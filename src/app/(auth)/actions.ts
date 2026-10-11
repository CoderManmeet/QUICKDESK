"use server";

import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { RESET_TOKEN_TTL_MS } from "@/lib/auth/constants";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { escapeHtml, sendEmail } from "@/lib/email";
import type { FormState } from "@/lib/form-state";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import {
  field,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";
const FIFTEEN_MINUTES = 15 * 60;
const ONE_HOUR = 60 * 60;

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = {
    name: field(formData, "name"),
    email: field(formData, "email"),
    password: field(formData, "password"),
  };
  const values = { name: raw.name, email: raw.email };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }

  const ip = await getClientIp();
  if (!(await rateLimit(`register:ip:${ip}`, 5, ONE_HOUR))) {
    return { error: TOO_MANY, values };
  }

  const { name, email, password } = parsed.data;
  const duplicate = {
    fieldErrors: { email: ["An account with this email already exists."] },
    values,
  };

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return duplicate;

  let userId: string;
  try {
    const user = await db.user.create({
      // Self-registration always creates a requester. Roles are granted by admins.
      data: { name, email, passwordHash: await hashPassword(password), role: Role.REQUESTER },
      select: { id: true },
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return duplicate;
    }
    throw error;
  }

  await createSession(userId);
  redirect("/dashboard");
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = { email: field(formData, "email"), password: field(formData, "password") };
  const values = { email: raw.email };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }

  const { email, password } = parsed.data;
  const ip = await getClientIp();
  const ipAllowed = await rateLimit(`login:ip:${ip}`, 20, FIFTEEN_MINUTES);
  const emailAllowed = await rateLimit(`login:email:${email}`, 10, FIFTEEN_MINUTES);
  if (!ipAllowed || !emailAllowed) return { error: TOO_MANY, values };

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, isActive: true, deletedAt: true },
  });

  const passwordOk = await verifyPassword(password, user ? user.passwordHash : null);
  if (!user || !passwordOk || !user.isActive || user.deletedAt) {
    // Same message for every failure, so accounts cannot be enumerated here.
    return { error: "Incorrect email or password.", values };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = { email: field(formData, "email") };

  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values: raw };
  }

  const { email } = parsed.data;
  const ip = await getClientIp();
  const ipAllowed = await rateLimit(`forgot:ip:${ip}`, 5, ONE_HOUR);
  const emailAllowed = await rateLimit(`forgot:email:${email}`, 3, ONE_HOUR);
  if (!ipAllowed || !emailAllowed) return { error: TOO_MANY, values: raw };

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isActive: true, deletedAt: true },
  });

  if (user && user.isActive && !user.deletedAt) {
    const token = generateToken();
    await db.$transaction([
      db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      db.passwordResetToken.create({
        data: {
          tokenHash: hashToken(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }),
    ]);

    const baseUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const link = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await sendEmail({
      to: { email: user.email, name: user.name },
      subject: "Reset your QuickDesk password",
      text: `Hi ${user.name},\n\nUse this link to set a new password. It expires in 1 hour and can be used once.\n\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
      html: `<p>Hi ${escapeHtml(user.name)},</p><p>Use the link below to set a new password. It expires in 1 hour and can be used once.</p><p><a href="${escapeHtml(link)}">Reset your password</a></p><p>If you did not ask for this, you can ignore this email.</p>`,
    });
  }

  // Identical response whether or not the account exists.
  return {
    success: "If an account exists for that email, a reset link has been sent.",
  };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: field(formData, "token"),
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const ip = await getClientIp();
  if (!(await rateLimit(`reset:ip:${ip}`, 10, FIFTEEN_MINUTES))) {
    return { error: TOO_MANY };
  }

  const invalid = {
    error: "This reset link is invalid or has expired. Request a new one.",
  };

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    select: {
      id: true,
      userId: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { isActive: true, deletedAt: true } },
    },
  });

  if (
    !record ||
    record.usedAt ||
    record.expiresAt <= new Date() ||
    !record.user.isActive ||
    record.user.deletedAt
  ) {
    return invalid;
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const used = await db.$transaction(async (tx) => {
    // Claim the token first; a second request with the same link gets count 0.
    const claim = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count !== 1) return false;

    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    // Sign the user out everywhere.
    await tx.session.deleteMany({ where: { userId: record.userId } });
    return true;
  });

  if (!used) return invalid;

  redirect("/login?reset=1");
}
