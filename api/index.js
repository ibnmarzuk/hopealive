// server/app.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "webdev_app_session";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

// drizzle/schema.ts
import {
  integer,
  jsonb,
  boolean,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from "drizzle-orm/pg-core";
var userRole = pgEnum("user_role", ["user", "admin"]);
var paymentStatus = pgEnum("payment_status", ["pending_payment", "payment_claimed", "under_review", "verified", "rejected", "completed"]);
var receiptStatus = pgEnum("receipt_status", ["not_submitted", "submitted"]);
var verificationStatus = pgEnum("verification_status", ["pending", "verified", "rejected", "clarification"]);
var emailStatus = pgEnum("email_status", ["pending", "sent", "failed", "skipped"]);
var verifiedBy = pgEnum("verified_by", ["ai", "admin"]);
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => /* @__PURE__ */ new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull()
});
var registrationCounters = pgTable("registration_counters", {
  id: serial("id").primaryKey(),
  classGroup: varchar("classGroup", { length: 32 }).notNull().unique(),
  lastNumber: integer("lastNumber").notNull().default(0)
});
var registrations = pgTable("registrations", {
  id: serial("id").primaryKey(),
  studentName: varchar("studentName", { length: 160 }).notNull(),
  guardianEmail: varchar("guardianEmail", { length: 320 }),
  guardianPhone: varchar("guardianPhone", { length: 32 }).notNull(),
  schoolClass: varchar("schoolClass", { length: 64 }).notNull(),
  classGroup: varchar("classGroup", { length: 32 }).notNull(),
  registrationNumber: varchar("registrationNumber", { length: 32 }).notNull().unique(),
  dedupeKey: varchar("dedupeKey", { length: 64 }).unique(),
  /** Shared family passkey for participants registered and paid together. */
  familyCode: varchar("familyCode", { length: 16 }),
  familyPaymentLead: boolean("familyPaymentLead").notNull().default(false),
  /** Actual bank-confirmed amount, recorded once on the family's lead row. */
  verifiedAmountNgn: integer("verifiedAmountNgn"),
  paymentStatus: paymentStatus("paymentStatus").notNull().default("pending_payment"),
  receiptStatus: receiptStatus("receiptStatus").notNull().default("not_submitted"),
  verificationStatus: verificationStatus("verificationStatus").notNull().default("pending"),
  emailStatus: emailStatus("emailStatus").notNull().default("pending"),
  emailMessageId: varchar("emailMessageId", { length: 64 }),
  emailSentAt: timestamp("emailSentAt", { withTimezone: true }),
  emailError: varchar("emailError", { length: 255 }),
  receiptImage: text("receiptImage"),
  receiptSubmittedAt: timestamp("receiptSubmittedAt", { withTimezone: true }),
  receiptAttempts: integer("receiptAttempts").notNull().default(0),
  receiptAnalysis: jsonb("receiptAnalysis"),
  verifiedAt: timestamp("verifiedAt", { withTimezone: true }),
  verifiedBy: verifiedBy("verifiedBy"),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => /* @__PURE__ */ new Date()).notNull()
});

// server/_core/env.ts
var ENV = {
  get appId() {
    return process.env.MANUS_PROJECT_ID ?? "";
  },
  get cookieSecret() {
    return process.env.MANUS_JWT_SECRET ?? "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
  },
  get oAuthServerUrl() {
    return process.env.MANUS_OAUTH_API_URL ?? "";
  },
  // Preserve the legacy hint when supplied; otherwise roles remain application data.
  get ownerOpenId() {
    return process.env.OWNER_OPEN_ID ?? "";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return process.env.MANUS_API_URL ?? "";
  },
  get forgeApiKey() {
    return process.env.MANUS_API_KEY ?? "";
  },
  // --- Email delivery (Resend) -------------------------------------------
  // Server-only. These are never exposed through publicConfig.ts and must not
  // be referenced from client/ code.
  /** Resend API key, `re_...`. Server-side only. */
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  /** Verified sender, e.g. `Hope-Alive <ivc@your-verified-domain.org>`. */
  get resendFromEmail() {
    return process.env.RESEND_FROM_EMAIL ?? "";
  },
  /** Optional Reply-To shown to recipients, e.g. a monitored inbox. */
  get resendReplyTo() {
    return process.env.RESEND_REPLY_TO ?? "";
  },
  /** Public base URL of this site, used to build links inside emails. */
  get appUrl() {
    return (process.env.APP_URL ?? "").replace(/\/+$/, "");
  },
  // --- Payment / registration -------------------------------------------
  /** Group invite link. Returned to the browser only for verified registrations. */
  get whatsappGroupUrl() {
    return process.env.WHATSAPP_GROUP_URL ?? "";
  },
  // --- Admin login (email + password) -----------------------------------
  // Server-only. Never exposed through publicConfig.ts. See server/_core/adminAuth.ts.
  get adminEmail() {
    return process.env.ADMIN_EMAIL ?? "";
  },
  get adminPassword() {
    return process.env.ADMIN_PASSWORD ?? "";
  },
  /** Secret used to sign the admin session cookie. Use a long random string. */
  get adminSessionSecret() {
    return process.env.ADMIN_SESSION_SECRET ?? "";
  }
};

// server/db.ts
var _db = null;
async function getDb() {
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!_db && connectionString) {
    try {
      const client2 = postgres(connectionString, { prepare: false, max: 1, connect_timeout: 10 });
      _db = drizzle(client2);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function getSessionCookieOptions(_req) {
  return { httpOnly: true, path: "/", sameSite: "none", secure: true };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client2) {
    this.client = client2;
    if (ENV.oAuthServerUrl) {
      console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    } else {
      console.warn("[OAuth] MANUS_OAUTH_API_URL is not set.");
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client2 = createOAuthHttpClient()) {
    this.client = client2;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) throw new Error("MANUS_JWT_SECRET is unavailable");
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey2 = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey2);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey2 = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey2, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || (!isNonEmptyString(appId) || appId !== ENV.appId) || typeof name !== "string") {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken && req.path.startsWith("/api/scheduled/")) {
      const ticket = cookies.get("app_session_id");
      const identity = await this.verifySession(ticket);
      if (identity?.openId.startsWith(CRON_OPEN_ID_PREFIX)) sessionToken = ticket;
    }
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error instanceof Error ? error.message : "unknown error");
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/publicConfig.ts
function publicPlatformConfig(env = process.env) {
  return {
    projectId: env.MANUS_PROJECT_ID ?? "",
    oauthPortalUrl: env.MANUS_OAUTH_PORTAL_URL ?? "",
    apiUrl: env.MANUS_API_URL ?? "",
    apiBrowserKey: env.MANUS_API_BROWSER_KEY ?? ""
  };
}
function publicPlatformScript(env = process.env) {
  const json = JSON.stringify(publicPlatformConfig(env)).replaceAll("<", "\\u003c");
  return `window.__MANUS_CONFIG__=${json};`;
}

