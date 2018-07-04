// This is a copy of ui/vis/request_handlers/courier
//  with global time filter overwritten by comparing config
import _ from 'lodash'; // TODO: refactor lodash dependencies
import dateMath from '@elastic/datemath';
import { VisRequestHandlersRegistryProvider } from 'ui/registry/vis_request_handlers';

const ComparingRequestHandlerProvider = function (Private, courier, timefilter) {

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
   * Handles comparing agg, overriding global time filter if needed
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
   *
   * @param {*} vis
   * @param {*} searchSource
   */
  function removeComparingFilter(vis, searchSource) {
    const isUsingComparing = !!vis.aggs.byTypeName.comparing;
    if (!isUsingComparing) return;

    // Removes comparing time range filter
    const currentFilter = [ ...searchSource.get('filter') ];
    const filterWithoutComparing = currentFilter.filter(f => !f.comparing);
    searchSource.set('filter', filterWithoutComparing);
  }


  return {
    name: 'comparing',
    handler: function (vis, appState, uiState, queryFilter, searchSource) {

      if (queryFilter && vis.editorMode) {
        searchSource.set('filter', queryFilter.getFilters());
        searchSource.set('query', appState.query);
      }

      // Adds comparing time range filter if needed
      handleComparing(vis, searchSource);

      const shouldQuery = () => {
        if (!searchSource.lastQuery || vis.reload) return true;
        if (!_.isEqual(_.cloneDeep(searchSource.get('filter')), searchSource.lastQuery.filter)) return true;
        if (!_.isEqual(_.cloneDeep(searchSource.get('query')), searchSource.lastQuery.query)) return true;
        if (!_.isEqual(_.cloneDeep(searchSource.get('aggs')()), searchSource.lastQuery.aggs)) return true;
        if (!_.isEqual(_.cloneDeep(timefilter.time), searchSource.lastQuery.time)) return true;

        return false;
      };

      return new Promise((resolve, reject) => {
        if (shouldQuery()) {
          delete vis.reload;
          searchSource.onResults().then(resp => {
            searchSource.lastQuery = {
              filter: _.cloneDeep(searchSource.get('filter')),
              query: _.cloneDeep(searchSource.get('query')),
              aggs: _.cloneDeep(searchSource.get('aggs')()),
              time: _.cloneDeep(timefilter.time)
            };

            searchSource.rawResponse = resp;

            // Removes injected filter
            removeComparingFilter(vis, searchSource);

            resolve(resp);
          }).catch(e => reject(e));

          courier.fetch();
        } else {
          resolve(searchSource.rawResponse);
        }
      });
    }
  };
};

VisRequestHandlersRegistryProvider.register(ComparingRequestHandlerProvider);

export { ComparingRequestHandlerProvider };
