import chrome from 'ui/chrome';
import { uiModules } from  'ui/modules';
import { decorateAggTypes } from './decorators/agg_types';
import { decorateRootSearchSource } from './decorators/root_search_source';
import { decorateTabbedAggResponseWriterProvider } from './decorators/response_writer';
import { decorateVis } from './decorators/vis';
import { decorateAggConfigResult } from './decorators/agg_config_result';
import './decorators/agg_table';
import './decorators/paginated_table';
import './styles/comparing.less';
const appId = chrome.getApp().id;

// Only inject decorator on kibana app
if (appId === 'kibana') {
  uiModules
    .get('comparable_time_range', ['kibana'])
    .run((Private) => {
      decorateAggTypes(Private);
      decorateRootSearchSource(Private);
      decorateTabbedAggResponseWriterProvider(Private);
      decorateVis(Private);
      decorateAggConfigResult();
    });
}
