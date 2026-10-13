import { Paperclip } from "lucide-react";
import { formatBytes } from "@/lib/tickets/format";

type AttachmentItem = { id: string; fileName: string; sizeBytes: number };

/** Links go through /api/attachments/[id], which checks access on every request. */
export function AttachmentList({ attachments }: { attachments: AttachmentItem[] }) {
  if (attachments.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <a
            href={`/api/attachments/${attachment.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
          >
            <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{attachment.fileName}</span>
            <span className="shrink-0 text-muted-foreground">
              {formatBytes(attachment.sizeBytes)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
