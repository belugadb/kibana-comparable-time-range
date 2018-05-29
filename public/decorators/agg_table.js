import chrome from 'ui/chrome';
import { uiModules } from 'ui/modules';
import { ComparingProvider } from '../lib/comparing';
const appId = chrome.getApp().id;

// Only inject decorator on kibana app
if (appId === 'kibana') {
  uiModules
    .get('kibana')
    .config(($provide) => {
      // Decorates kbnAggTable default directive
      $provide.decorator('kbnAggTableDirective', ($delegate, $controller) => {
        const directive = $delegate[0];
        const controllerName = directive.controller;

        directive.controller = function ($scope, Private) {
          angular.extend(this, $controller(controllerName, { $scope: $scope }));
          const getDifference = Private(ComparingProvider);

          // This will run after $scope.$watch('table') from default controller
          $scope.$watch('table', () => {
            const table = $scope.table;

            // Validations
            if (!table) return;
            const hasColumns = !!table.columns.length;
            const isUsingComparing = table.rows[0] && !!table.rows[0].find(col => col.comparing);
            const shouldApplyComparing = hasColumns && isUsingComparing;
            if (!shouldApplyComparing) return;

            const isPercentage = isUsingComparing && table.columns[0] && table.columns[0].aggConfig.vis.comparingConfig.format === '%';

            // Calculates total difference from every $scope.formattedColumns element
            $scope.formattedColumns = table.columns.map((col, i) => {
              const formattedColumn = $scope.formattedColumns[i];

              // Validations
              const agg = table.aggConfig(col);
              const field = agg.getField();
              const isFieldDate = field && field.type === 'date';
              const isBucketColumn = agg.type.type === 'buckets';
              if(isFieldDate || isBucketColumn) return formattedColumn;

              // Adds formatter into formattedColumn
              formattedColumn.formatter = agg.fieldFormatter('text');

              const sum = tableRows => tableRows.reduce((prev, curr) => {
                // some metrics return undefined for some of the values
                // derivative is an example of this as it returns undefined in the first row
                if (curr[i].value === undefined) return prev;
                return prev + curr[i].value;
              }, 0);
              const sumComparing = tableRows => tableRows.reduce((prev, curr) => {
                if (curr[i].comparing === undefined) return prev;
                return prev + curr[i].comparing;
              }, 0);

              // Adds differenceTotal into formattedColumn.total
              let totalRaw;
              let comparingTotal;
              let differenceTotal;
              switch ($scope.totalFunc) {
                case 'sum':
                  totalRaw = sum(table.rows);
                  comparingTotal = sumComparing(table.rows);
                  differenceTotal = getDifference(comparingTotal, totalRaw, isPercentage);
                  break;
                case 'avg':
                  totalRaw = sum(table.rows) / table.rows.length;
                  comparingTotal = sumComparing(table.rows) / table.rows.length;
                  differenceTotal = getDifference(comparingTotal, totalRaw, isPercentage);
                  break;
                default:
                  break;
              }
              formattedColumn.total = `${formattedColumn.total}${differenceTotal}`;

              return formattedColumn;
            });
          });
        };

        return $delegate;
      });
    });
}
