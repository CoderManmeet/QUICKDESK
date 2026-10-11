// Kept free of server-only imports so the middleware can use it.
export const SESSION_COOKIE = "qd_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
