# Functional and visual regression

## Passed

- Disposable native PostgreSQL runner under Node 22: **218 tests, 218 pass, 0 fail/skipped/cancelled**. All 46 migrations applied once; repeat applied zero. Restricted runtime readiness 200, unauthenticated session 401. Backup/restore and tenant isolation checks passed. Installed PostgreSQL service and live database unchanged.
- Existing focused frontend suites: **15 tests passed** covering detail validation/dirty state, list restoration, pagination/cursors, planning context/move eligibility, returns entry, quality/shipping/overview queues and production monitoring fields.
- New actual-application UI harness: jobs and planning at 1440×900, 1280×800, 768×1024, 390×844, 375×667, 412×915. No document horizontal overflow or page exceptions. Local grid/timeline horizontal scrolling is intentional.
- Tabulator typed filter reduces to the matching record; clearing restores 20 visible rows of 45; built-in pagination used.
- Planning date forward/back, blocked running-job move, waiting-job callback and mobile menu open/close passed.
- RC1 deterministic build and cloud build passed. npm production audit: zero reported vulnerabilities.

## What the evidence does not establish

- The new UI harness uses controlled in-memory API fixtures. It is not an authenticated browser-to-PostgreSQL save/reload test.
- Backend tests validate state transitions/persistence and permissions independently; they do not prove the complete new browser UI path.
- Direct callback testing of the scheduler is not physical touchscreen dragging.
- Real iPhone/Safari keyboard, PDF, start/pause/resume/complete through the new complete application session have not been repeated in this modernization round.
- The older monolithic shell browser test times out; investigation found its harness omits current UI modules and expects obsolete headings/fixture shapes. It is not counted as passing, and its source was left unchanged.

## Reproduction

```powershell
node scripts/verify-ui-modernization.cjs --before
node scripts/verify-ui-modernization.cjs
npx --yes --package=node@22 node scripts/windows/test-native-postgres.cjs
node --test tests/list-ergonomics.test.cjs tests/detail-ergonomics.test.cjs tests/planning-returns-monitor.test.cjs tests/operational-pagination.test.cjs tests/compact-queues.test.cjs
npm run build:rc1
node scripts/build-cloud.cjs
```

Use `visual-checks.json` for machine-readable UI outcomes. Database test outputs remain under the existing protected native-postgres evidence directory. Do not delete its persisted cluster as screenshot cleanup.

## Production monitor follow-up

The browser harness now covers three views at all six sizes (18 captures). Production monitor running/all filters and list/card/list transitions pass. Six focused monitor/queue regression tests pass. This adds UI fixture evidence, not real-device or authenticated persistence acceptance.

## Preview drag verification

The isolated preview journal previously omitted begin/execute, so drops could not persist. Added scoped fixture-only move handling and sessionStorage reload retention. `node scripts/verify-preview-drag.cjs` now performs real browser queue drag and timeline mouse down/move/up, then reloads to assert destination machine retention. Both pass. These are preview-fixture results, not production database persistence. Preview server can run directly on port 62949 with `node scripts/verify-ui-modernization.cjs --serve-only`.
