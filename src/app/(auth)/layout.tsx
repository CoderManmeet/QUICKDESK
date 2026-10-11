import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
        </span>
        QuickDesk
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
