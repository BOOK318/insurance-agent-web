// Add explicit nationality field and make sure preferences exists on older DBs.

exports.up = pgm => {
  pgm.sql('ALTER TABLE clients ADD COLUMN IF NOT EXISTS nationality TEXT');
  pgm.sql('ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferences TEXT');
};

exports.down = pgm => {
  pgm.sql('ALTER TABLE clients DROP COLUMN IF EXISTS nationality');
};
