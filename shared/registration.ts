import { z } from "zod";

/**
 * Single source of truth for the IVC registration domain.
 *
 * Both the browser form and the tRPC router import from here so the class
 * list, the class-group mapping and the validation rules can never drift
 * apart (they previously lived in two hand-maintained copies).
 */

export const CLASS_GROUPS = {
  "Lower Class": ["Nursery 2", "Basic 1", "Basic 2"],
  "Middle Class": ["Basic 3", "Basic 4", "Basic 5", "Basic 6"],
  "Upper Class": ["JSS 1", "JSS 2", "JSS 3"],
  "Advance 1": ["SS 1", "SS 2", "SS 3"],
  "Advance 2": ["Higher institution and above"],
} as const;

export type ClassGroup = keyof typeof CLASS_GROUPS;

export const GROUP_PREFIXES: Record<ClassGroup, string> = {
  "Lower Class": "LOWER",
  "Middle Class": "MIDDLE",
  "Upper Class": "UPPER",
  "Advance 1": "ADV1",
  "Advance 2": "ADV2",
};

/** Flat, ordered list of selectable classes, derived from CLASS_GROUPS. */
export const SCHOOL_CLASSES: string[] = Object.values(CLASS_GROUPS).flatMap(classes => [...classes]);

/** Returns the class group for a school class, or `null` when unknown. */
export function findClassGroup(schoolClass: string): ClassGroup | null {
  for (const [group, classes] of Object.entries(CLASS_GROUPS) as [ClassGroup, readonly string[]][]) {
    if (classes.includes(schoolClass)) return group;
  }
  return null;
}

/** Registration prices shown in the Hope-Alive IVC 2026 fee schedule. */
export function registrationFeeNgn(schoolClass: string, registeredAt: Date = new Date()): number | null {
  const group = findClassGroup(schoolClass);
  if (!group || Number.isNaN(registeredAt.getTime())) return null;

  // Use Lagos calendar dates so the advertised 23 December changeover does not
  // depend on the server's UTC offset or the visitor's device timezone.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(registeredAt);
  const date = parts.reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const localDate = `${date.year}-${date.month}-${date.day}`;
  if (localDate < "2026-09-20") return null;
  const isOnSite = localDate >= "2026-12-23";
  const primaryOrBelow = group === "Lower Class" || group === "Middle Class";

  if (isOnSite) return primaryOrBelow ? 8_000 : 9_000;
  return primaryOrBelow ? 7_500 : 8_500;
}

/** Display label for the registration pricing phase shown in admin summaries. */
export function registrationPricingPhase(registeredAt: Date | string | null | undefined): "Early bird" | "Second phase" | "Not open" {
  if (!registeredAt) return "Not open";
  const date = registeredAt instanceof Date ? registeredAt : new Date(registeredAt);
  if (Number.isNaN(date.getTime())) return "Not open";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const dateMap = parts.reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const localDate = `${dateMap.year}-${dateMap.month}-${dateMap.day}`;
  if (localDate < "2026-09-20") return "Not open";
  return localDate < "2026-12-23" ? "Early bird" : "Second phase";
}

/**
 * Reduces a phone number to digits and a leading `+`.
 * Used for both storage and lookup so "0805 778 2932" and "08057782932" match.
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  // A `+` is only meaningful as an international prefix.
  return cleaned.startsWith("+") ? `+${cleaned.slice(1).replace(/\+/g, "")}` : cleaned.replace(/\+/g, "");
}

/** Lowercases and trims an email for storage and duplicate detection. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Collapses whitespace and lowercases a name, for duplicate detection only. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * A participant is "the same person" when the normalised name, guardian phone
 * and class all match. Siblings (different names) and a participant moving up
 * a class therefore still get their own registration, which is the documented
 * behaviour of the programme.
 */
export function dedupeFingerprint(input: { studentName: string; guardianPhone: string; schoolClass: string }): string {
  return [normalizeName(input.studentName), normalizePhone(input.guardianPhone), input.schoolClass.trim().toLowerCase()].join("|");
}

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Enter a parent or guardian phone number.")
  .refine(value => normalizePhone(value).replace("+", "").length >= 7, "Enter a valid phone number with at least 7 digits.")
  .refine(value => normalizePhone(value).replace("+", "").length <= 20, "That phone number looks too long.");

