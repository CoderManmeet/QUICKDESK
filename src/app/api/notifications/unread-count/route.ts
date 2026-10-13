import { getCurrentUser } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notifications/queries";

export const dynamic = "force-dynamic";

/** Polled by the bell every 30 seconds. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(
    { count: await unreadCount(user.id) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
