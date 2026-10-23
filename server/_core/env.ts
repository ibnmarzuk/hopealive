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

  // --- Payment / registration -------------------------------------------
  /** Registration fee in naira, shown to users on the payment page. `null` if unset. */
  get registrationFeeNgn() {
    const value = Number(process.env.REGISTRATION_FEE_NGN ?? "");
    return Number.isFinite(value) && value > 0 ? value : null;
  },
  /** Group invite link. Returned to the browser only for verified registrations. */
  get whatsappGroupUrl() { return process.env.WHATSAPP_GROUP_URL ?? ""; },

  // --- Admin login (email + password) -----------------------------------
  // Server-only. Never exposed through publicConfig.ts. See server/_core/adminAuth.ts.
  get adminEmail() { return process.env.ADMIN_EMAIL ?? ""; },
  get adminPassword() { return process.env.ADMIN_PASSWORD ?? ""; },
  /** Secret used to sign the admin session cookie. Use a long random string. */
  get adminSessionSecret() { return process.env.ADMIN_SESSION_SECRET ?? ""; },
};
