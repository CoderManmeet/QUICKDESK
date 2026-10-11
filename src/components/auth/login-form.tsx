"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/(auth)/actions";
import { FormAlert, FormField } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action] = useActionState(loginAction, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {!state.error && notice ? <FormAlert tone="success">{notice}</FormAlert> : null}
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
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <SubmitButton className="w-full">Log in</SubmitButton>
    </form>
  );
}
