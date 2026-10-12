import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  guardianPhone: varchar("guardianPhone", { length: 32 }).notNull(),
  schoolClass: varchar("schoolClass", { length: 64 }).notNull(),
  classGroup: varchar("classGroup", { length: 32 }).notNull(),
  registrationNumber: varchar("registrationNumber", { length: 32 }).notNull().unique(),
  paymentStatus: mysqlEnum("paymentStatus", ["pending_payment", "payment_claimed", "under_review", "verified", "rejected", "completed"]).notNull().default("pending_payment"),
  receiptStatus: mysqlEnum("receiptStatus", ["not_submitted", "submitted"]).notNull().default("not_submitted"),
  verificationStatus: mysqlEnum("verificationStatus", ["pending", "verified", "rejected", "clarification"]).notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Registration = typeof registrations.$inferSelect;
export type InsertRegistration = typeof registrations.$inferInsert;
