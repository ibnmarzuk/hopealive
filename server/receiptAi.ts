import { z } from "zod";

const geminiResponseSchema = z.object({
  isReceipt: z.boolean(),
  paymentStatus: z.enum(["successful", "pending", "failed", "unknown"]),
  bankOrPlatform: z.string().nullable().optional(),
  senderName: z.string().nullable().optional(),
  receiverName: z.string().nullable().optional(),
  receiverAccountNumber: z.string().nullable().optional(),
  amountNgn: z.number().nullable().optional(),
  transactionDateTime: z.string().nullable().optional(),
  transactionReference: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()).default([]),
});

export type ReceiptAnalysis = {
  decision: "pass" | "review" | "rejected";
  isReceipt: boolean;
  paymentStatus: "successful" | "pending" | "failed" | "unknown";
  bankOrPlatform: string | null;
  senderName: string | null;
  receiverName: string | null;
  receiverAccountNumber: string | null;
  amountNgn: number | null;
  transactionDateTime: string | null;
  transactionReference: string | null;
  confidence: number;
  reasons: string[];
  checkedAt: string;
  transactionAgeMinutes: number | null;
};

type AnalyzeInput = {
  imageDataUrl: string;
  expectedAmountNgn: number;
  paymentDetails: { accountName: string; accountNumber: string; bank: string };
  submittedAt: Date;
};

const MAX_RECEIPT_AGE_MINUTES = 24 * 60;
const FUTURE_TOLERANCE_MINUTES = 10;

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function analyzePaymentReceipt(input: AnalyzeInput): Promise<ReceiptAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const match = input.imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error("Unsupported receipt image format");

  const prompt = [
    "You are a careful payment-receipt screening assistant for a Nigerian camp registration website.",
    "Inspect the attached image. Do not assume it is a receipt. It must visibly resemble a bank transfer or payment confirmation receipt.",
    "Extract only information that is actually visible. Never invent missing values.",
    'Return JSON with exactly these fields: {"isReceipt":boolean,"paymentStatus":"successful"|"pending"|"failed"|"unknown","bankOrPlatform":string|null,"senderName":string|null,"receiverName":string|null,"receiverAccountNumber":string|null,"amountNgn":number|null,"transactionDateTime":string|null,"transactionReference":string|null,"confidence":number,"notes":string[]}.',
    "Use a number for amountNgn, in naira, without currency symbols. Use an ISO 8601 timestamp with timezone if enough information is visible; otherwise null.",
    "Mark isReceipt false for unrelated photographs, memes, blank images, or non-payment documents. Receipts from any Nigerian bank or wallet are acceptable.",
    "Do not decide that funds actually arrived. Never guess missing account details.",
    "Expected recipient details: bank " + input.paymentDetails.bank + ", account name " + input.paymentDetails.accountName + ", account number " + input.paymentDetails.accountNumber + ". Expected amount: NGN " + input.expectedAmountNgn + ".",
  ].join("\n");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: match[1], data: match[2] } }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[Receipt AI] Gemini API returned", response.status, detail.slice(0, 500));
    throw new Error("Gemini receipt screening request failed");
  }

  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim();
  if (!raw) throw new Error("Gemini returned an empty receipt analysis");
  let parsed: z.infer<typeof geminiResponseSchema>;
  try { parsed = geminiResponseSchema.parse(JSON.parse(raw)); }
  catch { throw new Error("Gemini returned an invalid receipt analysis"); }

  const reasons = [...parsed.notes];
  let decision: ReceiptAnalysis["decision"] = "pass";
  const amount = typeof parsed.amountNgn === "number" && Number.isFinite(parsed.amountNgn) ? parsed.amountNgn : null;
  const receiverName = clean(parsed.receiverName);
  const receiverAccountNumber = clean(parsed.receiverAccountNumber);
  const reference = clean(parsed.transactionReference);
  const transactionDateTime = clean(parsed.transactionDateTime);

  if (!parsed.isReceipt) {
    decision = "rejected";
    reasons.push("The uploaded image does not appear to be a payment receipt.");
  } else if (parsed.paymentStatus === "failed" || parsed.paymentStatus === "pending") {
    decision = "rejected";
    reasons.push("The receipt does not show a completed successful payment.");
  }
  if (amount !== null && amount !== input.expectedAmountNgn) {
    decision = "rejected";
    reasons.push("The amount shown (₦" + amount.toLocaleString("en-NG") + ") does not match the expected ₦" + input.expectedAmountNgn.toLocaleString("en-NG") + ".");
  } else if (amount === null && decision !== "rejected") {
    decision = "review";
    reasons.push("The payment amount could not be read clearly.");
  }

  const expectedName = normalize(input.paymentDetails.accountName);
  const observedName = receiverName ? normalize(receiverName) : "";
  if (observedName && !expectedName.includes(observedName) && !observedName.includes(expectedName)) {
    decision = "rejected";
    reasons.push("The receiver name does not match the official Hope-Alive account.");
  } else if (!observedName && decision !== "rejected") {
    decision = "review";
    reasons.push("The receiver name is not visible enough to confirm.");
  }
  if (receiverAccountNumber && receiverAccountNumber.replace(/\D/g, "") !== input.paymentDetails.accountNumber.replace(/\D/g, "")) {
    decision = "rejected";
    reasons.push("The receiver account number does not match Hope-Alive's official account.");
  }

  let transactionAgeMinutes: number | null = null;
  if (transactionDateTime) {
    const transactionDate = new Date(transactionDateTime);
    if (Number.isNaN(transactionDate.getTime())) {
      if (decision !== "rejected") decision = "review";
      reasons.push("The transaction date and time could not be interpreted.");
    } else {
      transactionAgeMinutes = Math.round((input.submittedAt.getTime() - transactionDate.getTime()) / 60000);
      if (transactionAgeMinutes < -FUTURE_TOLERANCE_MINUTES) {
        decision = "rejected";
        reasons.push("The transaction timestamp is in the future.");
      } else if (transactionAgeMinutes > MAX_RECEIPT_AGE_MINUTES) {
        decision = "rejected";
        reasons.push("This receipt is older than the allowed 24-hour submission window.");
      }
    }
  } else if (decision !== "rejected") {
    decision = "review";
    reasons.push("The transaction date and time are not visible.");
  }
  if (!reference && decision !== "rejected") {
    decision = "review";
    reasons.push("A transaction reference could not be identified.");
  }
  if (parsed.paymentStatus !== "successful" && decision !== "rejected") {
    decision = "review";
    reasons.push("The payment status needs a human check.");
  }
  if (parsed.confidence < 0.7 && decision === "pass") {
    decision = "review";
    reasons.push("The AI confidence is not high enough for an initial pass.");
  }

  return {
    decision,
    isReceipt: parsed.isReceipt,
    paymentStatus: parsed.paymentStatus,
    bankOrPlatform: clean(parsed.bankOrPlatform),
    senderName: clean(parsed.senderName),
    receiverName,
    receiverAccountNumber,
    amountNgn: amount,
    transactionDateTime,
    transactionReference: reference,
    confidence: parsed.confidence,
    reasons: [...new Set(reasons)],
    checkedAt: input.submittedAt.toISOString(),
    transactionAgeMinutes,
  };
}
