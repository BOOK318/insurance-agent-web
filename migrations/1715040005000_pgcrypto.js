// Enable pgcrypto for column-level encryption (HKID, future PII fields).
// We don't encrypt names/phones/emails because we still need ILIKE search.
// Use FileVault on the Mac mini disk for full-volume encryption at rest.

exports.up = pgm => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  // Convert hkid to encrypted form. Empty initially; the route will write
  // pgp_sym_encrypt(value, key) when an HKID is added or edited.
  pgm.addColumn('clients', { hkid_encrypted: { type: 'bytea' } });
};

exports.down = pgm => {
  pgm.dropColumn('clients', 'hkid_encrypted');
  // Keep pgcrypto extension; harmless and other features may use it.
};
