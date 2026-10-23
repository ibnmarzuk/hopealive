import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration tests for the registration procedures.
 *
 * These drive the real tRPC router (validation, dedupe, rate limiting, email
 * orchestration, error mapping) against a fake drizzle handle and a mocked
 * Resend module. They do not need a live MySQL or a Resend API key — the
 * parts that do are listed in the README's verification notes.
 */

type SelectResult = Record<string, unknown>[];

const state = {
  dbAvailable: true,
  selectQueue: [] as SelectResult[],
  insertId: 1,
  transactionError: null as unknown,
  counterLastNumber: 0,
  updates: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
};

/** Chainable + awaitable stand-in for a drizzle query builder. */
function chain(resolve: () => unknown) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    from: self,
    where: self,
    limit: self,
    orderBy: self,
    then: (onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onOk, onErr),
  });
  return node;
}

function nextSelect(): SelectResult {
  return state.selectQueue.shift() ?? [];
}

const fakeDb = {
  select: () => chain(nextSelect),
  update: () => {
    const node: Record<string, unknown> = {};
    Object.assign(node, {
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        return node;
      },
      where: () => node,
      then: (onOk: (value: unknown) => unknown) => Promise.resolve({}).then(onOk),
    });
    return node;
  },
  transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    if (state.transactionError) throw state.transactionError;
    const tx = {
      execute: async () => [[{ lastNumber: state.counterLastNumber }], []],
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          state.inserted.push(values);
          if (state.transactionError) throw state.transactionError;
          return { insertId: state.insertId };
        },
      }),
    };
    return callback(tx);
  },
};

vi.mock("./db", () => ({
  getDb: async () => (state.dbAvailable ? fakeDb : null),
}));

const sendRegistrationEmail = vi.fn();
const sendPaymentVerifiedEmail = vi.fn();

vi.mock("./email/resend", () => ({
  sendRegistrationEmail: (...args: unknown[]) => sendRegistrationEmail(...args),
  sendPaymentVerifiedEmail: (...args: unknown[]) => sendPaymentVerifiedEmail(...args),
  isEmailConfigured: () => true,
  emailConfigurationProblem: () => null,
  maskEmail: (email: string) => `masked:${email}`,
}));

// Only the model call is faked; the verdict rules and user-facing wording are
// the real implementations, so these tests cover the router's handling of them.
const analyzeReceipt = vi.fn();

vi.mock("./receipt/analyze", async importOriginal => {
  const actual = await importOriginal<typeof import("./receipt/analyze")>();
  return {
    ...actual,
    analyzeReceipt: (...args: unknown[]) => analyzeReceipt(...args),
    isReceiptCheckConfigured: () => true,
    receiptCheckProblem: () => null,
  };
});

const { appRouter } = await import("./routers");
const { resetRateLimits } = await import("./rateLimit");

function caller(ip = "203.0.113.5") {
  return appRouter.createCaller({
    req: { headers: { "x-forwarded-for": ip }, ip } as never,
    res: {} as never,
    user: null,
  });
}

const validInput = {
  studentName: "Aisha Ibrahim",
  guardianEmail: "Parent@Example.com",
  guardianPhone: "0805 778 2932",
  schoolClass: "Basic 4",
  consentToEmail: true as const,
};

beforeEach(() => {
  state.dbAvailable = true;
  state.selectQueue = [];
  state.insertId = 1;
  state.transactionError = null;
  state.counterLastNumber = 13;
  state.updates = [];
  state.inserted = [];
  sendRegistrationEmail.mockReset();
  sendRegistrationEmail.mockResolvedValue({ status: "sent", messageId: "resend_abc123" });
  sendPaymentVerifiedEmail.mockReset();
  sendPaymentVerifiedEmail.mockResolvedValue({ status: "sent", messageId: "resend_verified_1" });
  analyzeReceipt.mockReset();
  resetRateLimits();
});

