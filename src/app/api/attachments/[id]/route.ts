import { getCurrentUser, toActor } from "@/lib/auth/session";
import { INLINE_MIME_TYPES } from "@/lib/attachments";
import { db } from "@/lib/db";
import { canViewAttachment, ticketAccess, ticketRefSelect } from "@/lib/permissions";
import { contentDisposition, getDownload } from "@/lib/storage";

export const dynamic = "force-dynamic";

// The only way to download an attachment. Access is checked on every request:
// the user must be able to see the ticket, and requesters can never fetch a
// file that was attached to an internal note. Anything else is a plain 404.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await context.params;
  const notFound = () => new Response("Not found", { status: 404 });
  if (!/^[a-z0-9]{1,40}$/i.test(id)) return notFound();

  const attachment = await db.attachment.findUnique({
    where: { id },
    select: {
      fileName: true,
      mimeType: true,
      storageKey: true,
      message: { select: { type: true } },
      ticket: { select: ticketRefSelect },
    },
  });
  if (!attachment) return notFound();

  const access = ticketAccess(toActor(user), attachment.ticket);
  if (!canViewAttachment(access, attachment)) return notFound();

  const inline = INLINE_MIME_TYPES.has(attachment.mimeType);
  let download;
  try {
    download = await getDownload(attachment.storageKey, {
      fileName: attachment.fileName,
      contentType: attachment.mimeType,
      inline,
    });
  } catch (error) {
    console.error("Attachment download failed:", error);
    return notFound();
  }

  if (download.kind === "redirect") {
    return new Response(null, {
      status: 302,
      headers: { Location: download.url, "Cache-Control": "private, no-store" },
    });
  }

  return new Response(new Uint8Array(download.body), {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(download.body.length),
      "Content-Disposition": contentDisposition(attachment.fileName, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
