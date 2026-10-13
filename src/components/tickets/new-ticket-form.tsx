"use client";

import { useActionState } from "react";
import { createTicketAction } from "@/app/(app)/tickets/actions";
import { FileInput } from "@/components/tickets/file-input";
import { FormAlert, FormField } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState } from "@/lib/form-state";

type Category = { id: string; name: string };

export function NewTicketForm({
  categories,
  followUpOfId,
}: {
  categories: Category[];
  followUpOfId?: string;
}) {
  const [state, action] = useActionState(createTicketAction, initialFormState);
  const descriptionError = state.fieldErrors?.description?.join(" ");
  const categoryError = state.fieldErrors?.categoryId?.join(" ");

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {followUpOfId ? <input type="hidden" name="followUpOfId" value={followUpOfId} /> : null}

      <FormField
        name="subject"
        label="Subject"
        required
        maxLength={200}
        placeholder="Short summary of the problem"
        defaultValue={state.values?.subject}
        errors={state.fieldErrors?.subject}
      />

      <div className="space-y-1.5">
        <Label htmlFor="categoryId">Category</Label>
        <Select
          id="categoryId"
          name="categoryId"
          required
          defaultValue={state.values?.categoryId ?? ""}
          aria-invalid={Boolean(categoryError)}
          aria-describedby={categoryError ? "categoryId-error" : undefined}
          className="sm:max-w-xs"
        >
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        {categoryError ? (
          <p id="categoryId-error" className="text-xs text-destructive">
            {categoryError}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          required
          maxLength={10000}
          rows={8}
          placeholder="What happened, what you expected, and any steps to reproduce it"
          defaultValue={state.values?.description}
          aria-invalid={Boolean(descriptionError)}
          aria-describedby={descriptionError ? "description-error" : undefined}
        />
        {descriptionError ? (
          <p id="description-error" className="text-xs text-destructive">
            {descriptionError}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="attachments">Attachments</Label>
        <FileInput id="attachments" />
      </div>

      <SubmitButton>Create ticket</SubmitButton>
    </form>
  );
}
