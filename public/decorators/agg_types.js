import { AggTypesIndexProvider } from 'ui/agg_types';
import { AggTypesBucketsComparingProvider } from '../agg_types/comparing';
import { AggConfig } from 'ui/vis/agg_config';
import { AggTypesMetricsMetricAggTypeProvider } from 'ui/agg_types/metrics/metric_agg_type';
import { AggTypesMetricsCountProvider } from 'ui/agg_types/metrics/count';

export function decorateAggTypes(Private) {
  const AggTypes = Private(AggTypesIndexProvider);
  const AggComparing = Private(AggTypesBucketsComparingProvider);
  const MetricAggType = Private(AggTypesMetricsMetricAggTypeProvider);
  const CountAggType = Private(AggTypesMetricsCountProvider);

  // Adds getComparing and getDifference functions in AggConfig/MetricAggType/CountAggType
  AggConfig.prototype.getComparing = function (bucket) {
    return this.type.getComparing(this, bucket);
  };
  AggConfig.prototype.getDifference = function (bucket) {
    return this.type.getDifference(this, bucket);
  };
  MetricAggType.prototype.getComparing = (agg, bucket) => {
    return bucket[agg.id] && bucket[agg.id].comparing;
  };
  MetricAggType.prototype.getDifference = (agg, bucket) => {
    return bucket[agg.id] && bucket[agg.id].difference;
  };
  CountAggType.getComparing = (agg, bucket) => {
    return bucket.doc_count_comparing;
  };
  CountAggType.getDifference = (agg, bucket) => {
    return bucket.doc_count_difference;
  };

  // Adds AggComparing in AggTypes list
  AggComparing.type = 'buckets';
  AggTypes.push(AggComparing);
}
