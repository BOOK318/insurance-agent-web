exports.up = pgm => {
  pgm.createTable('audit_logs', {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    actor_user_id: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
    action:        { type: 'text', notNull: true },
    target_type:   { type: 'text' },
    target_id:     { type: 'uuid' },
    metadata:      { type: 'jsonb' },
    ip:            { type: 'text' },
    user_agent:    { type: 'text' },
    created_at:    { type: 'timestamptz', default: pgm.func('now()') },
  });

  pgm.createIndex('audit_logs', ['actor_user_id', 'created_at']);
  pgm.createIndex('audit_logs', ['action', 'created_at']);
};

exports.down = pgm => {
  pgm.dropTable('audit_logs');
};

