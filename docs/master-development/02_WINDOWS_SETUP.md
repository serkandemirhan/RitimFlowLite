# Windows setup — initial inspection

Status: **BLOCKED**, not a completed installation. See [audit](01_CURRENT_STATE_AUDIT.md).

## Safe checks available now

From repository root in PowerShell:

```powershell
node --version
npm --version
git --version
Get-Service postgresql-x64-18
& 'C:/Program Files/PostgreSQL/18/bin/psql.exe' --version
& 'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe' --version
& 'C:/Program Files/PostgreSQL/18/bin/pg_restore.exe' --version
node --test tests/p0-domain.test.cjs
```

Service was Running during inspection. Starting it if stopped requires a suitably privileged PowerShell: `Start-Service postgresql-x64-18`. Do not stop a shared database service to stop the application.

## Required next setup

1. Resolve the branch mismatch before installing packages: current HEAD has no npm manifest or Fastify server.
2. Use Node 22.x and npm 10.x, matching the existing integration contract. Do not silently relax engine constraints to match Node 24.
3. Inspect the recovered backend configuration and scripts before adding Windows equivalents.
4. Have an authorized database administrator provision a dedicated development database, separate migration identity and restricted non-owner runtime identity. Confirm target database explicitly before fixtures. Supply secrets only via ignored local configuration or process environment; never put passwords in command arguments, reports or Git.
5. Run existing migration runner using migration identity; provision existing grants; run readiness and real database security/integration tests using runtime identity. Do not use the PostgreSQL superuser for either application runtime or migration.
6. Start existing API and premium frontend locally without Docker. Verify readiness, real user authorization and browser access. LAN binding requires explicit network/security configuration; default loopback alone does not provide workshop LAN access.
7. Test backup and restore into a separate explicitly confirmed empty test database. Use compatible 18.x client tools after querying actual server version. Do not overwrite an existing database or use destructive restore flags by default.

Database initialization, permissions, startup, backup/restore and full regression scripts are pending inspection of the implementation branch. Providing executable substitutes before that would bypass its security design. No fixture, role, database or environment secret was created during this audit.

Offline authentication is BLOCKED until an architecture is approved and outage login/authorization are tested. Static page availability is insufficient.
