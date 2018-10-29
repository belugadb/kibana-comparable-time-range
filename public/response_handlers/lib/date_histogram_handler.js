import _ from 'lodash'; // TODO: refactor lodash dependencies
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
  const containsComparingAgg = containsAgg(bucket, comparingAggId);
  const formattedBucket = containsComparingAgg
    ? buildComparingBucket(bucket, comparingBucket, comparingAggId)
    : bucket;
  // Finds next bucket child (looks for buckets array inside every child)
  //  (if not found, it's the last bucket, then returns `formattedBucket` itself)
  const nextAggId = Object.keys(formattedBucket).find(k => !!formattedBucket[k].buckets && k !== comparingAggId);
  if (!nextAggId){
    // Marks comparing bucket with an "Already Computed" flag, so it can be filtered out later 
    if(containsComparingAgg) comparingBucket.comparingAlreadyComputed = true;
    return formattedBucket;
  }
  
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
 * Checks if bucket values are not empty (`doc_count: 0`)
 *  or subBuckets are not empty arrays.
 * Looks recursively for the `comparingAggId` bucket
 *
 * @param {*} bucket
 * @param {*} comparingAggId
 */
function isBucketValueEmpty(bucket, comparingAggId) {
  // Checks `doc_count` from both current (buckets[1]) and comparing (buckets[0]) date ranges
  const noDocCount = containsAgg(bucket, comparingAggId) &&
    !bucket[comparingAggId].buckets[0].doc_count &&
    !bucket[comparingAggId].buckets[1].doc_count;
  
  // Checks if it's the last bucket, and if it is, returns noDocCount validation
  const nextAggId = Object.keys(bucket).find(k => !!bucket[k].buckets && k !== comparingAggId);
  if(!nextAggId) return noDocCount;

  // Returns true (empty) for buckets whose subBuckets are empty arrays
  //  This is useful for "metrics for every bucket/level" response
  if(!bucket[nextAggId].buckets.length) return true;

  // Finally, calls itself recursively, looking for next aggregation
  return !!bucket[nextAggId].buckets.find(subBucket => isBucketValueEmpty(subBucket, comparingAggId));
}

/**
 * Filters out already computed buckets recursively.
 *
 * @param {*} bucket 
 */
function removeComputedBuckets(bucket, comparingAggId) {
  // Finds next bucket child (looks for buckets array inside every child)
  // (returns bucket itself if not found)
  const nextAggId = Object.keys(bucket).find(k => !!bucket[k].buckets && k !== comparingAggId);
  if (!nextAggId) return bucket;
  
  // Calls itself recursively, looking for next aggregation
  //  (also filters out already computed buckets)
  const newBuckets = bucket[nextAggId].buckets
    .filter(b => !b.comparingAlreadyComputed)
    .map(b => removeComputedBuckets(b, comparingAggId))

  return {
    ...bucket,
    [nextAggId]: {
      ...bucket[nextAggId],
      buckets: newBuckets
    }
  };
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
  const comparingRanges = {
    from: getDate(currentDateFilter.min, comparingOffset),
    to: getDate(currentDateFilter.max, comparingOffset)
  };

  // Considering there's only one date_histogram agg
  const dateHistogramAgg = vis.aggs.byTypeName.date_histogram[0];
  const dateHistogramIntervalUnit = dateHistogramAgg.params.interval.val;

  // Considering date_histogram is the first bucket agg
  const dateHistogramBuckets = _.cloneDeep(response.aggregations[dateHistogramAgg.id].buckets);

  const bucketsWithComparing = dateHistogramBuckets
    // Extracts the comparing values from sibbling buckets
    .map(bucket => {
      // Gets comparing date to look for in sibbling buckets
      const comparingBucketDate = getDate(bucket.key, comparingOffset);

      // Finds comparingBucket using comparing date
      const comparingBucket = dateHistogramBuckets.find(b => b.key === comparingBucketDate.valueOf());
      
      return getComparingFromDateHistogram(bucket, comparingBucket, comparingAggId);
    })

    // Collects remaining buckets from comparing range
    //  In some cases, ES is not filling empty buckets with `0` value (usually when splitting buckets by terms)
    //  This step shifts uncomputed buckets from comparing range to current range.
    .filter(bucket => !bucket.comparingAlreadyComputed) // Filters out already computed buckets (first level)
    .map(bucket => {
      const bucketBounds = {
        from: getDate(bucket.key),
        to: getDate(bucket.key).clone().add(1, dateHistogramIntervalUnit)
      };
      
      // Moment's isBetween last parameter ('[)') sets range inclusivity. See https://momentjs.com/docs/#/query/is-between/
      const isBucketInDateFilter = !!bucketBounds.from.isBetween(currentDateFilter.min, currentDateFilter.max, null, '[)');
      const bucketContainsDateFilterFrom = currentDateFilter.min.isBetween(bucketBounds.from, bucketBounds.to, null, '[)');
      const isBucketInComparingRange = !!bucketBounds.from.isBetween(comparingRanges.from, comparingRanges.to, null, '[)');
      const bucketContainsComparingRangeFrom = comparingRanges.from.isBetween(bucketBounds.from, bucketBounds.to, null, '[)');

      // If bucket is in current filter range, out of comparing range or has no children, returns unchanged bucket
      const isBucketOutOfComparingRange = !isBucketInComparingRange && !bucketContainsComparingRangeFrom;
      if (isBucketInDateFilter || bucketContainsDateFilterFrom || isBucketOutOfComparingRange || !bucket.doc_count) return bucket;

      // Removes nested already computed buckets
      const uncomputedBucket = removeComputedBuckets(bucket, comparingAggId);

      // Shfts bucket date to current date bounds
      const uncomputedBucketDate = bucketBounds.from.clone().add(comparingOffset.value, comparingOffset.unit);
      return {
        ...uncomputedBucket,
        key: uncomputedBucketDate.valueOf(),
        key_as_string: uncomputedBucketDate.format("YYYY-MM-DDTHH:mm:ss.SSSZ")
      }
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
