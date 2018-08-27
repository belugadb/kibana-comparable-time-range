import _ from 'lodash'; // TODO: refactor lodash dependencies
import * as prov from 'ui/vis/agg_configs';

export function decorateAggConfigs(Private) {
  // eslint-disable-next-line import/namespace
  const AggConfigs = prov.AggConfigs || Private(prov.VisAggConfigsProvider);

  /**
   * Recursively removes undefined values from object.
   * @param {*} obj
   */
  function removeEmptyValues(obj) {
    return Object.keys(obj)
      .filter(k => obj[k] != null) // Filters out undefined and null objects
      .reduce((newObj, k) => {
        // Recursive call for arrays
        if (Array.isArray(obj[k])) return { ...newObj, [k]: obj[k].map(removeEmptyValues) };
        // Recursive call for objects
        return typeof obj[k] === 'object' ?
          { ...newObj, [k]: removeEmptyValues(obj[k]) } :
          { ...newObj, [k]: obj[k] };
      }, {});
  }

  /**
   * Applies comparing agg dsl for every bucket level recursively.
   * @param {*} dsl
   * @param {*} comparingAgg
   * @param {*} nestedMetrics
   */
  function applyComparingDsl(dsl, comparingAgg, nestedMetrics) {
    return Object.keys(dsl).reduce((obj, key) => {
      const currentDsl = _.cloneDeep(dsl[key]);
      const isLastBucket = currentDsl.aggs && !Object.keys(currentDsl.aggs).find(k => currentDsl.aggs[k].aggs);
      // If currentDsl has aggreagations, applies comparing dsl
      //  (last buckets don't accept sub-aggs)
      if (currentDsl.aggs && !isLastBucket) {
        // Calls itself recusrively for child aggs
        currentDsl.aggs = applyComparingDsl(currentDsl.aggs, comparingAgg, nestedMetrics);
        // Adds comparingAgg dsl + nestedMetrics dsls
        currentDsl.aggs[comparingAgg.id] = {
          ...comparingAgg.toDsl(),
          aggs: nestedMetrics.reduce((obj, curr) => {
            obj[curr.config.id] = curr.dsl;
            return obj;
          }, {})
        };
      }
      obj[key] = currentDsl;
      return obj;
    }, {});
  }

  function handleHierarchicalVisComparing(dsl, vis) {
    // Returns default dsl if vis isn't hierarchical
    const isUsingComparing = !!vis.aggs.byTypeName.comparing;
    if (!isUsingComparing || isUsingComparing && !vis.isHierarchical()) return dsl;

    const comparingAgg = vis.aggs.byTypeName.comparing[0];

    // Collect metrics to apply in comparing dsl
    const nestedMetrics = vis.aggs.bySchemaGroup.metrics
      .filter(agg => (agg.type.name !== 'count' && !agg.type.hasNoDsl))
      .map(agg => ({ config: agg, dsl: agg.toDsl() }));

    // Removes empty values from `toDsl` response
    const filteredDsl = removeEmptyValues(dsl);

    // Injects comparing agg dsl in dsl object
    return applyComparingDsl(filteredDsl, comparingAgg, nestedMetrics);
  }

  const toDslFn = AggConfigs.prototype.toDsl;
  AggConfigs.prototype.toDsl = function () {
    const dsl = toDslFn.apply(this, arguments);
    return handleHierarchicalVisComparing(dsl, this.vis);
  };
}
