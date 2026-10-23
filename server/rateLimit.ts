/**
 * Minimal fixed-window rate limiter held in process memory.
 *
 * Sized for a single-instance deployment, which is what this app runs as. It
 * is deliberately dependency-free; if the app is ever scaled horizontally this
 * should move to a shared store (Redis) so limits are enforced across replicas.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Drop expired buckets so the map cannot grow without bound. */
function sweep(now: number) {
  if (buckets.size < 512) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Counts one hit against `key`. Returns whether it is allowed and, when it is
 * not, how long the caller should wait.
 */
export function hitRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test helper — clears all windows. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is attacker-controllable when the app is reached directly,
 * so this is an abuse-mitigation signal only — never an authentication or
 * authorisation input.
 */
export function clientIp(req: { ip?: string; headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}
