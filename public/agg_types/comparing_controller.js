import _ from 'lodash'; // TODO: refactor lodash dependencies
import { handleCustomDate } from './lib/custom_date_handler';

export function comparingAggController($scope) {

  $scope.isCustomComparing = () => {
    return $scope.agg.params.range.comparing.display === 'Custom';
  };

  $scope.hasDifferentRanges = () => {
    if (!$scope.isCustomComparing()) return false;

    // Gets comparing time range
    const customComparing = handleCustomDate($scope.agg.params.range.custom);
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

  $scope.$watch('responseValueAggs', checkBuckets);
  function checkBuckets() {
    const comparingBucket = $scope.vis.aggs.byTypeName.comparing[0];
    const lastBucket = _.findLast($scope.vis.getAggConfig(), agg => agg.schema.group === 'buckets');
    const canUseAggregation = comparingBucket && lastBucket && lastBucket.id === comparingBucket.id;

    // Removes error from comparing bucket
    if (comparingBucket.error) delete comparingBucket.error;

    // Adds an error message if last bucket isn't "Comparing"
    if ($scope.aggForm.agg) {
      $scope.aggForm.agg.$setValidity('bucket', canUseAggregation);
    }
    if (!canUseAggregation && comparingBucket) {
      comparingBucket.error = '"Comparing" must be the last bucket aggregation!';
    }
  }
}
