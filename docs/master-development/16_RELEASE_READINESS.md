# Release readiness

| Area | Decision | Evidence / next gate |
|---|---|---|
| Windows local setup | GO (local development scope) | Installed PostgreSQL service, 65 tables/28 migrations, restricted runtime, real local Keycloak/BFF login and browser-to-SQL order persistence verified |
| Local database integration | GO (native test scope) | PostgreSQL 18.6, 142/142, restricted runtime readiness, 28 migrations and tested backup/restore; persistent installed-service DB remains pending |
| Existing MES regression | GO (backend tested scope) | 142/142 actual PostgreSQL tests; full authenticated Windows UI regression remains BLOCKED |
| Offline authentication | BLOCKED | ADR A/F pending |
| Cloud authentication | BLOCKED | Preserve legacy identity; approve Supabase migration |
| Two-way sync | NOT IMPLEMENTED | Approve authority/conflict/security policy |
| Master data | NO-GO | Existing material/location/supplier APIs tested; complete customer/product and other catalogs missing |
| Machine scheduling | NOT IMPLEMENTED | Assignment exists; no persisted queue/priority contract implemented |
| Machine journal | NOT IMPLEMENTED | Manual production history exists; complete shift/setup/downtime journal missing |
| Premium UI/UX | BLOCKED | Frontend present, six navigation/order tests and packaged smoke pass; authenticated workflows pending |
| End-to-end factory journey | BLOCKED | Backend chain tested; live Windows identity/browser, queue/journal and outage/reconnect acceptance pending |
| Security | NO-GO | Native auth/RLS/audit tests pass; production threat model, key operations and offline/sync security remain open |
| Staging deployment | BLOCKED | Architecture, keys and acceptance pending |
| Production readiness | NO-GO | Pilot, recovery, physical mobile, concurrency and security acceptance pending |

M0 repository/Windows discovery and initial comprehensive mapping are complete after backend merge 2ffcdc1. M1 native test scope PASS; persistent development installation is incomplete. M2 authenticated premium-browser baseline is incomplete; M3-M5 await explicit architecture decisions. Later product milestones remain open. Both branch histories are preserved and no push/deployment occurred.

Earlier frontend results: 292 domain, 12 packaging, 14 recovery and six navigation/order tests pass, plus build/verify and packaged smoke (45 assets, zero application errors). No full browser/PDF acceptance is claimed. Expanded backend unit command passes 37 tests included within the full 142-case native run, not counted twice. Windows operations rehearsal confirms initialization, backup/restore, order quantity 42, FORCE RLS and existing DB ownership preservation.

Latest individual browser-suite totals: 109 passed / 1 PDF failure. Persistence 34/34, integrity 11/11 and concurrency 20/20 passed. Full source/packaged acceptance remains NO-GO; see [test results](14_TEST_RESULTS.md).
