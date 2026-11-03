# Test results — 2026-11-03

## After merge ac360fb on Node 22.20.0

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
