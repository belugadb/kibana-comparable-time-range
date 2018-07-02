import _ from 'lodash'; // TODO: refactor lodash dependencies
import moment from 'moment';
import dateMath from '@elastic/datemath';
import { AggResponseTabifyComparingProvider } from './tabify_comparing';
import { VisResponseHandlersRegistryProvider } from 'ui/registry/vis_response_handlers';
import { ComparingProvider } from '../lib/comparing';

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

  function containsAgg(obj, aggId) {
    return Object.keys(obj).includes(aggId);
  }

  function getDate(date, offset) {
    const momentDate = moment(date);
    if (!offset) return momentDate;
    return momentDate.clone().subtract(offset.value, offset.unit);
  }

  /**
   * Creates a diff object ({value, unit}) for custom comparing time ranges
   *
   * @param {*} comparingRange
   * @param {*} timeFilter
   */
  function getOffset(timeFilter, comparingRange) {
    // If it's not using custom comparing, returns selected offset
    const isCustom = comparingRange.comparing.display === 'Custom';
    if (!isCustom) return comparingRange.comparing.offset;

    // Gets `from` dates of both current date and comparing date
    const currentDateFrom = timeFilter.getBounds().min;
    const comparingFrom = dateMath.parse(comparingRange.custom.from);

    // Gets diff in milliseconds
    const diff = currentDateFrom.diff(comparingFrom);
    return {
      value: diff,
      unit: 'milliseconds'
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
    // If the current agg level contains comparingAggId, formats agg and returns
    if (containsAgg(aggs, comparingAggId)) {
      return applyComparing(aggs, comparingAggId, metricsAggsIds, isPercentage);
    } else { // calls itself recursively for every bucket
      // Finds next agg child (looks for buckets array inside every child)
      const nextAggId = Object.keys(aggs).find(k => !!aggs[k].buckets);
      const newBuckets = aggs[nextAggId].buckets.map(b => findComparingAgg(b, comparingAggId, metricsAggsIds, isPercentage));
      return {
        ...aggs,
        [nextAggId]: {
          ...aggs[nextAggId],
          buckets: newBuckets
        }
      };
    }
  }

  function handleDateHistogramResponse(vis, response, comparingAgg) {
    if (!vis.aggs.byTypeName.date_histogram) return response;

    // TODO: handle custom
    const comparingAggId = comparingAgg.id;
    const comparingOffset = getOffset(vis.API.timeFilter, comparingAgg.params.range);

    // Considering there's only one date_histogram agg
    //  TODO: Limit query to have only one date_histogram
    const dateHistogramAgg = vis.aggs.byTypeName.date_histogram[0];

    // TODO: implement a recursive function that finds nested date_histogram aggregations
    //  This case will only work if date_histogram is the first one
    const dateHistogramBuckets = response.aggregations[dateHistogramAgg.id].buckets;

    // Extract the comparing values from sibbling buckets
    const bucketsWithComparing = dateHistogramBuckets.map(bucket => {
      // Gets comparing date to look for in sibbling buckets
      const comparingBucketDate = getDate(bucket.key, comparingOffset);

      // Finds comparingBucket using comparing date
      const comparingBucket = dateHistogramBuckets.find(b => b.key === comparingBucketDate.valueOf());

      // If no comparingBucket is found, discards the bucket itself
      //  This is used later in order to filter out unwanted buckets
      if (!comparingBucket) return null;

      // Builds new comparing agg bucket based on comapring date range
      //  from comparingBucket and base date range from bucket
      const newComparingBuckets = [
        comparingBucket[comparingAggId].buckets[0],
        bucket[comparingAggId].buckets[1]
      ];

      return {
        ...bucket,
        [comparingAggId]: {
          ...bucket[comparingAggId],
          buckets: newComparingBuckets
        }
      };
    })
      // Filters out unwanted `null` buckets
      .filter(b => !!b);

    return {
      ...response,
      aggregations: {
        ...response.aggregations,
        [dateHistogramAgg.id]: {
          ...response.aggregations[dateHistogramAgg.id],
          buckets: bucketsWithComparing
        }
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

  return {
    name: 'comparing',
    handler: (vis, response) => {
      return new Promise(resolve => {
        const newResponse = handleComparingResponse(vis, response);
        const newVis = handleVis(vis);

        const tableGroup = tabifyComparing(newVis, newResponse, {
          canSplit: true,
          asAggConfigResults: _.get(newVis, 'type.responseHandlerConfig.asAggConfigResults', false)
        });

        resolve(tableGroup);
      });
    }
  };
}

VisResponseHandlersRegistryProvider.register(ComparingResponseHandlerProvider);

export { ComparingResponseHandlerProvider };
