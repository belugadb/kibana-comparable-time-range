import { jstz as tzDetect } from 'jstimezonedetect';
import moment from 'moment';
import 'ui/directives/validate_date_math';
import { AggTypesBucketsBucketAggTypeProvider } from 'ui/agg_types/buckets/_bucket_agg_type';
import comparingAggTemplate from './comparing.html';
import { comparingAggController }from './comparing_controller';

const COMPARING_OFFSETS = [
  {
    display: 'None',
    offset: { unit: 0, value: 'days' }
  },
  {
    display: 'Previous Day',
    offset: { unit: 1, value: 'day' },
    default: true
  },
  {
    display: 'Previous Week',
    offset: { unit: 7, value: 'days' }
  },
  {
    display: 'Previous Month',
    offset: { unit: 1, value: 'month' }
  }
];

const COMPARING_FORMATS = [ '%', 'Absolute' ];

function getDate(date, offset) {
  if (!offset) return date.toISOString();
  return date.clone().subtract(offset.unit, offset.value).toISOString();
}

export function AggTypesBucketsComparingProvider(config, Private) {
  const BucketAggType = Private(AggTypesBucketsBucketAggTypeProvider);

  const detectedTimezone = tzDetect.determine().name();
  const tzOffset = moment().format('Z');

  return new BucketAggType({
    name: 'comparing',
    title: 'Comparing',
    dslName: 'date_range',
    customLabels: false,
    params: [
      {
        name: 'field',
        filterFieldTypes: 'date',
        default: agg => agg.vis.indexPattern.timeFieldName
      },
      {
        name: 'range',
        comparingOffsets: COMPARING_OFFSETS,
        comparingFormats: COMPARING_FORMATS,
        default: {
          comparing: COMPARING_OFFSETS.find(offset => offset.default),
          format: '%'
        },
        editor: comparingAggTemplate,
        controller: comparingAggController,
        write: (aggConfig, output) => {
          // Gets global timeFilter settings
          const timeFilter = aggConfig.vis.API.timeFilter;
          const timeFilterBounds = timeFilter.getBounds();

          // Gets offset config from agg
          const { offset } = aggConfig.params.range.comparing;

          // Builds date ranges array
          const ranges = [
            // Comparing date range
            {
              from: getDate(timeFilterBounds.min, offset),
              to: getDate(timeFilterBounds.max, offset)
            },
            // Base date range
            {
              from: getDate(timeFilterBounds.min),
              to: getDate(timeFilterBounds.max)
            }
          ];

          // Sets date ranges
          output.params.ranges = ranges;

          // Sets agg time_zone
          const isDefaultTimezone = config.isDefault('dateFormat:tz');
          output.params.time_zone = isDefaultTimezone
            ? (detectedTimezone || tzOffset)
            : config.get('dateFormat:tz');

          return output;
        }
      }
    ]
  });
}
