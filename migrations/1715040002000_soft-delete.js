// Add `deleted_at` to clients/policies/claims for PDPO right-to-deletion.
// All read queries must filter `WHERE deleted_at IS NULL`.

exports.up = pgm => {
  pgm.addColumn('clients',  { deleted_at: { type: 'timestamptz' } });
  pgm.addColumn('policies', { deleted_at: { type: 'timestamptz' } });
  pgm.addColumn('claims',   { deleted_at: { type: 'timestamptz' } });

  pgm.createIndex('clients',  ['agent_id'], { name: 'idx_clients_agent_active',  where: 'deleted_at IS NULL' });
  pgm.createIndex('policies', ['agent_id'], { name: 'idx_policies_agent_active', where: 'deleted_at IS NULL' });
  pgm.createIndex('claims',   ['agent_id'], { name: 'idx_claims_agent_active',   where: 'deleted_at IS NULL' });
};

exports.down = pgm => {
  pgm.dropIndex('claims',   ['agent_id'], { name: 'idx_claims_agent_active' });
  pgm.dropIndex('policies', ['agent_id'], { name: 'idx_policies_agent_active' });
  pgm.dropIndex('clients',  ['agent_id'], { name: 'idx_clients_agent_active' });
  pgm.dropColumn('claims',   'deleted_at');
  pgm.dropColumn('policies', 'deleted_at');
  pgm.dropColumn('clients',  'deleted_at');
};
