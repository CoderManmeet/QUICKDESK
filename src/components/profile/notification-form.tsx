"use client";

import { useActionState } from "react";
import { updateNotificationPrefsAction } from "@/app/(app)/profile/actions";
import { FormAlert } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";

export type PreferenceOption = { key: string; label: string; description: string; checked: boolean };

export function NotificationForm({ options }: { options: PreferenceOption[] }) {
  const [state, action] = useActionState(updateNotificationPrefsAction, initialFormState);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}
      <fieldset className="space-y-3">
        <legend className="sr-only">Email me when</legend>
        {options.map((option) => (
          <label key={option.key} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name={option.key}
              defaultChecked={option.checked}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="block font-medium">{option.label}</span>
              <span className="block text-muted-foreground">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        In-app notifications in the bell are always on. Internal notes never send email.
      </p>
      <SubmitButton>Save preferences</SubmitButton>
    </form>
  );
}