describe("registration.create — happy path", () => {
  it("saves the registration, allocates a number and sends the email", async () => {
    const result = await caller().registration.create(validInput);

    expect(result.registrationNumber).toBe("MIDDLE-014");
    expect(result.classGroup).toBe("Middle Class");
    expect(result.emailStatus).toBe("sent");

    // Stored values are normalised.
    expect(state.inserted[0].guardianEmail).toBe("parent@example.com");
    expect(state.inserted[0].guardianPhone).toBe("08057782932");
    expect(state.inserted[0].dedupeKey).toMatch(/^[0-9a-f]{64}$/);

    expect(sendRegistrationEmail).toHaveBeenCalledOnce();
    expect(sendRegistrationEmail.mock.calls[0][0]).toBe("parent@example.com");
    expect(sendRegistrationEmail.mock.calls[0][1]).toMatchObject({ registrationNumber: "MIDDLE-014" });
  });

  it("records the Resend message id against the registration", async () => {
    await caller().registration.create(validInput);
    expect(state.updates.at(-1)).toMatchObject({ emailStatus: "sent", emailMessageId: "resend_abc123" });
  });

  it("prefixes the number by class group", async () => {
    state.counterLastNumber = 0;
    const result = await caller().registration.create({ ...validInput, schoolClass: "SS 1" });
    expect(result.registrationNumber).toBe("ADV1-001");
  });
});

describe("registration.create — validation", () => {
  it("rejects a malformed email before touching the database", async () => {
    await expect(caller().registration.create({ ...validInput, guardianEmail: "nope" })).rejects.toThrow();
    expect(state.inserted).toHaveLength(0);
  });

  it("rejects a missing consent checkbox", async () => {
    await expect(caller().registration.create({ ...validInput, consentToEmail: false as never })).rejects.toThrow();
    expect(state.inserted).toHaveLength(0);
  });

  it("rejects a class that is not on the list", async () => {
    await expect(caller().registration.create({ ...validInput, schoolClass: "Year 9" })).rejects.toThrow();
    expect(state.inserted).toHaveLength(0);
  });
});

describe("registration.create — duplicates", () => {
  it("rejects a duplicate found by the pre-check without consuming a number", async () => {
    state.selectQueue = [[{ registrationNumber: "MIDDLE-014" }]];
    await expect(caller().registration.create(validInput)).rejects.toThrow(/already registered/i);
    expect(state.inserted).toHaveLength(0);
  });

  it("maps a unique-index collision (concurrent submit) to a friendly conflict", async () => {
    state.transactionError = Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY", errno: 1062 });
    await expect(caller().registration.create(validInput)).rejects.toThrow(/already registered/i);
  });

  it("maps a wrapped driver duplicate error too", async () => {
    state.transactionError = Object.assign(new Error("insert failed"), {
      cause: Object.assign(new Error("Duplicate entry"), { errno: 1062 }),
    });
    await expect(caller().registration.create(validInput)).rejects.toThrow(/already registered/i);
  });
});

describe("registration.create — email failures never lose a registration", () => {
  it("returns a saved registration when Resend rejects the message", async () => {
    sendRegistrationEmail.mockResolvedValue({ status: "failed", reason: "Domain is not verified" });

    const result = await caller().registration.create(validInput);

    expect(result.registrationNumber).toBe("MIDDLE-014");
    expect(result.emailStatus).toBe("failed");
    expect(state.inserted).toHaveLength(1);
    expect(state.updates.at(-1)).toMatchObject({ emailStatus: "failed", emailError: "Domain is not verified" });
  });

  it("returns a saved registration when email is not configured at all", async () => {
    sendRegistrationEmail.mockResolvedValue({ status: "skipped", reason: "RESEND_API_KEY is not set" });

    const result = await caller().registration.create(validInput);

    expect(result.registrationNumber).toBe("MIDDLE-014");
    expect(result.emailStatus).toBe("skipped");
    expect(state.inserted).toHaveLength(1);
  });
});

