import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Opening a notification marks it read and goes to its ticket. The ticket
 * page runs its own access check, so a notification can never grant access.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { id } = await context.params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) return new Response("Not found", { status: 404 });

  const notification = await db.notification.findFirst({
    where: { id, userId: user.id },
    select: { id: true, ticketId: true, readAt: true },
  });
  if (!notification) return new Response("Not found", { status: 404 });

  if (!notification.readAt) {
    await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  const target = notification.ticketId ? `/tickets/${notification.ticketId}` : "/notifications";
  return NextResponse.redirect(new URL(target, request.url), 303);
}
