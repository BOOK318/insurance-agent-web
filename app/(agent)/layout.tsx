import { getSession } from '../../lib/auth';
import { redirect } from 'next/navigation';
import { AgentNav } from '../../components/agent-nav';

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AgentNav user={user} />
      <main className="flex-1 p-3.5 md:p-6 pb-20 md:pb-6 max-w-3xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}
