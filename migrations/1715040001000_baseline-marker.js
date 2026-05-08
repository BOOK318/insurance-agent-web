// Empty baseline. Marks the point in time where node-pg-migrate took over
// schema management. Everything in schema.sql is considered "applied" before
// this migration runs. New schema changes go in subsequent migrations.

exports.up = pgm => {
  // intentionally empty
};

exports.down = pgm => {
  // intentionally empty
};
