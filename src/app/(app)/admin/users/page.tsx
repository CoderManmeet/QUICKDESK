import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { RoleBadge } from "@/components/ticket-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser, toActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const user = await requireUser();
  // Server-side check. Non-admins get a 404, the same as a page that does not exist.
  if (!can(toActor(user), "admin.users")) notFound();

  const users = await db.user.findMany({
    where: { deletedAt: null },
    orderBy: [{ role: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      teamMemberships: {
        where: { team: { deletedAt: null } },
        select: { team: { select: { name: true } } },
      },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          {users.length === 1 ? "1 user" : `${users.length} users`}
        </p>
      </div>

      <Card>
        {users.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" aria-hidden="true" />}
            title="No users yet"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Email</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Teams</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium">{row.name}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{row.email}</td>
                    <td className="px-4 py-2.5">
                      <RoleBadge role={row.role} />
                    </td>
                    <td className="px-4 py-2.5">
                      {row.teamMemberships.length > 0 ? (
                        row.teamMemberships.map((m) => m.team.name).join(", ")
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.isActive ? (
                        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          Active
                        </Badge>
                      ) : (
                        <Badge className="border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300">
                          Deactivated
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
