"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/app/(auth)/actions";
import { FormAlert, FormField } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  const tokenError = state.fieldErrors?.token?.join(" ");

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error || tokenError ? (
        <FormAlert tone="error">{state.error ?? tokenError}</FormAlert>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <FormField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters, with a letter and a number."
        errors={state.fieldErrors?.password}
      />
      <FormField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton className="w-full">Set new password</SubmitButton>
    </form>
  );
}
