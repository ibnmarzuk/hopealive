import type { Request } from "express";
import { parse as parseCookie } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";

/**
 * Server-configured super-admin and sub-admin email + password logins.
 *
 * Credentials live in the environment (ADMIN_EMAIL / ADMIN_PASSWORD), never in
 * source. A successful login mints a short-lived signed JWT stored in an
 * httpOnly cookie; every admin request re-verifies that cookie server-side, so
 * the gate cannot be bypassed from the client. This is deliberately independent
 * of any external identity provider.
 */

export const ADMIN_COOKIE = "hopealive_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
export const ADMIN_COOKIE_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;
export type AdminRole = "superadmin" | "subadmin";

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
  return Boolean(
    ENV.adminEmail &&
    ENV.adminPassword &&
    ENV.adminSessionSecret &&
    Boolean(ENV.subAdminEmail) === Boolean(ENV.subAdminPassword),
  );
}

/** Explains what is missing, for the login screen and startup logs. */
export function adminLoginProblem(): string | null {
  if (!ENV.adminEmail) return "ADMIN_EMAIL is not set";
  if (!ENV.adminPassword) return "ADMIN_PASSWORD is not set";
  if (Boolean(ENV.subAdminEmail) !== Boolean(ENV.subAdminPassword)) return "SUB_ADMIN_EMAIL and SUB_ADMIN_PASSWORD must both be set";
  if (!ENV.adminSessionSecret) return "ADMIN_SESSION_SECRET is not set";
  return null;
}

export function verifyAdminCredentials(email: string, password: string): AdminRole | null {
  if (!isAdminLoginConfigured()) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const superAdminMatch =
    constantTimeEqual(normalizedEmail, ENV.adminEmail.trim().toLowerCase()) &&
    constantTimeEqual(password, ENV.adminPassword);
  const subAdminMatch = Boolean(ENV.subAdminEmail && ENV.subAdminPassword) &&
    constantTimeEqual(normalizedEmail, ENV.subAdminEmail.trim().toLowerCase()) &&
    constantTimeEqual(password, ENV.subAdminPassword);
  if (superAdminMatch) return "superadmin";
  if (subAdminMatch) return "subadmin";
  return null;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(ENV.adminSessionSecret);
}

export async function signAdminSession(email: string, role: AdminRole = "superadmin"): Promise<string> {
  return new SignJWT({ role, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Reads and verifies the admin cookie. Returns the admin identity or null. */
export async function readAdminSession(req: Request): Promise<{ email: string; role: AdminRole } | null> {
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
    if ((payload.role === "superadmin" || payload.role === "subadmin" || payload.role === "admin") && typeof payload.email === "string") {
      return { email: payload.email, role: payload.role === "admin" ? "superadmin" : payload.role };
    }
  } catch {
    // Expired, tampered, or signed with a rotated secret — treat as logged out.
  }
  return null;
}
