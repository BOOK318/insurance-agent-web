/**
 * Behavioural test for the inbox-model reminder endpoints:
 *   POST /api/reminders/mark-all-read    (bulk: mark all this agent's unread → read)
 *   PATCH /api/reminders/[id]            (single: { read: true })
 *
 * We don't boot Next.js — we re-implement the handler control flow against
 * a mock DB + session. The assertions describe the contract the production
 * handlers must satisfy.
 */

import assert from 'node:assert/strict';

function mockDb(state) {
  return {
    async query(sql, params) {
      if (/^UPDATE reminders SET is_sent = TRUE WHERE agent_id = \$1 AND is_sent = FALSE$/.test(sql.trim())) {
        const agent = params[0];
        let touched = 0;
        for (const r of state.reminders) {
          if (r.agent_id === agent && !r.is_sent) {
            r.is_sent = true;
            touched += 1;
          }
        }
        return { rowCount: touched };
      }
      if (/^UPDATE reminders SET is_sent = TRUE\s+WHERE id = \$1 AND agent_id = \$2 AND is_sent = FALSE$/.test(sql.trim())) {
        const [id, agent] = params;
        const r = state.reminders.find(x => x.id === id && x.agent_id === agent && !x.is_sent);
        if (r) {
          r.is_sent = true;
          return { rowCount: 1 };
        }
        return { rowCount: 0 };
      }
      throw new Error('unmocked: ' + sql.slice(0, 80));
    },
  };
}

// ── handler reimplementations ────────────────────────────────────────────
async function markAllRead({ session, db }) {
  if (!session) return { status: 401, body: { error: 'Unauthorized' } };
  const { rowCount } = await db.query(
    'UPDATE reminders SET is_sent = TRUE WHERE agent_id = $1 AND is_sent = FALSE',
    [session.id],
  );
  return { status: 200, body: { ok: true, marked: rowCount ?? 0 } };
}

async function markOneRead({ session, id, body, db }) {
  if (!session) return { status: 401, body: { error: 'Unauthorized' } };
  if (body?.read !== true) {
    return { status: 400, body: { error: '只支援 { read: true }' } };
  }
  const { rowCount } = await db.query(
    `UPDATE reminders SET is_sent = TRUE
     WHERE id = $1 AND agent_id = $2 AND is_sent = FALSE`,
    [id, session.id],
  );
  return { status: 200, body: { ok: true, marked: rowCount ?? 0 } };
}

// ── tests ────────────────────────────────────────────────────────────────
async function run() {
  const alice = { id: 'a1' };
  const bob   = { id: 'b1' };

  const baseState = () => ({
    reminders: [
      { id: 'r1', agent_id: 'a1', is_sent: false },
      { id: 'r2', agent_id: 'a1', is_sent: true  },
      { id: 'r3', agent_id: 'a1', is_sent: false },
      { id: 'r4', agent_id: 'b1', is_sent: false }, // bob's, must NOT be touched by alice's actions
    ],
  });

  // ── mark-all-read ──
  // 1. unauthenticated → 401
  {
    const res = await markAllRead({ session: null, db: mockDb(baseState()) });
    assert.equal(res.status, 401);
  }
  // 2. happy path: marks only alice's unread, returns count
  {
    const state = baseState();
    const res = await markAllRead({ session: alice, db: mockDb(state) });
    assert.equal(res.status, 200);
    assert.equal(res.body.marked, 2, 'should mark r1 + r3 (2 rows)');
    assert.equal(state.reminders.find(r => r.id === 'r1').is_sent, true);
    assert.equal(state.reminders.find(r => r.id === 'r2').is_sent, true, 'r2 was already read, untouched');
    assert.equal(state.reminders.find(r => r.id === 'r3').is_sent, true);
    assert.equal(state.reminders.find(r => r.id === 'r4').is_sent, false, "bob's row must not be touched");
  }
  // 3. idempotent: second call marks 0
  {
    const state = baseState();
    const db = mockDb(state);
    await markAllRead({ session: alice, db });
    const second = await markAllRead({ session: alice, db });
    assert.equal(second.body.marked, 0, 'second call is a no-op');
  }
  // 4. empty inbox: marks 0
  {
    const state = { reminders: [] };
    const res = await markAllRead({ session: alice, db: mockDb(state) });
    assert.equal(res.status, 200);
    assert.equal(res.body.marked, 0);
  }

  // ── PATCH /api/reminders/[id] ──
  // 5. unauthenticated → 401
  {
    const res = await markOneRead({ session: null, id: 'r1', body: { read: true }, db: mockDb(baseState()) });
    assert.equal(res.status, 401);
  }
  // 6. wrong body → 400 (no rows touched)
  {
    const state = baseState();
    const res = await markOneRead({ session: alice, id: 'r1', body: { read: false }, db: mockDb(state) });
    assert.equal(res.status, 400);
    assert.equal(state.reminders.find(r => r.id === 'r1').is_sent, false);
  }
  // 7. happy path: marks the one row, doesn't touch others
  {
    const state = baseState();
    const res = await markOneRead({ session: alice, id: 'r1', body: { read: true }, db: mockDb(state) });
    assert.equal(res.status, 200);
    assert.equal(res.body.marked, 1);
    assert.equal(state.reminders.find(r => r.id === 'r1').is_sent, true);
    assert.equal(state.reminders.find(r => r.id === 'r3').is_sent, false, 'unrelated unread row untouched');
  }
  // 8. cross-tenant: alice tries to mark bob's reminder → 200 but 0 marked (id not enumerated)
  {
    const state = baseState();
    const res = await markOneRead({ session: alice, id: 'r4', body: { read: true }, db: mockDb(state) });
    assert.equal(res.status, 200);
    assert.equal(res.body.marked, 0, "alice cannot affect bob's reminder");
    assert.equal(state.reminders.find(r => r.id === 'r4').is_sent, false);
  }
  // 9. already-read: 200, marked 0 (idempotent)
  {
    const state = baseState();
    const res = await markOneRead({ session: alice, id: 'r2', body: { read: true }, db: mockDb(state) });
    assert.equal(res.status, 200);
    assert.equal(res.body.marked, 0);
  }
  // 10. unknown id: 200, marked 0 (silent — same as already-read, defends against enumeration)
  {
    const state = baseState();
    const res = await markOneRead({ session: alice, id: 'no-such', body: { read: true }, db: mockDb(state) });
    assert.equal(res.status, 200);
    assert.equal(res.body.marked, 0);
  }

  console.log('reminders inbox endpoints contract: PASS (10 cases)');
}

run().catch(err => { console.error(err); process.exit(1); });
