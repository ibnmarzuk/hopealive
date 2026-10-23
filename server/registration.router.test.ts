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

const { appRouter } = await import("./routers");
const { resetRateLimits } = await import("./rateLimit");

function caller(ip = "203.0.113.5") {
  return appRouter.createCaller({
    req: { headers: { "x-forwarded-for": ip }, ip } as never,
    res: {} as never,
    user: null,
    admin: null,
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

describe("registration.submitReceipt (manual flow — stores evidence, never auto-confirms)", () => {
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
    notes: null,
  };

  const originalGroupUrl = process.env.WHATSAPP_GROUP_URL;
  beforeEach(() => {
    process.env.WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/test-group";
  });
  afterEach(() => {
    if (originalGroupUrl === undefined) delete process.env.WHATSAPP_GROUP_URL;
    else process.env.WHATSAPP_GROUP_URL = originalGroupUrl;
  });

  it("stores the evidence and marks it pending review — never confirms, never emails, never reveals the link", async () => {
    state.selectQueue = [[row]];

    const result = await caller().registration.submitReceipt(upload);

    // Exactly one write: the evidence + pending-review status.
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      receiptImage: image,
      receiptStatus: "submitted",
      receiptAttempts: 1,
      paymentStatus: "payment_claimed",
      verificationStatus: "pending",
    });
    expect(state.updates[0].verifiedAt).toBeUndefined();

    expect(result.outcome).toBe("submitted");
    expect(result.verificationStatus).toBe("pending");
    expect(result.receiptMessage).toMatch(/pending review/i);
    expect(result.receiptMessage).toMatch(/does not confirm payment/i);
    expect(result.receiptAttemptsLeft).toBe(4);
    // The group link is never exposed before an admin confirms.
    expect(result.whatsappGroupUrl).toBeNull();
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("short-circuits an already confirmed registration and shows the link without re-writing", async () => {
    state.selectQueue = [[{ ...row, verificationStatus: "verified", paymentStatus: "verified", receiptStatus: "submitted", receiptAttempts: 1 }]];

    const result = await caller().registration.submitReceipt(upload);

    expect(result.outcome).toBe("already_verified");
    expect(result.whatsappGroupUrl).toBe("https://chat.whatsapp.com/test-group");
    expect(state.updates).toHaveLength(0);
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("stops after the attempt limit and points to a human", async () => {
    state.selectQueue = [[{ ...row, receiptAttempts: 5, receiptStatus: "submitted" }]];
    await expect(caller().registration.submitReceipt(upload)).rejects.toThrow(/upload limit/i);
    expect(state.updates).toHaveLength(0);
  });

  it("refuses a registration number with the wrong phone", async () => {
    state.selectQueue = [[]];
    await expect(caller().registration.submitReceipt(upload)).rejects.toThrow(/could not find/i);
    expect(state.updates).toHaveLength(0);
  });

  it("rejects an unsupported image before touching the database", async () => {
    await expect(caller().registration.submitReceipt({ ...upload, imageDataUrl: "data:image/gif;base64,R0lGOD" })).rejects.toThrow();
    expect(state.updates).toHaveLength(0);
  });

  it("rate-limits evidence uploads per IP", async () => {
    state.selectQueue = Array.from({ length: 21 }, () => [row]);
    for (let i = 0; i < 20; i++) {
      await caller("203.0.113.77").registration.submitReceipt(upload);
    }
    await expect(caller("203.0.113.77").registration.submitReceipt(upload)).rejects.toThrow(/too many uploads/i);
  });

  it("never includes the group link or raw columns in a non-verified public view", async () => {
    state.selectQueue = [[{ ...row, receiptStatus: "submitted", verificationStatus: "pending", paymentStatus: "payment_claimed" }]];
    const result = await caller().registration.resume({ registrationNumber: "MIDDLE-014", guardianPhone: "08057782932" });
    expect(result.whatsappGroupUrl).toBeNull();
    expect(result).not.toHaveProperty("receiptImage");
    expect(result).not.toHaveProperty("notes");
  });
});

describe("admin procedures", () => {
  const row = {
    id: 7,
    registrationNumber: "MIDDLE-014",
    studentName: "Aisha Ibrahim",
    guardianEmail: "parent@example.com",
    guardianPhone: "08057782932",
    schoolClass: "Basic 4",
    classGroup: "Middle Class",
    paymentStatus: "payment_claimed",
    verificationStatus: "pending",
    receiptStatus: "submitted",
    receiptAttempts: 1,
    notes: null,
  };

  function adminCaller() {
    return appRouter.createCaller({
      req: { headers: {}, ip: "203.0.113.5" } as never,
      res: {} as never,
      user: { id: 1, role: "admin" } as never,
      admin: null,
    });
  }

  it("refuses an unauthenticated caller", async () => {
    await expect(caller().registration.adminList()).rejects.toThrow();
  });

  it("confirms a payment manually: sets verified, stamps verifiedBy=admin, emails the group link once", async () => {
    state.selectQueue = [[row]];
    const result = await adminCaller().registration.adminUpdateStatus({ id: 7, paymentStatus: "verified" });

    expect(state.updates[0]).toMatchObject({ paymentStatus: "verified", verificationStatus: "verified", verifiedBy: "admin" });
    expect(state.updates[0].verifiedAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ success: true, emailed: true });
    expect(sendPaymentVerifiedEmail).toHaveBeenCalledOnce();
    expect(sendPaymentVerifiedEmail.mock.calls[0][1]).toMatchObject({ registrationNumber: "MIDDLE-014", groupUrl: "https://chat.whatsapp.com/test-group" });
  });

  it("does not resend the confirmation email when the registration is already verified", async () => {
    state.selectQueue = [[{ ...row, paymentStatus: "verified", verificationStatus: "verified" }]];
    const result = await adminCaller().registration.adminUpdateStatus({ id: 7, paymentStatus: "verified" });
    expect(result.emailed).toBe(false);
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("rejects a payment without emailing anything", async () => {
    state.selectQueue = [[row]];
    const result = await adminCaller().registration.adminUpdateStatus({ id: 7, paymentStatus: "rejected" });
    expect(state.updates[0]).toMatchObject({ paymentStatus: "rejected", verificationStatus: "rejected" });
    expect(result.emailed).toBe(false);
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("grants adminList access via a verified admin session cookie (no Manus user)", async () => {
    state.selectQueue = [[row]];
    const withAdminCookie = appRouter.createCaller({
      req: { headers: {}, ip: "203.0.113.5" } as never,
      res: {} as never,
      user: null,
      admin: { email: "ibnmarzuk207@gmail.com" },
    });
    const result = await withAdminCookie.registration.adminList();
    expect(Array.isArray(result.rows)).toBe(true);
  });

  const originalGroupUrl = process.env.WHATSAPP_GROUP_URL;
  beforeEach(() => {
    process.env.WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/test-group";
  });
  afterEach(() => {
    if (originalGroupUrl === undefined) delete process.env.WHATSAPP_GROUP_URL;
    else process.env.WHATSAPP_GROUP_URL = originalGroupUrl;
  });
});

describe("auth.adminLogin", () => {
  const ORIGINAL = {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    secret: process.env.ADMIN_SESSION_SECRET,
  };

  beforeEach(() => {
    process.env.ADMIN_EMAIL = "ibnmarzuk207@gmail.com";
    process.env.ADMIN_PASSWORD = "Abdurry207";
    process.env.ADMIN_SESSION_SECRET = "test-secret-value-long-enough";
    resetRateLimits();
  });
  afterEach(() => {
    for (const [key, value] of [["ADMIN_EMAIL", ORIGINAL.email], ["ADMIN_PASSWORD", ORIGINAL.password], ["ADMIN_SESSION_SECRET", ORIGINAL.secret]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  /** Caller whose res stub records Set-Cookie calls. */
  function loginCaller(cookies: Array<{ name: string; value: string }>, ip = "203.0.113.5") {
    return appRouter.createCaller({
      req: { headers: {}, ip } as never,
      res: {
        cookie: (name: string, value: string) => cookies.push({ name, value }),
        clearCookie: (name: string) => cookies.push({ name, value: "" }),
      } as never,
      user: null,
      admin: null,
    });
  }

  it("sets a session cookie for correct credentials", async () => {
    const cookies: Array<{ name: string; value: string }> = [];
    const result = await loginCaller(cookies).auth.adminLogin({ email: "ibnmarzuk207@gmail.com", password: "Abdurry207" });
    expect(result).toEqual({ success: true });
    expect(cookies.some(c => c.name === "hopealive_admin" && c.value.length > 0)).toBe(true);
  });

  it("rejects wrong credentials and sets no cookie", async () => {
    const cookies: Array<{ name: string; value: string }> = [];
    await expect(loginCaller(cookies).auth.adminLogin({ email: "ibnmarzuk207@gmail.com", password: "wrong" })).rejects.toThrow(/incorrect email or password/i);
    expect(cookies).toHaveLength(0);
  });

  it("reports when admin login is not configured", async () => {
    delete process.env.ADMIN_PASSWORD;
    const cookies: Array<{ name: string; value: string }> = [];
    await expect(loginCaller(cookies).auth.adminLogin({ email: "ibnmarzuk207@gmail.com", password: "Abdurry207" })).rejects.toThrow(/not configured/i);
  });

  it("rate-limits repeated login attempts from one IP", async () => {
    const cookies: Array<{ name: string; value: string }> = [];
    for (let i = 0; i < 8; i++) {
      await loginCaller(cookies, "198.51.100.9").auth.adminLogin({ email: "x@y.com", password: "nope" }).catch(() => {});
    }
    await expect(loginCaller(cookies, "198.51.100.9").auth.adminLogin({ email: "x@y.com", password: "nope" })).rejects.toThrow(/too many login attempts/i);
  });

  it("adminSession reflects a present admin cookie context", async () => {
    const session = await appRouter
      .createCaller({ req: { headers: {}, ip: "203.0.113.5" } as never, res: {} as never, user: null, admin: { email: "ibnmarzuk207@gmail.com" } })
      .auth.adminSession();
    expect(session.isAdmin).toBe(true);
    expect(session.email).toBe("ibnmarzuk207@gmail.com");
  });
});
