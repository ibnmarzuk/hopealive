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
  type ReceiptAnalysis,
  type ReceiptVerdict,
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
import { analyzeReceipt, describeVerdictForUser, isReceiptCheckConfigured, receiptCheckProblem } from "./receipt/analyze";
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
  /** Receipt uploads per IP. Each one is a model call, so this is tighter. */
  receiptIp: { limit: 12, windowMs: 60 * 60 * 1000 },
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
 * Deliberately not the raw row: the receipt image is large, the model's full
 * analysis is for admins, and the group invite link is only ever included for
 * a verified registration.
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
  | "receiptAnalysis"
>;

function toPublicRegistration(row: PublicRegistrationSource) {
  const verified = row.verificationStatus === "verified";
  const analysis = row.receiptAnalysis ?? null;
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
    receiptVerdict: (analysis?.verdict ?? null) as ReceiptVerdict | null,
    receiptMessage: verified
      ? "Your payment has been confirmed."
      : analysis
        ? describeVerdictForUser(analysis)
        : row.receiptStatus === "submitted"
          ? "We've received your receipt. A team member will confirm it shortly and you'll get an email once it's approved."
          : null,
    feeNgn: ENV.registrationFeeNgn,
    payment: PAYMENT_DETAILS,
    // Only verified registrations ever receive the invite link.
    whatsappGroupUrl: verified && ENV.whatsappGroupUrl ? ENV.whatsappGroupUrl : null,
  };
}

export type PublicRegistration = ReturnType<typeof toPublicRegistration>;

/** Maps a receipt verdict onto the registration's status columns. */
function statusForVerdict(verdict: ReceiptVerdict) {
  switch (verdict) {
    case "verified":
      return { paymentStatus: "verified", verificationStatus: "verified" } as const;
    case "rejected":
      return { paymentStatus: "rejected", verificationStatus: "rejected" } as const;
    case "needs_review":
    default:
      return { paymentStatus: "under_review", verificationStatus: "clarification" } as const;
  }
}

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
          receiptAnalysis: null,
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
     * Receipt upload + automated check.
     *
     * Order matters: the image is persisted and the attempt counted *before*
     * the model is called, so a crash or timeout mid-analysis never loses an
     * upload — the worst case is a receipt waiting for manual review.
     */
    submitReceipt: publicProcedure.input(receiptUploadSchema).mutation(async ({ input, ctx }) => {
      const ip = clientIp(ctx.req);
      const ipLimit = hitRateLimit(`receipt:ip:${ip}`, RATE_LIMITS.receiptIp.limit, RATE_LIMITS.receiptIp.windowMs);
      if (!ipLimit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many receipt uploads. Please try again in about ${Math.ceil(ipLimit.retryAfterSeconds / 60)} minute(s).`,
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

      // Already verified: nothing to do, and never spend a model call on it.
      if (registration.verificationStatus === "verified") {
        return { outcome: "verified" as const, ...toPublicRegistration(registration) };
      }

      if (registration.receiptAttempts >= MAX_RECEIPT_ATTEMPTS) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `You've reached the upload limit for this registration. Please message us on WhatsApp ${PAYMENT_DETAILS.enquiriesPhone} and we'll confirm it manually.`,
        });
      }

      const attempts = registration.receiptAttempts + 1;
      const submittedAt = new Date();
      await db
        .update(registrations)
        .set({
          receiptImage: input.imageDataUrl,
          receiptSubmittedAt: submittedAt,
          receiptAttempts: attempts,
          receiptStatus: "submitted",
          paymentStatus: "payment_claimed",
          verificationStatus: "pending",
          receiptAnalysis: null,
        })
        .where(eq(registrations.id, registration.id));

      const check = await analyzeReceipt(
        input.imageDataUrl,
        {
          accountNumber: PAYMENT_DETAILS.accountNumber,
          accountName: PAYMENT_DETAILS.accountName,
          bank: PAYMENT_DETAILS.bank,
          feeNgn: ENV.registrationFeeNgn,
        },
        { registrationNumber },
      );

      let analysis: ReceiptAnalysis | null = null;
      let outcome: ReceiptVerdict | "pending_manual";
      let statuses: ReturnType<typeof statusForVerdict>;
      let note: string | null = null;

      if (check.status === "analyzed") {
        analysis = check.analysis;
        outcome = analysis.verdict;
        statuses = statusForVerdict(analysis.verdict);
      } else {
        // Model unavailable or failed: keep the upload, route to a human.
        outcome = "pending_manual";
        statuses = statusForVerdict("needs_review");
        note = `Automated receipt check ${check.status}: ${check.reason}`;
      }

      const verifiedNow = outcome === "verified";
      await db
        .update(registrations)
        .set({
          ...statuses,
          receiptAnalysis: analysis,
          ...(verifiedNow ? { verifiedAt: new Date(), verifiedBy: "ai" as const } : {}),
          ...(note ? { notes: [registration.notes, `${submittedAt.toISOString()} — ${note}`].filter(Boolean).join("\n") } : {}),
        })
        .where(eq(registrations.id, registration.id));

      if (verifiedNow) await notifyPaymentVerified(registration);

      return {
        outcome,
        ...toPublicRegistration({
          ...registration,
          ...statuses,
          receiptStatus: "submitted",
          receiptAttempts: attempts,
          receiptAnalysis: analysis,
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
          receiptAnalysis: registrations.receiptAnalysis,
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
        receiptCheckConfigured: isReceiptCheckConfigured(),
        receiptCheckProblem: receiptCheckProblem(),
        feeNgn: ENV.registrationFeeNgn,
        groupLinkConfigured: Boolean(ENV.whatsappGroupUrl),
      };
    }),

    /** The stored receipt screenshot for one registration. */
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
     * Manual status override. Moving a registration to verified for the first
     * time also sends the group-link email, exactly as the automated path does.
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
