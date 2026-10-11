import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>You will be signed out on all devices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <FormAlert tone="error">
            This reset link is missing its token. Request a new one.
          </FormAlert>
        )}
        <Link href="/forgot-password" className="block text-sm text-primary hover:underline">
          Request a new link
        </Link>
      </CardContent>
    </Card>
  );
}
