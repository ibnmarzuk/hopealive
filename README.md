# Hope-Alive Islamic Vacation Course

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

## Configuration

Copy `.env.example` to `.env` and fill it in. `.env` is gitignored — never commit real secrets.

Required for the registration flow to work end to end:

| Variable | Purpose | Without it |
| --- | --- | --- |
| `DATABASE_URL` | MySQL connection | Registration returns "temporarily unavailable" |
| `RESEND_API_KEY` | Resend API key, server-side only | Registrations still save; `emailStatus` is `skipped` |
| `RESEND_FROM_EMAIL` | Sender on a domain **verified in Resend** | Same as above |
| `APP_URL` | Public base URL | Confirmation email omits the "continue" link |

`RESEND_REPLY_TO` is optional. The Resend key is read only in `server/email/resend.ts`; it is never
added to `server/_core/publicConfig.ts`, so it cannot reach the browser.

Run `pnpm db:migrate` after setting `DATABASE_URL` to apply migration `0002`, which adds
`guardianEmail`, the `dedupeKey` unique index used for duplicate prevention, and the email
delivery columns.

## Registration and email flow

1. The browser validates against `shared/registration.ts` (the same schema the server uses).
2. `registration.create` rate-limits, re-validates, and rejects duplicates — a duplicate is the
   same normalised name + phone + class, so siblings and class changes still register.
3. The registration is committed to MySQL.
4. Only then is the confirmation email sent through Resend. **A delivery failure never rolls back a
   saved registration**: the row keeps `emailStatus` `failed`/`skipped` plus a short reason, and the
   admin dashboard offers a Resend action.
5. The UI reports the real outcome. `emailStatus: "sent"` means Resend *accepted* the message, not
   that it was delivered — the copy to the user says so.

### Verification not covered by `pnpm test`

`pnpm test` runs 64 tests, including the registration procedures against a fake DB and a mocked
Resend. These still need live credentials and a manual check:

- Writing to a real MySQL instance (persistence, the `dedupeKey` unique index under real concurrency,
  and migration `0002` against existing rows).
- A real Resend send: set `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`, register once, and
  confirm the message appears in the Resend dashboard and the inbox.
- Sender-domain SPF/DKIM must be verified in Resend, or sends are rejected with an unverified-domain
  error (surfaced in the admin dashboard's Email column).

Start with the Webdev skill's default-template guide. Platform login, storage, payments and service contracts live in its shared references; read the relevant capability before extending its helper.

`server/_core/publicConfig.ts` exposes only named public runtime values. Private keys stay server-side. The platform serves managed `/manus-storage/` assets; the application does not register a second proxy.

Platform configuration is readable and editable through `webdev.config`. Default settings are initial values, not enforced constraints. The agent may modify the files, commands and configuration or follow the flexible guide for another stack.
