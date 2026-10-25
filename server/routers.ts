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
  registrationFeeNgn,
  familyRegistrationInputSchema,
  type ClassGroup,
} from "@shared/registration";
import { TRPCError } from "@trpc/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Registration } from "../drizzle/schema";
import { DuplicateRegistrationError, getStore } from "./registrationStore";
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
import { adminProcedure, publicProcedure, router, superAdminProcedure } from "./_core/trpc";

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

function requireClassGroup(schoolClass: string): ClassGroup {
  const group = findClassGroup(schoolClass);
  if (!group) throw new TRPCError({ code: "BAD_REQUEST", message: "Please select a valid school class." });
  return group;
}

function fingerprintHash(input: { studentName: string; guardianPhone: string; schoolClass: string }): string {
  return createHash("sha256").update(dedupeFingerprint(input)).digest("hex");
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
  | "createdAt"
> & {
  entitlementsEligibleAt?: Registration["entitlementsEligibleAt"];
  familyCode?: Registration["familyCode"];
  familyPaymentLead?: Registration["familyPaymentLead"];
};

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
    familyCode: row.familyCode ?? null,
    studentName: row.studentName,
    guardianEmail: row.guardianEmail,
    guardianPhone: row.guardianPhone,
    schoolClass: row.schoolClass,
    classGroup: row.classGroup,
    paymentStatus: row.paymentStatus,
    verificationStatus: row.verificationStatus,
    entitlementsEligible: Boolean(row.entitlementsEligibleAt),
    receiptStatus: row.receiptStatus,
    receiptAttemptsLeft: Math.max(0, MAX_RECEIPT_ATTEMPTS - row.receiptAttempts),
    receiptMessage: publicReceiptMessage(row),
    feeNgn: registrationFeeNgn(row.schoolClass, row.createdAt),
    registeredAt: row.createdAt,
    payment: PAYMENT_DETAILS,
    // Only a verified registration ever receives the invite link.
    whatsappGroupUrl: verified && ENV.whatsappGroupUrl ? ENV.whatsappGroupUrl : null,
  };
}

export type PublicRegistration = ReturnType<typeof toPublicRegistration>;

/** Sends the group-link email. Never fatal; the on-screen link already covers a verified user. */
async function notifyPaymentVerified(
  row: Pick<Registration, "guardianEmail" | "studentName" | "registrationNumber" | "classGroup" | "schoolClass" | "createdAt"> & { feeNgn?: number | null },
) {
  if (!row.guardianEmail) return;
  await sendPaymentVerifiedEmail(row.guardianEmail, {
    studentName: row.studentName,
    registrationNumber: row.registrationNumber,
    classGroup: row.classGroup,
    feeNgn: row.feeNgn ?? registrationFeeNgn(row.schoolClass, row.createdAt),
    groupUrl: ENV.whatsappGroupUrl,
    appUrl: ENV.appUrl,
  });
}

