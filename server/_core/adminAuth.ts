import type { Request } from "express";
import { parse as parseCookie } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";

/**
 * Simple single-admin email + password login.
 *
 * Credentials live in the environment (ADMIN_EMAIL / ADMIN_PASSWORD), never in
 * source. A successful login mints a short-lived signed JWT stored in an
 * httpOnly cookie; every admin request re-verifies that cookie server-side, so
 * the gate cannot be bypassed from the client. This is deliberately independent
 * of the Manus OAuth path — either one can grant admin access.
 */

export const ADMIN_COOKIE = "hopealive_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
export const ADMIN_COOKIE_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;

/** Length-independent constant-time string comparison. */
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare against a fixed-length digest-ish accumulation so differing lengths
  // do not short-circuit in a timing-observable way.
  let diff = ab.length ^ bb.length;
  const max = Math.max(ab.length, bb.length);
  for (let i = 0; i < max; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** True when all three env vars needed for credential login are present. */
export function isAdminLoginConfigured(): boolean {
  return Boolean(ENV.adminEmail && ENV.adminPassword && ENV.adminSessionSecret);
}

/** Explains what is missing, for the login screen and startup logs. */
export function adminLoginProblem(): string | null {
  if (!ENV.adminEmail) return "ADMIN_EMAIL is not set";
  if (!ENV.adminPassword) return "ADMIN_PASSWORD is not set";
  if (!ENV.adminSessionSecret) return "ADMIN_SESSION_SECRET is not set";
  return null;
}

export function verifyAdminCredentials(email: string, password: string): boolean {
  if (!isAdminLoginConfigured()) return false;
  const emailOk = constantTimeEqual(email.trim().toLowerCase(), ENV.adminEmail.trim().toLowerCase());
  const passwordOk = constantTimeEqual(password, ENV.adminPassword);
  return emailOk && passwordOk;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(ENV.adminSessionSecret);
}

export async function signAdminSession(email: string): Promise<string> {
  return new SignJWT({ role: "admin", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Reads and verifies the admin cookie. Returns the admin identity or null. */
export async function readAdminSession(req: Request): Promise<{ email: string } | null> {
  if (!ENV.adminSessionSecret) return null;
  const header = req.headers?.cookie;
  if (!header) return null;

  let token: string | undefined;
  try {
    token = parseCookie(header)[ADMIN_COOKIE];
  } catch {
    return null;
  }
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.role === "admin" && typeof payload.email === "string") {
      return { email: payload.email };
    }
  } catch {
    // Expired, tampered, or signed with a rotated secret — treat as logged out.
  }
  return null;
}
