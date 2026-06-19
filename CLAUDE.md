# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server (Vite HMR)
npm run build        # Production build → build/
npm run start        # Production server (loads .env, runs build/index.js)
npm run migrate      # Apply pending SQL migrations (idempotent, safe to re-run)
```

Copy `.env.example` to `.env` and fill in values before running. `DATABASE_URL` and `SESSION_SECRET` are required.

## Architecture

**Stack:** SvelteKit (Svelte 5) + Node adapter + PostgreSQL. No ORM — raw SQL via `pg`.

### Database access

All queries go through `src/lib/server/db.ts`:
- `query<T>(sql, params)` → `T[]`
- `queryOne<T>(sql, params)` → `T | null`

The pool is lazy — it initialises on first query, not at import time. This is intentional so the build step doesn't require a live database.

### Auth

Session-cookie based (`skint_session`). `src/hooks.server.ts` calls `getUserFromEvent` on every request and attaches the result to `event.locals.user`. All API routes check `event.locals.user` directly — there is no middleware chain beyond the hook.

### Schema evolution

Migrations live in `migrations/` as numbered SQL files (`001_initial.sql`, `002_templates_and_admin.sql`, …). `scripts/migrate.js` runs them in order, skipping already-applied files via the `_migrations` tracking table. Always add a new numbered file — never edit an existing migration.

### Budget data flow

1. `src/lib/stores/budget.ts` is the single source of truth on the client — a Svelte writable store holding `BudgetCategory[]` (each with nested `items`).
2. `loadBudget()` fetches `/api/budget/categories` and populates the store.
3. `updateItem()` / `updateCategory()` optimistically update the store then debounce a PATCH to the API (600 ms).
4. The `summary` derived store computes gross income, tax, net income, expenses, and surplus from the store contents. Tax is calculated via `calcAustralianTax` in `src/lib/tax.ts`.

### Tax calculations

`src/lib/tax.ts` is imported on both client and server. It exports `calcAustralianTax(grossIncome)` which returns income tax, Medicare levy, LITO, and net income. Only `taxable === 'taxed'` items contribute to `taxedGross`; `taxfree` items are summed separately and added to net income after tax.

### Templates → Budget seeding

Templates (`templates` / `template_categories` / `template_items`) are admin-managed master copies. When a user starts a budget, `/api/budget/seed` copies the default template's categories and items into `budget_categories` / `budget_items` for that user. `service_key` is carried across from `template_items` to `budget_items` to enable the subscription tier picker.

### Admin section

`src/routes/admin/` has its own nested layout (`+layout.svelte`) with a sidebar mirroring the budget category sidebar pattern. Routes redirect non-admins to `/`. Admin API routes all live under `src/routes/api/admin/`.

### Audit logging

`src/lib/server/audit.ts` exports `auditLog(event, action, opts)`. It never throws — always wrapped in try/catch. Call it after mutating operations in API routes.

### Svelte 5 event handling

Use `on:click={(e) => { e.preventDefault(); handler(); }}` — the `|preventDefault` modifier syntax does not work in Svelte 5.

### Types

`src/lib/types.ts` is the shared type surface. `src/lib/server/auth.ts` re-exports its own `User` type (identical shape) for server-only use. Keep these in sync.
