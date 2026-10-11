import { AppShell } from "@/components/shell/app-shell";
import { requireUser, toActor } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/labels";
import { navFor } from "@/lib/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell
      user={{ name: user.name, email: user.email, roleLabel: ROLE_LABEL[user.role] }}
      nav={navFor(toActor(user))}
    >
      {children}
    </AppShell>
  );
}
