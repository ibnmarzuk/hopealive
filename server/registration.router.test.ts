import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration tests for the registration procedures.
 *
 * These drive the real tRPC router against the real in-memory store (the
 * fallback used when DATABASE_URL is unset — VITEST disables its file writes),
 * with only the email module mocked. So they exercise genuine create / dedupe /
 * counter / status logic, not a hand-rolled fake.
 */

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
const { getStore, resetStoreForTests } = await import("./registrationStore");

function caller(ip = "203.0.113.5") {
  return appRouter.createCaller({
    req: { headers: { "x-forwarded-for": ip }, ip } as never,
    res: {} as never,
    user: null,
    admin: null,
  });
}

function adminCaller() {
  return appRouter.createCaller({
    req: { headers: {}, ip: "203.0.113.5" } as never,
    res: {} as never,
    user: null,
    admin: { email: "ibnmarzuk207@gmail.com" },
  });
}

const validInput = {
  studentName: "Aisha Ibrahim",
  guardianEmail: "Parent@Example.com",
  guardianPhone: "0805 778 2932",
  schoolClass: "Basic 4", // → Middle Class → MIDDLE-###
  consentToEmail: true as const,
};

beforeEach(() => {
  resetStoreForTests();
  resetRateLimits();
  sendRegistrationEmail.mockReset();
  sendRegistrationEmail.mockResolvedValue({ status: "sent", messageId: "resend_abc123" });
  sendPaymentVerifiedEmail.mockReset();
  sendPaymentVerifiedEmail.mockResolvedValue({ status: "sent", messageId: "resend_verified_1" });
});

describe("registration.create — happy path", () => {
  it("saves a normalised registration, allocates MIDDLE-001 and sends the email", async () => {
    const result = await caller().registration.create(validInput);
    expect(result.registrationNumber).toBe("MIDDLE-001");
    expect(result.classGroup).toBe("Middle Class");
    expect(result.emailStatus).toBe("sent");

    const stored = await (await getStore()).findByNumber("MIDDLE-001");
    expect(stored).toMatchObject({
      guardianEmail: "parent@example.com",
      guardianPhone: "08057782932",
      studentName: "Aisha Ibrahim",
      emailStatus: "sent",
      emailMessageId: "resend_abc123",
    });
    expect(stored?.dedupeKey).toMatch(/^[0-9a-f]{64}$/);

    expect(sendRegistrationEmail).toHaveBeenCalledOnce();
    expect(sendRegistrationEmail.mock.calls[0][0]).toBe("parent@example.com");
  });

  it("increments the per-group counter", async () => {
    await caller().registration.create(validInput);
    const second = await caller().registration.create({ ...validInput, studentName: "Yusuf Ibrahim" });
    expect(second.registrationNumber).toBe("MIDDLE-002");
  });

  it("prefixes the number by class group", async () => {
    const result = await caller().registration.create({ ...validInput, schoolClass: "SS 1" });
    expect(result.registrationNumber).toBe("ADV1-001");
  });
});

describe("registration.create — validation", () => {
  it("rejects a malformed email and stores nothing", async () => {
    await expect(caller().registration.create({ ...validInput, guardianEmail: "nope" })).rejects.toThrow();
    expect(await (await getStore()).listForAdmin()).toHaveLength(0);
  });

  it("rejects a missing consent checkbox", async () => {
    await expect(caller().registration.create({ ...validInput, consentToEmail: false as never })).rejects.toThrow();
  });

  it("rejects a class that is not on the list", async () => {
    await expect(caller().registration.create({ ...validInput, schoolClass: "Year 9" })).rejects.toThrow();
  });
});

describe("registration.create — duplicates", () => {
  it("rejects a second identical participant with a friendly conflict", async () => {
    await caller().registration.create(validInput);
    await expect(caller().registration.create(validInput)).rejects.toThrow(/already registered/i);
    expect(await (await getStore()).listForAdmin()).toHaveLength(1);
  });

  it("still allows a sibling (different name) and a class change", async () => {
    await caller().registration.create(validInput);
    await expect(caller().registration.create({ ...validInput, studentName: "Yusuf Ibrahim" })).resolves.toBeTruthy();
    await expect(caller().registration.create({ ...validInput, schoolClass: "Basic 5" })).resolves.toBeTruthy();
  });
});

