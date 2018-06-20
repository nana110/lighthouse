/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/**
 * @typedef TaskGroup
 * @property {string} id
 * @property {string} label
 * @property {string[]} traceEventNames
 */

/**
 * Make sure the traceEventNames keep up with the ones in DevTools
 * @see https://cs.chromium.org/chromium/src/third_party/blink/renderer/devtools/front_end/timeline_model/TimelineModel.js?type=cs&q=TimelineModel.TimelineModel.RecordType+%3D&g=0&l=1156
 * @see https://cs.chromium.org/chromium/src/third_party/blink/renderer/devtools/front_end/timeline/TimelineUIUtils.js?type=cs&q=_initEventStyles+-f:out+f:devtools&sq=package:chromium&g=0&l=39
 */
const taskGroups = {
  ParseHTML: {
    id: '',
    label: 'Parse HTML & CSS',
    traceEventNames: ['ParseHTML', 'ParseAuthorStyleSheet'],
  },
  StyleLayout: {
    id: '',
    label: 'Style & Layout',
    traceEventNames: [
      'ScheduleStyleRecalculation',
      'RecalculateStyles',
      'UpdateLayoutTree',
      'InvalidateLayout',
      'Layout',
      'UpdateLayer',
      'UpdateLayerTree',
    ],
  },
  PaintCompositeRender: {
    id: '',
    label: 'Rendering',
    traceEventNames: [
      'Animation',
      'RequestMainThreadFrame',
      'ActivateLayerTree',
      'DrawFrame',
      'HitTest',
      'PaintSetup',
      'Paint',
      'PaintImage',
      'Rasterize',
      'RasterTask',
      'ScrollLayer',
      'CompositeLayers',
    ],
  },
  ScriptParseCompile: {
    id: '',
    label: 'Script Parsing & Compilation',
    traceEventNames: ['v8.compile', 'v8.compileModule', 'v8.parseOnBackground'],
  },
  ScriptEvaluation: {
    id: '',
    label: 'Script Evaluation',
    traceEventNames: [
      'EventDispatch',
      'EvaluateScript',
      'EvaluateModule',
      'FunctionCall',
      'TimerFire',
      'FireIdleCallback',
      'FireAnimationFrame',
      'RunMicrotasks',
      'V8.Execute',
    ],
  },
  GarbageCollection: {
    id: '',
    label: 'Garbage Collection',
    traceEventNames: [
      'GCEvent',
      'MinorGC',
      'MajorGC',
      'ThreadState::performIdleLazySweep',
      'ThreadState::completeSweep',
      'BlinkGCMarking',
    ],
  },
  Other: {
    id: '',
    label: 'Other',
    traceEventNames: [
      'MessageLoop::RunTask',
      'TaskQueueManager::ProcessTaskFromWorkQueue',
      'ThreadControllerImpl::DoWork',
    ],
  },
};

/** @type {Object<string, TaskGroup>} */
const taskNameToGroup = {};
/** @type {Set<string>} */
const traceEventNames = new Set();
for (const [groupId, group] of Object.entries(taskGroups)) {
  group.id = groupId;
  for (const traceEventName of group.traceEventNames) {
    taskNameToGroup[traceEventName] = group;
    traceEventNames.add(traceEventName);
  }
}

module.exports = {
  taskGroups,
  taskNameToGroup,
  traceEventNames,
};
