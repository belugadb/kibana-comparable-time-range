import moment from 'moment';
import dateMath from '@elastic/datemath';
import { containsAgg } from './utils';

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
 * Builds comparing aggregation for responses containing date_histogram aggregations.
 * Looks for `comparingAggId` recursively and returns a "comparing agg bucket"
 *  using information from both `bucket` and `comparingBucket`
 *
 * @param {*} bucket
 * @param {*} comparingBucket
 * @param {*} comparingAggId
 */
function getComparingFromDateHistogram(bucket, comparingBucket, comparingAggId) {
  if (containsAgg(bucket, comparingAggId)) {
    // If comparingBucket is missing, it means that there's no bucket
    //  value in comparing range, so just returns bucket itself
    if (!comparingBucket) return bucket;

    // Builds new comparing agg bucket based on comparing date range
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
  } else {
    // Finds next agg child (looks for buckets array inside every child)
    const nextAggId = Object.keys(bucket).find(k => !!bucket[k].buckets);
    const newBuckets = bucket[nextAggId].buckets.map(subBucket => {
      const comparingSubBucket = comparingBucket && comparingBucket[nextAggId].buckets.find(b => b.key === subBucket.key);
      return getComparingFromDateHistogram(subBucket, comparingSubBucket, comparingAggId);
    });
    return {
      ...bucket,
      [nextAggId]: {
        ...bucket[nextAggId],
        buckets: newBuckets
      }
    };
  }
}

/**
 * Handles date_histogram in response.aggregations
 *
 * @param {*} vis
 * @param {*} response
 * @param {*} comparingAgg
 */
function handleDateHistogramResponse(vis, response, comparingAgg) {
  if (!vis.aggs.byTypeName.date_histogram) return response;

  const comparingAggId = comparingAgg.id;
  const comparingOffset = getOffset(vis.API.timeFilter, comparingAgg.params.range);
  const currentDateFilter = vis.API.timeFilter.getBounds();

  // Considering there's only one date_histogram agg
  const dateHistogramAgg = vis.aggs.byTypeName.date_histogram[0];

  // Considering date_histogram is the first bucket agg
  const dateHistogramBuckets = response.aggregations[dateHistogramAgg.id].buckets;

  // Extract the comparing values from sibbling buckets
  const bucketsWithComparing = dateHistogramBuckets.map(bucket => {
    // Gets comparing date to look for in sibbling buckets
    const comparingBucketDate = getDate(bucket.key, comparingOffset);

    // Finds comparingBucket using comparing date
    const comparingBucket = dateHistogramBuckets.find(b => b.key === comparingBucketDate.valueOf());

    return getComparingFromDateHistogram(bucket, comparingBucket, comparingAggId);
  })
    // Filters out unwanted out-of-bounds buckets.
    //  This step is necessary since ES response contains both current and comparing range buckets
    .filter(bucket => !!getDate(bucket.key).isBetween(currentDateFilter.min, currentDateFilter.max));

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

export {
  getDate,
  getOffset,
  getComparingFromDateHistogram,
  handleDateHistogramResponse
};
