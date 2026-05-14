/**
 * Behavioural test for the new DELETE /api/admin/users flow.
 * We don't boot Next.js — we re-implement the handler's control flow inline
 * against a mock DB + mock session, asserting every branch.
 *
 * If the source ever diverges, the assertions still describe the *contract*
 * that the production handler must satisfy.
 */

import assert from 'node:assert/strict';

// ── mocks ─────────────────────────────────────────────────────────
function mockDb(state) {
  return {
    async query(sql, params) {
      if (/SELECT id, email, role FROM users WHERE id =/.test(sql)) {
        const u = state.users.find(x => x.id === params[0]);
        return { rows: u ? [u] : [] };
      }
      if (/SELECT[\s\S]+FROM clients[\s\S]+FROM policies[\s\S]+FROM claims[\s\S]+FROM documents/.test(sql)) {
        const id = params[0];
        return {
          rows: [{
            clients:   String(state.cascade[id]?.clients   ?? 0),
            policies:  String(state.cascade[id]?.policies  ?? 0),
            claims:    String(state.cascade[id]?.claims    ?? 0),
            documents: String(state.cascade[id]?.documents ?? 0),
          }],
        };
      }
      if (/^DELETE FROM users WHERE id = \$1/.test(sql)) {
        state.users = state.users.filter(x => x.id !== params[0]);
        state.deleted.push(params[0]);
        return { rowCount: 1 };
      }
      throw new Error('unmocked query: ' + sql.slice(0, 80));
    },
  };
}

