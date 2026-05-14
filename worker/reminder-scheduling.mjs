/**
 * Reminder scheduling helpers shared by the worker and contract tests.
 * These functions only create reminder rows; the worker's push loop sends
 * anything due and marks pushed_at.
 */

/**
 * Auto-create reminders for policies expiring in 30 / 7 / 1 days. We dedupe
 * by writing a sentinel reminder per (policy, threshold), so re-running the
 * worker does not double-fire.
 */
export async function scheduleExpiringPolicies(pool) {
  const thresholds = [30, 7, 1];
  for (const days of thresholds) {
    await pool.query(
      `INSERT INTO reminders (agent_id, client_id, type, title, message, remind_at)
       SELECT p.agent_id, p.client_id, 'renewal',
              '保單到期提醒',
              CONCAT(
                COALESCE(p.product_name, p.type),
                ' · ',
                COALESCE(c.name_zh, c.name_en, '客戶'),
                ' · ',
                $1::int, ' 日後到期'
              ),
              NOW()
       FROM policies p
       JOIN clients c ON c.id = p.client_id AND c.deleted_at IS NULL
       WHERE p.deleted_at IS NULL
         AND p.status = 'active'
         AND p.expiry_date IS NOT NULL
         AND p.expiry_date::date = (NOW() + ($1::int || ' days')::interval)::date
         AND NOT EXISTS (
           SELECT 1 FROM reminders r
           WHERE r.client_id = p.client_id
             AND r.type = 'renewal'
             AND r.title = '保單到期提醒'
             AND r.message LIKE CONCAT('%', $1::int, ' 日後到期%')
         )`,
      [days],
    );
  }
}

/**
 * Auto-create a birthday reminder one day before the client's birthday.
 * Dedupe is scoped to today's reminder date, so the same client can receive
 * one reminder again next year.
 */
export async function scheduleBirthdayReminders(pool) {
  await pool.query(
    `INSERT INTO reminders (agent_id, client_id, type, title, message, remind_at)
     SELECT c.agent_id, c.id, 'birthday',
            '客戶生日提醒',
            CONCAT(COALESCE(c.name_zh, c.name_en, '客戶'), ' 明日生日，記得跟進祝賀。'),
            NOW()
     FROM clients c
     WHERE c.deleted_at IS NULL
       AND c.dob IS NOT NULL
       AND c.agent_id IS NOT NULL
       AND TO_CHAR(c.dob, 'MM-DD') = TO_CHAR((NOW() + INTERVAL '1 day'), 'MM-DD')
       AND NOT EXISTS (
         SELECT 1 FROM reminders r
         WHERE r.client_id = c.id
           AND r.type = 'birthday'
           AND r.title = '客戶生日提醒'
           AND r.remind_at::date = CURRENT_DATE
       )`,
  );
}
