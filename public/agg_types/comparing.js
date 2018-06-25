import moment from 'moment';
import { jstz as tzDetect } from 'jstimezonedetect';
import dateMath from '@elastic/datemath';
import 'ui/directives/validate_date_math';
import { AggTypesBucketsBucketAggTypeProvider } from 'ui/agg_types/buckets/_bucket_agg_type';
import comparingAggTemplate from './comparing.html';
import { comparingAggController } from './comparing_controller';

const COMPARING_OFFSETS = [
  {
    display: 'None',
    offset: { value: 0, unit: 'days' }
  },
  {
    display: 'Previous Day',
    offset: { value: 1, unit: 'day' },
    default: true
  },
  {
    display: 'Previous Week',
    offset: { value: 7, unit: 'days' }
  },
  {
    display: 'Previous Month',
    offset: { value: 1, unit: 'month' }
  },
  {
    display: 'Custom'
  }
];

const COMPARING_FORMATS = [ '%', 'Absolute' ];

function getDate(date, offset) {
  if (!offset) return date.toISOString();
  return date.clone().subtract(offset.value, offset.unit).toISOString();
}

/**
 * Rounds up `customComparing.to` to the end of the day if needed
 *
 * @param { from, to } customComparing
 */
function handleCustomDate(customComparing) {
  // Checks if `customComparing.to` is using day format.
  //  If so, rounds it to the end of the day
  //  TODO: Add custom error when fields are empty
  const isEndDateUsingTime = customComparing.to && customComparing.to.includes(':');
  const momentEndDate = moment(customComparing.to);
  const isEndDateInDayFormat = !isEndDateUsingTime && momentEndDate.isSame(momentEndDate.startOf('day'));

  const endDate = dateMath.parse(customComparing.to) || moment();
  return {
    from: dateMath.parse(customComparing.from) || moment(),
    to: isEndDateInDayFormat ? endDate.endOf('day') : endDate
  };
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
          custom: {
            from: '',
            to: ''
          },
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

          // Handles custom comparing
          const isCustomComparing = aggConfig.params.range.comparing.display === 'Custom';
          const customComparing = handleCustomDate(aggConfig.params.range.custom);

          // Comparing date range
          const comparingRanges = {
            from: isCustomComparing ? getDate(customComparing.from) : getDate(timeFilterBounds.min, offset),
            to: isCustomComparing ? getDate(customComparing.to) : getDate(timeFilterBounds.max, offset)
          };

          // Builds date ranges array
          const ranges = [
            comparingRanges,
            // Base date range
            {
              from: getDate(timeFilterBounds.min),
              to: getDate(timeFilterBounds.max)
            }
          ];

          // Sets date ranges and date format
          output.params.ranges = ranges;
          output.params.format = 'date_time';

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