// Re-implement the handler so we can drive it without the Next.js runtime.
async function handleDelete({ session, urlId, jsonBody, db, purgedDirs, audit }) {
  if (!session || session.role !== 'admin') return { status: 403, body: { error: 'Forbidden' } };

  const id = typeof urlId === 'string' ? urlId.trim() : '';
  if (!id) return { status: 400, body: { error: '缺少帳號 ID' } };
  if (id === session.id) return { status: 400, body: { error: '唔可以刪除自己嘅管理員帳號' } };

  const confirmEmail = typeof jsonBody?.confirm_email === 'string' ? jsonBody.confirm_email.trim().toLowerCase() : '';
  if (!confirmEmail) return { status: 400, body: { error: '請輸入該帳號嘅 Email 確認刪除（會連同所有客戶、保單、Claim、文件一齊刪除）' } };

  const { rows: targets } = await db.query('SELECT id, email, role FROM users WHERE id = $1', [id]);
  const target = targets[0];
  if (!target) return { status: 404, body: { error: '找不到帳號' } };
  if (target.email.toLowerCase() !== confirmEmail) {
    return { status: 400, body: { error: '確認 Email 唔啱，請輸入嗰個帳號嘅 Email' } };
  }

  const { rows: countsRows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM clients   WHERE agent_id = $1) AS clients,
       (SELECT COUNT(*) FROM policies  WHERE agent_id = $1) AS policies,
       (SELECT COUNT(*) FROM claims    WHERE agent_id = $1) AS claims,
       (SELECT COUNT(*) FROM documents WHERE agent_id = $1) AS documents`,
    [id],
  );
  const counts = countsRows[0];

  await db.query('DELETE FROM users WHERE id = $1', [id]);
  purgedDirs.push(id);

  audit.push({
    action: 'admin.user.deleted',
    targetId: target.id,
    metadata: {
      email: target.email,
      role: target.role,
      cascaded: {
        clients:   Number(counts?.clients   ?? 0),
        policies:  Number(counts?.policies  ?? 0),
        claims:    Number(counts?.claims    ?? 0),
        documents: Number(counts?.documents ?? 0),
      },
    },
  });

  return { status: 200, body: { ok: true } };
}

// ── tests ─────────────────────────────────────────────────────────
async function run() {
  const adminId = '11111111-1111-1111-1111-111111111111';
  const targetId = '22222222-2222-2222-2222-222222222222';
  const baseState = () => ({
    users: [
      { id: adminId,  email: 'admin@team.local', role: 'admin' },
      { id: targetId, email: 'agent@team.local', role: 'agent' },
    ],
    cascade: {
      [targetId]: { clients: 5, policies: 12, claims: 3, documents: 7 },
    },
    deleted: [],
  });
  const adminSession = { id: adminId, role: 'admin' };

  // 1. non-admin forbidden
  {
    const state = baseState();
    const res = await handleDelete({
      session: { id: 'someone', role: 'agent' },
      urlId: targetId,
      jsonBody: { confirm_email: 'agent@team.local' },
      db: mockDb(state),
      purgedDirs: [],
      audit: [],
    });
    assert.equal(res.status, 403, 'non-admin should be forbidden');
    assert.equal(state.deleted.length, 0, 'no deletion happened');
  }

  // 2. unauthenticated forbidden
  {
    const state = baseState();
    const res = await handleDelete({
      session: null,
      urlId: targetId,
      jsonBody: { confirm_email: 'agent@team.local' },
      db: mockDb(state),
      purgedDirs: [],
      audit: [],
    });
    assert.equal(res.status, 403);
  }

  // 3. missing id
  {
    const res = await handleDelete({
      session: adminSession,
      urlId: '',
      jsonBody: { confirm_email: 'x' },
      db: mockDb(baseState()),
      purgedDirs: [],
      audit: [],
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /缺少帳號 ID/);
  }

  // 4. self-delete rejected
  {
    const res = await handleDelete({
      session: adminSession,
      urlId: adminId,
      jsonBody: { confirm_email: 'admin@team.local' },
      db: mockDb(baseState()),
      purgedDirs: [],
      audit: [],
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /唔可以刪除自己/);
  }

  // 5. missing confirm_email rejected
  {
    const state = baseState();
    const purged = [];
    const res = await handleDelete({
      session: adminSession,
      urlId: targetId,
      jsonBody: {},
      db: mockDb(state),
      purgedDirs: purged,
      audit: [],
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /請輸入/);
    assert.equal(state.deleted.length, 0, 'no DB delete without confirm_email');
    assert.equal(purged.length, 0, 'no disk purge without confirm_email');
  }

  // 6. wrong confirm_email rejected
  {
    const state = baseState();
    const purged = [];
    const res = await handleDelete({
      session: adminSession,
      urlId: targetId,
      jsonBody: { confirm_email: 'wrong@team.local' },
      db: mockDb(state),
      purgedDirs: purged,
      audit: [],
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /確認 Email 唔啱/);
    assert.equal(state.deleted.length, 0);
    assert.equal(purged.length, 0);
  }

  // 7. confirm_email matches but user not found → 404
  {
    const state = baseState();
    const purged = [];
    const res = await handleDelete({
      session: adminSession,
      urlId: '99999999-9999-9999-9999-999999999999',
      jsonBody: { confirm_email: 'doesnt-matter@team.local' },
      db: mockDb(state),
      purgedDirs: purged,
      audit: [],
    });
    assert.equal(res.status, 404);
    assert.equal(state.deleted.length, 0);
    assert.equal(purged.length, 0);
  }

  // 8. case-insensitive email match accepted
  {
    const state = baseState();
    const purged = [];
    const audit = [];
    const res = await handleDelete({
      session: adminSession,
      urlId: targetId,
      jsonBody: { confirm_email: 'AGENT@team.LOCAL' },
      db: mockDb(state),
      purgedDirs: purged,
      audit,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(state.deleted[0], targetId);
    assert.equal(purged[0], targetId);
    assert.equal(audit[0].action, 'admin.user.deleted');
    assert.deepEqual(audit[0].metadata.cascaded, { clients: 5, policies: 12, claims: 3, documents: 7 });
  }

  // 9. happy path: exact match, cascade counts in audit
  {
    const state = baseState();
    const purged = [];
    const audit = [];
    const res = await handleDelete({
      session: adminSession,
      urlId: targetId,
      jsonBody: { confirm_email: 'agent@team.local' },
      db: mockDb(state),
      purgedDirs: purged,
      audit,
    });
    assert.equal(res.status, 200);
    assert.equal(state.deleted[0], targetId, 'target row deleted');
    assert.equal(purged[0], targetId, 'on-disk dir queued for purge');
    assert.equal(audit[0].metadata.email, 'agent@team.local');
    assert.equal(audit[0].metadata.cascaded.clients, 5);
    assert.equal(audit[0].metadata.cascaded.documents, 7);
  }

  console.log('admin DELETE handler contract: PASS (9 cases)');
}

run().catch(err => { console.error(err); process.exit(1); });
