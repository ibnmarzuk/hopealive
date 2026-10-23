import { describe, expect, it } from "vitest";
import { MAX_RECEIPT_DATA_URL_CHARS, receiptUploadSchema } from "@shared/registration";
import {
  describeVerdictForUser,
  judgeReceipt,
  parseImageDataUrl,
  recipientNameLooksRight,
  type ReceiptExtraction,
} from "./receipt/analyze";

/**
 * The verdict rules are plain code on purpose — these tests pin them down so a
 * prompt tweak or model change can never silently loosen who gets verified.
 */

const expected = {
  accountNumber: "0019871510",
  accountName: "Hope-alive Muslim Found.",
  bank: "Jaiz Bank",
  feeNgn: 5000,
};
const meta = { model: "claude-opus-5", analyzedAt: "2026-10-22T20:00:00.000Z" };

const clean: ReceiptExtraction = {
  isBankTransferReceipt: true,
  transactionStatus: "successful",
  amount: 5000,
  currency: "NGN",
  recipientAccountNumber: "0019871510",
  recipientName: "HOPE-ALIVE MUSLIM FOUNDATION",
  recipientBank: "Jaiz Bank",
  senderName: "Aisha Ibrahim",
  reference: "TRX-000123",
  transactionDate: "2026-10-20T10:12:00Z",
  legibility: "clear",
  tamperingSigns: false,
  extractionConfidence: 0.96,
  notes: "",
};

const judge = (overrides: Partial<ReceiptExtraction>, exp = expected) => judgeReceipt({ ...clean, ...overrides }, exp, meta);

describe("judgeReceipt — verified", () => {
  it("verifies a clear, successful transfer to the right account for at least the fee", () => {
    const analysis = judge({});
    expect(analysis.verdict).toBe("verified");
    expect(analysis.checks).toEqual({
      isBankTransferReceipt: true,
      accountNumberMatches: true,
      recipientNameMatches: true,
      amountSufficient: true,
      transferSuccessful: true,
    });
    expect(analysis.confidence).toBe(0.96);
    expect(analysis.model).toBe("claude-opus-5");
  });

  it("accepts an overpayment", () => {
    expect(judge({ amount: 7500 }).verdict).toBe("verified");
  });

  it("matches the account number even when the receipt spaces or dashes it", () => {
    expect(judge({ recipientAccountNumber: "0019 871 510" }).verdict).toBe("verified");
    expect(judge({ recipientAccountNumber: "0019-871-510" }).checks.accountNumberMatches).toBe(true);
  });

  it("tolerates truncated or re-punctuated recipient names", () => {
    expect(judge({ recipientName: "HOPEALIVE MUSLIM FOUND" }).verdict).toBe("verified");
    expect(judge({ recipientName: "Hope Alive Muslim Foundation Ltd" }).verdict).toBe("verified");
  });
});

describe("judgeReceipt — rejected", () => {
  it("rejects a payment to a different account", () => {
    const analysis = judge({ recipientAccountNumber: "0123456789" });
    expect(analysis.verdict).toBe("rejected");
    expect(analysis.checks.accountNumberMatches).toBe(false);
    expect(analysis.reasoning).toContain("does not match 0019871510");
  });

  it("rejects an amount below the fee", () => {
    expect(judge({ amount: 2000 }).verdict).toBe("rejected");
  });

  it("rejects a failed transfer", () => {
    expect(judge({ transactionStatus: "failed" }).verdict).toBe("rejected");
  });

  it("rejects an image that is not a receipt", () => {
    expect(judge({ isBankTransferReceipt: false }).verdict).toBe("rejected");
  });

  it("rejects an unreadable image", () => {
    expect(judge({ legibility: "unreadable" }).verdict).toBe("rejected");
  });
});

describe("judgeReceipt — needs_review (never auto-verified, never hard-rejected)", () => {
  it("routes a pending transfer to review", () => {
    expect(judge({ transactionStatus: "pending" }).verdict).toBe("needs_review");
  });

  it("routes a missing amount to review rather than rejecting", () => {
    const analysis = judge({ amount: null });
    expect(analysis.verdict).toBe("needs_review");
    expect(analysis.checks.amountSufficient).toBe(false);
  });

  it("routes a partly legible receipt to review even when the digits that are visible mismatch", () => {
    expect(judge({ legibility: "partial", recipientAccountNumber: "0123456789" }).verdict).toBe("needs_review");
  });

  it("routes a short account fragment to review instead of rejecting on OCR noise", () => {
    expect(judge({ recipientAccountNumber: "9871510" }).verdict).toBe("needs_review");
  });

  it("routes a right account with an unrecognised name to review", () => {
    const analysis = judge({ recipientName: "J. DOE ENTERPRISES" });
    expect(analysis.verdict).toBe("needs_review");
    expect(analysis.checks.recipientNameMatches).toBe(false);
  });

  it("routes possible tampering to review", () => {
    expect(judge({ tamperingSigns: true }).verdict).toBe("needs_review");
  });

  it("never auto-verifies when no fee is configured, and says why", () => {
    const analysis = judge({}, { ...expected, feeNgn: null });
    expect(analysis.verdict).toBe("needs_review");
    expect(analysis.checks.amountSufficient).toBeNull();
    expect(analysis.reasoning).toContain("No registration fee is configured");
  });

  it("surfaces the model's notes to the reviewer", () => {
    expect(judge({ tamperingSigns: true, notes: "Font around the amount differs." }).reasoning).toContain("Font around the amount differs.");
  });
});

