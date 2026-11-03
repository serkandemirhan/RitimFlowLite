# Windows setup — initial inspection

Current status: native PostgreSQL validation **PASS**, persistent development installation **BLOCKED** until the user supplies credentials locally. Both implementation branches are merged. See [audit](01_CURRENT_STATE_AUDIT.md) and [results](14_TEST_RESULTS.md). Instructions below supersede the historical preliminary notes later in this file.

## Verified Docker-free native regression

```powershell
powershell -NoProfile -File scripts/windows/ritim.ps1 -Action TestNativeDatabase
```

Requires installed PostgreSQL 18 binaries and Node 22. The command creates a new private temporary cluster, random bootstrap password, SCRAM-only authentication, random available loopback port and dedicated test DB. It runs all backend tests, runtime Fastify smoke and Windows operations rehearsal, then stops its own cluster. It never contacts/resets the installed Windows service. Stopped private test data is retained for troubleshooting. First native regression: 142/142 passed; operations rehearsal passed separately. Logs are under ignored `artifacts/native-postgres/` without passwords. Use RITIM_PG_BIN only to select compatible PostgreSQL binaries if installed elsewhere.

## Persistent development DB on the installed service

Run this in your own PowerShell; enter the installed PostgreSQL provisioning password only in its local credential prompt:

```powershell
powershell -NoProfile -File scripts/windows/database.ps1 -Action Initialize -Database ritim_local_dev -ConfirmDatabase ritim_local_dev -EnableDevelopmentMutations
```

Initialization refuses existing database/role/configuration names. It creates distinct non-superuser migration owner and restricted runtime login, applies existing migrations without editing them, provisions grants and verifies readiness. It loads no fictional business fixtures. The explicit development-mutations switch enables existing development-only business routes/grants; it is not production deployment or trusted user identity. Omit it for a read-only foundation. Existing Keycloak/OIDC settings are not replaced.

Generated credentials are stored outside the repository under a project-specific local application-data directory as Windows DPAPI-encrypted SecureStrings. Folder ACL permits the current Windows user. Bootstrap credentials are not saved. Use the same Windows account to start the API. If initialization fails after provisioning begins, preserve this configuration and the DB; do not delete/reinitialize to hide partial state. Inspect and repair explicitly. DPAPI configuration is machine/account-bound; do not assume copying it backs up portable production secrets.

```powershell
powershell -NoProfile -File scripts/windows/database.ps1 -Action Migrate -ConfirmDatabase ritim_local_dev
powershell -NoProfile -File scripts/windows/database.ps1 -Action Provision -ConfirmDatabase ritim_local_dev
powershell -NoProfile -File scripts/windows/database.ps1 -Action Ready -ConfirmDatabase ritim_local_dev
powershell -NoProfile -File scripts/windows/ritim.ps1 -Action StartApi
```

Start web in another terminal with `-Action StartWeb`; open `http://127.0.0.1:4178/?mode=api`. Stop each with Ctrl+C. `-Action Health` checks default endpoints. StartApi loads only the saved restricted identity and rejects ambiguous simultaneous saved/process database configuration. Never use the bootstrap login for API or migrations. User login remains blocked until approved identity/provider configuration is supplied.

## Backup / isolated restore

```powershell
powershell -NoProfile -File scripts/windows/database.ps1 -Action Backup -ConfirmDatabase ritim_local_dev
powershell -NoProfile -File scripts/windows/database.ps1 -Action RestoreTest -ConfirmDatabase ritim_local_dev -BackupFile 'C:/absolute/path/from-backup-output.dump' -RestoreDatabase ritim_local_restore_test
```

Replace the example backup path with actual command output. Backup defaults to a private configuration-adjacent backup folder and never overwrites a file. Backup/restore prompts for an authorized operator because FORCE RLS prevents the restricted migration/runtime identities from reading all tenants. These credentials never become the application identity. Restore creates a separate absent test DB, restores data with the authorized operator, transfers only application-schema objects to the migration owner, reapplies restricted grants and verifies migration checksums/readiness. It never uses destructive restore flags or cluster-wide REASSIGN OWNED. Tested with native PostgreSQL 18.6: fictional order 42 and FORCE RLS preserved, source DB ownership unchanged. Production key management and restore recovery are separate acceptance work.

## Troubleshooting

- Diagnostics: `-Action Diagnostics` reports versions, service state and configuration presence only.
- Connection refused: verify service/port; do not alter pg_hba.conf to trust.
- Authentication failure: check local credentials, not a password pasted into chat. Do not switch runtime to postgres.
- Migration checksum/unknown version: preserve DB/SQL and investigate a forward migration; never edit applied historical SQL.
- Readiness 503: verify schema search path, migration versions and restricted grants; liveness alone is insufficient.
- Login unavailable: configure the actual OIDC/BFF securely; database success does not imply offline login.
- PDF test timeout: documented Windows Chromium failure remains; no PDF acceptance claimed.
