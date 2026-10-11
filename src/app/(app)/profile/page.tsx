import type { Metadata } from "next";
import { PasswordForm } from "@/components/profile/password-form";
import { ProfileForm } from "@/components/profile/profile-form";
import { RoleBadge } from "@/components/ticket-badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();

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
