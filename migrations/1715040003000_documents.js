// Document attachments for clients / policies / claims.
// Files live on disk under DOCUMENT_STORAGE_DIR; this row holds metadata.

exports.up = pgm => {
  pgm.createTable('documents', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    agent_id:     { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    client_id:    { type: 'uuid', references: 'clients(id)',  onDelete: 'CASCADE' },
    policy_id:    { type: 'uuid', references: 'policies(id)', onDelete: 'CASCADE' },
    claim_id:     { type: 'uuid', references: 'claims(id)',   onDelete: 'CASCADE' },
    title:        { type: 'text', notNull: true },
    file_name:    { type: 'text', notNull: true },
    mime_type:    { type: 'text', notNull: true },
    size_bytes:   { type: 'bigint', notNull: true },
    storage_key:  { type: 'text', notNull: true, comment: 'relative path in DOCUMENT_STORAGE_DIR' },
    sha256:       { type: 'text' },
    notes:        { type: 'text' },
    deleted_at:   { type: 'timestamptz' },
    created_at:   { type: 'timestamptz', default: pgm.func('now()') },
  });

  pgm.createIndex('documents', ['agent_id'],  { where: 'deleted_at IS NULL' });
  pgm.createIndex('documents', ['client_id'], { where: 'deleted_at IS NULL' });
  pgm.createIndex('documents', ['policy_id'], { where: 'deleted_at IS NULL' });
  pgm.createIndex('documents', ['claim_id'],  { where: 'deleted_at IS NULL' });

  // Each row must attach to at least one parent
  pgm.addConstraint('documents', 'documents_at_least_one_parent', {
    check: 'client_id IS NOT NULL OR policy_id IS NOT NULL OR claim_id IS NOT NULL',
  });
};

exports.down = pgm => {
  pgm.dropTable('documents');
};
