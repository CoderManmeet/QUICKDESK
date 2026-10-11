import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, safe to put in a cookie or URL. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored. A database leak does not expose usable tokens. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
