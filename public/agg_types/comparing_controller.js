import _ from 'lodash'; // TODO: refactor lodash dependencies
import { handleCustomDate } from './lib/custom_date_handler';

const VALIDATION_ERROR_MESSAGES = {
  LAST_BUCKET: '"Comparing" must be the last bucket aggregation',
  DATE_HISTOGRAM_FIRST: 'Date Histogram bucket aggregation should be the first one when using "Comparing" bucket aggregation',
  MAX_DATE_HISTOGRAM: 'Only one Date Histogram aggregation is allowed when using "Comparing" bucket aggregation'
};

export function comparingAggController($scope) {
  $scope.isCustomComparing = () => {
    return $scope.agg.params.range.comparing.display === 'Custom';
  };

  $scope.hasDifferentRanges = () => {
    const customComparingTexts = $scope.agg.params.range.custom;
    if (!$scope.isCustomComparing() || !customComparingTexts) return false;

    // Checks if input texts are not empty
    const isNullOrEmpty = text => text == null || text.trim() === '';
    const hasEmptyFields = isNullOrEmpty(customComparingTexts.from) || isNullOrEmpty(customComparingTexts.to);
    if (hasEmptyFields) return false;

    // Gets comparing time ranges
    const customComparing = handleCustomDate(customComparingTexts);
    const comparingDuration = customComparing.to.diff(customComparing.from);

    // Checks if input texts are valid dates
    const hasValidDates = customComparing.from.isValid() && customComparing.to.isValid();
    if (!hasValidDates) return false;

    // Gets global timeFilter settings
    const timeFilter = $scope.vis.API.timeFilter;
    const timeFilterBounds = timeFilter.getBounds();
    const timeFilterDuration = timeFilterBounds.max.diff(timeFilterBounds.min);

    return (timeFilterDuration !== comparingDuration);
  };

  // `vis.getAggConfig()` is used because `vis.aggs.byTypeName`
  //  is wrongly mapping `undefined` type for new aggregations
  function getAggByType(type) {
    return $scope.vis.getAggConfig().filter(agg => agg.type && agg.type.name === type);
  }

  $scope.$watch('responseValueAggs', checkBuckets);
  function checkBuckets() {
    let errorMessage = '';

    // Checks if comparing is last bucket
    const comparingBucket = getAggByType('comparing')[0];
    const lastBucket = _.findLast($scope.vis.getAggConfig(), agg => agg.schema.group === 'buckets');
    const isComparingOrderValid = comparingBucket && lastBucket && lastBucket.id === comparingBucket.id;
    if (!isComparingOrderValid) errorMessage = VALIDATION_ERROR_MESSAGES.LAST_BUCKET;

    // Checks if date_histogram is first bucket
    const dateHistogramBuckets = getAggByType('date_histogram');
    const dateHistogramBucket = dateHistogramBuckets[0];
    const firstBucket = $scope.vis.getAggConfig().find(agg => agg.schema.group === 'buckets');
    const isDateHistogramOrderValid = dateHistogramBucket ? firstBucket && firstBucket.id === dateHistogramBucket.id : true;
    if (!isDateHistogramOrderValid) errorMessage = VALIDATION_ERROR_MESSAGES.DATE_HISTOGRAM_FIRST;

    // Checks if only one date_histogram is used
    const maxOneDateHistogram = dateHistogramBuckets && dateHistogramBuckets.length <= 1;
    const isDateHistogramCountValid = dateHistogramBuckets ? maxOneDateHistogram : true;
    if (!isDateHistogramCountValid) errorMessage = VALIDATION_ERROR_MESSAGES.MAX_DATE_HISTOGRAM;

    const canUseAggregation = isComparingOrderValid && isDateHistogramOrderValid && isDateHistogramCountValid;

    // Removes error from comparing bucket
    if (comparingBucket.error) delete comparingBucket.error;

    // Adds an error message if needed
    if ($scope.aggForm.agg) $scope.aggForm.agg.$setValidity('bucket', canUseAggregation);
    if (comparingBucket && !canUseAggregation) comparingBucket.error = errorMessage;
  }
}
