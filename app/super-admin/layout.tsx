import { SuperAdminProvider } from '@/components/super-admin/SuperAdminData';
import { SuperAdminShell } from '@/components/super-admin/Shell';

export const metadata = { title: 'KONEK AI — Super Admin' };

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SuperAdminProvider>
      <SuperAdminShell>{children}</SuperAdminShell>
    </SuperAdminProvider>
  );
}
