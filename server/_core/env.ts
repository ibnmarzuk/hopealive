export const ENV = {
  get databaseUrl() { return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },

  // --- Email delivery (Resend) -------------------------------------------
  // Server-only. These must not be referenced from client/ code.
  /** Resend API key, `re_...`. Server-side only. */
  get resendApiKey() { return process.env.RESEND_API_KEY ?? ""; },
  /** Verified sender, e.g. `Hope-Alive <ivc@your-verified-domain.org>`. */
  get resendFromEmail() { return process.env.RESEND_FROM_EMAIL ?? ""; },
  /** Optional Reply-To shown to recipients, e.g. a monitored inbox. */
  get resendReplyTo() { return process.env.RESEND_REPLY_TO ?? ""; },
  /** Public base URL of this site, used to build links inside emails. */
  get appUrl() { return (process.env.APP_URL ?? "").replace(/\/+$/, ""); },

  // --- Payment / registration -------------------------------------------
  /** Group invite link. Returned to the browser only for verified registrations. */
  get whatsappGroupUrl() { return process.env.WHATSAPP_GROUP_URL ?? ""; },

  // --- Admin login (email + password) -----------------------------------
  // Server-only. See server/_core/adminAuth.ts.
  get adminEmail() { return process.env.ADMIN_EMAIL ?? ""; },
  get adminPassword() { return process.env.ADMIN_PASSWORD ?? ""; },
  get subAdminEmail() { return process.env.SUB_ADMIN_EMAIL ?? ""; },
  get subAdminPassword() { return process.env.SUB_ADMIN_PASSWORD ?? ""; },
  /** Secret used to sign the admin session cookie. Use a long random string. */
  get adminSessionSecret() { return process.env.ADMIN_SESSION_SECRET ?? ""; },
};
