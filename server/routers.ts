import { COOKIE_NAME } from "@shared/const";
import {
  GROUP_PREFIXES,
  MAX_RECEIPT_ATTEMPTS,
  PAYMENT_DETAILS,
  PAYMENT_STATUSES,
  dedupeFingerprint,
  findClassGroup,
  normalizeEmail,
  normalizePhone,
  receiptUploadSchema,
  registrationInputSchema,
  registrationLookupSchema,
  type ClassGroup,
} from "@shared/registration";
import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { registrations, type Registration } from "../drizzle/schema";
import { getDb } from "./db";
import {
  emailConfigurationProblem,
  isEmailConfigured,
  maskEmail,
  sendPaymentVerifiedEmail,
  sendRegistrationEmail,
} from "./email/resend";
import { clientIp, hitRateLimit } from "./rateLimit";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE_MS,
  adminLoginProblem,
  isAdminLoginConfigured,
  signAdminSession,
  verifyAdminCredentials,
} from "./_core/adminAuth";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";

/**
 * Abuse protection for the public mutations.
 *
 * Tuned to stop scripted abuse without breaking real use: families share one
 * email across several children, and a whole community can sit behind a single
 * NAT'd IP (school or community-centre WiFi). Both limits are therefore well
 * above plausible human volume but far below what a bot would attempt.
 */
const RATE_LIMITS = {
  /** Per source IP. Accommodates many families on one shared connection. */
  ip: { limit: 30, windowMs: 10 * 60 * 1000 },
  /** Per email address. Accommodates a large family registering each child. */
  email: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** Receipt/evidence uploads per IP — each stores an image, so a little tighter. */
  receiptIp: { limit: 20, windowMs: 60 * 60 * 1000 },
};

function requireDb() {
  return getDb().then(db => {
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Registration service is temporarily unavailable. Please try again shortly.",
      });
    }
    return db;
  });
}

function requireClassGroup(schoolClass: string): ClassGroup {
  const group = findClassGroup(schoolClass);
  if (!group) throw new TRPCError({ code: "BAD_REQUEST", message: "Please select a valid school class." });
  return group;
}

function fingerprintHash(input: { studentName: string; guardianPhone: string; schoolClass: string }): string {
  return createHash("sha256").update(dedupeFingerprint(input)).digest("hex");
}

/** MySQL reports a unique-index collision as ER_DUP_ENTRY / errno 1062. */
function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errno?: unknown; cause?: unknown };
  if (candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062) return true;
  return candidate.cause ? isDuplicateKeyError(candidate.cause) : false;
}

const DUPLICATE_MESSAGE =
  "This participant is already registered with that phone number and class. Use “Continue a registration” to retrieve the existing registration number.";

const NOT_FOUND_MESSAGE = "We could not find that registration. Check the number and phone number and try again.";

/**
 * The slice of a registration the browser is allowed to see.
 *
 * Deliberately not the raw row: the receipt image is large and the group invite
 * link is only ever included for a registration an admin has verified.
 */
type PublicRegistrationSource = Pick<
  Registration,
  | "registrationNumber"
  | "studentName"
  | "guardianEmail"
  | "guardianPhone"
  | "schoolClass"
  | "classGroup"
  | "paymentStatus"
  | "verificationStatus"
  | "receiptStatus"
  | "receiptAttempts"
>;

function publicReceiptMessage(row: PublicRegistrationSource): string | null {
  if (row.verificationStatus === "verified") return "Your payment has been confirmed.";
  if (row.verificationStatus === "rejected") {
    return "We could not confirm this payment. Please check your details, re-upload a clearer receipt, or contact us on WhatsApp with your registration ID.";
  }
  if (row.receiptStatus === "submitted") {
    return "Your payment evidence has been received and is pending review. Submitting evidence does not confirm payment — an administrator will verify it using your registration ID.";
  }
  return null;
}

function toPublicRegistration(row: PublicRegistrationSource) {
  const verified = row.verificationStatus === "verified";
  return {
    registrationNumber: row.registrationNumber,
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
    feeNgn: ENV.registrationFeeNgn,
    payment: PAYMENT_DETAILS,
    // Only a verified registration ever receives the invite link.
    whatsappGroupUrl: verified && ENV.whatsappGroupUrl ? ENV.whatsappGroupUrl : null,
  };
}

