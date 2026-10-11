import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

let dummyHash: Promise<string> | null = null;

/**
 * Compares a password with a stored hash. When there is no hash (unknown
 * email) it still does a full bcrypt comparison, so response time does not
 * reveal whether the account exists.
 */
export async function verifyPassword(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  if (!passwordHash) {
    dummyHash ??= bcrypt.hash("quickdesk-timing-placeholder", COST);
    await bcrypt.compare(password, await dummyHash);
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
