import _ from 'lodash'; // TODO: refactor lodash dependencies

export function comparingAggController($scope) {
  $scope.$watch('responseValueAggs', checkBuckets);

  function checkBuckets() {
    const comparingBucket = $scope.vis.aggs.byTypeName.comparing[0];
    const lastBucket = _.findLast($scope.vis.getAggConfig(), agg => agg.schema.group === 'buckets');
    const canUseAggregation = comparingBucket && lastBucket && lastBucket.id === comparingBucket.id

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
