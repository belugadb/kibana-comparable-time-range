


export default function (kibana) {
  return new kibana.Plugin({
    require: ['elasticsearch'],
    name: 'kibana-comparing-table',
    uiExports: {
      
      
      
      hacks: [
        'plugins/kibana-comparing-table/hack'
      ]
      
    },

    config(Joi) {
      return Joi.object({
        enabled: Joi.boolean().default(true),
      }).default();
    },

    

  });
};