describe("registration.create — abuse protection", () => {
  /** Vary name and email so neither dedupe nor the per-email limit interferes. */
  const distinct = (i: number) => ({
    ...validInput,
    studentName: `Child Number ${i}`,
    guardianEmail: `parent${i}@example.com`,
  });

  it("blocks a burst from one IP after the limit", async () => {
    for (let i = 0; i < 30; i++) {
      await caller("198.51.100.1").registration.create(distinct(i));
    }
    await expect(caller("198.51.100.1").registration.create(distinct(99))).rejects.toThrow(
      /too many registration attempts/i,
    );
  });

  it("does not penalise a different IP", async () => {
    for (let i = 0; i < 30; i++) {
      await caller("198.51.100.2").registration.create(distinct(i));
    }
    const result = await caller("198.51.100.3").registration.create(distinct(99));
    expect(result.registrationNumber).toBe("MIDDLE-014");
  });

  it("lets one family register several children on a shared email and IP", async () => {
    for (let i = 0; i < 6; i++) {
      const result = await caller("198.51.100.4").registration.create({ ...validInput, studentName: `Sibling ${i}` });
      expect(result.registrationNumber).toBe("MIDDLE-014");
    }
  });

  it("blocks reuse of one email address far beyond family scale", async () => {
    // 10 allowed per email per hour; spread across IPs so the IP limit is not the cause.
    for (let i = 0; i < 10; i++) {
      await caller(`192.0.2.${i}`).registration.create({ ...validInput, studentName: `Child Number ${i}` });
    }
    await expect(
      caller("192.0.2.200").registration.create({ ...validInput, studentName: "One More Child" }),
    ).rejects.toThrow(/several registrations/i);
  });
});

describe("registration.create — database unavailable", () => {
  it("fails with a user-facing message and sends no email", async () => {
    state.dbAvailable = false;
    await expect(caller().registration.create(validInput)).rejects.toThrow(/temporarily unavailable/i);
    expect(sendRegistrationEmail).not.toHaveBeenCalled();
  });
});

describe("registration.resume", () => {
  it("returns the registration when the number and phone match", async () => {
    state.selectQueue = [[{ registrationNumber: "MIDDLE-014", guardianPhone: "08057782932", studentName: "Aisha Ibrahim" }]];
    const result = await caller().registration.resume({ registrationNumber: "middle-014", guardianPhone: "0805 778 2932" });
    expect(result.registrationNumber).toBe("MIDDLE-014");
  });

  it("rejects a matching number with the wrong phone", async () => {
    state.selectQueue = [[{ registrationNumber: "MIDDLE-014", guardianPhone: "08011112222" }]];
    await expect(
      caller().registration.resume({ registrationNumber: "MIDDLE-014", guardianPhone: "0805 778 2932" }),
    ).rejects.toThrow(/could not find/i);
  });

  it("rejects an unknown registration number", async () => {
    state.selectQueue = [[]];
    await expect(
      caller().registration.resume({ registrationNumber: "MIDDLE-999", guardianPhone: "08057782932" }),
    ).rejects.toThrow(/could not find/i);
  });
});

