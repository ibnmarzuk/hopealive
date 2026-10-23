import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emailConfigurationProblem, isEmailConfigured, maskEmail } from "./email/resend";
import { registrationEmailHtml, registrationEmailSubject, registrationEmailText } from "./email/templates";

const data = {
  studentName: "Aisha Ibrahim",
  registrationNumber: "MIDDLE-014",
  schoolClass: "Basic 4",
  classGroup: "Middle Class",
  guardianPhone: "08057782932",
  appUrl: "https://hopealive.example.org",
};

describe("email configuration", () => {
  const original = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL };

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  afterEach(() => {
    if (original.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = original.key;
    if (original.from === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = original.from;
  });

  it("reports the missing API key first", () => {
    expect(isEmailConfigured()).toBe(false);
    expect(emailConfigurationProblem()).toBe("RESEND_API_KEY is not set");
  });

  it("reports a missing sender once the key is present", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    expect(isEmailConfigured()).toBe(false);
    expect(emailConfigurationProblem()).toBe("RESEND_FROM_EMAIL is not set");
  });

  it("is configured when both are present", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "Hope-Alive <ivc@example.org>";
    expect(isEmailConfigured()).toBe(true);
    expect(emailConfigurationProblem()).toBeNull();
  });
});

describe("maskEmail", () => {
  it("keeps the domain but hides most of the local part", () => {
    expect(maskEmail("parent@example.com")).toBe("pa***@example.com");
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });

  it("does not leak anything for a malformed address", () => {
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
  });
});

describe("registration email template", () => {
  it("puts the registration number in the subject", () => {
    expect(registrationEmailSubject(data)).toContain("MIDDLE-014");
  });

  it("includes the key registration details in the HTML", () => {
    const html = registrationEmailHtml(data);
    expect(html).toContain("MIDDLE-014");
    expect(html).toContain("Aisha Ibrahim");
    expect(html).toContain("Basic 4");
    expect(html).toContain("0019871510");
    expect(html).toContain("23rd &ndash; 28th December, 2026".replace("&ndash;", "–"));
  });

  it("links back to the site when APP_URL is known", () => {
    expect(registrationEmailHtml(data)).toContain("https://hopealive.example.org/register?mode=continue");
  });

  it("omits the continue button when APP_URL is not configured", () => {
    const html = registrationEmailHtml({ ...data, appUrl: "" });
    expect(html).not.toContain("Continue my registration");
    expect(html).toContain("MIDDLE-014");
  });

  it("escapes HTML in participant names", () => {
    const html = registrationEmailHtml({ ...data, studentName: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("produces a plain-text alternative with the same number", () => {
    const text = registrationEmailText(data);
    expect(text).toContain("MIDDLE-014");
    expect(text).toContain("0019871510");
    expect(text).not.toContain("<");
  });

  it("states that the email is transactional, not marketing", () => {
    expect(registrationEmailHtml(data)).toContain("not a marketing list");
    expect(registrationEmailText(data)).toContain("not a marketing list");
  });
});
