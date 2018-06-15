import { RootSearchSourceProvider } from 'ui/courier/data_source/_root_search_source';

export function decorateRootSearchSource(Private) {
  const rootSearchSource = Private(RootSearchSourceProvider).getGlobalSource();

  // Keeps filter original function into a variable
  const filterFn = rootSearchSource.get('filter');
  rootSearchSource.filter(function (globalSource) {
    // Returns no time range if the request is using comparing
    const isUsingComparing = !!globalSource.get('filter').find(f => f.comparing);
    if (isUsingComparing) return;

    // Otherwise, gets global time range from rootSearchSource
    return filterFn.apply(this, arguments);
  });
}
