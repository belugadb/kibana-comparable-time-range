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
 * Builds new comparing agg bucket based on comparing date range
 *  from `comparingBucket` and base date range from `bucket`
 *
 * @param {*} bucket
 * @param {*} comparingBucket
 * @param {*} comparingAggId
 */
function buildComparingBucket(bucket, comparingBucket, comparingAggId) {
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
  // If comparingBucket is missing, it means that there's no bucket
  //  value in comparing range, so just returns bucket itself
  if (!comparingBucket) return bucket;
  // If the current bucket level contains comparingAggId, formats bucket
  const formattedBucket = containsAgg(bucket, comparingAggId)
    ? buildComparingBucket(bucket, comparingBucket, comparingAggId)
    : bucket;
  // Finds next bucket child (looks for buckets array inside every child)
  //  (if not found, it's the last bucket, then returns `formattedBucket` itself)
  const nextAggId = Object.keys(formattedBucket).find(k => !!formattedBucket[k].buckets && k !== comparingAggId);
  if(!nextAggId) return formattedBucket;
  // Calls itself recursively for every bucket
  const newBuckets = formattedBucket[nextAggId].buckets.map(subBucket => {
    // Gets next level from comparingBucket
    const comparingSubBucket = comparingBucket[nextAggId].buckets.find(b => b.key === subBucket.key);
    return getComparingFromDateHistogram(subBucket, comparingSubBucket, comparingAggId);
  });
  return {
    ...formattedBucket,
    [nextAggId]: {
      ...formattedBucket[nextAggId],
      buckets: newBuckets
    }
  };
}

/**
 * Checks if bucket values are not empty (`doc_count: 0`).
 * Looks recursively for the `comparingAggId` bucket
 *
 * @param {*} bucket
 * @param {*} comparingAggId
 */
function isBucketValueEmpty(bucket, comparingAggId) {
  if (containsAgg(bucket, comparingAggId)) {
    // Checks `doc_count` from both current (buckets[1]) and comparing (buckets[0]) date ranges
    return !bucket[comparingAggId].buckets[0].doc_count && !bucket[comparingAggId].buckets[1].doc_count;
  }
  // if comparingAggId is not found, calls itself recursively, looking for next aggregation
  const nextAggId = Object.keys(bucket).find(k => !!bucket[k].buckets && k !== comparingAggId);
  return !!bucket[nextAggId].buckets.find(subBucket => isBucketValueEmpty(subBucket, comparingAggId));
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
  const dateHistogramIntervalUnit = dateHistogramAgg.params.interval.val;

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
    .filter(bucket => {
      const bucketBounds = {
        from: getDate(bucket.key),
        to: getDate(bucket.key).clone().add(1, dateHistogramIntervalUnit)
      };
      // Moment's isBetween last parameter ('[)') sets range inclusivity. See https://momentjs.com/docs/#/query/is-between/
      const isBucketInDateFilter = !!bucketBounds.from.isBetween(currentDateFilter.min, currentDateFilter.max, null, '[)');
      const bucketContainsDateFilterFrom = currentDateFilter.min.isBetween(bucketBounds.from, bucketBounds.to, null, '[)');

      // Also filters out `0` values from ES response
      const isBucketValueValid = !isBucketValueEmpty(bucket, comparingAggId);

      return (isBucketInDateFilter || bucketContainsDateFilterFrom) && isBucketValueValid;
    });

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
