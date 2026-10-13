"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { markRead } from "@/lib/notifications/queries";

const idsSchema = z.array(z.string().regex(/^[a-z0-9]{1,40}$/i)).max(100);

/** Marks the signed-in user's notifications as read. Returns the new unread count. */
export async function markNotificationsRead(input: { ids?: string[]; all?: boolean }) {
  const user = await requireUser();

  if (input.all === true) {
    await markRead(user.id, "all");
  } else {
    const ids = idsSchema.safeParse(input.ids ?? []);
    if (!ids.success || ids.data.length === 0) return { ok: false as const };
    await markRead(user.id, ids.data);
  }

  revalidatePath("/notifications");
  return { ok: true as const };
}

/** Form version for the notifications page (works without JavaScript). */
export async function markAllReadFormAction(): Promise<void> {
  const user = await requireUser();
  await markRead(user.id, "all");
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
