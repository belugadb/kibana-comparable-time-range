import { jstz as tzDetect } from 'jstimezonedetect';
import moment from 'moment';
import { dateRange } from 'ui/utils/date_range';
import 'ui/directives/validate_date_math';
import { AggTypesBucketsBucketAggTypeProvider } from 'ui/agg_types/buckets/_bucket_agg_type';
import comparingAggTemplate from './comparing.html';
import { comparingAggController }from './comparing_controller';

const COMPARING_OFFSETS = [
  { display: 'None', offset: '-0d' },
  { display: 'Previous Day', offset: '-1d', default: true },
  { display: 'Previous Week', offset: '-7d' },
  { display: 'Previous Month', offset: '-1M' },
]

const COMPARING_FORMATS = [ '%', 'Absolute' ]

function dateStringBuilder(date, offset) {
  const insertIndex = date.indexOf('/') > 0 ? date.indexOf('/') : date.length;
  return [date.slice(0, insertIndex), offset, date.slice(insertIndex)].join('');
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
        default: function (agg) {
          return agg.vis.indexPattern.timeFieldName;
        }
      },
      {
        name: 'range',
        comparingOffsets: COMPARING_OFFSETS,
        comparingFormats: COMPARING_FORMATS,
        default: {
          from: 'now/d',
          to: 'now',
          comparing: COMPARING_OFFSETS.find(offset => offset.default),
          format: '%'
        },
        editor: comparingAggTemplate,
        controller: comparingAggController,
        write: function (aggConfig, output) {
          // Converts the form inputs into date_range expected params
          const { from, to, comparing  } = aggConfig.params.range;

          const comparingRange = {
            from: dateStringBuilder(from, comparing.offset),
            to: dateStringBuilder(to, comparing.offset)
          };

          // Sets date ranges
          const ranges = [
            comparingRange,
            { from, to }
          ];
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
