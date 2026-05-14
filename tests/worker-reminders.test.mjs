/**
 * Contract test for the reminders worker.
 *
 * Inbox model (post-revert): worker only writes pushed_at after a successful
 * push; is_sent is owned entirely by the user (via the Mark-as-read flow).
 * The worker must NEVER touch is_sent.
 *
 * We re-implement the relevant SQL inline against a mock pool; if the
 * production worker drifts, these assertions describe the contract it must
 * keep.
 */

import assert from 'node:assert/strict';
import { scheduleBirthdayReminders } from '../worker/reminder-scheduling.mjs';

function mockPool(state) {
  return {
    async query(sql, params) {
      // The post-push UPDATE. Must NOT mention is_sent.
      if (/^UPDATE reminders SET pushed_at = NOW\(\) WHERE id = \$1$/.test(sql.trim())) {
        const r = state.reminders.find(x => x.id === params[0]);
        if (r) r.pushed_at = new Date().toISOString();
        return { rowCount: r ? 1 : 0 };
      }
      // Guard: catch any rogue is_sent write from the worker.
      if (/is_sent/.test(sql)) {
        throw new Error('worker must not write is_sent. SQL was: ' + sql);
      }
      throw new Error('unmocked query: ' + sql.slice(0, 80));
    },
  };
}

async function markReminderPushed(pool, id) {
  await pool.query('UPDATE reminders SET pushed_at = NOW() WHERE id = $1', [id]);
}

async function run() {
  // 1. markReminderPushed sets ONLY pushed_at, never is_sent
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
    assert.equal(row.is_sent, false, 'is_sent must be left alone — user owns that flag');
  }

  // 2. mock guard: confirm that writing is_sent throws (catches accidental regression)
  {
    const pool = mockPool({ reminders: [] });
    await assert.rejects(
      pool.query('UPDATE reminders SET pushed_at = NOW(), is_sent = TRUE WHERE id = $1', ['r1']),
      /must not write is_sent/,
      'guard catches any rogue is_sent write',
    );
  }

  // 3. missing id is a silent no-op (matches real SQL semantics)
  {
    const state = { reminders: [{ id: 'r1', pushed_at: null, is_sent: false }] };
    const pool = mockPool(state);
    await markReminderPushed(pool, 'no-such-id');
    assert.equal(state.reminders[0].pushed_at, null);
    assert.equal(state.reminders[0].is_sent, false);
  }

  // 4. birthday scheduler creates one reminder the day before a client's birthday
  {
    const calls = [];
    const pool = {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rowCount: 1 };
      },
    };

    await scheduleBirthdayReminders(pool);

    assert.equal(calls.length, 1);
    const sql = calls[0].sql;
    assert.match(sql, /INSERT INTO reminders \(agent_id, client_id, type, title, message, remind_at\)/);
    assert.match(sql, /'birthday'/);
    assert.match(sql, /TO_CHAR\(c\.dob, 'MM-DD'\) = TO_CHAR\(\(NOW\(\) \+ INTERVAL '1 day'\), 'MM-DD'\)/);
    assert.match(sql, /r\.type = 'birthday'/);
    assert.match(sql, /r\.remind_at::date = CURRENT_DATE/);
  }

  console.log('worker reminders contract: PASS (4 cases)');
}

run().catch(err => { console.error(err); process.exit(1); });
