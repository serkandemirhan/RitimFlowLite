# Release readiness — initial audit

| Area | Decision | Evidence / next gate |
|---|---|---|
| Windows local setup | BLOCKED | Integration merged, private Node 22/npm 10 and web startup verified; full backend and DB pending |
| Local database integration | BLOCKED | Dedicated DB, migrations, runtime and real tests pending |
| Existing MES regression | BLOCKED | 25 demo tests pass; integration not rerun |
| Offline authentication | BLOCKED | ADR A/F pending |
| Cloud authentication | BLOCKED | Preserve legacy identity; approve Supabase migration |
| Two-way sync | NOT IMPLEMENTED | Approve authority/conflict/security policy |
| Master data | BLOCKED | Integration inventory and functional tests pending |
| Machine scheduling | BLOCKED | Transactional contract and inventory pending |
| Machine journal | BLOCKED | Authoritative event inventory pending |
| Premium UI/UX | BLOCKED | Frontend present, six navigation/order tests and packaged smoke pass; authenticated workflows pending |
| End-to-end factory journey | BLOCKED | Real DB and identity required |
| Security | NO-GO | Current demo role selection is not authorization |
| Staging deployment | BLOCKED | Architecture, keys and acceptance pending |
| Production readiness | NO-GO | Pilot, recovery, physical mobile, concurrency and security acceptance pending |

M0 is partial; M1–M12 are not complete. This master program remains open. Integration merge ac360fb preserves both Git histories. Windows packaging bug was fixed; 292 domain, 14 backend unit, 12 packaging, 14 recovery and six navigation/order tests pass, plus build/verify and packaged smoke (45 assets, zero application errors). Source browser regression has a verified 34-scenario subtotal but hung in the PDF completion assertion and was interrupted. A bounded rerun reports that failure explicitly. No complete browser PASS or PDF acceptance is claimed. Additional backend branch merge and database provisioning need the requested user input.

Latest individual browser-suite totals: 109 passed / 1 PDF failure. Persistence 34/34, integrity 11/11 and concurrency 20/20 passed. Full source/packaged acceptance remains NO-GO; see [test results](14_TEST_RESULTS.md).
