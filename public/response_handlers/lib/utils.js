function containsAgg(obj, aggId) {
  return Object.keys(obj).includes(aggId);
}

export { containsAgg };
