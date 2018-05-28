import { uiModules } from  'ui/modules';
import chrome from 'ui/chrome';
import { decorateAggTypes } from './decorators/agg_types';
import { decorateTabbedAggResponseWriterProvider } from './decorators/response_writer';
import { decorateAggConfigResult } from './decorators/agg_config_result';
import { decorateVis } from './decorators/vis';
import './decorators/agg_table';
const appId = chrome.getApp().id;

// Only inject decorator on kibana app
if (appId === 'kibana') {
  uiModules
    .get('comparing_table', ['kibana'])
    .run((Private) => {
      decorateAggTypes(Private);
      decorateTabbedAggResponseWriterProvider(Private);
      decorateVis(Private);
      decorateAggConfigResult();
    });
}
