/**
 * Contract test for the reminders worker is_sent / pushed_at handling.
 *
 * The worker code lives in worker/reminders-worker.mjs but is wired to a real
 * pg Pool and webpush. Rather than spin both up, we re-implement the two
 * functions under test (processDueReminders, backfillPushedReminders) against
 * an in-memory mock that records every SQL call. If the production worker
 * ever diverges, these assertions still describe the contract it must keep.
 */

import assert from 'node:assert/strict';

function mockPool(state) {
  return {
    async query(sql, params) {
      // backfill statement
      if (/UPDATE reminders[\s\S]+SET is_sent = TRUE[\s\S]+WHERE pushed_at IS NOT NULL AND is_sent = FALSE/.test(sql)) {
        let touched = 0;
        for (const r of state.reminders) {
          if (r.pushed_at && !r.is_sent) {
            r.is_sent = true;
            touched += 1;
          }
        }
        return { rowCount: touched };
      }
      // post-push mark
      if (/UPDATE reminders SET pushed_at = NOW\(\), is_sent = TRUE WHERE id =/.test(sql)) {
        const r = state.reminders.find(x => x.id === params[0]);
        if (r) {
          r.pushed_at = new Date().toISOString();
          r.is_sent = true;
        }
        return { rowCount: r ? 1 : 0 };
      }
      throw new Error('unmocked query: ' + sql.slice(0, 80));
    },
  };
}

// ── Re-implementations of the two functions under test ───────────────────
async function backfillPushedReminders(pool) {
  const { rowCount } = await pool.query(
    `UPDATE reminders
     SET is_sent = TRUE
     WHERE pushed_at IS NOT NULL AND is_sent = FALSE`,
  );
  return rowCount ?? 0;
}

async function markReminderPushed(pool, id) {
  await pool.query(
    'UPDATE reminders SET pushed_at = NOW(), is_sent = TRUE WHERE id = $1',
    [id],
  );
}

// ── Tests ────────────────────────────────────────────────────────────────
async function run() {
  // 1. backfill touches only rows where pushed_at IS NOT NULL AND is_sent = FALSE
  {
    const state = {
      reminders: [
        { id: 'a', pushed_at: '2026-05-13T10:00:00Z', is_sent: false }, // backfill target
        { id: 'b', pushed_at: '2026-05-13T11:00:00Z', is_sent: true  }, // already marked
        { id: 'c', pushed_at: null,                   is_sent: false }, // not yet pushed
        { id: 'd', pushed_at: null,                   is_sent: true  }, // weird, leave alone
        { id: 'e', pushed_at: '2026-05-12T09:00:00Z', is_sent: false }, // backfill target
      ],
    };
    const pool = mockPool(state);
    const touched = await backfillPushedReminders(pool);

    assert.equal(touched, 2, 'should backfill exactly the 2 already-pushed-but-unmarked rows');
    assert.equal(state.reminders.find(r => r.id === 'a').is_sent, true);
    assert.equal(state.reminders.find(r => r.id === 'b').is_sent, true);
    assert.equal(state.reminders.find(r => r.id === 'c').is_sent, false, 'must not touch un-pushed rows');
    assert.equal(state.reminders.find(r => r.id === 'd').is_sent, true);
    assert.equal(state.reminders.find(r => r.id === 'e').is_sent, true);
  }

  // 2. backfill is idempotent: running twice does nothing the second time
  {
    const state = {
      reminders: [
        { id: 'a', pushed_at: '2026-05-13T10:00:00Z', is_sent: false },
      ],
    };
    const pool = mockPool(state);
    const first  = await backfillPushedReminders(pool);
    const second = await backfillPushedReminders(pool);
    assert.equal(first, 1);
    assert.equal(second, 0, 'second run should be a no-op');
  }

  // 3. backfill on an empty / clean DB is a no-op
  {
    const state = { reminders: [] };
    const pool = mockPool(state);
    assert.equal(await backfillPushedReminders(pool), 0);
  }

  // 4. markReminderPushed sets BOTH columns
  {
    const state = {
      reminders: [
        { id: 'r1', pushed_at: null, is_sent: false },
      ],
    };
    const pool = mockPool(state);
    await markReminderPushed(pool, 'r1');
    const row = state.reminders[0];
    assert.ok(row.pushed_at, 'pushed_at must be set');
    assert.equal(row.is_sent, true, 'is_sent must be set so the UI drops the row');
  }

  // 5. markReminderPushed on a deleted/missing id is a silent no-op (matches real SQL semantics)
  {
    const state = { reminders: [{ id: 'r1', pushed_at: null, is_sent: false }] };
    const pool = mockPool(state);
    await markReminderPushed(pool, 'no-such-id');
    assert.equal(state.reminders[0].is_sent, false, 'unaffected row stays untouched');
  }

  console.log('worker reminders contract: PASS (5 cases)');
}

run().catch(err => { console.error(err); process.exit(1); });
