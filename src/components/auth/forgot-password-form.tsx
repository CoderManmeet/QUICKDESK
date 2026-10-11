"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/(auth)/actions";
import { FormAlert, FormField } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <SubmitButton className="w-full">Send reset link</SubmitButton>
    </form>
  );
}
