## Why

SLA text and domain glossary for severity assessment today ship in [`sla-guidelines.json`](sla-guidelines.json) and require a code deploy to change. Product Owners asked for a way to update bot context without engineering for every policy tweak.

## What Changes

- Add PostgreSQL-backed optional overlay for severity/glossary text (or structured JSON blob) merged at runtime with defaults from `sla-guidelines.json`.
- Add Admin Hub entry (same access pattern as Users / Disciplines: admin channel membership) to view and edit that overlay.
- Audit trail via existing `AuditLog` pattern where feasible.
- Document merge order: DB overlay overrides/supplements file defaults; failures fall back to file-only.

**BREAKING**: None if overlay is optional and defaults match current behavior.

## Impact

- Affected specs: new capability `sla-assessment` (proposed)
- Affected code: `prisma/schema.prisma`, migration, repository helper, [`appHome.js`](appHome.js) admin modal + handlers, [`botMentionHandler.js`](botMentionHandler.js) load/merge at startup or per-request with cache