describe("registration.create — email failures never lose a registration", () => {
  it("keeps the registration when Resend rejects the message", async () => {
    sendRegistrationEmail.mockResolvedValue({ status: "failed", reason: "Domain is not verified" });
    const result = await caller().registration.create(validInput);
    expect(result.emailStatus).toBe("failed");
    const stored = await (await getStore()).findByNumber(result.registrationNumber);
    expect(stored).toMatchObject({ emailStatus: "failed", emailError: "Domain is not verified" });
  });

  it("keeps the registration when email is not configured", async () => {
    sendRegistrationEmail.mockResolvedValue({ status: "skipped", reason: "RESEND_API_KEY is not set" });
    const result = await caller().registration.create(validInput);
    expect(result.emailStatus).toBe("skipped");
    expect(await (await getStore()).findByNumber(result.registrationNumber)).toBeTruthy();
  });
});

describe("registration.create — abuse protection", () => {
  const distinct = (i: number) => ({ ...validInput, studentName: `Child Number ${i}`, guardianEmail: `parent${i}@example.com` });

  it("blocks a burst from one IP after the limit", async () => {
    for (let i = 0; i < 30; i++) await caller("198.51.100.1").registration.create(distinct(i));
    await expect(caller("198.51.100.1").registration.create(distinct(99))).rejects.toThrow(/too many registration attempts/i);
  });

  it("does not penalise a different IP", async () => {
    for (let i = 0; i < 30; i++) await caller("198.51.100.2").registration.create(distinct(i));
    await expect(caller("198.51.100.3").registration.create(distinct(99))).resolves.toBeTruthy();
  });

  it("lets one family register several children on a shared email and IP", async () => {
    for (let i = 0; i < 6; i++) {
      await expect(caller("198.51.100.4").registration.create({ ...validInput, studentName: `Sibling ${i}` })).resolves.toBeTruthy();
    }
  });

  it("blocks reuse of one email address far beyond family scale", async () => {
    for (let i = 0; i < 10; i++) await caller(`192.0.2.${i}`).registration.create({ ...validInput, studentName: `Child Number ${i}` });
    await expect(caller("192.0.2.200").registration.create({ ...validInput, studentName: "One More Child" })).rejects.toThrow(/several registrations/i);
  });
});

describe("registration.createFamily", () => {
  it("registers one child without email and skips sending", async () => {
    const result = await caller().registration.createFamily({
      registrationType: "individual",
      guardianPhone: "0805 778 2932",
      guardianEmail: "",
      consentToEmail: false,
      participants: [{ studentName: "Aisha Ibrahim", schoolClass: "Basic 4" }],
    });
    expect(result.registrationNumber).toBe("MIDDLE-001");
    expect(result.registrationType).toBe("individual");
    expect(result.familyCode).toBeNull();
    expect(result.emailStatus).toBe("skipped");
    expect(sendRegistrationEmail).not.toHaveBeenCalled();
  });

  it("sends email when a family opts in", async () => {
    const result = await caller().registration.createFamily({
      registrationType: "family",
      guardianPhone: "0805 778 2932",
      guardianEmail: "Family@Example.com",
      consentToEmail: true,
      participants: [
        { studentName: "Aisha Ibrahim", schoolClass: "Basic 4" },
        { studentName: "Yusuf Ibrahim", schoolClass: "SS 1" },
      ],
    });
    expect(result.registrationType).toBe("family");
    expect(result.familyCode).toMatch(/^HA-[0-9A-F]{8}$/);
    expect(result.members).toHaveLength(2);
    expect(result.members.map(member => member.registrationNumber)).toEqual(["MIDDLE-001", "ADV1-001"]);
    expect(result.emailStatus).toBe("sent");
    expect(sendRegistrationEmail).toHaveBeenCalledOnce();
    expect(sendRegistrationEmail.mock.calls[0][0]).toBe("family@example.com");

    const resumed = await caller().registration.resume({
      registrationNumber: result.familyCode!,
      guardianPhone: "08057782932",
    });
    expect(resumed.members).toHaveLength(2);
    expect(resumed.feeNgn).toBe(result.feeNgn);
  });

  it("rejects a second child that matches an existing fingerprint", async () => {
    await caller().registration.createFamily({
      registrationType: "individual",
      guardianPhone: "08057782932",
      guardianEmail: "",
      consentToEmail: false,
      participants: [{ studentName: "Aisha Ibrahim", schoolClass: "Basic 4" }],
    });
    await expect(
      caller().registration.createFamily({
        registrationType: "family",
        guardianPhone: "08057782932",
        guardianEmail: "",
        consentToEmail: false,
        participants: [
          { studentName: "Aisha Ibrahim", schoolClass: "Basic 4" },
          { studentName: "Yusuf Ibrahim", schoolClass: "Basic 5" },
        ],
      }),
    ).rejects.toThrow(/already registered/i);
  });
});

