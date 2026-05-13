exports.up = pgm => {
  pgm.sql("DELETE FROM settings WHERE key = 'ANTHROPIC_API_KEY'");
};

exports.down = () => {};
