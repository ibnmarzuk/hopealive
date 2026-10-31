---
name: hopealive-ui-ux
description: Use for any HopeAlive website UI, UX, responsive layout, accessibility, visual design, forms, donor flows, registration, payment receipt upload, admin dashboard, or interface bug fixing.
---

# HopeAlive UI/UX implementation skill

## Mission
Improve HopeAlive's interface with a polished, trustworthy, accessible experience while preserving existing product behavior.

## Project context
HopeAlive is the Islamic Vacation Course 2026 registration and administration app. The current stack is React 19, TypeScript, Vite, Wouter, Tailwind CSS 4, Radix UI, Lucide, Express, tRPC, Drizzle, PostgreSQL/Supabase, and Resend.

## Design direction
- Preserve the existing HopeAlive identity: deep forest green, warm cream, muted olive, restrained brass accents, and editorial serif headlines using Newsreader.
- Aim for calm, credible, community-centered design. Avoid generic AI gradients, neon, excessive glassmorphism, noisy animations, and decorative elements that weaken clarity.
- Use clear hierarchy, purposeful whitespace, readable line lengths, consistent spacing, strong contrast, and deliberate responsive layouts.
- Keep every interaction usable with keyboard, touch, and screen readers. Use visible focus states, meaningful labels, accessible names, and reduced-motion support.
- Prefer the existing Lucide icon set and existing approved project assets. Do not invent testimonials, impact statistics, participant photos, or claims.
- Check every supplied image path and asset reference. Fix broken or missing visuals rather than hiding them or replacing them with fabricated evidence.

## Critical product constraints
Do not break or rewrite backend behavior, database schema, migrations, API contracts, authentication, admin roles, registration and payment logic, or receipt review workflows.
- Registration is saved before payment.
- One participant has a registration ID. A family of up to six can share a passkey and payment while each child keeps an individual ID.
- Payment receipt uploads are evidence for manual staff review. Never claim an uploaded receipt is verified automatically.
- Keep optional donations separate from required registration fees.
- Admin access and permissions must remain unchanged.
- Email is optional. Email delivery failure must not roll back a saved registration.
- Do not add migrations, AI payment verification, or automatic receipt approval.

## Workflow
1. Inspect the relevant page, shared styles, components, existing tests, and asset paths before editing.
2. If the official UI/UX Pro Max skill is installed, use its design-system search and stack-specific guidance. If it is not installed, tell the developer how to install it; do not pretend its database or scripts are present.
3. Identify concrete visual or interaction defects before changing code. Prefer small, coherent fixes over a wholesale rewrite.
4. Implement the selected improvements in the existing architecture. Avoid unnecessary new dependencies.
5. Verify mobile widths around 360px, 390px, 768px, 1024px, and desktop. Check keyboard focus, labels, contrast, loading, empty, error, and success states.
6. Run `pnpm check`, `pnpm test`, and `pnpm build` when the environment supports it. Report the actual result of each command. Never claim a check passed if it was not run.
7. Review the diff for unintended business-logic, schema, security, or content changes before delivery.

## Finish criteria
Deliver a visually coherent, responsive interface that remains truthful and functional. Summarize files changed, the defects fixed, checks run, and any remaining risks.
