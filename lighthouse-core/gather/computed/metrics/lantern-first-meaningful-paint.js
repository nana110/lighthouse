/**
 * @license Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const MetricArtifact = require('./lantern-metric');
const Node = require('../../../lib/dependency-graph/node');

/** @typedef {Node.NodeType} NodeType */

class FirstMeaningfulPaint extends MetricArtifact {
  get name() {
    return 'LanternFirstMeaningfulPaint';
  }

  /**
   * @return {LH.Gatherer.Simulation.MetricCoefficients}
   */
  get COEFFICIENTS() {
    return {
      intercept: 900,
      optimistic: 0.45,
      pessimistic: 0.6,
    };
  }

  /**
   * @param {NodeType} dependencyGraph
   * @param {LH.Artifacts.TraceOfTab} traceOfTab
   * @return {NodeType}
   */
  getOptimisticGraph(dependencyGraph, traceOfTab) {
    const fmp = traceOfTab.timestamps.firstMeaningfulPaint;
    const blockingScriptUrls = MetricArtifact.getScriptUrls(dependencyGraph, node => {
      return (
        node.endTime <= fmp && node.hasRenderBlockingPriority() && node.initiatorType !== 'script'
      );
    });

    return dependencyGraph.cloneWithRelationships(node => {
      if (node.endTime > fmp && !node.isMainDocument()) return false;
      // Include EvaluateScript tasks for blocking scripts
      if (node.type === Node.TYPES.CPU) {
        return node.isEvaluateScriptFor(blockingScriptUrls);
      }

      // Include non-script-initiated network requests with a render-blocking priority
      return node.hasRenderBlockingPriority() && node.initiatorType !== 'script';
    });
  }

  /**
   * @param {NodeType} dependencyGraph
   * @param {LH.Artifacts.TraceOfTab} traceOfTab
   * @return {NodeType}
   */
  getPessimisticGraph(dependencyGraph, traceOfTab) {
    const fmp = traceOfTab.timestamps.firstMeaningfulPaint;
    const requiredScriptUrls = MetricArtifact.getScriptUrls(dependencyGraph, node => {
      return node.endTime <= fmp && node.hasRenderBlockingPriority();
    });

    return dependencyGraph.cloneWithRelationships(node => {
      if (node.endTime > fmp && !node.isMainDocument()) return false;

      // Include CPU tasks that performed a layout or were evaluations of required scripts
      if (node.type === Node.TYPES.CPU) {
        return node.didPerformLayout() || node.isEvaluateScriptFor(requiredScriptUrls);
      }

      // Include all network requests that had render-blocking priority (even script-initiated)
      return node.hasRenderBlockingPriority();
    });
  }

  /**
   * @param {LH.Artifacts.MetricComputationData} data
   * @param {LH.ComputedArtifacts} artifacts
   * @return {Promise<LH.Artifacts.LanternMetric>}
   */
  async compute_(data, artifacts) {
    const fcpResult = await artifacts.requestLanternFirstContentfulPaint(data);
    const metricResult = await this.computeMetricWithGraphs(data, artifacts);
    metricResult.timing = Math.max(metricResult.timing, fcpResult.timing);
    return metricResult;
  }
}

module.exports = FirstMeaningfulPaint;
