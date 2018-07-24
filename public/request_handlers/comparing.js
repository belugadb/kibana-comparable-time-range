// This is a copy of ui/vis/request_handlers/courier
//  with global time filter overwritten by comparing config
import _ from 'lodash'; // TODO: refactor lodash dependencies
import dateMath from '@kbn/datemath';
import { SearchSourceProvider } from 'ui/courier/data_source/search_source';
import { VisRequestHandlersRegistryProvider } from 'ui/registry/vis_request_handlers.js';
import { calculateObjectHash } from 'ui/vis/lib/calculate_object_hash';

const ComparingRequestHandlerProvider = function (Private, courier, timefilter) {
  const SearchSource = Private(SearchSourceProvider);

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
    const isUsingComparing = !!vis.aggs.byTypeName.comparing;
    if (!isUsingComparing) return;

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
    //  `comparing` field will be used in RootSearchSource.filter decorator
    const currentFilter = [ ...searchSource.get('filter') ];
    currentFilter.push({
      comparing: true,
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
    });
    searchSource.set('filter', currentFilter);
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
  function removeComparingFilter(vis, searchSource) {
    const isUsingComparing = !!vis.aggs.byTypeName.comparing;
    if (!isUsingComparing) return;

    // Resets date_histogram params values
    if (vis.aggs.byTypeName.date_histogram) {
      vis.aggs.byTypeName.date_histogram[0].params.min_doc_count = 1;
      vis.aggs.byTypeName.date_histogram[0].params.extended_bounds = {};
    }

    // Removes comparing time range filter
    const currentFilter = [ ...searchSource.get('filter') ];
    const filterWithoutComparing = currentFilter.filter(f => !f.comparing);
    searchSource.set('filter', filterWithoutComparing);
  }

  /**
   * TODO: This code can be removed as soon as we got rid of inheritance in the
   * searchsource and pass down every filter explicitly.
   * We are filtering out the global timefilter by the meta key set by the root
   * search source on that filter.
   */
  function removeSearchSourceParentTimefilter(searchSource) {
    searchSource.addFilterPredicate((filter) => {
      return !_.get(filter, 'meta._globalTimefilter', false);
    });
  }

  return {
    name: 'comparing',
    handler: function (vis, { appState, queryFilter, searchSource, timeRange }) {

      // Create a new search source that inherits the original search source
      // but has the propriate timeRange applied via a filter.
      // This is a temporary solution until we properly pass down all required
      // information for the request to the request handler (https://github.com/elastic/kibana/issues/16641).
      // Using callParentStartHandlers: true we make sure, that the parent searchSource
      // onSearchRequestStart will be called properly even though we use an inherited
      // search source.
      const requestSearchSource = new SearchSource().inherits(searchSource, { callParentStartHandlers: true });

      // For now we need to mirror the history of the passed search source, since
      // the spy panel wouldn't work otherwise.
      Object.defineProperty(requestSearchSource, 'history', {
        get() {
          return requestSearchSource._parent.history;
        },
        set(history) {
          return requestSearchSource._parent.history = history;
        }
      });

      // Add the explicit passed timeRange as a filter to the requestSearchSource.
      requestSearchSource.filter(() => {
        return timefilter.get(searchSource.get('index'), timeRange);
      });

      removeSearchSourceParentTimefilter(requestSearchSource);

      if (queryFilter && vis.editorMode) {
        searchSource.set('filter', queryFilter.getFilters());
        searchSource.set('query', appState.query);
      }

      const shouldQuery = () => {
        if (!searchSource.lastQuery || vis.reload) return true;
        if (!_.isEqual(_.cloneDeep(searchSource.get('filter')), searchSource.lastQuery.filter)) return true;
        if (!_.isEqual(_.cloneDeep(searchSource.get('query')), searchSource.lastQuery.query)) return true;
        if (!_.isEqual(calculateObjectHash(vis.aggs.getRequestAggs()), searchSource.lastQuery.aggs)) return true;
        if (!_.isEqual(_.cloneDeep(timeRange), searchSource.lastQuery.timeRange)) return true;

        return false;
      };

      return new Promise((resolve, reject) => {
        if (shouldQuery()) {
          // Adds comparing time range filter if needed
          handleComparing(vis, searchSource);

          delete vis.reload;
          requestSearchSource.onResults().then(resp => {
            // Removes injected filter
            removeComparingFilter(vis, searchSource);

            searchSource.lastQuery = {
              filter: _.cloneDeep(searchSource.get('filter')),
              query: _.cloneDeep(searchSource.get('query')),
              aggs: calculateObjectHash(vis.aggs.getRequestAggs()),
              timeRange: _.cloneDeep(timeRange)
            };

            searchSource.rawResponse = resp;

            return _.cloneDeep(resp);
          }).then(async resp => {
            for (const agg of vis.getAggConfig()) {
              if (_.has(agg, 'type.postFlightRequest')) {
                const nestedSearchSource = new SearchSource().inherits(requestSearchSource);
                resp = await agg.type.postFlightRequest(resp, vis.aggs, agg, nestedSearchSource);
              }
            }

            searchSource.finalResponse = resp;
            resolve(resp);
          }).catch(e => reject(e));

          courier.fetch();
        } else {
          resolve(searchSource.finalResponse);
        }
      });
    }
  };
};

VisRequestHandlersRegistryProvider.register(ComparingRequestHandlerProvider);

export { ComparingRequestHandlerProvider };
