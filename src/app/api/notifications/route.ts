import { getCurrentUser } from "@/lib/auth/session";
import { listNotifications } from "@/lib/notifications/queries";

export const dynamic = "force-dynamic";

/** The bell's dropdown. Only ever returns the signed-in user's notifications. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Number(new URL(request.url).searchParams.get("limit"));
  const take = Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : 10;

  const { items, unread } = await listNotifications(user.id, { take });
  return Response.json(
    {
      unread,
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        hasTicket: item.ticketId !== null,
        read: item.readAt !== null,
        createdAt: item.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
