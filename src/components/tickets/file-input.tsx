"use client";

import { useState } from "react";
import {
  ACCEPT,
  ATTACHMENT_HINT,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  MAX_FILES,
} from "@/lib/attachment-rules";

/**
 * Attachment picker. Checks count and size in the browser so the user gets an
 * instant message instead of a failed upload. The server validates again.
 */
export function FileInput({ id, name = "attachments" }: { id: string; name?: string }) {
  const [error, setError] = useState<string | null>(null);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const tooBig = files.find((file) => file.size > MAX_FILE_BYTES);

    if (files.length > MAX_FILES) {
      setError(`Attach at most ${MAX_FILES} files at a time.`);
      event.target.value = "";
    } else if (tooBig) {
      setError(`"${tooBig.name}" is larger than ${MAX_FILE_MB} MB.`);
      event.target.value = "";
    } else {
      setError(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        id={id}
        name={name}
        type="file"
        multiple
        accept={ACCEPT}
        onChange={onChange}
        aria-describedby={`${id}-hint`}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      {error ? (
        <p role="alert" data-file-error className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {ATTACHMENT_HINT}
      </p>
    </div>
  );
}
