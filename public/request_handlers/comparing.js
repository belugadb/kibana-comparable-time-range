// This is a copy of ui/vis/request_handlers/courier
//  with global time filter overwritten by comparing config
import _ from 'lodash'; // TODO: refactor lodash dependencies
import moment from 'moment';
import dateMath from '@elastic/datemath';
import { VisRequestHandlersRegistryProvider } from 'ui/registry/vis_request_handlers';

const ComparingRequestHandlerProvider = function (Private, courier, timefilter) {
  /**
   * Handles comparing agg, overriding global time filter if needed
   *
   * @param {*} vis
   * @param {*} searchSource
   */
  function handleComparing(vis, searchSource) {
    const isUsingComparing = !!vis.aggs.byTypeName.comparing;

    // Disables global time range filter if the query is using comparing agg.
    //  Also needed to enable it again for future requests
    searchSource.skipTimeRangeFilter = isUsingComparing;

    // Stop executing function if comparing agg is missing
    if (!isUsingComparing) return;

    // Gets requestedDateRange from comparing agg
    const comparingAgg = vis.aggs.byTypeName.comparing[0].toDsl();
    const timeField = comparingAgg.date_range.field;
    const aggDateRanges = comparingAgg.date_range.ranges;
    const requestedDateRange = {
      from: dateMath.parse(aggDateRanges[0].from),
      to: dateMath.parse(aggDateRanges[1].to)
    };

    // Creates a new time range filter
    const currentFilter = [ ...searchSource.get('filter') ];
    currentFilter.push({
      comparing: true, // This will be used later to filter this query out
      query: {
        range: {
          [timeField]: {
            gte: moment(requestedDateRange.from).toISOString(),
            lte: moment(requestedDateRange.to).toISOString()
          }
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
