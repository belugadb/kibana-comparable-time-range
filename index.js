export default kibana => new kibana.Plugin({
  id: 'comparing_table',
  require: ['kibana'],
  uiExports: {
    hacks: [ 'plugins/comparing_table/comparing_hack' ]
  }
});
