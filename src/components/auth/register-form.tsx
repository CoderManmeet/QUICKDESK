"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/(auth)/actions";
import { FormAlert, FormField } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      <FormField
        name="name"
        label="Full name"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        errors={state.fieldErrors?.name}
      />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters, with a letter and a number."
        errors={state.fieldErrors?.password}
      />
      <SubmitButton className="w-full">Create account</SubmitButton>
    </form>
  );
}