export type PublicRegistration = ReturnType<typeof toPublicRegistration>;

/** Sends the group-link email. Never fatal; the on-screen link already covers a verified user. */
async function notifyPaymentVerified(row: Pick<Registration, "guardianEmail" | "studentName" | "registrationNumber" | "classGroup">) {
  if (!row.guardianEmail) return;
  await sendPaymentVerifiedEmail(row.guardianEmail, {
    studentName: row.studentName,
    registrationNumber: row.registrationNumber,
    classGroup: row.classGroup,
    groupUrl: ENV.whatsappGroupUrl,
    appUrl: ENV.appUrl,
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    /** Whether the caller currently holds an admin session (either mechanism). */
    adminSession: publicProcedure.query(({ ctx }) => ({
      isAdmin: ctx.user?.role === "admin" || Boolean(ctx.admin),
      email: ctx.admin?.email ?? ctx.user?.email ?? null,
      loginConfigured: isAdminLoginConfigured(),
    })),

    /** Email + password admin login. Sets a signed, httpOnly session cookie. */
    adminLogin: publicProcedure
      .input(z.object({ email: z.string().trim().min(1), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const ip = clientIp(ctx.req);
        const limit = hitRateLimit(`adminlogin:ip:${ip}`, 8, 10 * 60 * 1000);
        if (!limit.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many login attempts. Please try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`,
          });
        }

        const problem = adminLoginProblem();
        if (problem) {
          console.warn(`[Admin] Login unavailable: ${problem}.`);
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Admin login is not configured on the server yet." });
        }

        if (!verifyAdminCredentials(input.email, input.password)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect email or password." });
        }

        const token = await signAdminSession(input.email.trim().toLowerCase());
        ctx.res.cookie(ADMIN_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: ADMIN_COOKIE_MAX_AGE_MS });
        return { success: true } as const;
      }),

    adminLogout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(ADMIN_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  registration: router({
    create: publicProcedure.input(registrationInputSchema).mutation(async ({ input, ctx }) => {
      const ip = clientIp(ctx.req);
      const guardianEmail = normalizeEmail(input.guardianEmail);

      const ipLimit = hitRateLimit(`register:ip:${ip}`, RATE_LIMITS.ip.limit, RATE_LIMITS.ip.windowMs);
      if (!ipLimit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many registration attempts. Please try again in about ${Math.ceil(ipLimit.retryAfterSeconds / 60)} minute(s).`,
        });
      }

      const emailLimit = hitRateLimit(`register:email:${guardianEmail}`, RATE_LIMITS.email.limit, RATE_LIMITS.email.windowMs);
      if (!emailLimit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "This email address has been used for several registrations recently. Please contact us on WhatsApp if you need to register more participants.",
        });
      }

      const db = await requireDb();
      const classGroup = requireClassGroup(input.schoolClass);
      const prefix = GROUP_PREFIXES[classGroup];
      const guardianPhone = normalizePhone(input.guardianPhone);
      const studentName = input.studentName.trim().replace(/\s+/g, " ");
      const dedupeKey = fingerprintHash({ studentName, guardianPhone, schoolClass: input.schoolClass });

      // Cheap pre-check so a duplicate submission does not consume a
      // registration number. The unique index is the authoritative guard.
      const existing = await db
        .select({ registrationNumber: registrations.registrationNumber })
        .from(registrations)
        .where(eq(registrations.dedupeKey, dedupeKey))
        .limit(1);
      if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_MESSAGE });

      let registrationNumber: string;
      try {
        registrationNumber = await db.transaction(async tx => {
          await tx.execute(
            sql`INSERT INTO registration_counters (classGroup, lastNumber) VALUES (${classGroup}, 0) ON DUPLICATE KEY UPDATE classGroup = VALUES(classGroup)`,
          );
          const counterResult = await tx.execute(
            sql`SELECT lastNumber FROM registration_counters WHERE classGroup = ${classGroup} FOR UPDATE`,
          );
          const rows = (counterResult as unknown as [{ lastNumber: number }[], unknown])[0];
          const nextNumber = Number(rows[0]?.lastNumber ?? 0) + 1;
          await tx.execute(sql`UPDATE registration_counters SET lastNumber = ${nextNumber} WHERE classGroup = ${classGroup}`);

          const allocated = `${prefix}-${String(nextNumber).padStart(3, "0")}`;
          await tx.insert(registrations).values({
            studentName,
            guardianEmail,
            guardianPhone,
            schoolClass: input.schoolClass,
            classGroup,
            registrationNumber: allocated,
            dedupeKey,
            emailStatus: isEmailConfigured() ? "pending" : "skipped",
          });

          return allocated;
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
        console.error("[Registration] Failed to save registration:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We could not save your registration. Please try again.",
        });
      }

      // The registration is committed from here on. Email problems are
      // reported, never fatal — we must not lose a saved registration.
      const emailResult = await sendRegistrationEmail(guardianEmail, {
        studentName,
        registrationNumber,
        schoolClass: input.schoolClass,
        classGroup,
        guardianPhone,
        appUrl: ENV.appUrl,
      });

      try {
        await db
          .update(registrations)
          .set(
            emailResult.status === "sent"
              ? { emailStatus: "sent", emailMessageId: emailResult.messageId, emailSentAt: new Date(), emailError: null }
              : { emailStatus: emailResult.status, emailError: emailResult.reason.slice(0, 255) },
          )
          .where(eq(registrations.registrationNumber, registrationNumber));
      } catch (error) {
        // Losing the delivery breadcrumb is not worth failing the request over.
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
        }),
        // "sent" means Resend accepted the message, not that it reached the inbox.
        emailStatus: emailResult.status,
      };
    }),

    resume: publicProcedure.input(registrationLookupSchema).query(async ({ input }) => {
      const db = await requireDb();
      const registrationNumber = input.registrationNumber.toUpperCase();
      const result = await db
        .select()
        .from(registrations)
        .where(eq(registrations.registrationNumber, registrationNumber))
        .limit(1);
      const registration = result[0];
      if (!registration || registration.guardianPhone !== normalizePhone(input.guardianPhone)) {
        throw new TRPCError({ code: "NOT_FOUND", message: NOT_FOUND_MESSAGE });
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
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many uploads. Please try again in about ${Math.ceil(ipLimit.retryAfterSeconds / 60)} minute(s).`,
        });
      }

      const db = await requireDb();
      const registrationNumber = input.registrationNumber.toUpperCase();
      const phone = normalizePhone(input.guardianPhone);
      const found = await db
        .select()
        .from(registrations)
        .where(and(eq(registrations.registrationNumber, registrationNumber), eq(registrations.guardianPhone, phone)))
        .limit(1);
      const registration = found[0];
      if (!registration) throw new TRPCError({ code: "NOT_FOUND", message: NOT_FOUND_MESSAGE });

      // Already confirmed: nothing to do.
      if (registration.verificationStatus === "verified") {
        return { outcome: "already_verified" as const, ...toPublicRegistration(registration) };
      }

      if (registration.receiptAttempts >= MAX_RECEIPT_ATTEMPTS) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `You've reached the upload limit for this registration. Please message us on WhatsApp ${PAYMENT_DETAILS.enquiriesPhone} with your registration ID and we'll confirm it manually.`,
        });
      }

      const attempts = registration.receiptAttempts + 1;
      await db
        .update(registrations)
        .set({
          receiptImage: input.imageDataUrl,
          receiptSubmittedAt: new Date(),
          receiptAttempts: attempts,
          receiptStatus: "submitted",
          // Awaiting a human: "claimed" by the registrant, pending verification.
          paymentStatus: "payment_claimed",
          verificationStatus: "pending",
        })
        .where(eq(registrations.id, registration.id));

      return {
        outcome: "submitted" as const,
        ...toPublicRegistration({
          ...registration,
          paymentStatus: "payment_claimed",
          verificationStatus: "pending",
          receiptStatus: "submitted",
          receiptAttempts: attempts,
        }),
      };
    }),

    adminList: adminProcedure.query(async () => {
      const db = await requireDb();
      // Everything except the image, which is fetched per row on demand.
      const rows = await db
        .select({
          id: registrations.id,
          studentName: registrations.studentName,
          guardianEmail: registrations.guardianEmail,
          guardianPhone: registrations.guardianPhone,
          schoolClass: registrations.schoolClass,
          classGroup: registrations.classGroup,
          registrationNumber: registrations.registrationNumber,
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
          createdAt: registrations.createdAt,
        })
        .from(registrations)
        .orderBy(desc(registrations.createdAt));
      return {
        rows,
        emailConfigured: isEmailConfigured(),
        emailProblem: emailConfigurationProblem(),
        feeNgn: ENV.registrationFeeNgn,
        groupLinkConfigured: Boolean(ENV.whatsappGroupUrl),
      };
    }),

    /** The stored receipt screenshot for one registration, fetched on demand. */
    adminReceiptImage: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const db = await requireDb();
      const result = await db
        .select({ receiptImage: registrations.receiptImage, receiptSubmittedAt: registrations.receiptSubmittedAt })
        .from(registrations)
        .where(eq(registrations.id, input.id))
        .limit(1);
      if (!result[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found." });
      return result[0];
    }),

    /**
     * Manual status change — the only way a payment is confirmed. Moving a
     * registration to verified for the first time also sends the group-link
     * email. The "first time" guard prevents duplicate confirmation emails.
     */
    adminUpdateStatus: adminProcedure
      .input(z.object({ id: z.number().int().positive(), paymentStatus: z.enum(PAYMENT_STATUSES) }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const result = await db.select().from(registrations).where(eq(registrations.id, input.id)).limit(1);
        const registration = result[0];
        if (!registration) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found." });

        const verificationStatus =
          input.paymentStatus === "verified" || input.paymentStatus === "completed"
            ? "verified"
            : input.paymentStatus === "rejected"
              ? "rejected"
              : input.paymentStatus === "under_review"
                ? "clarification"
                : "pending";
        const becomingVerified = verificationStatus === "verified" && registration.verificationStatus !== "verified";

        await db
          .update(registrations)
          .set({
            paymentStatus: input.paymentStatus,
            verificationStatus,
            ...(becomingVerified ? { verifiedAt: new Date(), verifiedBy: "admin" as const } : {}),
          })
          .where(eq(registrations.id, input.id));

        if (becomingVerified) await notifyPaymentVerified(registration);

        return { success: true, emailed: becomingVerified && Boolean(registration.guardianEmail) } as const;
      }),

    /** Retries a confirmation email that Resend rejected or that was never sent. */
    adminResendEmail: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const result = await db.select().from(registrations).where(eq(registrations.id, input.id)).limit(1);
        const registration = result[0];
        if (!registration) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found." });
        if (!registration.guardianEmail) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This registration has no email address on file." });
        }

        const problem = emailConfigurationProblem();
        if (problem) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Email is not configured: ${problem}.` });

        const emailResult = await sendRegistrationEmail(
          registration.guardianEmail,
          {
            studentName: registration.studentName,
            registrationNumber: registration.registrationNumber,
            schoolClass: registration.schoolClass,
            classGroup: registration.classGroup,
            guardianPhone: registration.guardianPhone,
            appUrl: ENV.appUrl,
          },
          // Time-bucketed so an accidental double-click is deduped, but a
          // deliberate retry minutes later genuinely resends.
          { idempotencySuffix: `retry-${Math.floor(Date.now() / 60_000)}` },
        );

        await db
          .update(registrations)
          .set(
            emailResult.status === "sent"
              ? { emailStatus: "sent", emailMessageId: emailResult.messageId, emailSentAt: new Date(), emailError: null }
              : { emailStatus: emailResult.status, emailError: emailResult.reason.slice(0, 255) },
          )
          .where(eq(registrations.id, registration.id));

        if (emailResult.status !== "sent") {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Resend could not accept the message: ${emailResult.reason}`,
          });
        }

        return { status: emailResult.status, recipient: maskEmail(registration.guardianEmail) };
      }),
  }),
});

export type AppRouter = typeof appRouter;
