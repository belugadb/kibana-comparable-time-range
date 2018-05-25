import AggConfigResult from 'ui/vis/agg_config_result';

export function decorateAggConfigResult() {
  const toStringFn = AggConfigResult.prototype.toString;
  AggConfigResult.prototype.toString = function (contentType) {
    const res = toStringFn.apply(this, arguments);
    return this.difference ? `${res}${this.difference}` : res;
  }
};
