import { db } from '../../../lib/db';
import { UsersAdminPanel, type AdminUserRow } from './users-admin-panel';
import { getMaxActiveUsers } from '../../../lib/security';
import { getSession } from '../../../lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const user = await getSession();
  if (!user || user.role === 'agent') redirect('/head');

  const { rows: users } = await db.query<AdminUserRow>(
    `SELECT id, name, email, role, is_active, created_at
     FROM users
     ${user.role === 'admin' ? '' : "WHERE role = 'agent'"}
     ORDER BY
       CASE role WHEN 'admin' THEN 0 WHEN 'head' THEN 1 ELSE 2 END,
       created_at DESC`
  );

  return <UsersAdminPanel initialUsers={users} maxActiveUsers={getMaxActiveUsers()} currentUserRole={user.role} />;
}
