# HopeAlive project instructions

For every interface design, UI bug fix, responsive improvement, accessibility review, registration UX change, receipt upload flow, or admin dashboard change, load and follow `.claude/skills/hopealive-ui-ux/SKILL.md`.

Use the UI/UX Pro Max design intelligence skill when available. Official source and installation instructions: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill. For this project, install it with `npx ui-ux-pro-max-cli init --ai claude`, then restart Claude Code. Do not claim it is installed until the skill files and search scripts are present.

## Non-negotiable safeguards
- Preserve existing backend contracts, database schema, migrations, auth, admin roles, registration, payment, receipt review, and email behavior.
- Never add AI receipt verification, automatic payment approval, or database migrations without explicit authorization.
- Registration must remain saved before payment.
- Never fabricate testimonials, metrics, participant photos, or impact claims.
- Keep the existing HopeAlive green and cream identity, Newsreader editorial typography, and accessible responsive design.
- Run `pnpm check`, `pnpm test`, and `pnpm build` when available and report the real outcomes.
