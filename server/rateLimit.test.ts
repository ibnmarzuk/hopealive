import { beforeEach, describe, expect, it } from "vitest";
import { clientIp, hitRateLimit, resetRateLimits } from "./rateLimit";

describe("hitRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows hits up to the limit and blocks the next one", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(hitRateLimit("key", 3, 60_000, now).allowed, `hit ${i + 1}`).toBe(true);
    }
    const blocked = hitRateLimit("key", 3, 60_000, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("starts a fresh window after it expires", () => {
    const now = 1_000_000;
    hitRateLimit("key", 1, 60_000, now);
    expect(hitRateLimit("key", 1, 60_000, now).allowed).toBe(false);
    expect(hitRateLimit("key", 1, 60_000, now + 60_001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const now = 1_000_000;
    hitRateLimit("a", 1, 60_000, now);
    expect(hitRateLimit("a", 1, 60_000, now).allowed).toBe(false);
    expect(hitRateLimit("b", 1, 60_000, now).allowed).toBe(true);
  });

  it("reports a decreasing retry-after as the window drains", () => {
    const now = 1_000_000;
    hitRateLimit("key", 1, 60_000, now);
    expect(hitRateLimit("key", 1, 60_000, now + 30_000).retryAfterSeconds).toBe(30);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for entry", () => {
    expect(clientIp({ headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } })).toBe("203.0.113.5");
  });

  it("falls back to req.ip and then the socket address", () => {
    expect(clientIp({ headers: {}, ip: "198.51.100.9" })).toBe("198.51.100.9");
    expect(clientIp({ headers: {}, socket: { remoteAddress: "192.0.2.4" } })).toBe("192.0.2.4");
  });

  it("returns a stable placeholder when nothing is available", () => {
    expect(clientIp({ headers: {} })).toBe("unknown");
  });
});
