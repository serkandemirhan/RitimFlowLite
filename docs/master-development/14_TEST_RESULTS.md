# Test results — 2026-11-03

## Operator phases 1–3 — 2026-11-08 local verification

- Backend: **216/216 passed**, no failures, skips or cancellations, on disposable PostgreSQL 18 with restricted runtime roles.
- Migration **046**: 46 migrations applied, repeat run applied zero. Restricted readiness returned 200; unauthenticated session returned 401. Backup/restore preserved FORCE RLS and fixture quantities.
- Operator/browser/recovery checks: **27 passed**. Covers state layout, draft isolation, offline write guard, correction forms, recovery identity, PDF rendering, pan/zoom and three-page navigation.
- Cloud bundle built successfully (42 application assets and the local PDF renderer).
- Correction scope: operator requests reduction/void of an uninspected production entry; manager approves or rejects with a reason. Original event and ledger remain immutable. Approved projections update consumed quantity and available input together. Quality-requested, previously corrected or closed work cannot be changed. Missing quantities use another production entry.
- Physical Android UI verification: **PASS**, Samsung SM-A326B, 384px viewport. Nine native screenshots; no horizontal overflow. Pause-reason keyboard reduced the visible viewport from 721px to 411px while actions remained accessible. Three-page PDF, native two-finger pinch, pan and refit passed. Active-job read 2.16s; drawing-job read 2.15s; PDF render 0.93s. This used local UI files against read-only live API calls, not a deployed release or a production-write acceptance test.
- Deployment is **pending**: apply the generated [Supabase 046 upgrade](../../artifacts/cloud-setup/supabase-upgrade-046.sql) and deploy the matching application, then run live acceptance. Do not publish the new API before its database upgrade.

Latest local screenshots: [operator verification gallery](../../artifacts/cloud-release/operator-refinement/index.html). Latest device evidence: [Android verification report](../../artifacts/cloud-release/android-operator-final/index.html).

## Historical native backend / Windows operations results

Installed-service continuation: database `ritim_local_dev` on 5432 has 65 tables/28 migrations. Real local Keycloak PKCE/BFF login, encrypted recovery-backed order creation, SQL read under restricted RLS scope, durable 201 receipt and browser reload all verified for test order **SIP-1793716581659**, quantity **10**. [Detailed proof/restart steps](17_LOCAL_RUN_VERIFICATION.md). This updates the earlier statement that existing-service provisioning and live local identity had not run. Broad premium browser, PDF, outage, cloud and sync acceptance remain open.

Source baseline: merge **2ffcdc1**, incorporating both existing implementation branches, plus Windows SCRAM test provisioning and operational helpers. Node 22.20.0, npm 10.9.3; PostgreSQL server and clients **18.6**. No historical SQL changed.

| Check | Result | Evidence / limit |
|---|---|---|
| Complete backend suite on SCRAM-only native cluster | **PASS 142/142**, zero fail/skip/cancel | artifacts/native-postgres/backend.tap; real role connections, RLS, concurrency, audit/idempotency, domain workflows and migration backup/restore |
| Dedicated migration/runtime Fastify smoke | PASS: 28 applied, repeat 0, live/ready 200, identity-less session 401 | artifacts/native-postgres/runtime-smoke.json; actual loopback HTTP, not user login |
| Native initialization/migrate/provision/backup/restore helpers | PASS | artifacts/native-postgres/windows-operations.json; quantity 42, checksums/FORCE RLS and existing database ownership preserved; repeated/destructive targets refused |
| Expanded backend pure unit command | PASS 37/37 | artifacts/native-postgres/expanded-unit.tap; included in 142, not additional coverage count |
| PowerShell script parse / DPAPI saved-secret round-trip | PASS | Export/import and decryption under current Windows account; no existing-service provisioning attempted |

Clusters used random loopback ports, new private temporary directories and generated credentials; stopped afterward. Installed PostgreSQL service/database/authentication were unchanged. Persistent service setup and live Keycloak/Supabase browser login are not verified. Initial failed native harness attempts involved SID syntax and inherited pg_ctl pipe; corrected before successful test runs, without modifying DB security.

