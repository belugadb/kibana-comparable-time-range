import { TabbedAggResponseWriter } from 'ui/agg_response/tabify/_response_writer';

export function decorateTabbedAggResponseWriter() {

  const cellFn = TabbedAggResponseWriter.prototype.cell;
  TabbedAggResponseWriter.prototype.cell = function (agg, value, block, comparing, difference) {
    const resp = cellFn.apply(this, arguments);
    if (this.asAggConfigResults && !!difference) {
      resp.comparing = comparing;
      resp.difference = difference;
    }

    return resp;
  };
}
