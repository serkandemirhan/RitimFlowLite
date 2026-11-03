# Release readiness — initial audit

| Area | Decision | Evidence / next gate |
|---|---|---|
| Windows local setup | BLOCKED | Reconcile source branch and supported runtime |
| Local database integration | BLOCKED | Dedicated DB, migrations, runtime and real tests pending |
| Existing MES regression | BLOCKED | 25 demo tests pass; integration not rerun |
| Offline authentication | BLOCKED | ADR A/F pending |
| Cloud authentication | BLOCKED | Preserve legacy identity; approve Supabase migration |
| Two-way sync | NOT IMPLEMENTED | Approve authority/conflict/security policy |
| Master data | BLOCKED | Integration inventory and functional tests pending |
| Machine scheduling | BLOCKED | Transactional contract and inventory pending |
| Machine journal | BLOCKED | Authoritative event inventory pending |
| Premium UI/UX | BLOCKED | Not in current checkout; Windows browser checks pending |
| End-to-end factory journey | BLOCKED | Real DB and identity required |
| Security | NO-GO | Current demo role selection is not authorization |
| Staging deployment | BLOCKED | Architecture, keys and acceptance pending |
| Production readiness | NO-GO | Pilot, recovery, physical mobile, concurrency and security acceptance pending |

M0 is partial; M1–M12 are not complete. This master program remains open.
