import chrome from 'ui/chrome';
import { uiModules } from 'ui/modules';
const appId = chrome.getApp().id;

// Only inject decorator on kibana app
if (appId === 'kibana') {
  uiModules
    .get('kibana/directive')
    .config($provide => {
      $provide.decorator('visualizeDirective', $delegate => {
        const directive = $delegate[0];
        const link = directive.link;

        directive.compile = () => {
          return function ($scope) {
            link.apply(this, arguments);

            // Overrides shouldShowSpyPanel function
            const shouldShowSpyPanel = $scope.shouldShowSpyPanel;
            $scope.shouldShowSpyPanel = () => {
              const isUsingComparing = $scope.vis.type.requestHandler === 'comparing';
              if (isUsingComparing && $scope.vis.type.requiresSearch && $scope.showSpyPanel) return true;
              return shouldShowSpyPanel();
            };
          };
        };

        return $delegate;
      });
    });
}
