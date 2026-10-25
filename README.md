# Hope-Alive Islamic Vacation Course

Hope-Alive's camp registration and administration app, built with React, Express, tRPC,
and Drizzle.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

## Configuration

Copy `.env.example` to `.env` and fill it in. `.env` is gitignored — never commit real secrets.

Required for the registration flow to work end to end:

| Variable | Purpose | Without it |
| --- | --- | --- |
| `DATABASE_URL` or `POSTGRES_URL` | Supabase/PostgreSQL connection string | Registration returns "temporarily unavailable" |
| `RESEND_API_KEY` | Resend API key, server-side only | Registrations still save; `emailStatus` is `skipped` |
| `RESEND_FROM_EMAIL` | Sender on a domain **verified in Resend** | Same as above |
| `APP_URL` | Public base URL | Confirmation email omits the "continue" link |

`RESEND_REPLY_TO` is optional. The Resend key is read only in `server/email/resend.ts` and is
never sent to the browser.

Run `pnpm db:migrate` after setting `DATABASE_URL` or `POSTGRES_URL` to create the PostgreSQL
schema. The checked-in migrations are the source of truth for a new Supabase database.

## Registration and email flow

1. The browser validates against `shared/registration.ts` (the same schema the server uses).
2. Families of 2–6 children register together via `registration.createFamily`. Each child gets a
   class-group ID (`MIDDLE-001`); the family shares one `HA-…` passkey for a single payment and
   receipt. Email is optional.
3. `registration.create` / `createFamily` rate-limit, re-validate, and reject duplicates — a
   duplicate is the same normalised name + phone + class, so siblings and class changes still
   register.
4. The registration is committed to PostgreSQL.
5. Only then is the confirmation email sent through Resend, and only if the guardian opted in.
   **A delivery failure never rolls back a saved registration**: the row keeps `emailStatus`
   `failed`/`skipped` plus a short reason, and the admin dashboard offers a Resend action.
6. The UI reports the real outcome. `emailStatus: "sent"` means Resend *accepted* the message, not
   that it was delivered — the copy to the user says so.
7. After registration, the family or participant can print/save a camp pass with participant IDs,
   class groups, saved fees, and the current payment/receipt status. Receipt upload remains evidence
   for review; the pass clearly says payment is pending until staff confirms it.
8. Confirming payment automatically marks the participant eligible for camp entitlements. Admin
   staff can then mark the participant checked in; the app records who and when. Eligibility is
   not a record that supplies were physically issued.

### Admin roles

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the super-admin, and `SUB_ADMIN_EMAIL` and
`SUB_ADMIN_PASSWORD` for the limited sub-admin. Both accounts use the signed `ADMIN_SESSION_SECRET`
cookie. Sub-admins can view registrations and receipts, confirm/reject payments, and check in
participants; only super-admins can resend registration emails and manage other payment statuses.
Configure credentials as private server environment variables and choose a strong password.

### Verification not covered by `pnpm test`

`pnpm test` runs 100 tests, including the registration procedures against a fake DB and a mocked
Resend. These still need live credentials and a manual check:

- Writing to a real Supabase/PostgreSQL instance (persistence and the `dedupeKey` unique index under
  real concurrency).
- A real Resend send: set `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`, register once, and
  confirm the message appears in the Resend dashboard and the inbox.
- Sender-domain SPF/DKIM must be verified in Resend, or sends are rejected with an unverified-domain
  error (surfaced in the admin dashboard's Email column).
