export default kibana => new kibana.Plugin({
  id: 'comparable_time_range',
  require: ['kibana'],
  uiExports: {
    hacks: [ 'plugins/comparable_time_range/comparing_hack' ]
  }
});
