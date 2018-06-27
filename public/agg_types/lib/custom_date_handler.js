import moment from 'moment';
import dateMath from '@elastic/datemath';

/**
 * Rounds up `customComparing.to` to the end of the day if needed.
 * Returns the current time (`moment()`) if the field is missing.
 *
 * @param { from, to } customComparing
 */
export function handleCustomDate(customComparing) {
  // If customComparing is missing,
  //  returns the object as if the fields are empty.
  if (!customComparing) return { from: moment(), to: moment() };

  // Checks if `customComparing.to` is using day format.
  //  If so, rounds it to the end of the day
  const isEndDateUsingTime = customComparing.to && customComparing.to.includes(':');
  const momentEndDate = moment(customComparing.to);
  const isEndDateInDayFormat = !isEndDateUsingTime && momentEndDate.isSame(momentEndDate.clone().startOf('day'));

  const endDate = dateMath.parse(customComparing.to) || moment();
  return {
    from: dateMath.parse(customComparing.from) || moment(),
    to: isEndDateInDayFormat ? endDate.endOf('day') : endDate
  };
}
