import "server-only";
import { MAX_FILE_BYTES, MAX_FILE_MB, MAX_FILES } from "@/lib/attachment-rules";
import { TicketError } from "@/lib/tickets/errors";

type Signature = "png" | "jpeg" | "gif" | "webp" | "pdf" | "zip" | "text";

// Allowlist. The stored MIME type comes from here, never from the browser.
const TYPES: Record<string, { mime: string; signature: Signature }> = {
  png: { mime: "image/png", signature: "png" },
  jpg: { mime: "image/jpeg", signature: "jpeg" },
  jpeg: { mime: "image/jpeg", signature: "jpeg" },
  gif: { mime: "image/gif", signature: "gif" },
  webp: { mime: "image/webp", signature: "webp" },
  pdf: { mime: "application/pdf", signature: "pdf" },
  txt: { mime: "text/plain; charset=utf-8", signature: "text" },
  csv: { mime: "text/csv; charset=utf-8", signature: "text" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: "zip",
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    signature: "zip",
  },
  zip: { mime: "application/zip", signature: "zip" },
};

export const INLINE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export type PreparedFile = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/** Checks the file's first bytes against what its extension claims. */
function matchesSignature(buffer: Buffer, signature: Signature): boolean {
  switch (signature) {
    case "png":
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg":
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case "gif":
      return startsWith(buffer, [0x47, 0x49, 0x46, 0x38]);
    case "webp":
      return (
        startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
      );
    case "pdf":
      return startsWith(buffer, [0x25, 0x50, 0x44, 0x46]);
    case "zip":
      return (
        startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
        startsWith(buffer, [0x50, 0x4b, 0x05, 0x06])
      );
    case "text":
      // Text files must not contain NUL bytes.
      return !buffer.subarray(0, 8192).includes(0);
  }
}

function cleanFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(-150);
  return cleaned || "file";
}

/**
 * Reads and validates the uploaded files in a form field.
 * Throws TicketError with a user-facing message when a file is not allowed.
 */
export async function prepareFiles(
  formData: FormData,
  fieldName = "attachments",
): Promise<PreparedFile[]> {
  const uploads = formData
    .getAll(fieldName)
    .filter((value): value is File => typeof value !== "string" && value.size > 0);

  if (uploads.length > MAX_FILES) {
    throw new TicketError(`Attach at most ${MAX_FILES} files at a time.`);
  }

  const prepared: PreparedFile[] = [];
  for (const upload of uploads) {
    const fileName = cleanFileName(upload.name);

    if (upload.size > MAX_FILE_BYTES) {
      throw new TicketError(`"${fileName}" is larger than ${MAX_FILE_MB} MB.`);
    }

    const extension = fileName.includes(".")
      ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase()
      : "";
    const type = TYPES[extension];
    if (!type) {
      throw new TicketError(
        `"${fileName}" is not an allowed file type. Use images, PDF, TXT, CSV, DOCX, XLSX or ZIP.`,
      );
    }

    const buffer = Buffer.from(await upload.arrayBuffer());
    if (buffer.length > MAX_FILE_BYTES) {
      throw new TicketError(`"${fileName}" is larger than ${MAX_FILE_MB} MB.`);
    }
    if (!matchesSignature(buffer, type.signature)) {
      throw new TicketError(`"${fileName}" does not look like a valid .${extension} file.`);
    }

    prepared.push({ fileName, mimeType: type.mime, sizeBytes: buffer.length, buffer });
  }

  return prepared;
}
