import _ from 'lodash'; // TODO: refactor lodash dependencies
import { handleCustomDate } from './lib/custom_date_handler';

const VALIDATION_ERROR_MESSAGES = {
  LAST_BUCKET: '"Comparing" must be the last bucket aggregation!',
  MAX_DATE_RANGE: 'Only one date range aggregation is allowed when using "Comparing" aggregation'
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
    const isLastBucket = comparingBucket && lastBucket && lastBucket.id === comparingBucket.id;
    if (!isLastBucket) errorMessage = VALIDATION_ERROR_MESSAGES.LAST_BUCKET;

    // Checks if only one date_histogram is used
    const dateHistogramAggs = getAggByType('date_histogram');
    const maxOneDateHistogram = dateHistogramAggs && dateHistogramAggs.length <= 1;
    const isDateHistogramValid = dateHistogramAggs ? maxOneDateHistogram : true;
    if (!isDateHistogramValid) errorMessage = VALIDATION_ERROR_MESSAGES.MAX_DATE_RANGE;

    const canUseAggregation = isLastBucket && isDateHistogramValid;

    // Removes error from comparing bucket
    if (comparingBucket.error) delete comparingBucket.error;

    // Adds an error message if needed
    if ($scope.aggForm.agg) $scope.aggForm.agg.$setValidity('bucket', canUseAggregation);
    if (comparingBucket && !canUseAggregation) comparingBucket.error = errorMessage;
  }
}
