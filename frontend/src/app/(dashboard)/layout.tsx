import type { ReactNode } from "react";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/AppShell";
import { AuthProvider } from "@/features/auth/AuthProvider";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const token = await getAccessToken();
  return (
    <AuthProvider token={token} user={user}>
      <AppShell user={user}>{children}</AppShell>
    </AuthProvider>
  );
}
