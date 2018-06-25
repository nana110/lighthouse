/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env mocha */

const Runner = require('../../../runner.js');
const taskGroups = require('../../../lib/task-groups.js').taskGroups;
const pwaTrace = require('../../fixtures/traces/progressive-app.json');
const TracingProcessor = require('../../../lib/traces/tracing-processor.js');
const assert = require('assert');

describe('MainResource computed artifact', () => {
  let computedArtifacts;

  beforeEach(() => {
    computedArtifacts = Runner.instantiateComputedArtifacts();
  });

  it('should get all main thread tasks from a trace', async () => {
    const tasks = await computedArtifacts.requestMainThreadTasks({traceEvents: pwaTrace});
    const toplevelTasks = tasks.filter(task => !task.parent);
    assert.equal(tasks.length, 2305);
    assert.equal(toplevelTasks.length, 296);

    // Sanity check the reachability of tasks and summation of selfTime
    const allTasks = [];
    const queue = toplevelTasks;
    let totalTime = 0;
    let totalTopLevelTime = 0;
    while (queue.length) {
      const task = queue.shift();
      totalTime += task.selfTime;
      totalTopLevelTime += TracingProcessor.isScheduleableTask(task.event) ? task.duration : 0;
      allTasks.push(task);
      queue.push(...task.children);
    }

    assert.equal(allTasks.length, 2305);
    assert.equal(Math.round(totalTopLevelTime), 386);
    assert.equal(Math.round(totalTime), 396);
  });

  it('should compute parent/child correctly', async () => {
    const baseTs = 1241250325;
    const traceEvents = [
      {ph: 'I', name: 'TracingStartedInPage', ts: baseTs},
      {ph: 'X', name: 'TaskA', ts: baseTs, dur: 100e3},
      {ph: 'B', name: 'TaskB', ts: baseTs + 5e3},
      {ph: 'X', name: 'TaskC', ts: baseTs + 10e3, dur: 30e3},
      {ph: 'E', name: 'TaskB', ts: baseTs + 55e3},
    ];

    traceEvents.forEach(evt => evt.args = {data: {}});

    const tasks = await computedArtifacts.requestMainThreadTasks({traceEvents});
    assert.equal(tasks.length, 3);

    const taskA = tasks.find(task => task.event.name === 'TaskA');
    const taskB = tasks.find(task => task.event.name === 'TaskB');
    const taskC = tasks.find(task => task.event.name === 'TaskC');
    assert.deepStrictEqual(taskA, {
      parent: undefined,
      attributableURL: undefined,

      children: [taskB],
      event: traceEvents[1],
      startTime: 0,
      endTime: 100,
      duration: 100,
      selfTime: 50,
      group: taskGroups.other,
    });

    assert.deepStrictEqual(taskB, {
      parent: taskA,
      attributableURL: undefined,

      children: [taskC],
      event: traceEvents[2],
      startTime: 5,
      endTime: 55,
      duration: 50,
      selfTime: 20,
      group: taskGroups.other,
    });
  });
});