describe("registration.resume", () => {
  beforeEach(async () => {
    await caller().registration.create(validInput);
  });

  it("returns the registration for the right number + phone", async () => {
    const result = await caller().registration.resume({ registrationNumber: "middle-001", guardianPhone: "0805 778 2932" });
    expect(result.registrationNumber).toBe("MIDDLE-001");
    expect(result).not.toHaveProperty("receiptImage");
    expect(result).not.toHaveProperty("dedupeKey");
  });

  it("rejects the right number with the wrong phone", async () => {
    await expect(caller().registration.resume({ registrationNumber: "MIDDLE-001", guardianPhone: "08011112222" })).rejects.toThrow(/could not find/i);
  });

  it("rejects an unknown number", async () => {
    await expect(caller().registration.resume({ registrationNumber: "MIDDLE-999", guardianPhone: "08057782932" })).rejects.toThrow(/could not find/i);
  });
});

describe("registration.submitReceipt (manual — stores evidence, never auto-confirms)", () => {
  const image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z";
  const upload = { registrationNumber: "middle-001", guardianPhone: "0805 778 2932", imageDataUrl: image };

  const originalGroupUrl = process.env.WHATSAPP_GROUP_URL;
  beforeEach(async () => {
    process.env.WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/test-group";
    await caller().registration.create(validInput);
  });
  afterEach(() => {
    if (originalGroupUrl === undefined) delete process.env.WHATSAPP_GROUP_URL;
    else process.env.WHATSAPP_GROUP_URL = originalGroupUrl;
  });

  it("stores the evidence and marks it pending — no confirm, no email, no group link", async () => {
    const result = await caller().registration.submitReceipt(upload);
    expect(result.outcome).toBe("submitted");
    expect(result.verificationStatus).toBe("pending");
    expect(result.receiptMessage).toMatch(/pending review/i);
    expect(result.whatsappGroupUrl).toBeNull();

    const stored = await (await getStore()).findByNumber("MIDDLE-001");
    expect(stored).toMatchObject({ receiptStatus: "submitted", receiptAttempts: 1, paymentStatus: "payment_claimed", verificationStatus: "pending" });
    expect(stored?.receiptImage).toBe(image);
    expect(stored?.verifiedAt).toBeNull();
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("short-circuits an already confirmed registration and shows the link", async () => {
    const store = await getStore();
    const reg = await store.findByNumber("MIDDLE-001");
    await store.updateById(reg!.id, { verificationStatus: "verified", paymentStatus: "verified" });

    const result = await caller().registration.submitReceipt(upload);
    expect(result.outcome).toBe("already_verified");
    expect(result.whatsappGroupUrl).toBe("https://chat.whatsapp.com/test-group");
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("stops after the attempt limit", async () => {
    const store = await getStore();
    const reg = await store.findByNumber("MIDDLE-001");
    await store.updateById(reg!.id, { receiptAttempts: 5 });
    await expect(caller().registration.submitReceipt(upload)).rejects.toThrow(/upload limit/i);
  });

  it("refuses the wrong phone", async () => {
    await expect(caller().registration.submitReceipt({ ...upload, guardianPhone: "08011112222" })).rejects.toThrow(/could not find/i);
  });

  it("rejects an unsupported image before touching the store", async () => {
    await expect(caller().registration.submitReceipt({ ...upload, imageDataUrl: "data:image/gif;base64,R0lGOD" })).rejects.toThrow();
    const stored = await (await getStore()).findByNumber("MIDDLE-001");
    expect(stored?.receiptStatus).toBe("not_submitted");
  });

  it("rate-limits evidence uploads per IP (across distinct registrations)", async () => {
    const ip = "203.0.113.77";
    const numbers: string[] = [];
    for (let i = 0; i < 21; i++) {
      const r = await caller(ip).registration.create({ ...validInput, studentName: `Upload Child ${i}`, guardianEmail: `up${i}@example.com` });
      numbers.push(r.registrationNumber);
    }
    for (let i = 0; i < 20; i++) {
      await caller(ip).registration.submitReceipt({ registrationNumber: numbers[i], guardianPhone: "0805 778 2932", imageDataUrl: image });
    }
    await expect(
      caller(ip).registration.submitReceipt({ registrationNumber: numbers[20], guardianPhone: "0805 778 2932", imageDataUrl: image }),
    ).rejects.toThrow(/too many uploads/i);
  });
});

describe("admin procedures", () => {
  const originalGroupUrl = process.env.WHATSAPP_GROUP_URL;
  beforeEach(async () => {
    process.env.WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/test-group";
    await caller().registration.create(validInput);
  });
  afterEach(() => {
    if (originalGroupUrl === undefined) delete process.env.WHATSAPP_GROUP_URL;
    else process.env.WHATSAPP_GROUP_URL = originalGroupUrl;
  });

  async function firstId() {
    const reg = await (await getStore()).findByNumber("MIDDLE-001");
    return reg!.id;
  }

  it("refuses an unauthenticated caller", async () => {
    await expect(caller().registration.adminList()).rejects.toThrow();
  });

  it("lists registrations for an admin, without the receipt image", async () => {
    const result = await adminCaller().registration.adminList();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].registrationNumber).toBe("MIDDLE-001");
    expect(result.rows[0]).not.toHaveProperty("receiptImage");
  });

  it("grants access via an admin session cookie with no Manus user", async () => {
    const result = await adminCaller().registration.adminList();
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it("confirms a payment: sets verified + verifiedBy=admin and emails the group link once", async () => {
    const id = await firstId();
    const result = await adminCaller().registration.adminUpdateStatus({ id, paymentStatus: "verified" });
    expect(result).toMatchObject({ success: true, emailed: true });

    const stored = await (await getStore()).findById(id);
    expect(stored).toMatchObject({ paymentStatus: "verified", verificationStatus: "verified", verifiedBy: "admin" });
    expect(stored?.verifiedAt).toBeInstanceOf(Date);
    expect(sendPaymentVerifiedEmail).toHaveBeenCalledOnce();
    expect(sendPaymentVerifiedEmail.mock.calls[0][1]).toMatchObject({ registrationNumber: "MIDDLE-001", groupUrl: "https://chat.whatsapp.com/test-group" });
  });

  it("does not resend the confirmation email when already verified", async () => {
    const id = await firstId();
    await adminCaller().registration.adminUpdateStatus({ id, paymentStatus: "verified" });
    sendPaymentVerifiedEmail.mockClear();
    const result = await adminCaller().registration.adminUpdateStatus({ id, paymentStatus: "verified" });
    expect(result.emailed).toBe(false);
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("rejects a payment without emailing anything", async () => {
    const id = await firstId();
    const result = await adminCaller().registration.adminUpdateStatus({ id, paymentStatus: "rejected" });
    expect(result.emailed).toBe(false);
    const stored = await (await getStore()).findById(id);
    expect(stored).toMatchObject({ paymentStatus: "rejected", verificationStatus: "rejected" });
    expect(sendPaymentVerifiedEmail).not.toHaveBeenCalled();
  });

  it("confirms a family payment only when the bank amount matches the family total", async () => {
    const created = await caller().registration.createFamily({
      registrationType: "family",
      guardianPhone: "0805 778 2932",
      guardianEmail: "family@example.com",
      consentToEmail: true,
      participants: [
        { studentName: "Maryam Ibrahim", schoolClass: "Basic 4" },
        { studentName: "Yusuf Ibrahim", schoolClass: "SS 1" },
      ],
    });
    const lead = (await (await getStore()).findByFamilyCode(created.familyCode!)).find(row => row.familyPaymentLead)!;
    await expect(adminCaller().registration.adminUpdateStatus({ id: lead.id, paymentStatus: "verified" })).rejects.toThrow(/bank-confirmed amount/i);
    await expect(
      adminCaller().registration.adminUpdateStatus({ id: lead.id, paymentStatus: "verified", actualAmountNgn: (created.feeNgn ?? 0) - 1 }),
    ).rejects.toThrow(/does not match/i);

    sendPaymentVerifiedEmail.mockClear();
    const result = await adminCaller().registration.adminUpdateStatus({
      id: lead.id,
      paymentStatus: "verified",
      actualAmountNgn: created.feeNgn ?? 0,
    });
    expect(result.emailed).toBe(true);
    expect(sendPaymentVerifiedEmail).toHaveBeenCalledOnce();
    expect(sendPaymentVerifiedEmail.mock.calls[0][1]).toMatchObject({
      registrationNumber: created.familyCode,
      classGroup: "Family",
      feeNgn: created.feeNgn,
    });
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

  it("adminSession reflects a present admin context", async () => {
    const session = await adminCaller().auth.adminSession();
    expect(session.isAdmin).toBe(true);
    expect(session.email).toBe("ibnmarzuk207@gmail.com");
  });
});
