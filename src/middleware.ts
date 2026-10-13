import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// /api/cron checks its own secret instead of a session.
const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/api/cron"];

// First line of defence only: sends visitors without a session cookie to the
// login page. The real check (valid session, active user, role) happens on
// the server in requireUser() and the permission helper on every request.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!isPublic && !request.cookies.has(SESSION_COOKIE)) {
    // Background requests (the notification bell's polling) get a 401 they can
    // handle. Page navigations, including opening an attachment link, go to login.
    const wantsPage = (request.headers.get("accept") ?? "").includes("text/html");
    if (pathname.startsWith("/api/") && !wantsPage) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
