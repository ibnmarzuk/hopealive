import { Resend } from "resend";
import { ENV } from "../_core/env";
import {
  paymentVerifiedEmailHtml,
  paymentVerifiedEmailSubject,
  paymentVerifiedEmailText,
  registrationEmailHtml,
  registrationEmailSubject,
  registrationEmailText,
  type PaymentVerifiedEmailData,
  type RegistrationEmailData,
} from "./templates";

/**
 * Resend integration.
 *
 * Rules this module enforces:
 *  - The API key is read from the environment at call time and never leaves the
 *    server. Nothing here is importable from client/ (it would pull in the SDK).
 *  - Sending never throws into the registration path. A saved registration must
 *    survive a Resend outage, so every failure is returned as a value.
 *  - Diagnostics are logged without the API key and with the recipient masked.
 */

export type SendResult =
  | { status: "sent"; messageId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

let client: Resend | null = null;
let clientKey = "";

function getClient(): Resend | null {
  const key = ENV.resendApiKey;
  if (!key) return null;
  // Rebuild if the key changed (tests, credential rotation).
  if (!client || clientKey !== key) {
    client = new Resend(key);
    clientKey = key;
  }
  return client;
}

/** True when both the API key and a verified sender address are configured. */
export function isEmailConfigured(): boolean {
  return Boolean(ENV.resendApiKey && ENV.resendFromEmail);
}

/** Explains what is missing, for startup logs and the admin view. */
export function emailConfigurationProblem(): string | null {
  if (!ENV.resendApiKey) return "RESEND_API_KEY is not set";
  if (!ENV.resendFromEmail) return "RESEND_FROM_EMAIL is not set";
  return null;
}

/** `aisha@example.com` -> `ai***@example.com`. Keeps logs useful but not a PII dump. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

/** Trims an error to something safe to persist and show to an admin. */
function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; name?: unknown };
    if (typeof maybe.message === "string" && maybe.message.trim()) return maybe.message.trim().slice(0, 240);
    if (typeof maybe.name === "string" && maybe.name.trim()) return maybe.name.trim().slice(0, 240);
  }
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 240);
  return "Unknown email delivery error";
}

type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Stable key so a double-submit cannot send the same message twice. */
  idempotencyKey: string;
  /** Short label for logs, e.g. "registration MIDDLE-014". */
  label: string;
  /** Threading hint for mail clients. */
  refId: string;
};

async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const problem = emailConfigurationProblem();
  if (problem) {
    console.warn(`[Email] Skipped ${message.label} email for ${maskEmail(message.to)}: ${problem}.`);
    return { status: "skipped", reason: problem };
  }

  const resend = getClient();
  if (!resend) return { status: "skipped", reason: "RESEND_API_KEY is not set" };

  try {
    const { data: result, error } = await resend.emails.send(
      {
        from: ENV.resendFromEmail,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(ENV.resendReplyTo ? { replyTo: ENV.resendReplyTo } : {}),
        headers: { "X-Entity-Ref-ID": message.refId },
      },
      { idempotencyKey: message.idempotencyKey },
    );

    if (error) {
      const reason = describeError(error);
      console.error(`[Email] Resend rejected ${message.label} for ${maskEmail(message.to)}: ${reason}`);
      return { status: "failed", reason };
    }

    if (!result?.id) {
      console.error(`[Email] Resend returned no message id for ${message.label}.`);
      return { status: "failed", reason: "Resend returned no message id" };
    }

    // The API accepted the message. Delivery is still asynchronous — this is
    // "handed to Resend", not "landed in the inbox".
    console.log(`[Email] Queued ${message.label} to ${maskEmail(message.to)} (resend id ${result.id}).`);
    return { status: "sent", messageId: result.id };
  } catch (error) {
    const reason = describeError(error);
    console.error(`[Email] Failed to call Resend for ${message.label}: ${reason}`);
    return { status: "failed", reason };
  }
}

/**
 * Sends the registration confirmation.
 *
 * The idempotency key defaults to the registration number, so a double-submit
 * cannot produce two confirmation emails. An explicit admin retry passes its
 * own suffix because the whole point there is to send the message again.
 */
export async function sendRegistrationEmail(
  to: string,
  data: RegistrationEmailData,
  options: { idempotencySuffix?: string } = {},
): Promise<SendResult> {
  const base = `registration-${data.registrationNumber}`;
  return sendEmail({
    to,
    subject: registrationEmailSubject(data),
    html: registrationEmailHtml(data),
    text: registrationEmailText(data),
    idempotencyKey: options.idempotencySuffix ? `${base}-${options.idempotencySuffix}` : base,
    label: `registration ${data.registrationNumber}`,
    refId: data.registrationNumber,
  });
}

/**
 * Sends the payment-confirmed email, which carries the group invite link.
 * Keyed on the registration so re-verifying cannot resend it by accident.
 */
export async function sendPaymentVerifiedEmail(
  to: string,
  data: PaymentVerifiedEmailData,
  options: { idempotencySuffix?: string } = {},
): Promise<SendResult> {
  const base = `payment-verified-${data.registrationNumber}`;
  return sendEmail({
    to,
    subject: paymentVerifiedEmailSubject(data),
    html: paymentVerifiedEmailHtml(data),
    text: paymentVerifiedEmailText(data),
    idempotencyKey: options.idempotencySuffix ? `${base}-${options.idempotencySuffix}` : base,
    label: `payment-verified ${data.registrationNumber}`,
    refId: `${data.registrationNumber}-verified`,
  });
}
