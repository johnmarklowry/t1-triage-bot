# Phase 2 implementation (blocked in Plan mode)

Cursor Plan mode prevented applying code changes. Switch to **Agent mode** and ask to "implement Phase 2 severity context admin", or apply the following manually.

## 1. Prisma — add to `prisma/schema.prisma` before `AdminChannelMembership`:

```prisma
model SeverityContextOverlay {
  id        Int      @id @default(1) @map("id")
  patchJson Json     @map("patch_json")
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamp(6)
  updatedBy String?  @map("updated_by") @db.VarChar(50)

  @@map("severity_context_overlay")
}
```

Run: `npx prisma migrate dev --name add_severity_context_overlay`

## 2. Add `lib/deepMergeSlaPatch.js`

See agent patch (deep merge; arrays replaced by patch).

## 3. Add `repositories/severityContext.js`

Load patch row id=1, `deepMergeSlaPatch(base, patch)`, TTL cache `SLA_MERGED_CACHE_TTL_MS` default 30000, `saveSeverityPatch` + `auditLog`, `invalidateMergedSlaCache`.

## 4. `botMentionHandler.js`

- `const { getMergedSlaGuidelines } = require('./repositories/severityContext');`
- Remove using static `SLA_GUIDELINES` for LLM; before each `assessSeverityWithJudge`, `const slaGuidelines = await getMergedSlaGuidelines();`

## 5. Admin Hub — `appHome.js`

- Button `Severity SLA` → `admin_hub_open_severity_context`
- Handler: `ensureAdminAccess`, `buildAdminSeverityContextModalView` from `services/adminViews.js`, `views.push`

## 6. `services/adminViews.js`

- `buildAdminSeverityContextModalView({ patchText })` — multiline `plain_text_input` max_length 3000, `callback_id: admin_severity_context_modal`

## 7. `adminCommands.js`

- `slackApp.view('admin_severity_context_modal', ...)` — parse JSON, `saveSeverityPatch`, validation errors via `ack({ response_action: 'errors', errors: { ... } })`

## 8. `env.example`

- `SLA_MERGED_CACHE_TTL_MS=30000`
