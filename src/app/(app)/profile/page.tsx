import type { Metadata } from "next";
import { NotificationForm, type PreferenceOption } from "@/components/profile/notification-form";
import { PasswordForm } from "@/components/profile/password-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { RoleBadge } from "@/components/ticket-badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const prefs = await db.notificationPreference.findUnique({ where: { userId: user.id } });
  const on = (value: boolean | undefined) => value ?? true;
  const staff = user.role !== "REQUESTER";

  const preferenceOptions: PreferenceOption[] = [
    {
      key: "emailTicketCreated",
      label: staff ? "New tickets" : "Ticket received",
      description: staff
        ? "A ticket is created in one of your teams, and confirmation of tickets you create."
        : "Confirmation when you create a ticket.",
      checked: on(prefs?.emailTicketCreated),
    },
    {
      key: "emailPublicReply",
      label: "Replies",
      description: staff
        ? "A requester replies on a ticket assigned to you, or to your team while unassigned."
        : "Our team replies to one of your tickets.",
      checked: on(prefs?.emailPublicReply),
    },
    ...(staff
      ? [
          {
            key: "emailAssigned",
            label: "Assigned to me",
            description: "A ticket is assigned to you.",
            checked: on(prefs?.emailAssigned),
          },
          {
            key: "emailSlaWarning",
            label: "SLA warnings",
            description: "A ticket you are responsible for is about to miss its SLA.",
            checked: on(prefs?.emailSlaWarning),
          },
        ]
      : []),
    {
      key: "emailResolved",
      label: "Resolved",
      description: "One of your own tickets is marked as resolved.",
      checked: on(prefs?.emailResolved),
    },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Profile</h1>
        <RoleBadge role={user.role} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact information</CardTitle>
          <CardDescription>Shown to the support team on your tickets.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            profile={{
              name: user.name,
              email: user.email,
              phone: user.phone ?? "",
              company: user.company ?? "",
              jobTitle: user.jobTitle ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
          <CardDescription>Choose which emails QuickDesk sends you.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationForm options={preferenceOptions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing it signs you out on your other devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