describe("registration.submitReceipt", () => {
  const image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z";
  const upload = { registrationNumber: "middle-014", guardianPhone: "0805 778 2932", imageDataUrl: image };

  const row = {
    id: 7,
    registrationNumber: "MIDDLE-014",
    studentName: "Aisha Ibrahim",
    guardianEmail: "parent@example.com",
    guardianPhone: "08057782932",
    schoolClass: "Basic 4",
    classGroup: "Middle Class",
    paymentStatus: "pending_payment",
    verificationStatus: "pending",
    receiptStatus: "not_submitted",
    receiptAttempts: 0,
    receiptAnalysis: null,
    notes: null,
  };

  const analysisFor = (verdict: "verified" | "needs_review" | "rejected", overrides: Record<string, unknown> = {}) => ({
    verdict,
    confidence: 0.9,
    extracted: {
      amount: 5000,
      currency: "NGN",
      recipientAccountNumber: verdict === "rejected" ? "0123456789" : "0019871510",
      recipientName: "HOPE-ALIVE MUSLIM FOUNDATION",
      recipientBank: "Jaiz Bank",
      senderName: "Aisha Ibrahim",
      reference: "TRX1",
      transactionDate: null,
      transactionStatus: "successful",
    },
    checks: {
      isBankTransferReceipt: true,
      accountNumberMatches: verdict !== "rejected",
      recipientNameMatches: true,
      amountSufficient: true,
      transferSuccessful: true,
    },
    reasoning: "test reasoning",
    model: "claude-opus-5",
    analyzedAt: "2026-10-22T20:00:00.000Z",
    ...overrides,
  });

  const originalGroupUrl = process.env.WHATSAPP_GROUP_URL;
  beforeEach(() => {
    process.env.WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/test-group";
  });
  afterEach(() => {
    if (originalGroupUrl === undefined) delete process.env.WHATSAPP_GROUP_URL;
    else process.env.WHATSAPP_GROUP_URL = originalGroupUrl;
  });

  it("stores the upload before analysing, then verifies, emails and reveals the group link", async () => {
    state.selectQueue = [[row]];
    analyzeReceipt.mockResolvedValue({ status: "analyzed", analysis: analysisFor("verified") });

    const result = await caller().registration.submitReceipt(upload);

    // First write persists the image and counts the attempt — before the model runs.
    expect(state.updates[0]).toMatchObject({ receiptImage: image, receiptStatus: "submitted", receiptAttempts: 1, paymentStatus: "payment_claimed" });
    expect(analyzeReceipt).toHaveBeenCalledOnce();
    expect(analyzeReceipt.mock.calls[0][1]).toMatchObject({ accountNumber: "0019871510", accountName: "Hope-alive Muslim Found." });

    // Second write records the verdict.
    expect(state.updates[1]).toMatchObject({ paymentStatus: "verified", verificationStatus: "verified", verifiedBy: "ai" });
    expect(state.updates[1].verifiedAt).toBeInstanceOf(Date);

    expect(result.outcome).toBe("verified");
    expect(result.verificationStatus).toBe("verified");
    expect(result.whatsappGroupUrl).toBe("https://chat.whatsapp.com/test-group");
    expect(result.receiptAttemptsLeft).toBe(4);

    expect(sendPaymentVerifiedEmail).toHaveBeenCalledOnce();
    expect(sendPaymentVerifiedEmail.mock.calls[0][0]).toBe("parent@example.com");
    expect(sendPaymentVerifiedEmail.mock.calls[0][1]).toMatchObject({ registrationNumber: "MIDDLE-014", groupUrl: "https://chat.whatsapp.com/test-group" });
  });

  it("routes an uncertain receipt to review without the group link or an email", async () => {
    state.selectQueue = [[row]];
    analyzeReceipt.mockResolvedValue({ status: "analyzed", analysis: analysisFor("needs_review") });

    const result = await caller().registration.submitReceipt(upload);

    expect(result.outcome).toBe("needs_review");
    expect(state.updates[1]).toMatchObject({ paymentStatus: "under_review", verificationStatus: "clarification" });
    expect(state.updates[1].verifiedBy).toBeUndefined();
    expect(result.whatsappGroupUrl).toBeNull();
    expect(result.receiptMessage).toMatch(/team member will confirm/i);
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("rejects a wrong-account receipt with a plain-language reason and no link", async () => {
    state.selectQueue = [[row]];
    analyzeReceipt.mockResolvedValue({ status: "analyzed", analysis: analysisFor("rejected") });

    const result = await caller().registration.submitReceipt(upload);

    expect(result.outcome).toBe("rejected");
    expect(state.updates[1]).toMatchObject({ paymentStatus: "rejected", verificationStatus: "rejected" });
    expect(result.receiptMessage).toMatch(/different account number/i);
    expect(result.whatsappGroupUrl).toBeNull();
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("keeps the upload and queues manual review when the model is unavailable", async () => {
    state.selectQueue = [[{ ...row, notes: "earlier note" }]];
    analyzeReceipt.mockResolvedValue({ status: "failed", reason: "Anthropic rate limit reached" });

    const result = await caller().registration.submitReceipt(upload);

    expect(result.outcome).toBe("pending_manual");
    expect(state.updates[0]).toMatchObject({ receiptImage: image, receiptStatus: "submitted" });
    expect(state.updates[1]).toMatchObject({ paymentStatus: "under_review", verificationStatus: "clarification", receiptAnalysis: null });
    expect(String(state.updates[1].notes)).toContain("earlier note");
    expect(String(state.updates[1].notes)).toContain("Anthropic rate limit reached");
    expect(result.receiptMessage).toMatch(/team member will confirm/i);
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("does the same when the check is skipped because no key is configured", async () => {
    state.selectQueue = [[row]];
    analyzeReceipt.mockResolvedValue({ status: "skipped", reason: "ANTHROPIC_API_KEY is not set" });

    const result = await caller().registration.submitReceipt(upload);
    expect(result.outcome).toBe("pending_manual");
    expect(state.updates[1]).toMatchObject({ verificationStatus: "clarification" });
  });

  it("short-circuits an already verified registration without spending a model call", async () => {
    state.selectQueue = [[{ ...row, verificationStatus: "verified", paymentStatus: "verified", receiptStatus: "submitted", receiptAttempts: 1 }]];

    const result = await caller().registration.submitReceipt(upload);

    expect(result.outcome).toBe("verified");
    expect(result.whatsappGroupUrl).toBe("https://chat.whatsapp.com/test-group");
    expect(analyzeReceipt).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("stops after the attempt limit and points to a human", async () => {
    state.selectQueue = [[{ ...row, receiptAttempts: 5, receiptStatus: "submitted", verificationStatus: "rejected" }]];
    await expect(caller().registration.submitReceipt(upload)).rejects.toThrow(/upload limit/i);
    expect(analyzeReceipt).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("refuses a registration number with the wrong phone", async () => {
    state.selectQueue = [[]];
    await expect(caller().registration.submitReceipt(upload)).rejects.toThrow(/could not find/i);
    expect(analyzeReceipt).not.toHaveBeenCalled();
  });

  it("rejects an unsupported image before touching the database", async () => {
    await expect(caller().registration.submitReceipt({ ...upload, imageDataUrl: "data:image/gif;base64,R0lGOD" })).rejects.toThrow();
    expect(state.updates).toHaveLength(0);
  });

  it("rate-limits receipt uploads per IP more tightly than registrations", async () => {
    analyzeReceipt.mockResolvedValue({ status: "analyzed", analysis: analysisFor("needs_review") });
    state.selectQueue = Array.from({ length: 13 }, () => [row]);
    for (let i = 0; i < 12; i++) {
      await caller("203.0.113.77").registration.submitReceipt(upload);
    }
    await expect(caller("203.0.113.77").registration.submitReceipt(upload)).rejects.toThrow(/too many receipt uploads/i);
  });

  it("never includes the group link in a public view that is not verified", async () => {
    state.selectQueue = [[{ ...row, receiptStatus: "submitted", verificationStatus: "clarification", paymentStatus: "under_review" }]];
    const result = await caller().registration.resume({ registrationNumber: "MIDDLE-014", guardianPhone: "08057782932" });
    expect(result.whatsappGroupUrl).toBeNull();
    expect(result).not.toHaveProperty("receiptImage");
    expect(result).not.toHaveProperty("receiptAnalysis");
  });
});

describe("admin procedures", () => {
  it("refuses an unauthenticated caller", async () => {
    await expect(caller().registration.adminList()).rejects.toThrow();
  });
});
