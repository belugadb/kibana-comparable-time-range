import chrome from 'ui/chrome';
import { uiModules } from  'ui/modules';
import { decorateAggTypes } from './decorators/agg_types';
import { decorateCourierReqHandler } from './decorators/courier_request_handler';
import { decorateTabbedAggResponseWriterProvider } from './decorators/response_writer';
import { decorateVis } from './decorators/vis';
import { decorateAggConfigs } from './decorators/agg_configs';
import { decorateAggConfigResult } from './decorators/agg_config_result';
import './decorators/agg_table';
import './decorators/paginated_table';
import './response_handlers/comparing';
import './styles/comparing.less';
const appId = chrome.getApp().id;

// Only inject decorator on kibana app
if (appId === 'kibana') {
  uiModules
    .get('comparable_time_range', ['kibana'])
    .run((Private) => {
      decorateAggTypes(Private);
      decorateCourierReqHandler(Private);
      decorateTabbedAggResponseWriterProvider(Private);
      decorateVis(Private);
      decorateAggConfigs(Private);
      decorateAggConfigResult();
    });
}