describe("recipientNameLooksRight", () => {
  it("recognises common bank-app renderings of the account name", () => {
    for (const printed of ["HOPE-ALIVE MUSLIM FOUND.", "HOPEALIVE MUSLIM FOUNDATION", "Hope Alive", "HOPE-ALIVE MUSLIM FOUNDATI"]) {
      expect(recipientNameLooksRight(printed, expected.accountName), printed).toBe(true);
    }
  });

  it("does not match unrelated or empty names", () => {
    expect(recipientNameLooksRight("JOHN DOE", expected.accountName)).toBe(false);
    expect(recipientNameLooksRight("", expected.accountName)).toBe(false);
    expect(recipientNameLooksRight(null, expected.accountName)).toBe(false);
  });
});

describe("parseImageDataUrl", () => {
  it("accepts jpeg, png and webp data URLs", () => {
    expect(parseImageDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toEqual({ mediaType: "image/jpeg", data: "/9j/4AAQ" });
    expect(parseImageDataUrl("data:image/png;base64,iVBORw0KGgo=")?.mediaType).toBe("image/png");
    expect(parseImageDataUrl("data:image/webp;base64,UklGRg==")?.mediaType).toBe("image/webp");
  });

  it("rejects other formats and non-data inputs", () => {
    expect(parseImageDataUrl("data:image/gif;base64,R0lGOD")).toBeNull();
    expect(parseImageDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(parseImageDataUrl("https://example.com/receipt.jpg")).toBeNull();
    expect(parseImageDataUrl("data:image/png;base64,not base64!")).toBeNull();
  });
});

describe("describeVerdictForUser", () => {
  it("explains each rejection in plain terms without echoing model prose", () => {
    const wrongAccount = judge({ recipientAccountNumber: "0123456789", notes: "SECRET MODEL NOTE" });
    expect(describeVerdictForUser(wrongAccount)).toMatch(/different account number/i);
    expect(describeVerdictForUser(wrongAccount)).not.toContain("SECRET MODEL NOTE");

    expect(describeVerdictForUser(judge({ transactionStatus: "failed" }))).toMatch(/failed transfer/i);
    expect(describeVerdictForUser(judge({ isBankTransferReceipt: false }))).toMatch(/doesn't look like a payment receipt/i);
    expect(describeVerdictForUser(judge({ amount: 1000 }))).toMatch(/less than the registration fee/i);
    expect(describeVerdictForUser(judge({ legibility: "unreadable" }))).toMatch(/clearer one/i);
  });

  it("tells a reviewed user to expect an email", () => {
    expect(describeVerdictForUser(judge({ transactionStatus: "pending" }))).toMatch(/team member will confirm/i);
  });

  it("confirms a verified user", () => {
    expect(describeVerdictForUser(judge({}))).toMatch(/confirmed/i);
  });
});

describe("receiptUploadSchema", () => {
  const base = { registrationNumber: "MIDDLE-014", guardianPhone: "08057782932" };

  it("accepts a jpeg/png/webp data URL with the lookup fields", () => {
    expect(receiptUploadSchema.safeParse({ ...base, imageDataUrl: "data:image/jpeg;base64,/9j/4AAQ" }).success).toBe(true);
    expect(receiptUploadSchema.safeParse({ ...base, imageDataUrl: "data:image/webp;base64,UklGRg==" }).success).toBe(true);
  });

  it("rejects unsupported formats, missing images and oversized payloads", () => {
    expect(receiptUploadSchema.safeParse({ ...base, imageDataUrl: "data:image/gif;base64,R0lGOD" }).success).toBe(false);
    expect(receiptUploadSchema.safeParse({ ...base, imageDataUrl: "" }).success).toBe(false);
    expect(receiptUploadSchema.safeParse({ ...base, imageDataUrl: `data:image/png;base64,${"A".repeat(MAX_RECEIPT_DATA_URL_CHARS)}` }).success).toBe(false);
  });

  it("still validates the lookup fields", () => {
    expect(receiptUploadSchema.safeParse({ registrationNumber: "AB", guardianPhone: "08057782932", imageDataUrl: "data:image/png;base64,iVBORw0KGgo=" }).success).toBe(false);
  });
});
