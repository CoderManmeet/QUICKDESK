"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { currentSessionTokenHash, requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import { rateLimit } from "@/lib/rate-limit";
import { changePasswordSchema, field, profileSchema } from "@/lib/validation/auth";

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // A user can only ever edit their own profile: the id comes from the session.
  const user = await requireUser();

  const raw = {
    name: field(formData, "name"),
    phone: field(formData, "phone"),
    company: field(formData, "company"),
    jobTitle: field(formData, "jobTitle"),
  };

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values: raw };
  }

  const { name, phone, company, jobTitle } = parsed.data;
  await db.user.update({
    where: { id: user.id },
    data: {
      name,
      phone: phone || null,
      company: company || null,
      jobTitle: jobTitle || null,
    },
  });

  revalidatePath("/", "layout");
  return {
    success: "Profile updated.",
    values: { name, phone, company, jobTitle },
  };
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: field(formData, "currentPassword"),
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (!(await rateLimit(`password:user:${user.id}`, 10, 15 * 60))) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record || !(await verifyPassword(parsed.data.currentPassword, record.passwordHash))) {
    return { fieldErrors: { currentPassword: ["Current password is incorrect."] } };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const currentTokenHash = await currentSessionTokenHash();

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    // Sign out every other device; keep this one.
    db.session.deleteMany({
      where: {
        userId: user.id,
        ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}),
      },
    }),
  ]);

  return { success: "Password changed. Other devices have been signed out." };
}
