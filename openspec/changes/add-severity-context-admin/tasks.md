## 1. Implementation

- [x] 1.1 Prisma model for severity context overlay (e.g. singleton row or versioned document JSON + updated_at)
- [x] 1.2 Migration and seed-safe default (empty overlay = use file only)
- [x] 1.3 Repository: load overlay, merge with `sla-guidelines.json` (document precedence rules)
- [x] 1.4 Wire `botMentionHandler` / `assessSeverityWithJudge` to use merged guidelines (short TTL cache acceptable)
- [x] 1.5 Admin Hub: modal to edit overlay text/JSON with validation and preview
- [x] 1.6 Audit log entries on successful save
- [ ] 1.7 Manual test: edit overlay in staging, verify bot assessment reflects change without redeploy