/** Validation shared by the registration form and the `registration.create` procedure. */
export const registrationInputSchema = z.object({
  studentName: z
    .string()
    .trim()
    .min(2, "Enter the participant's full name.")
    .max(160, "That name is too long.")
    .refine(value => /\p{L}/u.test(value), "Enter the participant's full name."),
  guardianEmail: z
    .string()
    .trim()
    .min(1, "Enter an email address so we can send your confirmation.")
    .max(320, "That email address is too long.")
    .pipe(z.email("Enter a valid email address, e.g. name@example.com")),
  guardianPhone: phoneSchema,
  schoolClass: z
    .string()
    .trim()
    .refine(value => findClassGroup(value) !== null, "Choose a class from the list."),
  consentToEmail: z.literal(true, "Please confirm we may email your registration details."),
});

export type RegistrationInput = z.infer<typeof registrationInputSchema>;

export const familyRegistrationInputSchema = z.object({
  registrationType: z.enum(["individual", "family"]),
  guardianPhone: phoneSchema,
  guardianEmail: z.string().trim().max(320, "That email address is too long.").optional().or(z.literal("")),
  consentToEmail: z.boolean(),
  participants: z.array(z.object({
    studentName: z.string().trim().min(2, "Enter the participant's full name.").max(160, "That name is too long.").refine(value => /\p{L}/u.test(value), "Enter the participant's full name."),
    schoolClass: z.string().trim().refine(value => findClassGroup(value) !== null, "Choose a class from the list."),
  })).min(1).max(6),
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

export type FamilyRegistrationInput = z.infer<typeof familyRegistrationInputSchema>;

/** Validation for looking up an existing registration. */
export const registrationLookupSchema = z.object({
  registrationNumber: z
    .string()
    .trim()
    .min(5, "Enter the registration number you were given.")
    .max(32, "That registration number is too long."),
  guardianPhone: phoneSchema,
});

export type RegistrationLookup = z.infer<typeof registrationLookupSchema>;

export const PAYMENT_STATUSES = [
  "pending_payment",
  "payment_claimed",
  "under_review",
  "verified",
  "rejected",
  "completed",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending_payment: "Pending payment",
  payment_claimed: "Payment claimed",
  under_review: "Under review",
  verified: "Verified",
  rejected: "Needs clarification",
  completed: "Completed",
};

/** Delivery state of the registration confirmation email. */
export const EMAIL_STATUSES = ["pending", "sent", "failed", "skipped"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/**
 * Bank details every surface must agree on: the payment page and the emails all
 * read from here. Previously three copies.
 */
export const PAYMENT_DETAILS = {
  accountName: "Hope-Alive Muslim Foundation",
  accountNumber: "0019871510",
  bank: "Jaiz Bank",
  /** Enquiries only. Receipts are uploaded on the site, never sent here. */
  enquiriesPhone: "08057782932",
  enquiriesLink: "https://wa.me/2348057782932",
} as const;

/** Upper bound on the receipt data URL — roughly a 1.5 MB image after base64. */
export const MAX_RECEIPT_DATA_URL_CHARS = 2_000_000;
/** Lifetime upload attempts per registration before an admin has to step in. */
export const MAX_RECEIPT_ATTEMPTS = 5;

const RECEIPT_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Validation for a receipt screenshot upload. */
export const receiptUploadSchema = registrationLookupSchema.extend({
  imageDataUrl: z
    .string()
    .min(1, "Choose a screenshot of your payment receipt.")
    .max(MAX_RECEIPT_DATA_URL_CHARS, "That image is too large. Please use a smaller screenshot.")
    .refine(value => RECEIPT_DATA_URL.test(value), "Upload a JPEG, PNG or WebP image."),
});

export type ReceiptUpload = z.infer<typeof receiptUploadSchema>;
