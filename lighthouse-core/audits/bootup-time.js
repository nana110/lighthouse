/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('./audit');
const TraceProcessor = require('../lib/traces/tracing-processor');
const Util = require('../report/html/renderer/util');
const {taskGroups} = require('../lib/task-groups');

/** @typedef {import('../lib/traces/tracing-processor.js').TaskNode} TaskNode */

class BootupTime extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      name: 'bootup-time',
      description: 'JavaScript boot-up time',
      failureDescription: 'JavaScript boot-up time is too high',
      scoreDisplayMode: Audit.SCORING_MODES.NUMERIC,
      helpText: 'Consider reducing the time spent parsing, compiling, and executing JS. ' +
        'You may find delivering smaller JS payloads helps with this. [Learn ' +
        'more](https://developers.google.com/web/tools/lighthouse/audits/bootup).',
      requiredArtifacts: ['traces'],
    };
  }

  /**
   * @return {LH.Audit.ScoreOptions & {thresholdInMs: number}}
   */
  static get defaultOptions() {
    return {
      // see https://www.desmos.com/calculator/rkphawothk
      // <500ms ~= 100, >2s is yellow, >3.5s is red
      scorePODR: 600,
      scoreMedian: 3500,
      thresholdInMs: 50,
    };
  }

  /**
   * @param {TaskNode[]} tasks
   * @param {number} multiplier
   * @return {Map<string, Object<keyof taskGroups, number>>}
   */
  static getExecutionTimingsByURL(tasks, multiplier) {
    /** @type {Map<string, Object<string, number>>} */
    const result = new Map();

    for (const task of tasks) {
      if (!task.attributableURL || task.attributableURL === 'about:blank') continue;

      const timingByGroupId = result.get(task.attributableURL) || {};
      const original = timingByGroupId[task.group.id] || 0;
      timingByGroupId[task.group.id] = original + task.selfTime * multiplier;
      result.set(task.attributableURL, timingByGroupId);
    }

    return result;
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Audit.Product>}
   */
  static async audit(artifacts, context) {
    const settings = context.settings || {};
    const trace = artifacts.traces[BootupTime.DEFAULT_PASS];
    const tasks = TraceProcessor.getMainThreadTasks(trace.traceEvents);
    const multiplier = settings.throttlingMethod === 'simulate' ?
      settings.throttling.cpuSlowdownMultiplier : 1;

    const executionTimings = BootupTime.getExecutionTimingsByURL(tasks, multiplier);

    let totalBootupTime = 0;
    const results = Array.from(executionTimings)
      .map(([url, timingByGroupId]) => {
        // Add up the totalBootupTime for all the taskGroups
        let bootupTimeForURL = 0;
        for (const timespanMs of Object.values(timingByGroupId)) {
          bootupTimeForURL += timespanMs;
        }

        totalBootupTime += bootupTimeForURL;

        const scriptingTotal = timingByGroupId[taskGroups.ScriptEvaluation.id] || 0;
        const parseCompileTotal = timingByGroupId[taskGroups.ScriptParseCompile.id] || 0;

        return {
          url: url,
          total: bootupTimeForURL,
          // Highlight the JavaScript task costs
          scripting: scriptingTotal,
          scriptParseCompile: parseCompileTotal,
        };
      })
      .filter(result => result.total >= context.options.thresholdInMs)
      .sort((a, b) => b.total - a.total);

    const summary = {wastedMs: totalBootupTime};

    const headings = [
      {key: 'url', itemType: 'url', text: 'URL'},
      {key: 'total', granularity: 1, itemType: 'ms', text: 'Total'},
      {key: 'scripting', granularity: 1, itemType: 'ms', text: taskGroups.ScriptEvaluation.label},
      {key: 'scriptParseCompile', granularity: 1, itemType: 'ms',
        text: taskGroups.ScriptParseCompile.label},
    ];

    const details = BootupTime.makeTableDetails(headings, results, summary);

    const score = Audit.computeLogNormalScore(
      totalBootupTime,
      context.options.scorePODR,
      context.options.scoreMedian
    );

    return {
      score,
      rawValue: totalBootupTime,
      displayValue: [Util.MS_DISPLAY_VALUE, totalBootupTime],
      details,
    };
  }
}

module.exports = BootupTime;
