import "server-only";
import { db } from "@/lib/db";

/** Every query here is limited to the given user's own notifications. */

export function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string, options: { take: number; skip?: number }) {
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.take,
      skip: options.skip ?? 0,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        ticketId: true,
        readAt: true,
        createdAt: true,
      },
    }),
    db.notification.count({ where: { userId } }),
    unreadCount(userId),
  ]);
  return { items, total, unread };
}

export async function markRead(userId: string, ids: string[] | "all"): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return result.count;
}
