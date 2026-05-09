import { db } from './db';

type AuditInput = {
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog(input: AuditInput) {
  try {
    await db.query(
      `INSERT INTO audit_logs
         (actor_user_id, action, target_type, target_id, metadata, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.actorUserId ?? null,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.ip ?? null,
        input.userAgent ?? null,
      ]
    );
  } catch {
    // Audit logging should not break core internal workflows during setup.
  }
}

