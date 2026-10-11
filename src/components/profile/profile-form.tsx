"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/app/(app)/profile/actions";
import { FormAlert, FormField } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";

type ProfileValues = {
  name: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
};

export function ProfileForm({ profile }: { profile: ProfileValues }) {
  const [state, action] = useActionState(updateProfileAction, initialFormState);
  const values = { ...profile, ...state.values };

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="name"
          label="Full name"
          autoComplete="name"
          required
          defaultValue={values.name}
          errors={state.fieldErrors?.name}
        />
        <FormField
          name="email"
          label="Email"
          type="email"
          defaultValue={profile.email}
          disabled
          hint="Contact an admin to change your email."
        />
        <FormField
          name="phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          defaultValue={values.phone}
          errors={state.fieldErrors?.phone}
        />
        <FormField
          name="company"
          label="Company"
          autoComplete="organization"
          defaultValue={values.company}
          errors={state.fieldErrors?.company}
        />
        <FormField
          name="jobTitle"
          label="Job title"
          autoComplete="organization-title"
          defaultValue={values.jobTitle}
          errors={state.fieldErrors?.jobTitle}
        />
      </div>
      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}
