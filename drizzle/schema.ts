import { int, json, mediumtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const registrationCounters = mysqlTable("registration_counters", {
  id: int("id").autoincrement().primaryKey(),
  classGroup: varchar("classGroup", { length: 32 }).notNull().unique(),
  lastNumber: int("lastNumber").notNull().default(0),
});

export const registrations = mysqlTable("registrations", {
  id: int("id").autoincrement().primaryKey(),
  studentName: varchar("studentName", { length: 160 }).notNull(),
  /**
   * Registration confirmations are sent here. Nullable at the column level so
   * registrations captured before the email field existed remain valid; the
   * API requires it for every new registration.
   */
  guardianEmail: varchar("guardianEmail", { length: 320 }),
  guardianPhone: varchar("guardianPhone", { length: 32 }).notNull(),
  schoolClass: varchar("schoolClass", { length: 64 }).notNull(),
  classGroup: varchar("classGroup", { length: 32 }).notNull(),
  registrationNumber: varchar("registrationNumber", { length: 32 }).notNull().unique(),
  /**
   * SHA-256 of the normalised (name | phone | class) tuple. The unique index
   * makes duplicate prevention race-proof: two concurrent submissions for the
   * same participant cannot both succeed.
   */
  dedupeKey: varchar("dedupeKey", { length: 64 }).unique(),
  paymentStatus: mysqlEnum("paymentStatus", ["pending_payment", "payment_claimed", "under_review", "verified", "rejected", "completed"]).notNull().default("pending_payment"),
  receiptStatus: mysqlEnum("receiptStatus", ["not_submitted", "submitted"]).notNull().default("not_submitted"),
  verificationStatus: mysqlEnum("verificationStatus", ["pending", "verified", "rejected", "clarification"]).notNull().default("pending"),
  /** Delivery state of the confirmation email. Never blocks a saved registration. */
  emailStatus: mysqlEnum("emailStatus", ["pending", "sent", "failed", "skipped"]).notNull().default("pending"),
  /** Resend message id, for tracing a delivery in the Resend dashboard. */
  emailMessageId: varchar("emailMessageId", { length: 64 }),
  emailSentAt: timestamp("emailSentAt"),
  /** Short, non-sensitive failure reason shown to admins so they can retry. */
  emailError: varchar("emailError", { length: 255 }),
  /**
   * Optional payment evidence: a receipt screenshot as a base64 data URL,
   * downscaled in the browser and capped server-side (MEDIUMTEXT = 16 MB).
   * Kept in the database so the only infrastructure this flow needs is MySQL
   * and admins can always see the evidence when verifying manually.
   */
  receiptImage: mediumtext("receiptImage"),
  receiptSubmittedAt: timestamp("receiptSubmittedAt"),
  /** Lifetime upload attempts; bounded so a bad actor cannot fill the table. */
  receiptAttempts: int("receiptAttempts").notNull().default(0),
  /**
   * Retained, unused column (no migration to drop it). It previously held an
   * automated analysis; verification is now fully manual, so nothing writes it.
   */
  receiptAnalysis: json("receiptAnalysis"),
  verifiedAt: timestamp("verifiedAt"),
  /**
   * Who granted verification. The "ai" value is retained in the enum only to
   * avoid a migration; the manual flow always writes "admin".
   */
  verifiedBy: mysqlEnum("verifiedBy", ["ai", "admin"]),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Registration = typeof registrations.$inferSelect;
export type InsertRegistration = typeof registrations.$inferInsert;
