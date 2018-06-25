/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const ComputedArtifact = require('./computed-artifact');
const TraceProcessor = require('../../lib/traces/tracing-processor');
const {taskGroups, taskNameToGroup} = require('../../lib/task-groups');

/**
 * @fileoverview
 *
 * This artifact converts the array of raw trace events into an array of hierarchical
 * tasks for easier consumption and bottom-up analysis.
 *
 * Events are easily produced but difficult to consume. They're a mixture of start/end markers, "complete" events, etc.
 * @see https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
 *
 * LH's TaskNode is an artifact that fills in the gaps a trace event leaves behind.
 * i.e. when did it end? which events are children/parents of this one?
 *
 * Each task will have its group/classification, start time, end time,
 * duration, and self time computed. Each task will potentially have a parent, children, and an
 * attributeableURL for the script that was executing/forced this execution.
 */

/** @typedef {import('../../lib/task-groups.js').TaskGroup} TaskGroup */

/**
 * @typedef TaskNode
 * @prop {LH.TraceEvent} event
 * @prop {TaskNode[]} children
 * @prop {TaskNode|undefined} parent
 * @prop {number} startTime
 * @prop {number} endTime
 * @prop {number} duration
 * @prop {number} selfTime
 * @prop {string|undefined} attributableURL
 * @prop {TaskGroup} group
 */

class MainThreadTasks extends ComputedArtifact {
  get name() {
    return 'MainThreadTasks';
  }

  /**
   * @param {LH.TraceEvent} event
   * @param {TaskNode} [parent]
   * @return {TaskNode}
   */
  static _createNewTaskNode(event, parent) {
    const newTask = {
      event,
      startTime: event.ts,
      endTime: event.ph === 'X' ? event.ts + Number(event.dur || 0) : NaN,
      parent: parent,
      children: [],

      // These properties will be filled in later
      group: taskGroups.other,
      attributableURL: undefined,
      duration: NaN,
      selfTime: NaN,
    };

    if (parent) {
      parent.children.push(newTask);
    }

    return newTask;
  }

  /**
   * @param {LH.TraceEvent[]} traceEvents
   * @return {TaskNode[]}
   */
  static _createTasksFromEvents(traceEvents) {
    const {startedInPageEvt} = TraceProcessor.findTracingStartedEvt(traceEvents);

    /** @type {TaskNode[]} */
    const tasks = [];
    /** @type {TaskNode|undefined} */
    let currentTask;

    for (const event of traceEvents) {
      // Only look at main thread events
      if (event.pid !== startedInPageEvt.pid || event.tid !== startedInPageEvt.tid) continue;
      // Only look at X (Complete), B (Begin), and E (End) events as they have most data
      if (event.ph !== 'X' && event.ph !== 'B' && event.ph !== 'E') continue;

      // Update currentTask based on the elapsed time.
      // The next event may be after currentTask has ended.
      while (
        currentTask &&
        Number.isFinite(currentTask.endTime) &&
        currentTask.endTime <= event.ts
      ) {
        currentTask = currentTask.parent;
      }

      // If we don't have a current task, start a new one.
      if (!currentTask) {
        // We can't start a task with an end event
        if (event.ph === 'E') {
          throw new Error('Fatal trace logic error');
        }

        currentTask = MainThreadTasks._createNewTaskNode(event);
        tasks.push(currentTask);

        continue;
      }

      if (event.ph === 'X' || event.ph === 'B') {
        // We're starting a nested event, create it as a child and make it the currentTask
        const newTask = MainThreadTasks._createNewTaskNode(event, currentTask);
        tasks.push(newTask);
        currentTask = newTask;
      } else {
        if (currentTask.event.ph !== 'B') {
          throw new Error('Fatal trace logic error');
        }

        // We're ending an event, update the end time and the currentTask to its parent
        currentTask.endTime = event.ts;
        currentTask = currentTask.parent;
      }
    }

    return tasks;
  }

  /**
   * @param {TaskNode} task
   * @return {number}
   */
  static _computeRecursiveSelfTime(task) {
    const childTime = task.children
      .map(MainThreadTasks._computeRecursiveSelfTime)
      .reduce((sum, child) => sum + child, 0);
    task.duration = task.endTime - task.startTime;
    task.selfTime = task.duration - childTime;
    return task.duration;
  }

  /**
   * @param {TaskNode} task
   * @param {string} [parentURL]
   */
  static _computeRecursiveAttributableURL(task, parentURL) {
    const argsData = task.event.args.data || {};
    const stackFrames = argsData.stackTrace || [{url: undefined}];
    const taskURL = argsData.url || (stackFrames[0] && stackFrames[0].url);

    task.attributableURL = parentURL || taskURL;
    task.children.forEach(child =>
      MainThreadTasks._computeRecursiveAttributableURL(child, task.attributableURL));
  }

  /**
   * @param {TaskNode} task
   * @param {TaskGroup} [parentGroup]
   */
  static _computeRecursiveTaskGroup(task, parentGroup) {
    const group = taskNameToGroup[task.event.name];
    task.group = group || parentGroup || taskGroups.other;
    task.children.forEach(child => MainThreadTasks._computeRecursiveTaskGroup(child, task.group));
  }

  /**
   *
   * @param {LH.TraceEvent[]} traceEvents
   * @return {TaskNode[]}
   */
  static getMainThreadTasks(traceEvents) {
    const tasks = MainThreadTasks._createTasksFromEvents(traceEvents);

    // Compute the recursive properties we couldn't compute earlier, starting at the toplevel tasks
    for (const task of tasks) {
      if (task.parent) continue;

      MainThreadTasks._computeRecursiveSelfTime(task);
      MainThreadTasks._computeRecursiveAttributableURL(task);
      MainThreadTasks._computeRecursiveTaskGroup(task);
    }

    const firstTs = (tasks[0] || {startTime: 0}).startTime;
    for (const task of tasks) {
      task.startTime = (task.startTime - firstTs) / 1000;
      task.endTime = (task.endTime - firstTs) / 1000;
      task.duration /= 1000;
      task.selfTime /= 1000;

      // sanity check that we have selfTime which captures all other timing data
      if (!Number.isFinite(task.selfTime)) {
        throw new Error('Invalid task timing data');
      }
    }

    return tasks;
  }

  /**
   * @param {LH.Trace} trace
   * @return {Promise<Array<TaskNode>>} networkRecords
   */
  async compute_(trace) {
    return MainThreadTasks.getMainThreadTasks(trace.traceEvents);
  }
}

module.exports = MainThreadTasks;
