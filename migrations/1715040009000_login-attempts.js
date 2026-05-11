exports.up = pgm => {
  pgm.createTable('login_attempts', {
    key:              { type: 'text', primaryKey: true },
    first_failure_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    failures:         { type: 'integer', notNull: true, default: 0 },
    locked_until:     { type: 'timestamptz' },
    updated_at:       { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('login_attempts', ['locked_until']);
  pgm.createIndex('login_attempts', ['first_failure_at']);
};

exports.down = pgm => {
  pgm.dropTable('login_attempts');
};
