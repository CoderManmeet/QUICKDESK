"use client";

import { useActionState, useEffect, useState } from "react";
import { replyAction } from "@/app/(app)/tickets/actions";
import { FileInput } from "@/components/tickets/file-input";
import { FormAlert } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";

type MessageKind = "PUBLIC_REPLY" | "INTERNAL_NOTE";
type Canned = { id: string; title: string; body: string };

/** Replaces {{variable}} placeholders. Unknown variables are left as written. */
function fillVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, name: string) => {
    const value = variables[name.toLowerCase()];
    return value === undefined ? match : value;
  });
}

export function ReplyForm({
  ticketId,
  canNote,
  canned,
  variables,
}: {
  ticketId: string;
  /** Staff only. The server re-checks this on submit. */
  canNote: boolean;
  canned: Canned[];
  variables: Record<string, string>;
}) {
  const [state, action] = useActionState(replyAction, initialFormState);
  const [kind, setKind] = useState<MessageKind>("PUBLIC_REPLY");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (state.success) setBody("");
  }, [state]);

  const isNote = kind === "INTERNAL_NOTE";

  function insertCanned(id: string) {
    const response = canned.find((item) => item.id === id);
    if (!response) return;
    const text = fillVariables(response.body, variables);
    setBody((current) => (current.trim() ? `${current.trimEnd()}\n\n${text}` : text));
  }

  return (
    <form
      action={action}
      className={cn(
        "space-y-3 rounded-lg border p-4",
        isNote
          ? "border-amber-500/50 bg-amber-50 dark:bg-amber-950/30"
          : "bg-card",
      )}
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="type" value={kind} />

      {canNote ? (
        <div className="flex gap-1" role="group" aria-label="Message type">
          {(
            [
              ["PUBLIC_REPLY", "Public reply"],
              ["INTERNAL_NOTE", "Internal note"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                kind === value
                  ? value === "INTERNAL_NOTE"
                    ? "bg-amber-500/20 text-amber-800 dark:text-amber-200"
                    : "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {isNote ? (
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
          Internal note. Only staff can see this. The requester is not notified.
        </p>
      ) : null}

      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}

      <div className="space-y-1.5">
        <Label htmlFor="reply-body">{isNote ? "Note" : "Reply"}</Label>
        <Textarea
          id="reply-body"
          name="body"
          required
          maxLength={10000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={isNote ? "Write a note for your team" : "Write your reply"}
          className={isNote ? "bg-background" : undefined}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-3">
          {canned.length > 0 && !isNote ? (
            <div className="space-y-1.5">
              <Label htmlFor="canned-response">Canned response</Label>
              <Select
                id="canned-response"
                value=""
                onChange={(event) => insertCanned(event.target.value)}
                className="sm:w-64"
              >
                <option value="">Insert a canned response</option>
                {canned.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="reply-attachments">Attachments</Label>
            <FileInput id="reply-attachments" />
          </div>
        </div>

        <SubmitButton>{isNote ? "Add note" : "Send reply"}</SubmitButton>
      </div>
    </form>
  );
}
