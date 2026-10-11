import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import { getClientIp } from "@/lib/request";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/constants";
import { generateToken, hashToken } from "@/lib/auth/tokens";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  role: Role;
  teamIds: string[];
};

/** Creates a session row and sets the httpOnly cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const userAgent = (await headers()).get("user-agent");

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ip: await getClientIp(),
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
    },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Deletes the current session row and clears the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

/** Hash of the current session token, or null when there is no cookie. */
export async function currentSessionTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/**
 * The signed-in user, loaded from the database on every request (memoised
 * within a single request). Role, team membership and active status are
 * therefore always current: deactivating a user takes effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const tokenHash = await currentSessionTokenHash();
  if (!tokenHash) return null;

  const session = await db.session.findUnique({
    where: { tokenHash },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          company: true,
          jobTitle: true,
          role: true,
          isActive: true,
          deletedAt: true,
          teamMemberships: {
            where: { team: { deletedAt: null } },
            select: { teamId: true },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date()) return null;

  const user = session.user;
  if (!user.isActive || user.deletedAt) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    company: user.company,
    jobTitle: user.jobTitle,
    role: user.role,
    teamIds:
      user.role === Role.REQUESTER
        ? []
        : user.teamMemberships.map((membership) => membership.teamId),
  };
});

/** Use at the top of every protected page and server action. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function toActor(user: CurrentUser): Actor {
  return { id: user.id, role: user.role, teamIds: user.teamIds };
}
