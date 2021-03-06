import chrome from 'ui/chrome';
import { uiModules } from  'ui/modules';
import { decorateAggTypes } from './decorators/agg_types';
import { decorateCourierReqHandler } from './decorators/courier_request_handler';
import { decorateTabbedAggResponseWriter } from './decorators/response_writer';
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
  //  Creating a custom Angular module is breaking some things in v6.4.0.
  //    That's why default `kibana` module is used below.
  //    See https://github.com/elastic/kibana/issues/23278
  uiModules
    // .get('comparable_time_range', ['kibana'])
    .get('kibana')
    .run(Private => {
      decorateAggTypes();
      decorateCourierReqHandler(Private);
      decorateTabbedAggResponseWriter();
      decorateVis(Private);
      decorateAggConfigs();
      decorateAggConfigResult();
    });
}
