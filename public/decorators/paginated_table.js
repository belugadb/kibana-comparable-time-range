import chrome from 'ui/chrome';
import { uiModules } from 'ui/modules';
const appId = chrome.getApp().id;

// Only inject decorator on kibana app
if (appId === 'kibana') {
  uiModules
    .get('kibana')
    .config(($provide) => {
      $provide.decorator('paginatedTableDirective', $delegate => {
        // Injects 'ng-bind-html' into paginated_table's footer element.
        //  This allow us to render comparing value from col.total as HTML
        const oldElement = '<th scope="col" ng-repeat="col in columns" class="numeric-value">{{col.total}}</th>';
        const newElement = '<th scope="col" ng-repeat="col in columns" class="numeric-value" ng-bind-html="col.total"></th>';

        const template = $delegate[0].template;
        $delegate[0].template = template.replace(oldElement, newElement);

        return $delegate;
      });
    });
}
