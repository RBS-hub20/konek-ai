import { redirect } from 'next/navigation';

/* The console lives on its own routes now; this keeps old links working. */
export default function SuperAdminIndex() {
  redirect('/super-admin/overview');
}
