import dateMath from '@kbn/datemath';
import { VisRequestHandlersRegistryProvider } from 'ui/registry/vis_request_handlers';

function buildDateRangeFilter(aggDateRanges, timeField) {
  return  {
    range: {
      [timeField]: {
        gte: dateMath.parse(aggDateRanges.from).toISOString(),
        lte: dateMath.parse(aggDateRanges.to).toISOString(),
        format: 'date_time'
      }
    }
  };
}

/**
 * Handles comparing agg:
 * - overrides global time filter if needed
 * - changes `min_doc_count` and `extended_bounds` of `date_histogram` aggregation
 *
 * @param {*} vis
 * @param {*} searchSource
 */
function handleComparing(vis, searchSource) {
  // Gets requestedDateRange from comparing agg
  const comparingAgg = vis.aggs.byTypeName.comparing[0].toDsl();
  const timeField = comparingAgg.date_range.field;
  const aggDateRanges = comparingAgg.date_range.ranges;

  // Changes `min_doc_count` and `extended_bounds` from `date_histogram` aggregation
  //  This ensures that the current time bucket will be considered, even with empty values (0)
  if (vis.aggs.byTypeName.date_histogram) {
    const dateHistogramAgg = vis.aggs.byTypeName.date_histogram[0];
    dateHistogramAgg.params = {
      ...dateHistogramAgg.params,
      min_doc_count: 0,
      extended_bounds: {
        min: aggDateRanges[0].from,
        max: aggDateRanges[1].to
      }
    };
  }

  // Creates a new time range filter
  const comparingFilter = [{
    query: {
      bool: {
        should: [
          // Comparing range
          buildDateRangeFilter(aggDateRanges[0], timeField),
          // Current global time filter range
          buildDateRangeFilter(aggDateRanges[1], timeField)
        ]
      }
    }
  }];
  searchSource.setField('filter', comparingFilter);
}

/**
 * Removes time range filter added by `handleComparing` function.
 * This function should be called after the ES request happens.
 * This approach is used in order to avoid keeping injected filter in appState!
 * Also changes `min_doc_count` and `extended_bounds` of `date_histogram` aggregation back to its default values
 *
 * @param {*} vis
 * @param {*} searchSource
 */
function resetDateHistogramParams(vis) {
  // Resets date_histogram params values
  if (vis.aggs.byTypeName.date_histogram) {
    vis.aggs.byTypeName.date_histogram[0].params.min_doc_count = 1;
    vis.aggs.byTypeName.date_histogram[0].params.extended_bounds = {};
  }
}

export function decorateCourierReqHandler(Private) {
  const requestHandlers = Private(VisRequestHandlersRegistryProvider);

  const handlerFn = requestHandlers.byName.courier.handler;
  requestHandlers.byName.courier.handler = function (vis, params) {
    // Returns default courier handler function if comparing agg is missing
    const isUsingComparing = !!vis.aggs.byTypeName.comparing;
    if (!isUsingComparing) return handlerFn(...arguments);

    // Creates a new search source that inherits the original search source
    //  Using callParentStartHandlers: true we make sure that the parent searchSource
    //  onSearchRequestStart will be called properly even though we use an inherited
    //  search source
    const comparingSearchSource = params.searchSource.createChild({ callParentStartHandlers: true });

    // Adds comparing time range filter
    handleComparing(vis, comparingSearchSource);

    const newParams = {
      ...params,
      // Overrides searchSource for comparing one
      searchSource: comparingSearchSource,
      // Removes timeRange, so courier won't set global timeRange filter
      timeRange: null
    };

    return handlerFn(vis, newParams)
      .then(resp => {
        resetDateHistogramParams(vis);
        return resp;
      });
  };
}