export const appRouter = router({
  auth: router({
    /** Whether the caller currently holds an administrator session. */
    adminSession: publicProcedure.query(({ ctx }) => ({
      isAdmin: Boolean(ctx.admin),
      email: ctx.admin?.email ?? null,
      role: ctx.admin?.role ?? null,
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

        const role = verifyAdminCredentials(input.email, input.password);
        if (!role) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect email or password." });
        }

        const token = await signAdminSession(input.email.trim().toLowerCase(), role);
        ctx.res.cookie(ADMIN_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: ADMIN_COOKIE_MAX_AGE_MS });
        return { success: true, role } as const;
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

      const store = await getStore();
      const classGroup = requireClassGroup(input.schoolClass);
      const prefix = GROUP_PREFIXES[classGroup];
      const guardianPhone = normalizePhone(input.guardianPhone);
      const studentName = input.studentName.trim().replace(/\s+/g, " ");
      const dedupeKey = fingerprintHash({ studentName, guardianPhone, schoolClass: input.schoolClass });

      // Cheap pre-check so a duplicate submission does not consume a
      // registration number. The store's unique key is the authoritative guard.
      if (await store.findByDedupeKey(dedupeKey)) {
        throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
      }

      let registrationNumber: string;
      try {
        registrationNumber = await store.create({
          studentName,
          guardianEmail,
          guardianPhone,
          schoolClass: input.schoolClass,
          classGroup,
          prefix,
          dedupeKey,
          emailStatus: isEmailConfigured() ? "pending" : "skipped",
        });
      } catch (error) {
        if (error instanceof DuplicateRegistrationError) throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
        console.error("[Registration] Failed to save registration:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We could not save your registration. Please try again.",
        });
      }

      // The registration is committed from here on. Email problems are
      // reported, never fatal — we must not lose a saved registration.
      const savedRegistration = await store.findByNumber(registrationNumber);
      const registeredAt = savedRegistration?.createdAt ?? new Date();
      const feeNgn = registrationFeeNgn(input.schoolClass, registeredAt);
      const emailResult = await sendRegistrationEmail(guardianEmail, {
        studentName,
        registrationNumber,
        schoolClass: input.schoolClass,
        classGroup,
        guardianPhone,
        feeNgn,
        appUrl: ENV.appUrl,
      });

      try {
        await store.updateByNumber(
          registrationNumber,
          emailResult.status === "sent"
            ? { emailStatus: "sent", emailMessageId: emailResult.messageId, emailSentAt: new Date(), emailError: null }
            : { emailStatus: emailResult.status, emailError: emailResult.reason.slice(0, 255) },
        );
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
          createdAt: registeredAt,
        }),
        // "sent" means Resend accepted the message, not that it reached the inbox.
        emailStatus: emailResult.status,
      };
    }),

    createFamily: publicProcedure.input(familyRegistrationInputSchema).mutation(async ({ input, ctx }) => {
      const ip = clientIp(ctx.req);
      const limited = hitRateLimit(`register:ip:${ip}`, RATE_LIMITS.ip.limit, RATE_LIMITS.ip.windowMs);
      if (!limited.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many registration attempts. Please try again shortly." });
      const phone = normalizePhone(input.guardianPhone);
      const email = input.consentToEmail && input.guardianEmail ? normalizeEmail(input.guardianEmail) : null;
      if (email) {
        const emailLimit = hitRateLimit(`register:email:${email}`, RATE_LIMITS.email.limit, RATE_LIMITS.email.windowMs);
        if (!emailLimit.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "This email address has been used for several registrations recently. Please contact us on WhatsApp if you need to register more participants.",
          });
        }
      }
      const store = await getStore();
      const createdAt = new Date();
      if (input.registrationType === "individual") {
        const participant = input.participants[0];
        const studentName = participant.studentName.trim().replace(/\s+/g, " ");
        const classGroup = requireClassGroup(participant.schoolClass);
        const dedupeKey = fingerprintHash({ studentName, guardianPhone: phone, schoolClass: participant.schoolClass });
        if (await store.findByDedupeKey(dedupeKey)) throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
        let registrationNumber: string;
        try { registrationNumber = await store.create({ studentName, guardianEmail: email, guardianPhone: phone, schoolClass: participant.schoolClass, classGroup, prefix: GROUP_PREFIXES[classGroup], dedupeKey, emailStatus: email && isEmailConfigured() ? "pending" : "skipped" }); }
        catch (error) { if (error instanceof DuplicateRegistrationError) throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_MESSAGE }); throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We could not save this registration. Please try again." }); }
        const saved = await store.findByNumber(registrationNumber);
        const registeredAt = saved?.createdAt ?? createdAt;
        let emailStatus: "sent" | "failed" | "skipped" | "pending" = email && isEmailConfigured() ? "pending" : "skipped";
        if (email && isEmailConfigured()) {
          const sent = await sendRegistrationEmail(email, {
            studentName,
            registrationNumber,
            schoolClass: participant.schoolClass,
            classGroup,
            guardianPhone: phone,
            feeNgn: registrationFeeNgn(participant.schoolClass, registeredAt),
            appUrl: ENV.appUrl,
          });
          emailStatus = sent.status;
          try {
            await store.updateByNumber(
              registrationNumber,
              sent.status === "sent"
                ? { emailStatus: "sent", emailMessageId: sent.messageId, emailSentAt: new Date(), emailError: null }
                : { emailStatus: sent.status, emailError: sent.reason.slice(0, 255) },
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
            createdAt: registeredAt,
          }),
          registrationType: "individual" as const,
          members: [{ registrationNumber, studentName, schoolClass: participant.schoolClass, classGroup, feeNgn: registrationFeeNgn(participant.schoolClass, registeredAt) }],
          emailStatus,
        };
      }
      const familyCode = `HA-${randomBytes(4).toString("hex").toUpperCase()}`;
      const participants = input.participants.map((p, index) => {
        const studentName = p.studentName.trim().replace(/\s+/g, " ");
        const classGroup = requireClassGroup(p.schoolClass);
        return { studentName, guardianEmail: email, guardianPhone: phone, schoolClass: p.schoolClass, classGroup, prefix: GROUP_PREFIXES[classGroup], dedupeKey: fingerprintHash({ studentName, guardianPhone: phone, schoolClass: p.schoolClass }), emailStatus: email && isEmailConfigured() ? "pending" as const : "skipped" as const, familyCode, familyPaymentLead: index === 0, createdAt };
      });
      const keys = participants.map(p => p.dedupeKey);
      if (new Set(keys).size !== keys.length || (await Promise.all(keys.map(key => store.findByDedupeKey(key)))).some(Boolean)) throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_MESSAGE });
      let numbers: string[];
      try { numbers = await store.createFamily(participants); }
      catch (error) { if (error instanceof DuplicateRegistrationError) throw new TRPCError({ code: "CONFLICT", message: DUPLICATE_MESSAGE }); throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We could not save this family registration. Please try again." }); }
      const members = participants.map((p, i) => ({ registrationNumber: numbers[i], studentName: p.studentName, schoolClass: p.schoolClass, classGroup: p.classGroup, feeNgn: registrationFeeNgn(p.schoolClass, createdAt) }));
      const total = members.reduce((sum, member) => sum + (member.feeNgn ?? 0), 0);
      const first = participants[0];
      const result = { ...toPublicRegistration({ registrationNumber: numbers[0], studentName: first.studentName, guardianEmail: email, guardianPhone: phone, schoolClass: first.schoolClass, classGroup: first.classGroup, paymentStatus: "pending_payment" as const, verificationStatus: "pending" as const, receiptStatus: "not_submitted" as const, receiptAttempts: 0, createdAt }), registrationNumber: numbers[0], studentName: input.registrationType === "family" ? `${members.length} participants` : first.studentName, familyCode, registrationType: input.registrationType, members, feeNgn: total, emailStatus: email && isEmailConfigured() ? "pending" : "skipped" };
      if (email && isEmailConfigured()) {
        const sent = await sendRegistrationEmail(email, { studentName: result.studentName, registrationNumber: familyCode, schoolClass: members.map(m => m.schoolClass).join(", "), classGroup: "Family", guardianPhone: phone, feeNgn: total, appUrl: ENV.appUrl });
        await store.updateByFamilyCode(familyCode, sent.status === "sent" ? { emailStatus: "sent", emailMessageId: sent.messageId, emailSentAt: new Date(), emailError: null } : { emailStatus: sent.status, emailError: sent.reason.slice(0, 255) });
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
        if (!family.length || family[0].guardianPhone !== phone) throw new TRPCError({ code: "NOT_FOUND", message: NOT_FOUND_MESSAGE });
        const lead = family.find(row => row.familyPaymentLead) ?? family[0];
        const members = family.map(row => ({ registrationNumber: row.registrationNumber, studentName: row.studentName, schoolClass: row.schoolClass, classGroup: row.classGroup, feeNgn: registrationFeeNgn(row.schoolClass, row.createdAt) }));
        const familyVerified = family.every(row => row.verificationStatus === "verified");
        return { ...toPublicRegistration(lead), studentName: `${family.length} participants`, familyCode: lead.familyCode, registrationType: family.length > 1 ? "family" : "individual", members, feeNgn: members.reduce((sum, m) => sum + (m.feeNgn ?? 0), 0), verificationStatus: familyVerified ? "verified" as const : lead.verificationStatus, entitlementsEligible: familyVerified && family.every(row => Boolean(row.entitlementsEligibleAt)), receiptAttemptsLeft: Math.max(0, MAX_RECEIPT_ATTEMPTS - lead.receiptAttempts) };
      }
      const registration = await store.findByNumber(lookupNumber);
      if (!registration || registration.guardianPhone !== phone) {
        throw new TRPCError({ code: "NOT_FOUND", message: NOT_FOUND_MESSAGE });
      }
      if (registration.familyCode) {
        const family = await store.findByFamilyCode(registration.familyCode);
        const lead = family.find(row => row.familyPaymentLead) ?? family[0];
        const members = family.map(row => ({ registrationNumber: row.registrationNumber, studentName: row.studentName, schoolClass: row.schoolClass, classGroup: row.classGroup, feeNgn: registrationFeeNgn(row.schoolClass, row.createdAt) }));
        const familyVerified = family.every(row => row.verificationStatus === "verified");
        return { ...toPublicRegistration(lead), studentName: `${family.length} participants`, familyCode: lead.familyCode, registrationType: "family", members, feeNgn: members.reduce((sum, m) => sum + (m.feeNgn ?? 0), 0), verificationStatus: familyVerified ? "verified" as const : lead.verificationStatus, entitlementsEligible: familyVerified && family.every(row => Boolean(row.entitlementsEligibleAt)), receiptAttemptsLeft: Math.max(0, MAX_RECEIPT_ATTEMPTS - lead.receiptAttempts) };
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

      const store = await getStore();
      const phone = normalizePhone(input.guardianPhone);
      const lookupNumber = input.registrationNumber.toUpperCase();
      let registration = lookupNumber.startsWith("HA-")
        ? (await store.findByFamilyCode(lookupNumber)).find(row => row.familyPaymentLead) ?? null
        : await store.findByNumber(lookupNumber);
      if (!registration || registration.guardianPhone !== phone) {
        throw new TRPCError({ code: "NOT_FOUND", message: NOT_FOUND_MESSAGE });
      }
      if (registration.familyCode && !registration.familyPaymentLead) {
        registration = (await store.findByFamilyCode(registration.familyCode)).find(row => row.familyPaymentLead) ?? registration;
      }

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
      const receiptPatch: Partial<Registration> = {
        receiptImage: input.imageDataUrl,
        receiptSubmittedAt: new Date(),
        receiptAttempts: attempts,
        receiptStatus: "submitted",
        // Awaiting a human: "claimed" by the registrant, pending verification.
        paymentStatus: "payment_claimed",
        verificationStatus: "pending",
      };
      if (registration.familyCode) await store.updateByFamilyCode(registration.familyCode, { ...receiptPatch, receiptImage: null });
      await store.updateById(registration.id, receiptPatch);

      const family = registration.familyCode ? await store.findByFamilyCode(registration.familyCode) : [];
      const members = family.map(row => ({ registrationNumber: row.registrationNumber, studentName: row.studentName, schoolClass: row.schoolClass, classGroup: row.classGroup, feeNgn: registrationFeeNgn(row.schoolClass, row.createdAt) }));
      return {
        outcome: "submitted" as const,
        ...toPublicRegistration({
          ...registration,
          paymentStatus: "payment_claimed",
          verificationStatus: "pending",
          receiptStatus: "submitted",
          receiptAttempts: attempts,
        }),
        ...(family.length ? { members, studentName: `${family.length} participants`, feeNgn: members.reduce((sum, item) => sum + (item.feeNgn ?? 0), 0) } : {}),
      };
    }),

    adminList: adminProcedure.query(async ({ ctx }) => {
      const store = await getStore();
      const rows = await store.listForAdmin();
      const confirmedAmountNgn = rows.reduce((sum, row) => sum + (row.familyCode ? (row.familyPaymentLead ? row.verifiedAmountNgn ?? 0 : 0) : row.verificationStatus === "verified" ? registrationFeeNgn(row.schoolClass, row.createdAt) ?? 0 : 0), 0);
      const pendingExpectedAmountNgn = rows.reduce((sum, row) => sum + (row.verificationStatus === "verified" ? 0 : registrationFeeNgn(row.schoolClass, row.createdAt) ?? 0), 0);
      return {
        rows: rows.map(row => ({ ...row, feeNgn: registrationFeeNgn(row.schoolClass, row.createdAt), entitlementsEligible: Boolean(row.entitlementsEligibleAt) })),
        confirmedAmountNgn,
        pendingExpectedAmountNgn,
        emailConfigured: isEmailConfigured(),
        emailProblem: emailConfigurationProblem(),
        groupLinkConfigured: Boolean(ENV.whatsappGroupUrl),
        viewerRole: ctx.admin?.role ?? "superadmin",
      };
    }),

    /** The stored receipt screenshot for one registration, fetched on demand. */
    adminReceiptImage: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const store = await getStore();
      const result = await store.getReceiptImage(input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found." });
      return result;
    }),

    /**
     * Manual status change — the only way a payment is confirmed. Moving a
     * registration to verified for the first time also sends the group-link
     * email. The "first time" guard prevents duplicate confirmation emails.
     */
    adminUpdateStatus: adminProcedure
      .input(z.object({ id: z.number().int().positive(), paymentStatus: z.enum(PAYMENT_STATUSES), actualAmountNgn: z.number().int().positive().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.admin?.role === "subadmin" && input.paymentStatus !== "verified" && input.paymentStatus !== "rejected") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sub-admins can only confirm or reject payment." });
        }
        const store = await getStore();
        const registration = await store.findById(input.id);
        if (!registration) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found." });

        const verificationStatus =
          input.paymentStatus === "verified" || input.paymentStatus === "completed"
            ? "verified"
            : input.paymentStatus === "rejected"
              ? "rejected"
              : input.paymentStatus === "under_review"
                ? "clarification"
                : "pending";
        if (verificationStatus !== "verified") {
          const affectedRegistrations = registration.familyCode
            ? await store.findByFamilyCode(registration.familyCode)
            : [registration];
          if (affectedRegistrations.some(row => row.checkedInAt)) {
            throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "Payment status cannot be changed after camp check-in. Contact an administrator if this needs correction.",
            });
          }
        }
        const becomingVerified = verificationStatus === "verified" && registration.verificationStatus !== "verified";
        const actor = ctx.admin?.email ?? "admin";
        const eligibleAt = verificationStatus === "verified"
          ? registration.entitlementsEligibleAt ?? registration.verifiedAt ?? new Date()
          : null;

        const patch: Partial<Registration> = {
          paymentStatus: input.paymentStatus,
          verificationStatus,
          ...(becomingVerified ? { verifiedAt: new Date(), verifiedBy: "admin" as const } : {}),
          entitlementsEligibleAt: eligibleAt,
          entitlementsEligibleBy: eligibleAt ? registration.entitlementsEligibleBy ?? actor : null,
        };
        if (registration.familyCode) {
          const family = await store.findByFamilyCode(registration.familyCode);
          const expected = family.reduce((sum, row) => sum + (registrationFeeNgn(row.schoolClass, row.createdAt) ?? 0), 0);
          if (becomingVerified) {
            const actual = input.actualAmountNgn;
            if (!actual) throw new TRPCError({ code: "BAD_REQUEST", message: `Enter the bank-confirmed amount for this family. Expected total: ₦${expected.toLocaleString("en-NG")}.` });
            if (actual !== expected) throw new TRPCError({ code: "BAD_REQUEST", message: `The entered amount does not match the family total of ₦${expected.toLocaleString("en-NG")}. Leave the family pending and investigate the difference.` });
            await store.updateByFamilyCode(registration.familyCode, { ...patch, verifiedAmountNgn: null });
            const lead = family.find(row => row.familyPaymentLead) ?? family[0];
            await store.updateById(lead.id, { verifiedAmountNgn: actual });
            await notifyPaymentVerified({
              ...registration,
              guardianEmail: lead.guardianEmail,
              studentName: `${family.length} participants`,
              registrationNumber: registration.familyCode,
              schoolClass: family.map(row => row.schoolClass).join(", "),
              classGroup: "Family",
              feeNgn: expected,
            });
          } else await store.updateByFamilyCode(registration.familyCode, patch);
        } else {
          await store.updateById(input.id, { ...patch, ...(becomingVerified ? { verifiedAmountNgn: input.actualAmountNgn ?? registrationFeeNgn(registration.schoolClass, registration.createdAt) } : {}) });
          if (becomingVerified) await notifyPaymentVerified(registration);
        }

        return { success: true, emailed: becomingVerified && Boolean(registration.guardianEmail) } as const;
      }),

    /** Camp arrival is staff-only and requires confirmed payment. */
    adminUpdateCampStatus: adminProcedure
      .input(z.object({ id: z.number().int().positive(), action: z.literal("check_in") }))
      .mutation(async ({ input, ctx }) => {
        const store = await getStore();
        const registration = await store.findById(input.id);
        if (!registration) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found." });
        if (registration.verificationStatus !== "verified") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Confirm payment before checking in this participant." });
        }

        const now = new Date();
        const actor = ctx.admin?.email ?? "admin";
        if (!registration.checkedInAt) await store.updateById(input.id, { checkedInAt: now, checkedInBy: actor });
        return { success: true, action: input.action } as const;
      }),

    /** Retries a confirmation email that Resend rejected or that was never sent. */
    adminResendEmail: superAdminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const store = await getStore();
        const registration = await store.findById(input.id);
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
            feeNgn: registrationFeeNgn(registration.schoolClass, registration.createdAt),
            appUrl: ENV.appUrl,
          },
          // Time-bucketed so an accidental double-click is deduped, but a
          // deliberate retry minutes later genuinely resends.
          { idempotencySuffix: `retry-${Math.floor(Date.now() / 60_000)}` },
        );

        await store.updateById(
          registration.id,
          emailResult.status === "sent"
            ? { emailStatus: "sent", emailMessageId: emailResult.messageId, emailSentAt: new Date(), emailError: null }
            : { emailStatus: emailResult.status, emailError: emailResult.reason.slice(0, 255) },
        );

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
