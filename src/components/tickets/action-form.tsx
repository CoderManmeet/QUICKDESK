"use client";

import * as React from "react";
import { useActionState } from "react";
import { initialFormState, type FormState } from "@/lib/form-state";

/** Small form for one-click ticket actions. Shows the server's error inline. */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.error ? (
        <p role="alert" data-form-error className="basis-full text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
