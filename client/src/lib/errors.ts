import { TRPCClientError } from "@trpc/client";

/**
 * Turns any thrown error into a message safe to show a user.
 *
 * The important case: when an API call hits a non-JSON response (the platform's
 * "A server error has occurred" page, an HTML 502, a dropped connection), the
 * tRPC client throws a raw `Unexpected token 'A', "A server e"... is not valid
 * JSON` — leaking internals and confusing people. We catch those shapes and
 * return a plain, reassuring sentence instead. Genuine tRPC errors (validation,
 * not-found, rate limits) already carry good messages and pass straight through.
 */
const UNFRIENDLY = [
  "is not valid json",
  "unexpected token",
  "unexpected end of json",
  "failed to fetch",
  "networkerror",
  "load failed",
  "fetch failed",
  "err_",
];

const SERVER_UNREACHABLE = "We couldn't reach the server just now. Please check your connection and try again in a moment.";

export function friendlyErrorMessage(error: unknown, fallback = SERVER_UNREACHABLE): string {
  const raw =
    error instanceof TRPCClientError || error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (UNFRIENDLY.some(marker => normalized.includes(marker))) return fallback;
  return raw.trim();
}
