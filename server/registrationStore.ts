import { desc, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { registrationCounters, registrations, type Registration } from "../drizzle/schema";
import { getDb } from "./db";
import type { EmailStatus } from "@shared/registration";

/**
 * Data access for registrations, behind one interface with two backends:
 *
 *  - PostgresStore — the real database, used whenever a database URL is set.
 *  - MemoryStore — a zero-config fallback (persisted to .data/registrations.json)
 *                  used when no database is configured, so the app — including the
 *                  admin dashboard — works out of the box in local/preview runs.
 *
 * The router talks only to this interface, so the two paths can never drift in
 * behaviour. In production configure DATABASE_URL or POSTGRES_URL.
 */

export class DuplicateRegistrationError extends Error {
  constructor() {
    super("Duplicate registration");
    this.name = "DuplicateRegistrationError";
  }
}

export type CreateRegistrationData = {
  studentName: string;
  guardianEmail: string | null;
  guardianPhone: string;
  schoolClass: string;
  classGroup: string;
  /** Registration-number prefix for the class group, e.g. "MIDDLE". */
  prefix: string;
  dedupeKey: string;
  emailStatus: EmailStatus;
};

export type CreateFamilyRegistrationData = CreateRegistrationData & { familyCode: string; familyPaymentLead: boolean; createdAt: Date };

/** Columns the admin list needs — everything except the heavy receipt image. */
export type AdminListRow = Pick<
  Registration,
  | "id"
  | "studentName"
  | "guardianEmail"
  | "guardianPhone"
  | "schoolClass"
  | "classGroup"
  | "registrationNumber"
  | "familyCode"
  | "familyPaymentLead"
  | "verifiedAmountNgn"
  | "paymentStatus"
  | "receiptStatus"
  | "verificationStatus"
  | "emailStatus"
  | "emailError"
  | "receiptSubmittedAt"
  | "receiptAttempts"
  | "verifiedAt"
  | "verifiedBy"
  | "checkedInAt"
  | "checkedInBy"
  | "entitlementsEligibleAt"
  | "entitlementsEligibleBy"
  | "notes"
  | "createdAt"
>;

export type ReceiptImageRow = Pick<Registration, "receiptImage" | "receiptSubmittedAt">;

export interface RegistrationStore {
  findByDedupeKey(dedupeKey: string): Promise<Pick<Registration, "registrationNumber"> | null>;
  /** Atomically allocates the next number for the class group and inserts the row. */
  create(data: CreateRegistrationData): Promise<string>;
  createFamily(data: CreateFamilyRegistrationData[]): Promise<string[]>;
  findByNumber(registrationNumber: string): Promise<Registration | null>;
  findById(id: number): Promise<Registration | null>;
  findByFamilyCode(familyCode: string): Promise<Registration[]>;
  listForAdmin(): Promise<AdminListRow[]>;
  getReceiptImage(id: number): Promise<ReceiptImageRow | null>;
  updateByNumber(registrationNumber: string, patch: Partial<Registration>): Promise<void>;
  updateById(id: number, patch: Partial<Registration>): Promise<void>;
  updateByFamilyCode(familyCode: string, patch: Partial<Registration>): Promise<void>;
}

const ADMIN_COLUMNS = {
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
  checkedInAt: registrations.checkedInAt,
  checkedInBy: registrations.checkedInBy,
  entitlementsEligibleAt: registrations.entitlementsEligibleAt,
  entitlementsEligibleBy: registrations.entitlementsEligibleBy,
  notes: registrations.notes,
  createdAt: registrations.createdAt,
} as const;

/** PostgreSQL reports unique-index collisions with SQLSTATE 23505. */
function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errno?: unknown; cause?: unknown };
  if (candidate.code === "23505") return true;
  return candidate.cause ? isDuplicateKeyError(candidate.cause) : false;
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

class PostgresStore implements RegistrationStore {
  constructor(private readonly db: Db) {}

