import {
  integer,
  jsonb,
  boolean,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const paymentStatus = pgEnum("payment_status", ["pending_payment", "payment_claimed", "under_review", "verified", "rejected", "completed"]);
export const receiptStatus = pgEnum("receipt_status", ["not_submitted", "submitted"]);
export const verificationStatus = pgEnum("verification_status", ["pending", "verified", "rejected", "clarification"]);
export const emailStatus = pgEnum("email_status", ["pending", "sent", "failed", "skipped"]);
export const verifiedBy = pgEnum("verified_by", ["ai", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const registrationCounters = pgTable("registration_counters", {
  id: serial("id").primaryKey(),
  classGroup: varchar("classGroup", { length: 32 }).notNull().unique(),
  lastNumber: integer("lastNumber").notNull().default(0),
});

export const registrations = pgTable("registrations", {
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
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type Registration = typeof registrations.$inferSelect;
export type InsertRegistration = typeof registrations.$inferInsert;
