# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Guardians and families registering participants for the Hope-Alive Islamic Vacation Course (IVC).
- Participants who use their registration IDs or family passkeys when checking in at camp.
- Staff who review payments, manage registrations, and check participants in.
- People who choose to make an optional donation.

## Product Purpose

Hope-Alive's website supports the IVC 2026 camping programme in Ilorin. It lets families save a participant or family registration before paying, submit payment evidence for staff review, and use the saved registration details at camp. Staff use an authenticated dashboard to verify payments and record arrival. The website also provides programme information and optional donation instructions.

## Positioning

Registration is saved before payment. Families registering two to six children can use one family passkey and one transfer while each child retains an individual registration ID. Payment evidence is reviewed by staff; an uploaded receipt does not itself confirm payment.

## Operating Context

- Public visitors use the site to learn about the programme, register, pay by bank transfer, and optionally upload a receipt image.
- Staff review participant and family records, confirm or reject payments, and record camp check-in.
- The camp pass is intended to be printable or saved and presented at the registration desk.
- Confirmed camp facts to preserve from the existing website: 23–28 December 2026; Ethical College, behind Okin Filling Station, opposite Agric, Zango Road, Ilorin; WhatsApp support at 08057782932.
- Donation instructions shown on the website identify Hope-alive Muslim Found., Jaiz Bank, account 0019871510. Do not imply automatic donation processing or verification.

## Capabilities and Constraints

- The existing stack is React, Express, tRPC, and Drizzle with PostgreSQL/Supabase.
- Preserve the existing Supabase project and database integration; do not create a replacement project or perform unrelated schema changes.
- The local `.env` has no `DATABASE_URL` or `POSTGRES_URL` configured, so local live database behavior cannot currently be verified.
- Admin access uses the existing server-side super-admin and sub-admin roles. Authorization must remain enforced by the server.
- Receipt uploads are evidence for manual review and must never automatically verify payment.
- Confirmed payment makes participants eligible for camp entitlements. Camp check-in records arrival separately.
- Preserve existing registration IDs, family passkeys, payment behavior, and participant data handling.

## Brand Commitments

- The user-approved direction is forest green, warm cream and off-white, with restrained gold or muted orange accents.
- Use readable editorial typography, a welcoming and trustworthy Islamic educational context, and clear product-interface patterns.
- Avoid generic charity-template styling, excessive religious decoration, unverified claims, and invented participant stories or impact statistics.
- Existing Hope-Alive name and local brand assets should be retained where appropriate.

## Evidence on Hand

- Existing program information and workflows in `client/src/pages/Home.tsx`, `client/src/pages/Registration.tsx`, and `client/src/pages/Admin.tsx`.
- Existing visual assets: `client/public/hopealive-logo.svg`, `client/public/islamic-camp-environment.svg`, and `client/public/hopealive-classroom.jpg`.
- No approved testimonials, impact statistics, or participant photographs have been identified; do not fabricate them.
- Existing automated tests cover registration, admin authentication, email, and rate limiting. Live Supabase verification requires a configured database URL.

## Product Principles

1. Make the next registration step and the actual payment state unmistakable.
2. Preserve participant and family details across registration, payment review, and camp check-in.
3. Keep payment verification and entitlement eligibility tied to staff-confirmed payment.
4. Make public registration and staff workflows usable on mobile and accessible by keyboard.
5. Distinguish optional donations from registration fees and be transparent about what the website can verify.

## Accessibility & Inclusion

Support keyboard navigation, visible focus, accessible labels and status messages, sufficient contrast, reduced motion, and responsive layouts including small mobile screens. Keep registration and payment instructions readable without relying on color alone.
