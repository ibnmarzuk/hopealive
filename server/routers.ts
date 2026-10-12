import { COOKIE_NAME } from "@shared/const";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { registrations } from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

const classGroups = {
  "Lower Class": ["Nursery 2", "Basic 1", "Basic 2"],
  "Middle Class": ["Basic 3", "Basic 4", "Basic 5", "Basic 6"],
  "Upper Class": ["JSS 1", "JSS 2", "JSS 3"],
  "Advance 1": ["SS 1", "SS 2", "SS 3"],
  "Advance 2": ["Higher institution and above"],
} as const;

type ClassGroup = keyof typeof classGroups;

const groupPrefixes: Record<ClassGroup, string> = {
  "Lower Class": "LOWER",
  "Middle Class": "MIDDLE",
  "Upper Class": "UPPER",
  "Advance 1": "ADV1",
  "Advance 2": "ADV2",
};

function getClassGroup(schoolClass: string): ClassGroup {
  for (const [group, classes] of Object.entries(classGroups) as [ClassGroup, readonly string[]][]) {
    if (classes.includes(schoolClass)) return group;
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Please select a valid school class." });
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").trim();
}

const registrationInput = z.object({
  studentName: z.string().trim().min(2).max(160),
  guardianPhone: z.string().trim().min(7).max(32),
  schoolClass: z.string().trim(),
});

const lookupInput = z.object({
  registrationNumber: z.string().trim().min(5).max(32),
  guardianPhone: z.string().trim().min(7).max(32),
});

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
    create: publicProcedure.input(registrationInput).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Registration service is temporarily unavailable." });

      const classGroup = getClassGroup(input.schoolClass);
      const prefix = groupPrefixes[classGroup];
      const guardianPhone = normalizePhone(input.guardianPhone);

      return db.transaction(async tx => {
        await tx.execute(sql`INSERT INTO registration_counters (classGroup, lastNumber) VALUES (${classGroup}, 0) ON DUPLICATE KEY UPDATE classGroup = VALUES(classGroup)`);
        const counterResult = await tx.execute(sql`SELECT lastNumber FROM registration_counters WHERE classGroup = ${classGroup} FOR UPDATE`);
        const rows = (counterResult as unknown as [{ lastNumber: number }[], unknown])[0];
        const nextNumber = Number(rows[0]?.lastNumber ?? 0) + 1;
        await tx.execute(sql`UPDATE registration_counters SET lastNumber = ${nextNumber} WHERE classGroup = ${classGroup}`);

        const registrationNumber = `${prefix}-${String(nextNumber).padStart(3, "0")}`;
        await tx.insert(registrations).values({
          studentName: input.studentName,
          guardianPhone,
          schoolClass: input.schoolClass,
          classGroup,
          registrationNumber,
        });

        return { registrationNumber, studentName: input.studentName, guardianPhone, schoolClass: input.schoolClass, classGroup, paymentStatus: "pending_payment" as const };
      });
    }),

    resume: publicProcedure.input(lookupInput).query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Registration service is temporarily unavailable." });
      const registrationNumber = input.registrationNumber.toUpperCase();
      const result = await db.select().from(registrations).where(eq(registrations.registrationNumber, registrationNumber)).limit(1);
      const registration = result[0];
      if (!registration || registration.guardianPhone !== normalizePhone(input.guardianPhone)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "We could not find that registration. Check the number and phone number and try again." });
      }
      return registration;
    }),

    claimPayment: publicProcedure.input(lookupInput).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Registration service is temporarily unavailable." });
      const registrationNumber = input.registrationNumber.toUpperCase();
      const phone = normalizePhone(input.guardianPhone);
      const result = await db.select().from(registrations).where(and(eq(registrations.registrationNumber, registrationNumber), eq(registrations.guardianPhone, phone))).limit(1);
      if (!result[0]) throw new TRPCError({ code: "NOT_FOUND", message: "We could not find that registration. Check the number and phone number and try again." });
      await db.update(registrations).set({ paymentStatus: "payment_claimed" }).where(eq(registrations.id, result[0].id));
      return { ...result[0], paymentStatus: "payment_claimed" as const };
    }),

    adminList: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      return db.select().from(registrations).orderBy(desc(registrations.createdAt));
    }),

    adminUpdateStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), paymentStatus: z.enum(["pending_payment", "payment_claimed", "under_review", "verified", "rejected", "completed"]) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const verificationStatus = input.paymentStatus === "verified" || input.paymentStatus === "completed" ? "verified" : input.paymentStatus === "rejected" ? "rejected" : "pending";
      await db.update(registrations).set({ paymentStatus: input.paymentStatus, verificationStatus }).where(eq(registrations.id, input.id));
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
