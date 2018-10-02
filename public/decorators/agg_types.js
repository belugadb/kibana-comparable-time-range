import { aggTypes } from 'ui/agg_types';
import { MetricAggType } from 'ui/agg_types/metrics/metric_agg_type';
import { countMetricAgg } from 'ui/agg_types/metrics/count';
import { AggConfig } from 'ui/vis/agg_config';
import { comparingBucketAgg } from '../agg_types/comparing';

export function decorateAggTypes() {
  // Adds getComparing and getDifference functions in AggConfig/MetricAggType/countMetricAgg
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
  countMetricAgg.getComparing = (agg, bucket) => {
    return bucket.doc_count_comparing;
  };
  countMetricAgg.getDifference = (agg, bucket) => {
    return bucket.doc_count_difference;
  };

  // Adds comparingBucketAgg in aggTypes list
  comparingBucketAgg.type = 'buckets';
  aggTypes.push(comparingBucketAgg);
}
