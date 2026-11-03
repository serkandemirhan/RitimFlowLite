# Open limitations

1. Integration merge completed at ac360fb. Eighteen additional backend commits remain on origin/backend/b01-foundation; approval for that second merge is pending. Premium frontend and old backend do not yet match.
2. Private Node 22.20.0/npm 10.9.3 installed; Windows runner selects it without changing system runtime.
3. PostgreSQL server compatibility, dedicated database, migration identity, restricted runtime, secrets, encoding and extensions are unverified.
4. Existing integration tests and security reports need local reruns; demo tests are not MES acceptance.
5. Architecture decisions A–G are pending. Offline identity, Supabase transition and bidirectional synchronization cannot proceed on inferred defaults.
6. Machine scheduling, journal and master-data gaps must be re-evaluated against integration code before implementation.
7. Windows diagnostics/start/test runner added. Migration/provisioning/backup/restore scripts, remaining design documents, before/after UI evidence and full factory acceptance remain outstanding. Do not fill them with completion claims or replace existing functionality.
8. Only integration merge was authorized/performed. No push, deployment, database reset or fictional data import occurred.
9. Windows Chromium embedded PDF receives HTTP 200 but does not finish the transfer in the reproduction. Source browser runner passed 34 scenarios before this hang and was interrupted. Bounded test reports failure instead of hanging; PDF acceptance remains open.
