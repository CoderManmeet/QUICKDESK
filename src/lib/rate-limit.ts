import "server-only";
import { db } from "@/lib/db";

/**
 * Fixed-window rate limiter backed by Postgres.
 * Returns true if the request is allowed, false if the limit is exceeded.
 * The upsert is a single atomic statement, so concurrent requests count correctly.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, (now() AT TIME ZONE 'utc'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" < (now() AT TIME ZONE 'utc') - make_interval(secs => ${windowSeconds}::double precision)
        THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" < (now() AT TIME ZONE 'utc') - make_interval(secs => ${windowSeconds}::double precision)
        THEN (now() AT TIME ZONE 'utc')
        ELSE "RateLimit"."windowStart"
      END
    RETURNING "count"
  `;
  const count = Number(rows[0]?.count ?? 0);
  return count <= limit;
}
