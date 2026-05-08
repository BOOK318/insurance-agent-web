// Web Push subscriptions per user. One user may have multiple devices.

exports.up = pgm => {
  pgm.createTable('push_subscriptions', {
    id:         { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id:    { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    endpoint:   { type: 'text', notNull: true },
    p256dh:     { type: 'text', notNull: true },
    auth:       { type: 'text', notNull: true },
    user_agent: { type: 'text' },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
    last_used:  { type: 'timestamptz' },
  });
  pgm.addConstraint('push_subscriptions', 'push_subscriptions_endpoint_unique', { unique: ['endpoint'] });
  pgm.createIndex('push_subscriptions', ['user_id']);

  // Mark a reminder as already pushed so we don't double-fire
  pgm.addColumn('reminders', { pushed_at: { type: 'timestamptz' } });
};

exports.down = pgm => {
  pgm.dropColumn('reminders', 'pushed_at');
  pgm.dropTable('push_subscriptions');
};
