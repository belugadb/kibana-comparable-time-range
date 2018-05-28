import { VisTypesRegistryProvider } from 'ui/registry/vis_types';
import { VisSchemasProvider } from 'ui/vis/editors/default/schemas';
import { ComparingResponseHandlerProvider } from '../response_handlers/comparing';

const ALLOWED_VIS_TYPES = ['table'];

/**
 * Checks if aggFilter array is including or excluding aggregations
 * @param aggFilter
 * @returns {boolean}
 */
function isNegativePermissionList(aggFilter) {
  if (!aggFilter[0]) return true;
  return !!aggFilter[0].startsWith('!');
}

/**
 * Gets permission string based on aggFilter list permission and allowed vis types
 * @param aggFilter
 * @returns {String|null}
 */
function getPermission(aggFilter) {
  return isNegativePermissionList(aggFilter) ? '!comparing' : null;
}

/**
 * Gets aggFilter array (creates a new one if missing)
 * @param aggFilter
 * @returns {*[]|Array}
 */
function getAggFilter(aggFilter) {
  // Transforms String into array if needed
  const newAggFilter = (typeof aggFilter === 'string') ? [aggFilter] : aggFilter;
  // Returns an empty array if null
  return newAggFilter || [];
}

export function decorateVis(Private) {
  const VisTypes = Private(VisTypesRegistryProvider);
  const Schemas = Private(VisSchemasProvider);
  const responseHandler = Private(ComparingResponseHandlerProvider).handler;

  VisTypes.forEach(vis => {
    if (vis.editorConfig && vis.editorConfig.schemas) {
      vis.editorConfig.schemas.buckets.forEach(bucket => {
        const newAggFilter = getAggFilter(bucket.aggFilter);
        const permission = getPermission(newAggFilter);

        // Adds a negative permission in every bucket
        if (permission) {
          newAggFilter.push(permission);
          bucket.aggFilter = newAggFilter;
        }
      });

      const allowedVisType = ALLOWED_VIS_TYPES.includes(vis.type);
      if (allowedVisType) {
        // Adds a new bucket option in allowed vis types
        const schemas = vis.editorConfig.schemas.all.raw;
        schemas.push({
          group: 'buckets',
          name: 'compare',
          title: 'Compare Data',
          aggFilter: ['comparing'],
          min: 0,
          max: 1
        });
        vis.editorConfig.schemas = new Schemas(schemas);

        // Modify the default responseHandler of the vis
        vis.responseHandler = responseHandler;
      }
    }
  });
}
