// Platform values are read at use time. See the Webdev service/authentication skills.
export const ENV = {
  get appId() { return process.env.MANUS_PROJECT_ID ?? ""; },
  get cookieSecret() { return process.env.MANUS_JWT_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get oAuthServerUrl() { return process.env.MANUS_OAUTH_API_URL ?? ""; },
  // Preserve the legacy hint when supplied; otherwise roles remain application data.
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.MANUS_API_URL ?? ""; },
  get forgeApiKey() { return process.env.MANUS_API_KEY ?? ""; },

  // --- Email delivery (Resend) -------------------------------------------
  // Server-only. These are never exposed through publicConfig.ts and must not
  // be referenced from client/ code.
  /** Resend API key, `re_...`. Server-side only. */
  get resendApiKey() { return process.env.RESEND_API_KEY ?? ""; },
  /** Verified sender, e.g. `Hope-Alive <ivc@your-verified-domain.org>`. */
  get resendFromEmail() { return process.env.RESEND_FROM_EMAIL ?? ""; },
  /** Optional Reply-To shown to recipients, e.g. a monitored inbox. */
  get resendReplyTo() { return process.env.RESEND_REPLY_TO ?? ""; },
  /** Public base URL of this site, used to build links inside emails. */
  get appUrl() { return (process.env.APP_URL ?? "").replace(/\/+$/, ""); },

  // --- Receipt verification (Claude) ------------------------------------
  // Server-only. The SDK reads ANTHROPIC_API_KEY itself; this getter exists so
  // the app can degrade gracefully (queue for manual review) when it is unset.
  get anthropicApiKey() { return process.env.ANTHROPIC_API_KEY ?? ""; },
  /** Model that reads receipts. Override only to pin a different Claude model. */
  get receiptModel() { return process.env.RECEIPT_VERIFICATION_MODEL || "claude-opus-5"; },
  /** Expected fee in naira. `null` when unset — the amount check is then skipped. */
  get registrationFeeNgn() {
    const value = Number(process.env.REGISTRATION_FEE_NGN ?? "");
    return Number.isFinite(value) && value > 0 ? value : null;
  },
  /** Group invite link. Returned to the browser only for verified registrations. */
  get whatsappGroupUrl() { return process.env.WHATSAPP_GROUP_URL ?? ""; },
};