// shared/registration.ts
import { z } from "zod";
var CLASS_GROUPS = {
  "Lower Class": ["Nursery 2", "Basic 1", "Basic 2"],
  "Middle Class": ["Basic 3", "Basic 4", "Basic 5", "Basic 6"],
  "Upper Class": ["JSS 1", "JSS 2", "JSS 3"],
  "Advance 1": ["SS 1", "SS 2", "SS 3"],
  "Advance 2": ["Higher institution and above"]
};
var GROUP_PREFIXES = {
  "Lower Class": "LOWER",
  "Middle Class": "MIDDLE",
  "Upper Class": "UPPER",
  "Advance 1": "ADV1",
  "Advance 2": "ADV2"
};
var SCHOOL_CLASSES = Object.values(CLASS_GROUPS).flatMap((classes) => [...classes]);
function findClassGroup(schoolClass) {
  for (const [group, classes] of Object.entries(CLASS_GROUPS)) {
    if (classes.includes(schoolClass)) return group;
  }
  return null;
}
function registrationFeeNgn(schoolClass, registeredAt = /* @__PURE__ */ new Date()) {
  const group = findClassGroup(schoolClass);
  if (!group || Number.isNaN(registeredAt.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(registeredAt);
  const date = parts.reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const localDate = `${date.year}-${date.month}-${date.day}`;
  if (localDate < "2026-09-20") return null;
  const isOnSite = localDate >= "2026-12-23";
  const primaryOrBelow = group === "Lower Class" || group === "Middle Class";
  if (isOnSite) return primaryOrBelow ? 8e3 : 9e3;
  return primaryOrBelow ? 7500 : 8500;
}
function normalizePhone(phone) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? `+${cleaned.slice(1).replace(/\+/g, "")}` : cleaned.replace(/\+/g, "");
}
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
function dedupeFingerprint(input) {
  return [normalizeName(input.studentName), normalizePhone(input.guardianPhone), input.schoolClass.trim().toLowerCase()].join("|");
}
var phoneSchema = z.string().trim().min(1, "Enter a parent or guardian phone number.").refine((value) => normalizePhone(value).replace("+", "").length >= 7, "Enter a valid phone number with at least 7 digits.").refine((value) => normalizePhone(value).replace("+", "").length <= 20, "That phone number looks too long.");
var registrationInputSchema = z.object({
  studentName: z.string().trim().min(2, "Enter the participant's full name.").max(160, "That name is too long.").refine((value) => /\p{L}/u.test(value), "Enter the participant's full name."),
  guardianEmail: z.string().trim().min(1, "Enter an email address so we can send your confirmation.").max(320, "That email address is too long.").pipe(z.email("Enter a valid email address, e.g. name@example.com")),
  guardianPhone: phoneSchema,
  schoolClass: z.string().trim().refine((value) => findClassGroup(value) !== null, "Choose a class from the list."),
  consentToEmail: z.literal(true, "Please confirm we may email your registration details.")
});
var familyRegistrationInputSchema = z.object({
  registrationType: z.enum(["individual", "family"]),
  guardianPhone: phoneSchema,
  guardianEmail: z.string().trim().max(320, "That email address is too long.").optional().or(z.literal("")),
  consentToEmail: z.boolean(),
  participants: z.array(z.object({
    studentName: z.string().trim().min(2, "Enter the participant's full name.").max(160, "That name is too long.").refine((value) => /\p{L}/u.test(value), "Enter the participant's full name."),
    schoolClass: z.string().trim().refine((value) => findClassGroup(value) !== null, "Choose a class from the list.")
  })).min(1).max(6)
}).superRefine((value, ctx) => {
  if (value.registrationType === "individual" && value.participants.length !== 1) {
    ctx.addIssue({ code: "custom", path: ["participants"], message: "Individual registration is for one participant." });
  }
  if (value.registrationType === "family" && value.participants.length < 2) {
    ctx.addIssue({ code: "custom", path: ["participants"], message: "Family registration needs at least two participants." });
  }
  if (value.guardianEmail && !z.email().safeParse(value.guardianEmail).success) {
    ctx.addIssue({ code: "custom", path: ["guardianEmail"], message: "Enter a valid email address." });
  }
  if (value.consentToEmail && !value.guardianEmail) {
    ctx.addIssue({ code: "custom", path: ["guardianEmail"], message: "Enter an email address to receive email updates." });
  }
});
var registrationLookupSchema = z.object({
  registrationNumber: z.string().trim().min(5, "Enter the registration number you were given.").max(32, "That registration number is too long."),
  guardianPhone: phoneSchema
});
var PAYMENT_STATUSES = [
  "pending_payment",
  "payment_claimed",
  "under_review",
  "verified",
  "rejected",
  "completed"
];
var PAYMENT_DETAILS = {
  accountName: "Hope-Alive Muslim Foundation",
  accountNumber: "0019871510",
  bank: "Jaiz Bank",
  /** Enquiries only. Receipts are uploaded on the site, never sent here. */
  enquiriesPhone: "08057782932",
  enquiriesLink: "https://wa.me/2348057782932"
};
var MAX_RECEIPT_DATA_URL_CHARS = 2e6;
var MAX_RECEIPT_ATTEMPTS = 5;
var RECEIPT_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
var receiptUploadSchema = registrationLookupSchema.extend({
  imageDataUrl: z.string().min(1, "Choose a screenshot of your payment receipt.").max(MAX_RECEIPT_DATA_URL_CHARS, "That image is too large. Please use a smaller screenshot.").refine((value) => RECEIPT_DATA_URL.test(value), "Upload a JPEG, PNG or WebP image.")
});

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { createHash, randomBytes } from "node:crypto";
import { z as z3 } from "zod";

// server/registrationStore.ts
import { desc, eq as eq2 } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
var DuplicateRegistrationError = class extends Error {
  constructor() {
    super("Duplicate registration");
    this.name = "DuplicateRegistrationError";
  }
};
var ADMIN_COLUMNS = {
  id: registrations.id,
  studentName: registrations.studentName,
  guardianEmail: registrations.guardianEmail,
  guardianPhone: registrations.guardianPhone,
  schoolClass: registrations.schoolClass,
  classGroup: registrations.classGroup,
  registrationNumber: registrations.registrationNumber,
  familyCode: registrations.familyCode,
  familyPaymentLead: registrations.familyPaymentLead,
  verifiedAmountNgn: registrations.verifiedAmountNgn,
  paymentStatus: registrations.paymentStatus,
  receiptStatus: registrations.receiptStatus,
  verificationStatus: registrations.verificationStatus,
  emailStatus: registrations.emailStatus,
  emailError: registrations.emailError,
  receiptSubmittedAt: registrations.receiptSubmittedAt,
  receiptAttempts: registrations.receiptAttempts,
  verifiedAt: registrations.verifiedAt,
  verifiedBy: registrations.verifiedBy,
  notes: registrations.notes,
  createdAt: registrations.createdAt
};
function isDuplicateKeyError(error) {
  if (!error || typeof error !== "object") return false;
  const candidate = error;
  if (candidate.code === "23505") return true;
  return candidate.cause ? isDuplicateKeyError(candidate.cause) : false;
}
var PostgresStore = class {
  constructor(db) {
    this.db = db;
  }
  async findByDedupeKey(dedupeKey) {
    const rows = await this.db.select({ registrationNumber: registrations.registrationNumber }).from(registrations).where(eq2(registrations.dedupeKey, dedupeKey)).limit(1);
    return rows[0] ?? null;
  }
  async create(data) {
    try {
      return await this.db.transaction(async (tx) => {
        await tx.insert(registrationCounters).values({ classGroup: data.classGroup, lastNumber: 0 }).onConflictDoNothing({ target: registrationCounters.classGroup });
        const [counter] = await tx.select({ lastNumber: registrationCounters.lastNumber }).from(registrationCounters).where(eq2(registrationCounters.classGroup, data.classGroup)).for("update");
        const nextNumber = Number(counter?.lastNumber ?? 0) + 1;
        await tx.update(registrationCounters).set({ lastNumber: nextNumber }).where(eq2(registrationCounters.classGroup, data.classGroup));
        const allocated = `${data.prefix}-${String(nextNumber).padStart(3, "0")}`;
        await tx.insert(registrations).values({
          studentName: data.studentName,
          guardianEmail: data.guardianEmail,
          guardianPhone: data.guardianPhone,
          schoolClass: data.schoolClass,
          classGroup: data.classGroup,
          registrationNumber: allocated,
          dedupeKey: data.dedupeKey,
          emailStatus: data.emailStatus
        });
        return allocated;
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new DuplicateRegistrationError();
      throw error;
    }
  }
  async createFamily(data) {
    try {
      return await this.db.transaction(async (tx) => {
        const nextNumbers = {};
        for (const classGroup of [...new Set(data.map((item) => item.classGroup))].sort()) {
          await tx.insert(registrationCounters).values({ classGroup, lastNumber: 0 }).onConflictDoNothing({ target: registrationCounters.classGroup });
          const [counter] = await tx.select({ lastNumber: registrationCounters.lastNumber }).from(registrationCounters).where(eq2(registrationCounters.classGroup, classGroup)).for("update");
          nextNumbers[classGroup] = Number(counter?.lastNumber ?? 0);
        }
        const numbered = data.map((item) => {
          const next = ++nextNumbers[item.classGroup];
          return { ...item, registrationNumber: `${item.prefix}-${String(next).padStart(3, "0")}` };
        });
        for (const [classGroup, lastNumber] of Object.entries(nextNumbers)) {
          await tx.update(registrationCounters).set({ lastNumber }).where(eq2(registrationCounters.classGroup, classGroup));
        }
        await tx.insert(registrations).values(numbered.map((item) => ({
          studentName: item.studentName,
          guardianEmail: item.guardianEmail,
          guardianPhone: item.guardianPhone,
          schoolClass: item.schoolClass,
          classGroup: item.classGroup,
          registrationNumber: item.registrationNumber,
          dedupeKey: item.dedupeKey,
          emailStatus: item.emailStatus,
          familyCode: item.familyCode,
          familyPaymentLead: item.familyPaymentLead,
          createdAt: item.createdAt,
          updatedAt: item.createdAt
        })));
        return numbered.map((item) => item.registrationNumber);
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new DuplicateRegistrationError();
      throw error;
    }
  }
  async findByNumber(registrationNumber) {
    const rows = await this.db.select().from(registrations).where(eq2(registrations.registrationNumber, registrationNumber)).limit(1);
    return rows[0] ?? null;
  }
  async findById(id) {
    const rows = await this.db.select().from(registrations).where(eq2(registrations.id, id)).limit(1);
    return rows[0] ?? null;
  }
  async findByFamilyCode(familyCode) {
    return this.db.select().from(registrations).where(eq2(registrations.familyCode, familyCode)).orderBy(registrations.id);
  }
  async listForAdmin() {
    return this.db.select(ADMIN_COLUMNS).from(registrations).orderBy(desc(registrations.createdAt));
  }
  async getReceiptImage(id) {
    const rows = await this.db.select({ receiptImage: registrations.receiptImage, receiptSubmittedAt: registrations.receiptSubmittedAt }).from(registrations).where(eq2(registrations.id, id)).limit(1);
    return rows[0] ?? null;
  }
  async updateByNumber(registrationNumber, patch) {
    await this.db.update(registrations).set(patch).where(eq2(registrations.registrationNumber, registrationNumber));
  }
  async updateById(id, patch) {
    await this.db.update(registrations).set(patch).where(eq2(registrations.id, id));
  }
  async updateByFamilyCode(familyCode, patch) {
    await this.db.update(registrations).set(patch).where(eq2(registrations.familyCode, familyCode));
  }
};
var DATE_FIELDS = ["emailSentAt", "receiptSubmittedAt", "verifiedAt", "createdAt", "updatedAt"];
var DATA_DIR = path.join(process.cwd(), ".data");
var DATA_FILE = path.join(DATA_DIR, "registrations.json");
var PERSIST = !process.env.VITEST;
function reviveDates(record) {
  const clone = { ...record };
  for (const field of DATE_FIELDS) {
    const value = clone[field];
    clone[field] = value ? new Date(value) : null;
  }
  return clone;
}
var MemoryStore = class {
  state = { registrations: [], counters: {}, nextId: 1 };
  constructor() {
    if (!PERSIST) return;
    try {
      if (fs.existsSync(DATA_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        this.state = {
          registrations: (parsed.registrations ?? []).map(reviveDates),
          counters: parsed.counters ?? {},
          nextId: parsed.nextId ?? (parsed.registrations?.length ?? 0) + 1
        };
      }
      console.warn("[Store] DATABASE_URL is not set \u2014 using the local JSON store at .data/registrations.json. Set DATABASE_URL for a durable production database.");
    } catch (error) {
      console.error("[Store] Could not read the local data file; starting empty:", error);
    }
  }
  persist() {
    if (!PERSIST) return;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.state, null, 2), "utf8");
    } catch (error) {
      console.error("[Store] Could not write the local data file:", error);
    }
  }
  clone(record) {
    return { ...record };
  }
  async findByDedupeKey(dedupeKey) {
    const found = this.state.registrations.find((r) => r.dedupeKey === dedupeKey);
    return found ? { registrationNumber: found.registrationNumber } : null;
  }
  async create(data) {
    if (this.state.registrations.some((r) => r.dedupeKey === data.dedupeKey)) {
      throw new DuplicateRegistrationError();
    }
    const next = (this.state.counters[data.classGroup] ?? 0) + 1;
    this.state.counters[data.classGroup] = next;
    const registrationNumber = `${data.prefix}-${String(next).padStart(3, "0")}`;
    const now = /* @__PURE__ */ new Date();
    const record = {
      id: this.state.nextId++,
      studentName: data.studentName,
      guardianEmail: data.guardianEmail,
      guardianPhone: data.guardianPhone,
      schoolClass: data.schoolClass,
      classGroup: data.classGroup,
      registrationNumber,
      dedupeKey: data.dedupeKey,
      familyCode: null,
      familyPaymentLead: false,
      verifiedAmountNgn: null,
      paymentStatus: "pending_payment",
      receiptStatus: "not_submitted",
      verificationStatus: "pending",
      emailStatus: data.emailStatus,
      emailMessageId: null,
      emailSentAt: null,
      emailError: null,
      receiptImage: null,
      receiptSubmittedAt: null,
      receiptAttempts: 0,
      receiptAnalysis: null,
      verifiedAt: null,
      verifiedBy: null,
      notes: null,
      createdAt: now,
      updatedAt: now
    };
    this.state.registrations.push(record);
    this.persist();
    return registrationNumber;
  }
  async createFamily(data) {
    const dedupeKeys = data.map((item) => item.dedupeKey);
    if (new Set(dedupeKeys).size !== dedupeKeys.length || dedupeKeys.some((key) => this.state.registrations.some((r) => r.dedupeKey === key))) {
      throw new DuplicateRegistrationError();
    }
    const numbers = data.map((item) => {
      const next = (this.state.counters[item.classGroup] ?? 0) + 1;
      this.state.counters[item.classGroup] = next;
      return `${item.prefix}-${String(next).padStart(3, "0")}`;
    });
    const records = data.map((item, index) => ({
      id: this.state.nextId++,
      studentName: item.studentName,
      guardianEmail: item.guardianEmail,
      guardianPhone: item.guardianPhone,
      schoolClass: item.schoolClass,
      classGroup: item.classGroup,
      registrationNumber: numbers[index],
      dedupeKey: item.dedupeKey,
      familyCode: item.familyCode,
      familyPaymentLead: item.familyPaymentLead,
      verifiedAmountNgn: null,
      paymentStatus: "pending_payment",
      receiptStatus: "not_submitted",
      verificationStatus: "pending",
      emailStatus: item.emailStatus,
      emailMessageId: null,
      emailSentAt: null,
      emailError: null,
      receiptImage: null,
      receiptSubmittedAt: null,
      receiptAttempts: 0,
      receiptAnalysis: null,
      verifiedAt: null,
      verifiedBy: null,
      notes: null,
      createdAt: item.createdAt,
      updatedAt: item.createdAt
    }));
    this.state.registrations.push(...records);
    this.persist();
    return numbers;
  }
  async findByNumber(registrationNumber) {
    const found = this.state.registrations.find((r) => r.registrationNumber === registrationNumber);
    return found ? this.clone(found) : null;
  }
  async findById(id) {
    const found = this.state.registrations.find((r) => r.id === id);
    return found ? this.clone(found) : null;
  }
  async findByFamilyCode(familyCode) {
    return this.state.registrations.filter((record) => record.familyCode === familyCode).sort((a, b) => a.id - b.id).map((record) => this.clone(record));
  }
  async listForAdmin() {
    return [...this.state.registrations].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((r) => {
      const { receiptImage: _img, receiptAnalysis: _an, dedupeKey: _dk, emailMessageId: _mid, updatedAt: _up, ...row } = r;
      return row;
    });
  }
  async getReceiptImage(id) {
    const found = this.state.registrations.find((r) => r.id === id);
    return found ? { receiptImage: found.receiptImage, receiptSubmittedAt: found.receiptSubmittedAt } : null;
  }
  apply(record, patch) {
    Object.assign(record, patch, { updatedAt: /* @__PURE__ */ new Date() });
  }
  async updateByNumber(registrationNumber, patch) {
    const record = this.state.registrations.find((r) => r.registrationNumber === registrationNumber);
    if (record) {
      this.apply(record, patch);
      this.persist();
    }
  }
  async updateById(id, patch) {
    const record = this.state.registrations.find((r) => r.id === id);
    if (record) {
      this.apply(record, patch);
      this.persist();
    }
  }
  async updateByFamilyCode(familyCode, patch) {
    const family = this.state.registrations.filter((record) => record.familyCode === familyCode);
    if (!family.length) return;
    family.forEach((record) => this.apply(record, patch));
    this.persist();
  }
};
var postgresStore = null;
var memoryStore = null;
async function getStore() {
  const db = await getDb();
  if (db) {
    if (!postgresStore || postgresStore.db !== db) postgresStore = { db, store: new PostgresStore(db) };
    return postgresStore.store;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Registration storage is unavailable. Configure DATABASE_URL or POSTGRES_URL before accepting registrations.");
  }
  if (!memoryStore) memoryStore = new MemoryStore();
  return memoryStore;
}

// server/email/resend.ts
import { Resend } from "resend";

// server/email/templates.ts
var INK = "#172c25";
var INK_SOFT = "#5f6e65";
var CREAM = "#f5f0e8";
var PAPER = "#fbfaf6";
var APRICOT = "#e7b58e";
var SAGE_LIGHT = "#e5ebe0";
var LINE = "#dcd8cf";
var CAMP = {
  dates: "23rd \u2013 28th December, 2026",
  venue: "Ethical College, Ilorin",
  address: "Behind Okin Filling Station, Opposite Agric, Zango Road, Ilorin",
  accountName: PAYMENT_DETAILS.accountName,
  accountNumber: PAYMENT_DETAILS.accountNumber,
  bank: PAYMENT_DETAILS.bank,
  whatsappDisplay: PAYMENT_DETAILS.enquiriesPhone,
  whatsappLink: PAYMENT_DETAILS.enquiriesLink
};
function formatNaira(amount) {
  return typeof amount === "number" ? `\u20A6${amount.toLocaleString("en-NG")}` : "Contact Hope-Alive to confirm the fee";
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function registrationEmailSubject(data) {
  return `Registration saved \u2014 ${data.registrationNumber} \xB7 Hope-Alive IVC 2026`;
}
function detailRow(label, value, isLast = false) {
  const border = isLast ? "" : `border-bottom:1px solid ${LINE};`;
  return `<tr>
    <td style="padding:12px 0;${border}font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${INK_SOFT};text-transform:uppercase;letter-spacing:0.08em;" valign="top">${escapeHtml(label)}</td>
    <td style="padding:12px 0;${border}font-family:Helvetica,Arial,sans-serif;font-size:15px;color:${INK};font-weight:700;text-align:right;" valign="top">${escapeHtml(value)}</td>
  </tr>`;
}
function registrationEmailHtml(data) {
  const name = escapeHtml(data.studentName);
  const number = escapeHtml(data.registrationNumber);
  const continueUrl = data.appUrl ? `${data.appUrl}/register?mode=continue` : "";
  const continueButton = continueUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
         <tr><td style="border-radius:999px;background:${INK};">
           <a href="${escapeHtml(continueUrl)}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${CREAM};text-decoration:none;border-radius:999px;">Continue my registration</a>
         </td></tr>
       </table>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(registrationEmailSubject(data))}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your registration number is ${number}. Keep it safe \u2014 you will need it for payment.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:${PAPER};border-radius:16px;overflow:hidden;border:1px solid ${LINE};">

  <tr><td style="height:4px;background:${APRICOT};font-size:0;line-height:0;">&nbsp;</td></tr>

  <tr><td style="padding:28px 32px 0;">
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:-0.03em;color:${INK};">hope-alive</p>
    <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${INK_SOFT};">Islamic Vacation Course 2026</p>
  </td></tr>

  <tr><td style="padding:24px 32px 0;">
    <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;letter-spacing:-0.04em;line-height:1.1;color:${INK};">You're registered, ${name}.</h1>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK_SOFT};">Your place at the IVC 2026 camping programme is saved. Keep the registration number below \u2014 you'll need it to make payment and to pick up where you left off.</p>
  </td></tr>

  <tr><td style="padding:24px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SAGE_LIGHT};border-radius:12px;">
      <tr><td align="center" style="padding:20px;">
        <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${INK_SOFT};">Your registration number</p>
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:28px;font-weight:800;letter-spacing:0.06em;color:${INK};">${number}</p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:20px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${detailRow("Participant", data.studentName)}
      ${detailRow("Class", data.schoolClass)}
      ${detailRow("Class group", String(data.classGroup))}
      ${detailRow("Registration fee", formatNaira(data.feeNgn))}
      ${detailRow("Contact phone", data.guardianPhone)}
      ${detailRow("Dates", CAMP.dates)}
      ${detailRow("Venue", CAMP.venue, true)}
    </table>
    <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${INK_SOFT};">${escapeHtml(CAMP.address)}</p>
  </td></tr>

  <tr><td style="padding:24px 32px 0;">
    <p style="margin:0 0 10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${INK_SOFT};">Next step \u2014 payment</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:12px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 2px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${INK};">${escapeHtml(CAMP.accountName)}</p>
        <p style="margin:0 0 2px;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;letter-spacing:0.06em;color:${INK};">${escapeHtml(CAMP.accountNumber)}</p>
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${INK_SOFT};">${escapeHtml(CAMP.bank)}</p>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${INK_SOFT};">Pay by transfer using the details above, then come back to the site and upload a screenshot of your receipt. Our team reviews payments manually; once yours is confirmed, you\u2019ll receive the participants\u2019 group link.</p>
  </td></tr>

  ${continueButton ? `<tr><td align="center" style="padding:26px 32px 0;">${continueButton}</td></tr>` : ""}

  <tr><td style="padding:28px 32px 28px;">
    <div style="height:1px;background:${LINE};margin-bottom:16px;"></div>
    <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${INK_SOFT};">Questions? Message us on WhatsApp at <a href="${CAMP.whatsappLink}" style="color:${INK};">${escapeHtml(CAMP.whatsappDisplay)}</a>.</p>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:${INK_SOFT};">You received this because this address was used to register a participant for the Hope-Alive Islamic Vacation Course 2026. This is a one-off confirmation, not a marketing list.</p>
    <p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${INK_SOFT};">Hope-Alive Muslim Foundation \xB7 Faith \xB7 Education \xB7 Community</p>
  </td></tr>

</table>
<p style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${INK_SOFT};">&copy; 2026 Hope-Alive Muslim Foundation</p>
</td></tr>
</table>
</body>
</html>`;
}
function registrationEmailText(data) {
  const lines = [
    `You're registered, ${data.studentName}.`,
    "",
    "Your place at the Hope-Alive Islamic Vacation Course 2026 camping programme is saved.",
    "",
    `YOUR REGISTRATION NUMBER: ${data.registrationNumber}`,
    "Keep this number \u2014 you need it for payment and to continue later.",
    "",
    `Participant:   ${data.studentName}`,
    `Class:         ${data.schoolClass}`,
    `Class group:   ${data.classGroup}`,
    `Registration fee: ${formatNaira(data.feeNgn)}`,
    `Contact phone: ${data.guardianPhone}`,
    `Dates:         ${CAMP.dates}`,
    `Venue:         ${CAMP.venue}`,
    `               ${CAMP.address}`,
    "",
    "NEXT STEP \u2014 PAYMENT",
    `${CAMP.accountName}`,
    `${CAMP.accountNumber}`,
    `${CAMP.bank}`,
    "",
    "Pay by transfer using the details above, then come back to the site and upload a screenshot of your receipt. Our team reviews payments manually; once yours is confirmed, you'll receive the participants' group link."
  ];
  if (data.appUrl) {
    lines.push("", `Upload your receipt / continue: ${data.appUrl}/register?mode=continue`);
  }
  lines.push(
    "",
    "---",
    `Questions? WhatsApp ${CAMP.whatsappDisplay}.`,
    "You received this because this address was used to register a participant for the Hope-Alive Islamic Vacation Course 2026. This is a one-off confirmation, not a marketing list.",
    "Hope-Alive Muslim Foundation \xB7 Faith \xB7 Education \xB7 Community"
  );
  return lines.join("\n");
}
function paymentVerifiedEmailSubject(data) {
  return `Payment confirmed \u2014 ${data.registrationNumber} \xB7 Hope-Alive IVC 2026`;
}
function paymentVerifiedEmailHtml(data) {
  const name = escapeHtml(data.studentName);
  const number = escapeHtml(data.registrationNumber);
  const groupUrl = data.groupUrl ? escapeHtml(data.groupUrl) : "";
  const groupBlock = groupUrl ? `<tr><td style="padding:24px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SAGE_LIGHT};border-radius:12px;">
          <tr><td align="center" style="padding:22px 20px;">
            <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${INK_SOFT};">Participants' WhatsApp group</p>
            <p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${INK_SOFT};">This link is for verified participants only. Please don't forward it.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr><td style="border-radius:999px;background:${INK};">
                <a href="${groupUrl}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${CREAM};text-decoration:none;border-radius:999px;">Join the group</a>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>` : `<tr><td style="padding:24px 32px 0;">
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${INK_SOFT};">We'll share the participants' group link with verified families shortly \u2014 keep an eye on this inbox.</p>
      </td></tr>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(paymentVerifiedEmailSubject(data))}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Payment confirmed for ${number}. ${name}'s place at IVC 2026 is secured.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:${PAPER};border-radius:16px;overflow:hidden;border:1px solid ${LINE};">

  <tr><td style="height:4px;background:${APRICOT};font-size:0;line-height:0;">&nbsp;</td></tr>

  <tr><td style="padding:28px 32px 0;">
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:-0.03em;color:${INK};">hope-alive</p>
    <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${INK_SOFT};">Islamic Vacation Course 2026</p>
  </td></tr>

  <tr><td style="padding:24px 32px 0;">
    <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;letter-spacing:-0.04em;line-height:1.1;color:${INK};">Payment confirmed.</h1>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK_SOFT};">Thank you \u2014 ${name}'s place at the IVC 2026 camping programme is secured under <strong style="color:${INK};">${number}</strong> (${escapeHtml(String(data.classGroup))}).</p>
  </td></tr>

  ${groupBlock}

  <tr><td style="padding:24px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${detailRow("Registration fee", formatNaira(data.feeNgn))}
      ${detailRow("Dates", CAMP.dates)}
      ${detailRow("Venue", CAMP.venue, true)}
    </table>
    <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${INK_SOFT};">${escapeHtml(CAMP.address)}</p>
  </td></tr>

  <tr><td style="padding:28px 32px 28px;">
    <div style="height:1px;background:${LINE};margin-bottom:16px;"></div>
    <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${INK_SOFT};">Questions? Message us on WhatsApp at <a href="${CAMP.whatsappLink}" style="color:${INK};">${escapeHtml(CAMP.whatsappDisplay)}</a>.</p>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:${INK_SOFT};">You received this because a payment was confirmed for a Hope-Alive IVC 2026 registration made with this address. This is a one-off confirmation, not a marketing list.</p>
    <p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${INK_SOFT};">Hope-Alive Muslim Foundation \xB7 Faith \xB7 Education \xB7 Community</p>
  </td></tr>

</table>
<p style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${INK_SOFT};">&copy; 2026 Hope-Alive Muslim Foundation</p>
</td></tr>
</table>
</body>
</html>`;
}
function paymentVerifiedEmailText(data) {
  const lines = [
    "Payment confirmed.",
    "",
    `Thank you \u2014 ${data.studentName}'s place at the Hope-Alive IVC 2026 camping programme is secured under ${data.registrationNumber} (${data.classGroup}).`,
    `Registration fee: ${formatNaira(data.feeNgn)}`,
    ""
  ];
  if (data.groupUrl) {
    lines.push(
      "PARTICIPANTS' WHATSAPP GROUP",
      "This link is for verified participants only. Please don't forward it.",
      data.groupUrl
    );
  } else {
    lines.push("We'll share the participants' group link with verified families shortly \u2014 keep an eye on this inbox.");
  }
  lines.push(
    "",
    `Dates: ${CAMP.dates}`,
    `Venue: ${CAMP.venue}`,
    `       ${CAMP.address}`,
    "",
    "---",
    `Questions? WhatsApp ${CAMP.whatsappDisplay}.`,
    "You received this because a payment was confirmed for a Hope-Alive IVC 2026 registration made with this address. This is a one-off confirmation, not a marketing list.",
    "Hope-Alive Muslim Foundation \xB7 Faith \xB7 Education \xB7 Community"
  );
  return lines.join("\n");
}

// server/email/resend.ts
var client = null;
var clientKey = "";
function getClient() {
  const key = ENV.resendApiKey;
  if (!key) return null;
  if (!client || clientKey !== key) {
    client = new Resend(key);
    clientKey = key;
  }
  return client;
}
function isEmailConfigured() {
  return Boolean(ENV.resendApiKey && ENV.resendFromEmail);
}
function emailConfigurationProblem() {
  if (!ENV.resendApiKey) return "RESEND_API_KEY is not set";
  if (!ENV.resendFromEmail) return "RESEND_FROM_EMAIL is not set";
  return null;
}
function maskEmail(email) {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
function describeError(error) {
  if (error && typeof error === "object") {
    const maybe = error;
    if (typeof maybe.message === "string" && maybe.message.trim()) return maybe.message.trim().slice(0, 240);
    if (typeof maybe.name === "string" && maybe.name.trim()) return maybe.name.trim().slice(0, 240);
  }
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 240);
  return "Unknown email delivery error";
}
async function sendEmail(message) {
  const problem = emailConfigurationProblem();
  if (problem) {
    console.warn(`[Email] Skipped ${message.label} email for ${maskEmail(message.to)}: ${problem}.`);
    return { status: "skipped", reason: problem };
  }
  const resend = getClient();
  if (!resend) return { status: "skipped", reason: "RESEND_API_KEY is not set" };
  try {
    const { data: result, error } = await resend.emails.send(
      {
        from: ENV.resendFromEmail,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...ENV.resendReplyTo ? { replyTo: ENV.resendReplyTo } : {},
        headers: { "X-Entity-Ref-ID": message.refId }
      },
      { idempotencyKey: message.idempotencyKey }
    );
    if (error) {
      const reason = describeError(error);
      console.error(`[Email] Resend rejected ${message.label} for ${maskEmail(message.to)}: ${reason}`);
      return { status: "failed", reason };
    }
    if (!result?.id) {
      console.error(`[Email] Resend returned no message id for ${message.label}.`);
      return { status: "failed", reason: "Resend returned no message id" };
    }
    console.log(`[Email] Queued ${message.label} to ${maskEmail(message.to)} (resend id ${result.id}).`);
    return { status: "sent", messageId: result.id };
  } catch (error) {
    const reason = describeError(error);
    console.error(`[Email] Failed to call Resend for ${message.label}: ${reason}`);
    return { status: "failed", reason };
  }
}
async function sendRegistrationEmail(to, data, options = {}) {
  const base = `registration-${data.registrationNumber}`;
  return sendEmail({
    to,
    subject: registrationEmailSubject(data),
    html: registrationEmailHtml(data),
    text: registrationEmailText(data),
    idempotencyKey: options.idempotencySuffix ? `${base}-${options.idempotencySuffix}` : base,
    label: `registration ${data.registrationNumber}`,
    refId: data.registrationNumber
  });
}
async function sendPaymentVerifiedEmail(to, data, options = {}) {
  const base = `payment-verified-${data.registrationNumber}`;
  return sendEmail({
    to,
    subject: paymentVerifiedEmailSubject(data),
    html: paymentVerifiedEmailHtml(data),
    text: paymentVerifiedEmailText(data),
    idempotencyKey: options.idempotencySuffix ? `${base}-${options.idempotencySuffix}` : base,
    label: `payment-verified ${data.registrationNumber}`,
    refId: `${data.registrationNumber}-verified`
  });
}

// server/rateLimit.ts
var buckets = /* @__PURE__ */ new Map();
function sweep(now) {
  if (buckets.size < 512) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
function hitRateLimit(key, limit, windowMs, now = Date.now()) {
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1e3)) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// server/_core/adminAuth.ts
import { parse as parseCookie } from "cookie";
import { SignJWT as SignJWT2, jwtVerify as jwtVerify2 } from "jose";
var ADMIN_COOKIE = "hopealive_admin";
var SESSION_TTL_SECONDS = 60 * 60 * 12;
var ADMIN_COOKIE_MAX_AGE_MS = SESSION_TTL_SECONDS * 1e3;
function constantTimeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const max = Math.max(ab.length, bb.length);
  for (let i = 0; i < max; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}
function isAdminLoginConfigured() {
  return Boolean(ENV.adminEmail && ENV.adminPassword && ENV.adminSessionSecret);
}
function adminLoginProblem() {
  if (!ENV.adminEmail) return "ADMIN_EMAIL is not set";
  if (!ENV.adminPassword) return "ADMIN_PASSWORD is not set";
  if (!ENV.adminSessionSecret) return "ADMIN_SESSION_SECRET is not set";
  return null;
}
function verifyAdminCredentials(email, password) {
  if (!isAdminLoginConfigured()) return false;
  const emailOk = constantTimeEqual(email.trim().toLowerCase(), ENV.adminEmail.trim().toLowerCase());
  const passwordOk = constantTimeEqual(password, ENV.adminPassword);
  return emailOk && passwordOk;
}
function secretKey() {
  return new TextEncoder().encode(ENV.adminSessionSecret);
}
async function signAdminSession(email) {
  return new SignJWT2({ role: "admin", email }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SESSION_TTL_SECONDS}s`).sign(secretKey());
}
async function readAdminSession(req) {
  if (!ENV.adminSessionSecret) return null;
  const header = req.headers?.cookie;
  if (!header) return null;
  let token;
  try {
    token = parseCookie(header)[ADMIN_COOKIE];
  } catch {
    return null;
  }
  if (!token) return null;
  try {
    const { payload } = await jwtVerify2(token, secretKey());
    if (payload.role === "admin" && typeof payload.email === "string") {
      return { email: payload.email };
    }
  } catch {
  }
  return null;
}

// server/_core/systemRouter.ts
import { z as z2 } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    const isAdmin = ctx.user?.role === "admin" || Boolean(ctx.admin);
    if (!isAdmin) {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z2.object({
      timestamp: z2.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z2.object({
      title: z2.string().min(1, "title is required"),
      content: z2.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var RATE_LIMITS = {
  /** Per source IP. Accommodates many families on one shared connection. */
  ip: { limit: 30, windowMs: 10 * 60 * 1e3 },
  /** Per email address. Accommodates a large family registering each child. */
  email: { limit: 10, windowMs: 60 * 60 * 1e3 },
  /** Receipt/evidence uploads per IP — each stores an image, so a little tighter. */
  receiptIp: { limit: 20, windowMs: 60 * 60 * 1e3 }
};
function requireClassGroup(schoolClass) {
  const group = findClassGroup(schoolClass);
  if (!group) throw new TRPCError3({ code: "BAD_REQUEST", message: "Please select a valid school class." });
  return group;
}
function fingerprintHash(input) {
  return createHash("sha256").update(dedupeFingerprint(input)).digest("hex");
}
var DUPLICATE_MESSAGE = "This participant is already registered with that phone number and class. Use \u201CContinue a registration\u201D to retrieve the existing registration number.";
var NOT_FOUND_MESSAGE = "We could not find that registration. Check the number and phone number and try again.";
function publicReceiptMessage(row) {
  if (row.verificationStatus === "verified") return "Your payment has been confirmed.";
  if (row.verificationStatus === "rejected") {
    return "We could not confirm this payment. Please check your details, re-upload a clearer receipt, or contact us on WhatsApp with your registration ID.";
  }
  if (row.receiptStatus === "submitted") {
    return "Your payment evidence has been received and is pending review. Submitting evidence does not confirm payment \u2014 an administrator will verify it using your registration ID.";
  }
  return null;
}
function toPublicRegistration(row) {
  const verified = row.verificationStatus === "verified";
  return {
    registrationNumber: row.registrationNumber,
    familyCode: row.familyCode ?? null,
    studentName: row.studentName,
    guardianEmail: row.guardianEmail,
    guardianPhone: row.guardianPhone,
    schoolClass: row.schoolClass,
    classGroup: row.classGroup,
    paymentStatus: row.paymentStatus,
    verificationStatus: row.verificationStatus,
    receiptStatus: row.receiptStatus,
    receiptAttemptsLeft: Math.max(0, MAX_RECEIPT_ATTEMPTS - row.receiptAttempts),
    receiptMessage: publicReceiptMessage(row),
    feeNgn: registrationFeeNgn(row.schoolClass, row.createdAt),
    payment: PAYMENT_DETAILS,
    // Only a verified registration ever receives the invite link.
    whatsappGroupUrl: verified && ENV.whatsappGroupUrl ? ENV.whatsappGroupUrl : null
  };
}
async function notifyPaymentVerified(row) {
  if (!row.guardianEmail) return;
  await sendPaymentVerifiedEmail(row.guardianEmail, {
    studentName: row.studentName,
    registrationNumber: row.registrationNumber,
    classGroup: row.classGroup,
    feeNgn: row.feeNgn ?? registrationFeeNgn(row.schoolClass, row.createdAt),
    groupUrl: ENV.whatsappGroupUrl,
    appUrl: ENV.appUrl
  });
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
    /** Whether the caller currently holds an admin session (either mechanism). */
    adminSession: publicProcedure.query(({ ctx }) => ({
      isAdmin: ctx.user?.role === "admin" || Boolean(ctx.admin),
      email: ctx.admin?.email ?? ctx.user?.email ?? null,
      loginConfigured: isAdminLoginConfigured()
    })),
    /** Email + password admin login. Sets a signed, httpOnly session cookie. */
    adminLogin: publicProcedure.input(z3.object({ email: z3.string().trim().min(1), password: z3.string().min(1) })).mutation(async ({ input, ctx }) => {
      const ip = clientIp(ctx.req);
      const limit = hitRateLimit(`adminlogin:ip:${ip}`, 8, 10 * 60 * 1e3);
      if (!limit.allowed) {
        throw new TRPCError3({
          code: "TOO_MANY_REQUESTS",
          message: `Too many login attempts. Please try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`
        });
      }
      const problem = adminLoginProblem();
      if (problem) {
        console.warn(`[Admin] Login unavailable: ${problem}.`);
        throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Admin login is not configured on the server yet." });
      }
      if (!verifyAdminCredentials(input.email, input.password)) {
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Incorrect email or password." });
      }
      const token = await signAdminSession(input.email.trim().toLowerCase());
      ctx.res.cookie(ADMIN_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: ADMIN_COOKIE_MAX_AGE_MS });
      return { success: true };
    }),
    adminLogout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(ADMIN_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true };
    })
  }),
  registration: router({
    create: publicProcedure.input(registrationInputSchema).mutation(async ({ input, ctx }) => {
      const ip = clientIp(ctx.req);
      const guardianEmail = normalizeEmail(input.guardianEmail);
      const ipLimit = hitRateLimit(`register:ip:${ip}`, RATE_LIMITS.ip.limit, RATE_LIMITS.ip.windowMs);
      if (!ipLimit.allowed) {
        throw new TRPCError3({
          code: "TOO_MANY_REQUESTS",
          message: `Too many registration attempts. Please try again in about ${Math.ceil(ipLimit.retryAfterSeconds / 60)} minute(s).`
        });
      }
      const emailLimit = hitRateLimit(`register:email:${guardianEmail}`, RATE_LIMITS.email.limit, RATE_LIMITS.email.windowMs);
      if (!emailLimit.allowed) {
        throw new TRPCError3({
          code: "TOO_MANY_REQUESTS",
          message: "This email address has been used for several registrations recently. Please contact us on WhatsApp if you need to register more participants."
        });
      }
      const store = await getStore();
      const classGroup = requireClassGroup(input.schoolClass);
      const prefix = GROUP_PREFIXES[classGroup];
      const guardianPhone = normalizePhone(input.guardianPhone);
      const studentName = input.studentName.trim().replace(/\s+/g, " ");
      const dedupeKey = fingerprintHash({ studentName, guardianPhone, schoolClass: input.schoolClass });
      if (await store.findByDedupeKey(dedupeKey)) {
        throw new TRPCError3({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
      }
      let registrationNumber;
      try {
        registrationNumber = await store.create({
          studentName,
          guardianEmail,
          guardianPhone,
          schoolClass: input.schoolClass,
          classGroup,
          prefix,
          dedupeKey,
          emailStatus: isEmailConfigured() ? "pending" : "skipped"
        });
      } catch (error) {
        if (error instanceof DuplicateRegistrationError) throw new TRPCError3({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
        console.error("[Registration] Failed to save registration:", error);
        throw new TRPCError3({
          code: "INTERNAL_SERVER_ERROR",
          message: "We could not save your registration. Please try again."
        });
      }
      const savedRegistration = await store.findByNumber(registrationNumber);
      const registeredAt = savedRegistration?.createdAt ?? /* @__PURE__ */ new Date();
      const feeNgn = registrationFeeNgn(input.schoolClass, registeredAt);
      const emailResult = await sendRegistrationEmail(guardianEmail, {
        studentName,
        registrationNumber,
        schoolClass: input.schoolClass,
        classGroup,
        guardianPhone,
        feeNgn,
        appUrl: ENV.appUrl
      });
      try {
        await store.updateByNumber(
          registrationNumber,
          emailResult.status === "sent" ? { emailStatus: "sent", emailMessageId: emailResult.messageId, emailSentAt: /* @__PURE__ */ new Date(), emailError: null } : { emailStatus: emailResult.status, emailError: emailResult.reason.slice(0, 255) }
        );
      } catch (error) {
        console.error(`[Registration] Could not record email status for ${registrationNumber}:`, error);
      }
      return {
        ...toPublicRegistration({
          registrationNumber,
          studentName,
          guardianEmail,
          guardianPhone,
          schoolClass: input.schoolClass,
          classGroup,
          paymentStatus: "pending_payment",
          verificationStatus: "pending",
          receiptStatus: "not_submitted",
          receiptAttempts: 0,
          createdAt: registeredAt
        }),
        // "sent" means Resend accepted the message, not that it reached the inbox.
        emailStatus: emailResult.status
      };
    }),
    createFamily: publicProcedure.input(familyRegistrationInputSchema).mutation(async ({ input, ctx }) => {
      const ip = clientIp(ctx.req);
      const limited = hitRateLimit(`register:ip:${ip}`, RATE_LIMITS.ip.limit, RATE_LIMITS.ip.windowMs);
      if (!limited.allowed) throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Too many registration attempts. Please try again shortly." });
      const phone = normalizePhone(input.guardianPhone);
      const email = input.consentToEmail && input.guardianEmail ? normalizeEmail(input.guardianEmail) : null;
      if (email) {
        const emailLimit = hitRateLimit(`register:email:${email}`, RATE_LIMITS.email.limit, RATE_LIMITS.email.windowMs);
        if (!emailLimit.allowed) {
          throw new TRPCError3({
            code: "TOO_MANY_REQUESTS",
            message: "This email address has been used for several registrations recently. Please contact us on WhatsApp if you need to register more participants."
          });
        }
      }
      const store = await getStore();
      const createdAt = /* @__PURE__ */ new Date();
      if (input.registrationType === "individual") {
        const participant = input.participants[0];
        const studentName = participant.studentName.trim().replace(/\s+/g, " ");
        const classGroup = requireClassGroup(participant.schoolClass);
        const dedupeKey = fingerprintHash({ studentName, guardianPhone: phone, schoolClass: participant.schoolClass });
        if (await store.findByDedupeKey(dedupeKey)) throw new TRPCError3({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
        let registrationNumber;
        try {
          registrationNumber = await store.create({ studentName, guardianEmail: email, guardianPhone: phone, schoolClass: participant.schoolClass, classGroup, prefix: GROUP_PREFIXES[classGroup], dedupeKey, emailStatus: email && isEmailConfigured() ? "pending" : "skipped" });
        } catch (error) {
          if (error instanceof DuplicateRegistrationError) throw new TRPCError3({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
          throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "We could not save this registration. Please try again." });
        }
        const saved = await store.findByNumber(registrationNumber);
        const registeredAt = saved?.createdAt ?? createdAt;
        let emailStatus2 = email && isEmailConfigured() ? "pending" : "skipped";
        if (email && isEmailConfigured()) {
          const sent = await sendRegistrationEmail(email, {
            studentName,
            registrationNumber,
            schoolClass: participant.schoolClass,
            classGroup,
            guardianPhone: phone,
            feeNgn: registrationFeeNgn(participant.schoolClass, registeredAt),
            appUrl: ENV.appUrl
          });
          emailStatus2 = sent.status;
          try {
            await store.updateByNumber(
              registrationNumber,
              sent.status === "sent" ? { emailStatus: "sent", emailMessageId: sent.messageId, emailSentAt: /* @__PURE__ */ new Date(), emailError: null } : { emailStatus: sent.status, emailError: sent.reason.slice(0, 255) }
            );
          } catch (error) {
            console.error(`[Registration] Could not record email status for ${registrationNumber}:`, error);
          }
        }
        return {
          ...toPublicRegistration({
            registrationNumber,
            studentName,
            guardianEmail: email,
            guardianPhone: phone,
            schoolClass: participant.schoolClass,
            classGroup,
            paymentStatus: "pending_payment",
            verificationStatus: "pending",
            receiptStatus: "not_submitted",
            receiptAttempts: 0,
            createdAt: registeredAt
          }),
          registrationType: "individual",
          members: [{ registrationNumber, studentName, schoolClass: participant.schoolClass, classGroup, feeNgn: registrationFeeNgn(participant.schoolClass, registeredAt) }],
          emailStatus: emailStatus2
        };
      }
      const familyCode = `HA-${randomBytes(4).toString("hex").toUpperCase()}`;
      const participants = input.participants.map((p, index) => {
        const studentName = p.studentName.trim().replace(/\s+/g, " ");
        const classGroup = requireClassGroup(p.schoolClass);
        return { studentName, guardianEmail: email, guardianPhone: phone, schoolClass: p.schoolClass, classGroup, prefix: GROUP_PREFIXES[classGroup], dedupeKey: fingerprintHash({ studentName, guardianPhone: phone, schoolClass: p.schoolClass }), emailStatus: email && isEmailConfigured() ? "pending" : "skipped", familyCode, familyPaymentLead: index === 0, createdAt };
      });
      const keys = participants.map((p) => p.dedupeKey);
      if (new Set(keys).size !== keys.length || (await Promise.all(keys.map((key) => store.findByDedupeKey(key)))).some(Boolean)) throw new TRPCError3({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
      let numbers;
      try {
        numbers = await store.createFamily(participants);
      } catch (error) {
        if (error instanceof DuplicateRegistrationError) throw new TRPCError3({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "We could not save this family registration. Please try again." });
      }
      const members = participants.map((p, i) => ({ registrationNumber: numbers[i], studentName: p.studentName, schoolClass: p.schoolClass, classGroup: p.classGroup, feeNgn: registrationFeeNgn(p.schoolClass, createdAt) }));
      const total = members.reduce((sum, member) => sum + (member.feeNgn ?? 0), 0);
      const first = participants[0];
      const result = { ...toPublicRegistration({ registrationNumber: numbers[0], studentName: first.studentName, guardianEmail: email, guardianPhone: phone, schoolClass: first.schoolClass, classGroup: first.classGroup, paymentStatus: "pending_payment", verificationStatus: "pending", receiptStatus: "not_submitted", receiptAttempts: 0, createdAt }), registrationNumber: numbers[0], studentName: input.registrationType === "family" ? `${members.length} participants` : first.studentName, familyCode, registrationType: input.registrationType, members, feeNgn: total, emailStatus: email && isEmailConfigured() ? "pending" : "skipped" };
      if (email && isEmailConfigured()) {
        const sent = await sendRegistrationEmail(email, { studentName: result.studentName, registrationNumber: familyCode, schoolClass: members.map((m) => m.schoolClass).join(", "), classGroup: "Family", guardianPhone: phone, feeNgn: total, appUrl: ENV.appUrl });
        await store.updateByFamilyCode(familyCode, sent.status === "sent" ? { emailStatus: "sent", emailMessageId: sent.messageId, emailSentAt: /* @__PURE__ */ new Date(), emailError: null } : { emailStatus: sent.status, emailError: sent.reason.slice(0, 255) });
        result.emailStatus = sent.status;
      }
      return result;
    }),
    resume: publicProcedure.input(registrationLookupSchema).query(async ({ input }) => {
      const store = await getStore();
      const lookupNumber = input.registrationNumber.toUpperCase();
      const phone = normalizePhone(input.guardianPhone);
      if (lookupNumber.startsWith("HA-")) {
        const family = await store.findByFamilyCode(lookupNumber);
        if (!family.length || family[0].guardianPhone !== phone) throw new TRPCError3({ code: "NOT_FOUND", message: NOT_FOUND_MESSAGE });
        const lead = family.find((row) => row.familyPaymentLead) ?? family[0];
        const members = family.map((row) => ({ registrationNumber: row.registrationNumber, studentName: row.studentName, schoolClass: row.schoolClass, classGroup: row.classGroup, feeNgn: registrationFeeNgn(row.schoolClass, row.createdAt) }));
        return { ...toPublicRegistration(lead), studentName: `${family.length} participants`, familyCode: lead.familyCode, registrationType: family.length > 1 ? "family" : "individual", members, feeNgn: members.reduce((sum, m) => sum + (m.feeNgn ?? 0), 0), verificationStatus: family.every((row) => row.verificationStatus === "verified") ? "verified" : lead.verificationStatus, receiptAttemptsLeft: Math.max(0, MAX_RECEIPT_ATTEMPTS - lead.receiptAttempts) };
      }
      const registration = await store.findByNumber(lookupNumber);
      if (!registration || registration.guardianPhone !== phone) {
        throw new TRPCError3({ code: "NOT_FOUND", message: NOT_FOUND_MESSAGE });
      }
      if (registration.familyCode) {
        const family = await store.findByFamilyCode(registration.familyCode);
        const lead = family.find((row) => row.familyPaymentLead) ?? family[0];
        const members = family.map((row) => ({ registrationNumber: row.registrationNumber, studentName: row.studentName, schoolClass: row.schoolClass, classGroup: row.classGroup, feeNgn: registrationFeeNgn(row.schoolClass, row.createdAt) }));
        return { ...toPublicRegistration(lead), studentName: `${family.length} participants`, familyCode: lead.familyCode, registrationType: "family", members, feeNgn: members.reduce((sum, m) => sum + (m.feeNgn ?? 0), 0), verificationStatus: family.every((row) => row.verificationStatus === "verified") ? "verified" : lead.verificationStatus, receiptAttemptsLeft: Math.max(0, MAX_RECEIPT_ATTEMPTS - lead.receiptAttempts) };
      }
      return toPublicRegistration(registration);
    }),
    /**
     * Optional payment-evidence upload. Stores the screenshot and marks the
     * registration as awaiting manual review. Uploading evidence never confirms
     * a payment — only an admin does that (see `adminUpdateStatus`).
     */
    submitReceipt: publicProcedure.input(receiptUploadSchema).mutation(async ({ input, ctx }) => {
      const ip = clientIp(ctx.req);
      const ipLimit = hitRateLimit(`receipt:ip:${ip}`, RATE_LIMITS.receiptIp.limit, RATE_LIMITS.receiptIp.windowMs);
      if (!ipLimit.allowed) {
        throw new TRPCError3({
          code: "TOO_MANY_REQUESTS",
          message: `Too many uploads. Please try again in about ${Math.ceil(ipLimit.retryAfterSeconds / 60)} minute(s).`
        });
      }
      const store = await getStore();
      const phone = normalizePhone(input.guardianPhone);
      const lookupNumber = input.registrationNumber.toUpperCase();
      let registration = lookupNumber.startsWith("HA-") ? (await store.findByFamilyCode(lookupNumber)).find((row) => row.familyPaymentLead) ?? null : await store.findByNumber(lookupNumber);
      if (!registration || registration.guardianPhone !== phone) {
        throw new TRPCError3({ code: "NOT_FOUND", message: NOT_FOUND_MESSAGE });
      }
      if (registration.familyCode && !registration.familyPaymentLead) {
        registration = (await store.findByFamilyCode(registration.familyCode)).find((row) => row.familyPaymentLead) ?? registration;
      }
      if (registration.verificationStatus === "verified") {
        return { outcome: "already_verified", ...toPublicRegistration(registration) };
      }
      if (registration.receiptAttempts >= MAX_RECEIPT_ATTEMPTS) {
        throw new TRPCError3({
          code: "PRECONDITION_FAILED",
          message: `You've reached the upload limit for this registration. Please message us on WhatsApp ${PAYMENT_DETAILS.enquiriesPhone} with your registration ID and we'll confirm it manually.`
        });
      }
      const attempts = registration.receiptAttempts + 1;
      const receiptPatch = {
        receiptImage: input.imageDataUrl,
        receiptSubmittedAt: /* @__PURE__ */ new Date(),
        receiptAttempts: attempts,
        receiptStatus: "submitted",
        // Awaiting a human: "claimed" by the registrant, pending verification.
        paymentStatus: "payment_claimed",
        verificationStatus: "pending"
      };
      if (registration.familyCode) await store.updateByFamilyCode(registration.familyCode, { ...receiptPatch, receiptImage: null });
      await store.updateById(registration.id, receiptPatch);
      const family = registration.familyCode ? await store.findByFamilyCode(registration.familyCode) : [];
      const members = family.map((row) => ({ registrationNumber: row.registrationNumber, studentName: row.studentName, schoolClass: row.schoolClass, classGroup: row.classGroup, feeNgn: registrationFeeNgn(row.schoolClass, row.createdAt) }));
      return {
        outcome: "submitted",
        ...toPublicRegistration({
          ...registration,
          paymentStatus: "payment_claimed",
          verificationStatus: "pending",
          receiptStatus: "submitted",
          receiptAttempts: attempts
        }),
        ...family.length ? { members, studentName: `${family.length} participants`, feeNgn: members.reduce((sum, item) => sum + (item.feeNgn ?? 0), 0) } : {}
      };
    }),
    adminList: adminProcedure.query(async () => {
      const store = await getStore();
      const rows = await store.listForAdmin();
      const confirmedAmountNgn = rows.reduce((sum, row) => sum + (row.familyCode ? row.familyPaymentLead ? row.verifiedAmountNgn ?? 0 : 0 : row.verificationStatus === "verified" ? registrationFeeNgn(row.schoolClass, row.createdAt) ?? 0 : 0), 0);
      const pendingExpectedAmountNgn = rows.reduce((sum, row) => sum + (row.verificationStatus === "verified" ? 0 : registrationFeeNgn(row.schoolClass, row.createdAt) ?? 0), 0);
      return {
        rows: rows.map((row) => ({ ...row, feeNgn: registrationFeeNgn(row.schoolClass, row.createdAt) })),
        confirmedAmountNgn,
        pendingExpectedAmountNgn,
        emailConfigured: isEmailConfigured(),
        emailProblem: emailConfigurationProblem(),
        groupLinkConfigured: Boolean(ENV.whatsappGroupUrl)
      };
    }),
    /** The stored receipt screenshot for one registration, fetched on demand. */
    adminReceiptImage: adminProcedure.input(z3.object({ id: z3.number().int().positive() })).query(async ({ input }) => {
      const store = await getStore();
      const result = await store.getReceiptImage(input.id);
      if (!result) throw new TRPCError3({ code: "NOT_FOUND", message: "Registration not found." });
      return result;
    }),
    /**
     * Manual status change — the only way a payment is confirmed. Moving a
     * registration to verified for the first time also sends the group-link
     * email. The "first time" guard prevents duplicate confirmation emails.
     */
    adminUpdateStatus: adminProcedure.input(z3.object({ id: z3.number().int().positive(), paymentStatus: z3.enum(PAYMENT_STATUSES), actualAmountNgn: z3.number().int().positive().optional() })).mutation(async ({ input }) => {
      const store = await getStore();
      const registration = await store.findById(input.id);
      if (!registration) throw new TRPCError3({ code: "NOT_FOUND", message: "Registration not found." });
      const verificationStatus2 = input.paymentStatus === "verified" || input.paymentStatus === "completed" ? "verified" : input.paymentStatus === "rejected" ? "rejected" : input.paymentStatus === "under_review" ? "clarification" : "pending";
      const becomingVerified = verificationStatus2 === "verified" && registration.verificationStatus !== "verified";
      const patch = {
        paymentStatus: input.paymentStatus,
        verificationStatus: verificationStatus2,
        ...becomingVerified ? { verifiedAt: /* @__PURE__ */ new Date(), verifiedBy: "admin" } : {}
      };
      if (registration.familyCode) {
        const family = await store.findByFamilyCode(registration.familyCode);
        const expected = family.reduce((sum, row) => sum + (registrationFeeNgn(row.schoolClass, row.createdAt) ?? 0), 0);
        if (becomingVerified) {
          const actual = input.actualAmountNgn;
          if (!actual) throw new TRPCError3({ code: "BAD_REQUEST", message: `Enter the bank-confirmed amount for this family. Expected total: \u20A6${expected.toLocaleString("en-NG")}.` });
          if (actual !== expected) throw new TRPCError3({ code: "BAD_REQUEST", message: `The entered amount does not match the family total of \u20A6${expected.toLocaleString("en-NG")}. Leave the family pending and investigate the difference.` });
          await store.updateByFamilyCode(registration.familyCode, { ...patch, verifiedAmountNgn: null });
          const lead = family.find((row) => row.familyPaymentLead) ?? family[0];
          await store.updateById(lead.id, { verifiedAmountNgn: actual });
          await notifyPaymentVerified({
            ...registration,
            guardianEmail: lead.guardianEmail,
            studentName: `${family.length} participants`,
            registrationNumber: registration.familyCode,
            schoolClass: family.map((row) => row.schoolClass).join(", "),
            classGroup: "Family",
            feeNgn: expected
          });
        } else await store.updateByFamilyCode(registration.familyCode, patch);
      } else {
        await store.updateById(input.id, { ...patch, ...becomingVerified ? { verifiedAmountNgn: input.actualAmountNgn ?? registrationFeeNgn(registration.schoolClass, registration.createdAt) } : {} });
        if (becomingVerified) await notifyPaymentVerified(registration);
      }
      return { success: true, emailed: becomingVerified && Boolean(registration.guardianEmail) };
    }),
    /** Retries a confirmation email that Resend rejected or that was never sent. */
    adminResendEmail: adminProcedure.input(z3.object({ id: z3.number().int().positive() })).mutation(async ({ input }) => {
      const store = await getStore();
      const registration = await store.findById(input.id);
      if (!registration) throw new TRPCError3({ code: "NOT_FOUND", message: "Registration not found." });
      if (!registration.guardianEmail) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "This registration has no email address on file." });
      }
      const problem = emailConfigurationProblem();
      if (problem) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: `Email is not configured: ${problem}.` });
      const emailResult = await sendRegistrationEmail(
        registration.guardianEmail,
        {
          studentName: registration.studentName,
          registrationNumber: registration.registrationNumber,
          schoolClass: registration.schoolClass,
          classGroup: registration.classGroup,
          guardianPhone: registration.guardianPhone,
          feeNgn: registrationFeeNgn(registration.schoolClass, registration.createdAt),
          appUrl: ENV.appUrl
        },
        // Time-bucketed so an accidental double-click is deduped, but a
        // deliberate retry minutes later genuinely resends.
        { idempotencySuffix: `retry-${Math.floor(Date.now() / 6e4)}` }
      );
      await store.updateById(
        registration.id,
        emailResult.status === "sent" ? { emailStatus: "sent", emailMessageId: emailResult.messageId, emailSentAt: /* @__PURE__ */ new Date(), emailError: null } : { emailStatus: emailResult.status, emailError: emailResult.reason.slice(0, 255) }
      );
      if (emailResult.status !== "sent") {
        throw new TRPCError3({
          code: "INTERNAL_SERVER_ERROR",
          message: `Resend could not accept the message: ${emailResult.reason}`
        });
      }
      return { status: emailResult.status, recipient: maskEmail(registration.guardianEmail) };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  let admin = null;
  try {
    admin = await readAdminSession(opts.req);
  } catch {
    admin = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
    admin
  };
}

// server/app.ts
function createApp() {
  const app2 = express();
  app2.use(express.json({ limit: "50mb" }));
  app2.use(express.urlencoded({ limit: "50mb", extended: true }));
  app2.get("/api/health", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ status: "unavailable", database: "not_configured" });
      await db.select({ id: users.id }).from(users).limit(1);
      return res.json({ status: "ok", database: "connected" });
    } catch (error) {
      console.error("[Health] Database check failed:", error);
      return res.status(503).json({ status: "unavailable", database: "error" });
    }
  });
  app2.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app2);
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  return app2;
}
var app = createApp();

// server/vercel.ts
var vercel_default = app;
export {
  vercel_default as default
};