Final Windows public entry point `powershell -NoProfile -File scripts/windows/ritim.ps1 -Action TestNativeDatabase` was also executed end to end: 142/142, runtime smoke and operations rehearsal all passed; its cluster stopped. This rerun validates final orchestration after adding operational helpers, not extra independent test coverage.

## Earlier frontend merge results: ac360fb on Node 22.20.0

| Check | Result | Limit / local evidence |
|---|---|---|
| Expanded domain suite | PASS 292/292, no skips | artifacts/domain/windows-node22.log |
| Backend unit suite | PASS 14/14 | Foundation/JWT; no real database |
| Packaging | PASS 12/12 | artifacts/windows-packaging.log; Windows path fix applied |
| Recovery unit suites | PASS 14/14 | artifacts/windows-recovery.log; not offline login |
| Navigation / simple order tests | PASS 6/6 | artifacts/windows-architecture.log |
| RC1 build / verify | PASS | artifacts/windows-build.log, windows-verify.log |
| Packaged browser smoke | PASS, 45 assets, zero application errors | artifacts/windows-smoke.log; fictional demo only |
| Integration merge ancestry | PASS, checked after merge | Integration tip included in HEAD |
| PostgreSQL TCP probe | Accepting at 127.0.0.1:5432 | Not authenticated runtime readiness |

Source browser runner passed p0 (16), transfers (9), planning (9): 34 cases, zero application errors. It was then interrupted in p1 after an embedded PDF transfer never completed; it is not a complete passing suite. An independent reproduction received PDF HTTP 200 but timed out waiting for completion. The existing p1 assertion now has a 20-second bound without weakening acceptance. A bounded p1 rerun and remaining suites are evaluated separately; PDF rendering/security acceptance stays NO-GO pending diagnosis.

Final individual reruns: p1 **10 passed / 1 failed**, with one aborted PDF request recorded when closing the failed case; persistence **34/34**, integrity **11/11**, concurrency **20/20**. Concurrency first ran 19/20: the lock-owner-close test retried before browser lock release. It now observes actual release using the Web Locks API before retry; exclusive locking and mutation assertions remain unchanged. No application errors in the other suites. Across seven suites' latest individual results this is **109 passed / 1 failed**, not a passing full source runner. No complete packaged regression was claimed; packaged smoke alone passed.

Evidence: `artifacts/windows-p1-bounded/browser-results.json`, `artifacts/windows-p0-persistence/browser-results.json`, `artifacts/windows-p0-integrity/browser-results.json`, `artifacts/windows-p0-concurrency-retry/browser-results.json`, plus original source-browser run summary. These ignored artifacts preserve local Windows evidence; no baseline screenshots were overwritten.

Node/npm and Chromium installed locally. Full backend still depends on separately requested backend branch merge. No database mutation, push or deployment performed.

## Initial baseline

Actual source under test: HEAD 53153882cda16ff86550612faa0e85f8a130676b, Windows 10, Node 24.12.0.

| Check | Result | Limit |
|---|---|---|
| node --test tests/p0-domain.test.cjs | PASS: 25/25, no skips | Demo JavaScript domain tests only |
| Integration tip contains initial main | FAIL: initial shell exit interpretation was wrong | Shared base a28d562; reconciled by merge ac360fb |
| PostgreSQL Windows service | Running | No database connection or server-version query |
| psql / pg_dump / pg_restore | 18.6 each | No backup/restore performed |
| Node integration engine compatibility | FAIL: installed 24, required 22 | Must resolve before supported-runtime acceptance |
| Browser / responsive / physical devices | NOT TESTED | Historical screenshots do not count |
| Fastify / migrations / restricted role / RLS | BLOCKED | Not in working checkout; dedicated DB not configured |
| OIDC / encrypted recovery / factory journey | BLOCKED | Historical implementation available on integration branch |
| Offline login / two-way replay | BLOCKED | Requires architecture approval and implementation |

No test data or existing browser storage was modified. No overall MES, development or production acceptance is implied.
