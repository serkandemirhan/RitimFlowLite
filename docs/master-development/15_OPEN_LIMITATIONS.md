# Open limitations

1. Current main omits existing backend/premium integration history. Merge approval pending under the user's explicit no-merge rule.
2. Installed Node/npm do not match the integration contract.
3. PostgreSQL server compatibility, dedicated database, migration identity, restricted runtime, secrets, encoding and extensions are unverified.
4. Existing integration tests and security reports need local reruns; demo tests are not MES acceptance.
5. Architecture decisions A–G are pending. Offline identity, Supabase transition and bidirectional synchronization cannot proceed on inferred defaults.
6. Machine scheduling, journal and master-data gaps must be re-evaluated against integration code before implementation.
7. Requested Windows scripts, remaining design documents, before/after UI evidence and full factory acceptance remain outstanding. Do not fill them with completion claims or replace existing functionality.
8. No production deployment, push, merge, database reset or fictional data import authorized/performed in this audit.
