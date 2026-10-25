import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_COOKIE,
  adminLoginProblem,
  isAdminLoginConfigured,
  readAdminSession,
  signAdminSession,
  verifyAdminCredentials,
} from "./_core/adminAuth";

const ORIGINAL = {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
  subEmail: process.env.SUB_ADMIN_EMAIL,
  subPassword: process.env.SUB_ADMIN_PASSWORD,
  secret: process.env.ADMIN_SESSION_SECRET,
};

function setEnv(email?: string, password?: string, secret?: string) {
  if (email === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = email;
  if (password === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = password;
  if (secret === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = secret;
}

beforeEach(() => setEnv("ibnmarzuk207@gmail.com", "Abdurry207", "test-secret-value-long-enough"));
afterEach(() => {
  setEnv(ORIGINAL.email, ORIGINAL.password, ORIGINAL.secret);
  if (ORIGINAL.subEmail === undefined) delete process.env.SUB_ADMIN_EMAIL;
  else process.env.SUB_ADMIN_EMAIL = ORIGINAL.subEmail;
  if (ORIGINAL.subPassword === undefined) delete process.env.SUB_ADMIN_PASSWORD;
  else process.env.SUB_ADMIN_PASSWORD = ORIGINAL.subPassword;
});

/** Builds a fake Express request carrying a cookie header. */
const reqWithCookie = (cookie?: string) => ({ headers: cookie ? { cookie } : {} }) as never;

describe("configuration", () => {
  it("is configured when all three vars are set", () => {
    expect(isAdminLoginConfigured()).toBe(true);
    expect(adminLoginProblem()).toBeNull();
  });

  it("reports the first missing variable", () => {
    setEnv(undefined, "x", "y");
    expect(isAdminLoginConfigured()).toBe(false);
    expect(adminLoginProblem()).toBe("ADMIN_EMAIL is not set");
    setEnv("a@b.com", undefined, "y");
    expect(adminLoginProblem()).toBe("ADMIN_PASSWORD is not set");
    setEnv("a@b.com", "x", undefined);
    expect(adminLoginProblem()).toBe("ADMIN_SESSION_SECRET is not set");
  });
});

describe("verifyAdminCredentials", () => {
  it("accepts the exact credentials", () => {
    expect(verifyAdminCredentials("ibnmarzuk207@gmail.com", "Abdurry207")).toBe("superadmin");
  });

  it("is case-insensitive and whitespace-tolerant on the email only", () => {
    expect(verifyAdminCredentials("  IBNMarzuk207@Gmail.com ", "Abdurry207")).toBe("superadmin");
  });

  it("rejects a wrong password (case-sensitive)", () => {
    expect(verifyAdminCredentials("ibnmarzuk207@gmail.com", "abdurry207")).toBeNull();
    expect(verifyAdminCredentials("ibnmarzuk207@gmail.com", "wrong")).toBeNull();
  });

  it("rejects a wrong email", () => {
    expect(verifyAdminCredentials("someone@else.com", "Abdurry207")).toBeNull();
  });

  it("rejects everything when login is not configured", () => {
    setEnv(undefined, undefined, undefined);
    expect(verifyAdminCredentials("ibnmarzuk207@gmail.com", "Abdurry207")).toBeNull();
  });

  it("distinguishes the configured sub-admin credentials", () => {
    process.env.SUB_ADMIN_EMAIL = "team@hopealive";
    process.env.SUB_ADMIN_PASSWORD = "sub-admin-test-password";
    expect(verifyAdminCredentials("team@hopealive", "sub-admin-test-password")).toBe("subadmin");
    expect(verifyAdminCredentials("team@hopealive", "wrong")).toBeNull();
  });
});

describe("session cookie round-trip", () => {
  it("signs a token the reader accepts", async () => {
    const token = await signAdminSession("ibnmarzuk207@gmail.com", "superadmin");
    const session = await readAdminSession(reqWithCookie(`${ADMIN_COOKIE}=${token}`));
    expect(session).toEqual({ email: "ibnmarzuk207@gmail.com", role: "superadmin" });
  });

  it("preserves the role in a sub-admin session", async () => {
    const token = await signAdminSession("team@hopealive", "subadmin");
    expect(await readAdminSession(reqWithCookie(`${ADMIN_COOKIE}=${token}`))).toEqual({
      email: "team@hopealive",
      role: "subadmin",
    });
  });

  it("returns null with no cookie", async () => {
    expect(await readAdminSession(reqWithCookie())).toBeNull();
  });

  it("returns null for a tampered token", async () => {
    const token = await signAdminSession("ibnmarzuk207@gmail.com");
    const tampered = `${token.slice(0, -2)}xx`;
    expect(await readAdminSession(reqWithCookie(`${ADMIN_COOKIE}=${tampered}`))).toBeNull();
  });

  it("returns null when the signing secret has rotated", async () => {
    const token = await signAdminSession("ibnmarzuk207@gmail.com");
    process.env.ADMIN_SESSION_SECRET = "a-different-secret-entirely";
    expect(await readAdminSession(reqWithCookie(`${ADMIN_COOKIE}=${token}`))).toBeNull();
  });

  it("returns null when the secret is unset", async () => {
    const token = await signAdminSession("ibnmarzuk207@gmail.com");
    delete process.env.ADMIN_SESSION_SECRET;
    expect(await readAdminSession(reqWithCookie(`${ADMIN_COOKIE}=${token}`))).toBeNull();
  });
});
