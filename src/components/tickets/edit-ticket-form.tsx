"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateTicketAction } from "@/app/(app)/tickets/actions";
import { buttonVariants } from "@/components/ui/button";
import { FormAlert, FormField } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

export function EditTicketForm({
  ticket,
  categories,
  tags,
}: {
  ticket: {
    id: string;
    subject: string;
    description: string;
    categoryId: string | null;
    tagIds: string[];
  };
  categories: Option[];
  tags: Option[];
}) {
  const [state, action] = useActionState(updateTicketAction, initialFormState);
  const descriptionError = state.fieldErrors?.description?.join(" ");
  const categoryError = state.fieldErrors?.categoryId?.join(" ");
  const tagError = state.fieldErrors?.tagIds?.join(" ");

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      <input type="hidden" name="ticketId" value={ticket.id} />

      <FormField
        name="subject"
        label="Subject"
        required
        maxLength={200}
        defaultValue={state.values?.subject ?? ticket.subject}
        errors={state.fieldErrors?.subject}
      />

      <div className="space-y-1.5">
        <Label htmlFor="categoryId">Category</Label>
        <Select
          id="categoryId"
          name="categoryId"
          required
          defaultValue={state.values?.categoryId ?? ticket.categoryId ?? ""}
          aria-invalid={Boolean(categoryError)}
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
        {categoryError ? <p className="text-xs text-destructive">Choose a category.</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          required
          maxLength={10000}
          rows={8}
          defaultValue={state.values?.description ?? ticket.description}
          aria-invalid={Boolean(descriptionError)}
        />
        {descriptionError ? (
          <p className="text-xs text-destructive">{descriptionError}</p>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tags</legend>
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags have been created yet.</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="tagIds"
                  value={tag.id}
                  defaultChecked={ticket.tagIds.includes(tag.id)}
                  className="h-4 w-4 rounded border-input"
                />
                {tag.name}
              </label>
            ))}
          </div>
        )}
        {tagError ? <p className="text-xs text-destructive">{tagError}</p> : null}
      </fieldset>

      <div className="flex gap-2">
        <SubmitButton>Save changes</SubmitButton>
        <Link
          href={`/tickets/${ticket.id}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
