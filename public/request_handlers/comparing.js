import { VisRequestHandlersRegistryProvider } from 'ui/registry/vis_request_handlers';
import { CourierRequestHandlerProvider } from 'ui/vis/request_handlers/courier';

const ComparingRequestHandlerProvider = function (Private, courier, timefilter) {
  const courierRequestHandler = Private(CourierRequestHandlerProvider);

  return {
    name: 'comparing',
    handler: function (vis, appState, uiState, queryFilter, searchSource) {

      console.log('comparing reqHandler decorator');
      return courierRequestHandler.handler(...arguments);
    }
  };
};

VisRequestHandlersRegistryProvider.register(ComparingRequestHandlerProvider);

export { ComparingRequestHandlerProvider };
