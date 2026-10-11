"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/(app)/profile/actions";
import { FormAlert, FormField } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          className="sm:col-span-2 sm:max-w-sm"
          errors={state.fieldErrors?.currentPassword}
        />
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
      </div>
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}
