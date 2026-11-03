# Test results — 2026-11-03

Actual source under test: HEAD 53153882cda16ff86550612faa0e85f8a130676b, Windows 10, Node 24.12.0.

| Check | Result | Limit |
|---|---|---|
| node --test tests/p0-domain.test.cjs | PASS: 25/25, no skips | Demo JavaScript domain tests only |
| Integration tip contains main | PASS: merge-base ancestor check exit 0 | Local Git references; no remote refresh |
| PostgreSQL Windows service | Running | No database connection or server-version query |
| psql / pg_dump / pg_restore | 18.6 each | No backup/restore performed |
| Node integration engine compatibility | FAIL: installed 24, required 22 | Must resolve before supported-runtime acceptance |
| Browser / responsive / physical devices | NOT TESTED | Historical screenshots do not count |
| Fastify / migrations / restricted role / RLS | BLOCKED | Not in working checkout; dedicated DB not configured |
| OIDC / encrypted recovery / factory journey | BLOCKED | Historical implementation available on integration branch |
| Offline login / two-way replay | BLOCKED | Requires architecture approval and implementation |

No test data or existing browser storage was modified. No overall MES, development or production acceptance is implied.
