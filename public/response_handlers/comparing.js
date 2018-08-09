import _ from 'lodash'; // TODO: refactor lodash dependencies
import { AggResponseTabifyComparingProvider } from './tabify_comparing';
import { VisResponseHandlersRegistryProvider } from 'ui/registry/vis_response_handlers';
import { ComparingProvider } from '../lib/comparing';
import { handleDateHistogramResponse } from './lib/date_histogram_handler';
import { containsAgg } from './lib/utils';

function ComparingResponseHandlerProvider(Private) {
  const tabifyComparing = Private(AggResponseTabifyComparingProvider);
  const getDifference = Private(ComparingProvider);

  function getBucketValues(buckets, aggId) {
    // If aggId is missing, returns doc_count values
    if (!aggId) {
      return {
        comparing: buckets[0].doc_count,
        actual: buckets[1].doc_count
      };
    }
    // Returns agg value (for other metrics)
    return {
      comparing: buckets[0][aggId].value,
      actual: buckets[1][aggId].value
    };
  }

  /**
   * Applies the difference calculation for the two buckets of comparingAgg
   *
   * @param agg
   * @param comparingAggId
   * @param metricsAggsIds
   * @param isPercentage
   * @returns {Object} Returns comparingAgg formatted
   */
  function applyComparing(agg, comparingAggId, metricsAggsIds, isPercentage) {
    const { [comparingAggId]: comparingAgg, ...rawAgg } = agg;
    const buckets = comparingAgg.buckets;

    // Gets metric aggs difference
    const newMetrics = metricsAggsIds.reduce((obj, id) => {
      const values = getBucketValues(buckets, id);
      const difference = getDifference(values.comparing, values.actual, isPercentage);
      obj[id] = {
        value: values.actual,
        comparing: values.comparing,
        difference
      };
      return obj;
    }, {});

    // Gets count difference
    const countValues = getBucketValues(buckets);
    const countDifference = getDifference(countValues.comparing, countValues.actual, isPercentage);

    return {
      ...rawAgg,
      ...newMetrics,
      doc_count: countValues.actual,
      doc_count_comparing: countValues.comparing,
      doc_count_difference: countDifference
    };
  }

  /***
   * Finds comparingAgg recursively inside response.aggregations and handles comparing calc
   *
   * @param aggs
   * @param comparingAggId
   * @param metricsAggsIds
   * @param isPercentage
   * @returns {Object} Returns aggregations without comparingAgg (in the response.aggregations format)
   */
  function findComparingAgg(aggs, comparingAggId, metricsAggsIds, isPercentage) {
    // If the current agg level contains comparingAggId, formats agg
    const formattedAggs = containsAgg(aggs, comparingAggId)
      ? applyComparing(aggs, comparingAggId, metricsAggsIds, isPercentage)
      : aggs;
    // Finds next agg child (looks for buckets array inside every child)
    //  (if not found, it's the last bucket, then returns `formattedAggs` itself)
    const nextAggId = Object.keys(formattedAggs).find(k => !!formattedAggs[k].buckets);
    if(!nextAggId) return formattedAggs;
    // Calls itself recursively for every bucket
    const newBuckets = formattedAggs[nextAggId].buckets.map(b => findComparingAgg(b, comparingAggId, metricsAggsIds, isPercentage));
    return {
      ...formattedAggs,
      [nextAggId]: {
        ...formattedAggs[nextAggId],
        buckets: newBuckets
      }
    };
  }

  function handleComparingResponse(vis, response) {
    if (!vis.aggs.byTypeName.comparing) return response;

    // Considering there's only one comparingAgg
    const comparingAgg = vis.aggs.byTypeName.comparing[0];
    const isPercentage = comparingAgg.params.range.format === '%';

    // Lists metrics aggs ids, ignoring 'count' agg
    // TODO: find a better way to filter datasweet_formula aggs out
    const metricsAggsIds = vis.aggs.bySchemaGroup.metrics
      .filter(agg => agg.type.name !== 'count' && agg.type.name !== 'datasweet_formula')
      .map(agg => agg.id);

    // Handles date_histogram aggregation if needed
    const newResponse = handleDateHistogramResponse(vis, response, comparingAgg);

    // Finds comparingAgg recursively and formats response.aggs object
    const formattedAggs = findComparingAgg(newResponse.aggregations, comparingAgg.id, metricsAggsIds, isPercentage);

    // If there's only comparingAgg in bucket aggs, changes the hits.total value
    // TODO: handle others metric calcs
    const totalHits = vis.aggs.bySchemaGroup.buckets.length === 1
      ? formattedAggs.doc_count
      : response.hits.total;

    return {
      ...response,
      hits: {
        ...response.hits,
        total: totalHits
      },
      aggregations: formattedAggs
    };
  }

  // TODO: instead of removing comparing agg from vis, handle it in tabify
  function handleVis(vis) {
    if (!vis.aggs.byTypeName.comparing) return vis;
    const comparingAggId = vis.aggs.byTypeName.comparing[0].id;

    // Clones vis in order to keep comparing agg in visualization buckets
    //  This keeps original vis instance unchanged
    const newVis = vis.clone();
    // Removes comparing agg from clone (to be used in tabify)
    newVis.aggs.remove(agg => agg.id === comparingAggId);

    // Adds comparing default config to newVis
    newVis.comparingConfig = vis.aggs.byTypeName.comparing[0].params.range;

    return newVis;
  }

  function shouldHandleResponse(vis) {
    // enhanced-table plugin handles response in `esResponse` watcher from EnhancedTableVisController
    return vis.type.name !== 'enhanced-table';
  }

  return {
    name: 'comparing',
    handler: (vis, response) => {
      return new Promise(resolve => {
        if (!shouldHandleResponse(vis)) return resolve(response);

        const newResponse = handleComparingResponse(vis, response);
        const newVis = handleVis(vis);

        const tableGroup = tabifyComparing(newVis, newResponse, {
          canSplit: true,
          asAggConfigResults: _.get(newVis, 'type.responseHandlerConfig.asAggConfigResults', false)
        });

        resolve(tableGroup);
      });
    },
    handleComparingResponse,
    handleVis
  };
}

VisResponseHandlersRegistryProvider.register(ComparingResponseHandlerProvider);

export { ComparingResponseHandlerProvider };
