import { fieldFormats } from 'ui/registry/field_formats';

const INVALID_DIFF_TEXT = '(--)';

function roundDecimal(n) {
  return Math.round(n * 100) / 100.00;
}

function findDifferencePct(n1, n2) {
  const diff = (n2 - n1) / n1;
  return roundDecimal(diff);
}

function findDifferenceAbs(n1, n2) {
  return n2 - n1;
}

function getHTML(text, diff) {
  const styleClass = (diff >= 0)
    ? 'comparing-text'
    : 'comparing-text--negative';
  return `<span class=${styleClass}>${text}</span>`;
}

function getFormatter(isPercentage) {
  return isPercentage
    ? fieldFormats.getInstance('percent').getConverterFor('text')
    : fieldFormats.getDefaultInstance('number').getConverterFor('text');
}

function formatValue(diff, isPercentage) {
  const sign = (diff >= 0) ? '+' : '';
  const formatter = getFormatter(isPercentage);
  const text = `(${sign}${formatter(diff)})`;
  return getHTML(text, diff);
}

export function getDifference(n1, n2, isPercentage) {
  const isInvalidDiff = isPercentage && !n1;
  if (isInvalidDiff) return INVALID_DIFF_TEXT;

  const diffFn = isPercentage ? findDifferencePct : findDifferenceAbs;
  const diff = diffFn(n1, n2);
  return formatValue(diff, isPercentage);
}