  async findByDedupeKey(dedupeKey: string) {
    const rows = await this.db
      .select({ registrationNumber: registrations.registrationNumber })
      .from(registrations)
      .where(eq(registrations.dedupeKey, dedupeKey))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: CreateRegistrationData): Promise<string> {
    try {
      return await this.db.transaction(async tx => {
        await tx.insert(registrationCounters).values({ classGroup: data.classGroup, lastNumber: 0 }).onConflictDoNothing({ target: registrationCounters.classGroup });
        const [counter] = await tx.select({ lastNumber: registrationCounters.lastNumber })
          .from(registrationCounters)
          .where(eq(registrationCounters.classGroup, data.classGroup))
          .for("update");
        const nextNumber = Number(counter?.lastNumber ?? 0) + 1;
        await tx.update(registrationCounters).set({ lastNumber: nextNumber }).where(eq(registrationCounters.classGroup, data.classGroup));

        const allocated = `${data.prefix}-${String(nextNumber).padStart(3, "0")}`;
        await tx.insert(registrations).values({
          studentName: data.studentName,
          guardianEmail: data.guardianEmail,
          guardianPhone: data.guardianPhone,
          schoolClass: data.schoolClass,
          classGroup: data.classGroup,
          registrationNumber: allocated,
          dedupeKey: data.dedupeKey,
          emailStatus: data.emailStatus,
        });
        return allocated;
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new DuplicateRegistrationError();
      throw error;
    }
  }

  async createFamily(data: CreateFamilyRegistrationData[]): Promise<string[]> {
    try {
      return await this.db.transaction(async tx => {
        const nextNumbers: Record<string, number> = {};
        for (const classGroup of [...new Set(data.map(item => item.classGroup))].sort()) {
          await tx.insert(registrationCounters).values({ classGroup, lastNumber: 0 }).onConflictDoNothing({ target: registrationCounters.classGroup });
          const [counter] = await tx.select({ lastNumber: registrationCounters.lastNumber })
            .from(registrationCounters)
            .where(eq(registrationCounters.classGroup, classGroup))
            .for("update");
          nextNumbers[classGroup] = Number(counter?.lastNumber ?? 0);
        }

        const numbered = data.map(item => {
          const next = ++nextNumbers[item.classGroup];
          return { ...item, registrationNumber: `${item.prefix}-${String(next).padStart(3, "0")}` };
        });
        for (const [classGroup, lastNumber] of Object.entries(nextNumbers)) {
          await tx.update(registrationCounters).set({ lastNumber }).where(eq(registrationCounters.classGroup, classGroup));
        }
        await tx.insert(registrations).values(numbered.map(item => ({
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
          updatedAt: item.createdAt,
        })));
        return numbered.map(item => item.registrationNumber);
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new DuplicateRegistrationError();
      throw error;
    }
  }

  async findByNumber(registrationNumber: string) {
    const rows = await this.db.select().from(registrations).where(eq(registrations.registrationNumber, registrationNumber)).limit(1);
    return rows[0] ?? null;
  }

  async findById(id: number) {
    const rows = await this.db.select().from(registrations).where(eq(registrations.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByFamilyCode(familyCode: string) {
    return this.db.select().from(registrations).where(eq(registrations.familyCode, familyCode)).orderBy(registrations.id);
  }

  async listForAdmin() {
    return this.db.select(ADMIN_COLUMNS).from(registrations).orderBy(desc(registrations.createdAt));
  }

  async getReceiptImage(id: number) {
    const rows = await this.db
      .select({ receiptImage: registrations.receiptImage, receiptSubmittedAt: registrations.receiptSubmittedAt })
      .from(registrations)
      .where(eq(registrations.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async updateByNumber(registrationNumber: string, patch: Partial<Registration>) {
    await this.db.update(registrations).set(patch).where(eq(registrations.registrationNumber, registrationNumber));
  }

  async updateById(id: number, patch: Partial<Registration>) {
    await this.db.update(registrations).set(patch).where(eq(registrations.id, id));
  }

  async updateByFamilyCode(familyCode: string, patch: Partial<Registration>) {
    await this.db.update(registrations).set(patch).where(eq(registrations.familyCode, familyCode));
  }
}

/* ------------------------------------------------------------------------- */
/* In-memory fallback (persisted to a JSON file)                              */
/* ------------------------------------------------------------------------- */

type MemoryState = {
  registrations: Registration[];
  counters: Record<string, number>;
  nextId: number;
};

const DATE_FIELDS: (keyof Registration)[] = ["emailSentAt", "receiptSubmittedAt", "verifiedAt", "checkedInAt", "entitlementsEligibleAt", "createdAt", "updatedAt"];
const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "registrations.json");
/** Tests run fully in memory — no file writes. */
const PERSIST = !process.env.VITEST;

function reviveDates(record: Record<string, unknown>): Registration {
  const clone = { ...record } as Record<string, unknown>;
  for (const field of DATE_FIELDS) {
    const value = clone[field];
    clone[field] = value ? new Date(value as string) : null;
  }
  return clone as Registration;
}

class MemoryStore implements RegistrationStore {
  private state: MemoryState = { registrations: [], counters: {}, nextId: 1 };

  constructor() {
    if (!PERSIST) return;
    try {
      if (fs.existsSync(DATA_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as MemoryState;
        this.state = {
          registrations: (parsed.registrations ?? []).map(reviveDates),
          counters: parsed.counters ?? {},
          nextId: parsed.nextId ?? (parsed.registrations?.length ?? 0) + 1,
        };
      }
      console.warn("[Store] DATABASE_URL is not set — using the local JSON store at .data/registrations.json. Set DATABASE_URL for a durable production database.");
    } catch (error) {
      console.error("[Store] Could not read the local data file; starting empty:", error);
    }
  }

  private persist() {
    if (!PERSIST) return;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.state, null, 2), "utf8");
    } catch (error) {
      console.error("[Store] Could not write the local data file:", error);
    }
  }

  private clone(record: Registration): Registration {
    return { ...record };
  }

  async findByDedupeKey(dedupeKey: string) {
    const found = this.state.registrations.find(r => r.dedupeKey === dedupeKey);
    return found ? { registrationNumber: found.registrationNumber } : null;
  }

  async create(data: CreateRegistrationData): Promise<string> {
    if (this.state.registrations.some(r => r.dedupeKey === data.dedupeKey)) {
      throw new DuplicateRegistrationError();
    }
    const next = (this.state.counters[data.classGroup] ?? 0) + 1;
    this.state.counters[data.classGroup] = next;
    const registrationNumber = `${data.prefix}-${String(next).padStart(3, "0")}`;
    const now = new Date();
    const record: Registration = {
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
      checkedInAt: null,
      checkedInBy: null,
      entitlementsEligibleAt: null,
      entitlementsEligibleBy: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
    this.state.registrations.push(record);
    this.persist();
    return registrationNumber;
  }

  async createFamily(data: CreateFamilyRegistrationData[]): Promise<string[]> {
    const dedupeKeys = data.map(item => item.dedupeKey);
    if (new Set(dedupeKeys).size !== dedupeKeys.length || dedupeKeys.some(key => this.state.registrations.some(r => r.dedupeKey === key))) {
      throw new DuplicateRegistrationError();
    }
    const numbers = data.map(item => {
      const next = (this.state.counters[item.classGroup] ?? 0) + 1;
      this.state.counters[item.classGroup] = next;
      return `${item.prefix}-${String(next).padStart(3, "0")}`;
    });
    const records = data.map((item, index): Registration => ({
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
      checkedInAt: null,
      checkedInBy: null,
      entitlementsEligibleAt: null,
      entitlementsEligibleBy: null,
      notes: null,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
    }));
    this.state.registrations.push(...records);
    this.persist();
    return numbers;
  }

  async findByNumber(registrationNumber: string) {
    const found = this.state.registrations.find(r => r.registrationNumber === registrationNumber);
    return found ? this.clone(found) : null;
  }

  async findById(id: number) {
    const found = this.state.registrations.find(r => r.id === id);
    return found ? this.clone(found) : null;
  }

  async findByFamilyCode(familyCode: string) {
    return this.state.registrations.filter(record => record.familyCode === familyCode).sort((a, b) => a.id - b.id).map(record => this.clone(record));
  }

  async listForAdmin(): Promise<AdminListRow[]> {
    return [...this.state.registrations]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(r => {
        // Omit the heavy image + internal columns, mirroring the SQL projection.
        const { receiptImage: _img, receiptAnalysis: _an, dedupeKey: _dk, emailMessageId: _mid, updatedAt: _up, ...row } = r;
        return row;
      });
  }

  async getReceiptImage(id: number) {
    const found = this.state.registrations.find(r => r.id === id);
    return found ? { receiptImage: found.receiptImage, receiptSubmittedAt: found.receiptSubmittedAt } : null;
  }

  private apply(record: Registration, patch: Partial<Registration>) {
    Object.assign(record, patch, { updatedAt: new Date() });
  }

  async updateByNumber(registrationNumber: string, patch: Partial<Registration>) {
    const record = this.state.registrations.find(r => r.registrationNumber === registrationNumber);
    if (record) {
      this.apply(record, patch);
      this.persist();
    }
  }

  async updateById(id: number, patch: Partial<Registration>) {
    const record = this.state.registrations.find(r => r.id === id);
    if (record) {
      this.apply(record, patch);
      this.persist();
    }
  }

  async updateByFamilyCode(familyCode: string, patch: Partial<Registration>) {
    const family = this.state.registrations.filter(record => record.familyCode === familyCode);
    if (!family.length) return;
    family.forEach(record => this.apply(record, patch));
    this.persist();
  }
}

let postgresStore: { db: Db; store: PostgresStore } | null = null;
let memoryStore: MemoryStore | null = null;

/** Returns the PostgreSQL store when a database is configured, else the local fallback. */
export async function getStore(): Promise<RegistrationStore> {
  const db = await getDb();
  if (db) {
    if (!postgresStore || postgresStore.db !== db) postgresStore = { db, store: new PostgresStore(db) };
    return postgresStore.store;
  }
  // The JSON store is useful for local development, but it is not durable on
  // serverless hosts and must never silently accept production registrations.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Registration storage is unavailable. Configure DATABASE_URL or POSTGRES_URL before accepting registrations.");
  }
  if (!memoryStore) memoryStore = new MemoryStore();
  return memoryStore;
}

/** Test helper — drops the in-memory fallback so each test starts clean. */
export function resetStoreForTests() {
  memoryStore = null;
  postgresStore = null;
}
