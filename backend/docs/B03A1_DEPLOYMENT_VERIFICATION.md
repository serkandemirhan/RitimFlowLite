# B03A.1 — historical deployment verification and recovery

> Historical report from before Docker became available. Current PostgreSQL 16 and Compose results: [Docker validation](B03A1_DOCKER_VALIDATION.md).

28 October 2026. **NO-GO for B03B MES write endpoints and production release.** PostgreSQL 16 and Docker Compose are **NOT TESTED** in this environment. No deployment was performed.

## Environment blocker

On this Mac, `docker`, `podman`, `colima`, `lima` and `nerdctl` were not found on PATH, Docker Desktop was not present in `/Applications`, and the only installed local PostgreSQL was Homebrew 14.19. Therefore there was no Docker daemon or PostgreSQL 16 instance to build the image or start Compose. No claim is made about image build, Compose orchestration, PostgreSQL 16 compatibility, container health or target environment grants. Installing a container runtime or pointing the test harness at a disposable PostgreSQL 16 instance is still required.

## Real PostgreSQL 14 verification

Node v22.20.0 and Homebrew PostgreSQL 14.19; all tests ran against a newly initialized, temporary loopback-only PostgreSQL cluster, not a user database. Database setup created randomized fictional schemas, roles and a recovery database; it dropped only those test objects and stopped its own cluster afterward. No personal/demo storage was touched.

- Complete `npm test`: **42/42**, zero failed/skipped. [TAP evidence](evidence/b03a1-postgresql14.tap). Node counts parent subtests as tests.
- `npm run test:integration`: **28/28**, zero failed/skipped, a separate repeat of integration tests included in the complete count. [Evidence](evidence/b03a1-integration-postgresql14.tap).
- The B03A security suite uses an actual restricted LOGIN plus a separate non-superuser migration/schema-owner LOGIN. A privileged setup login creates the roles/schema and fictional fixtures. It checks 22 tables for RLS and FORCE RLS and correct owner; runtime cannot create a schema/table/role, alter RLS, modify schema migrations or authorization tables, or read users directly.
- The restricted role checks two tenants and site access, API scope, idempotency RLS and repeat keys, missing context, connection reuse, rollback, simultaneous membership revocation, and hardened security-definer search path. A real loopback HTTP listener returns health and a session using the restricted connection pool. Its identity adapter is a test stub; separate B02 tests validate real JWT signatures and key rotation.
- The compromised-runtime test intentionally forges the tenant/site settings and observes the other tenant. It **passes as a negative characterization of an unprotected threat**; it is not evidence of protection against arbitrary SQL as runtime.

## Migration, backup and recovery evidence

The automated [recovery test](../test/b03a-migration-recovery.test.js) creates 001/002 tables and a fictional order, applies 003 and verifies the complete preexisting order remains unchanged. A synthetic 004 creates a table then divides by zero; migration fails, and both the table and migration version roll back. A custom-format `pg_dump` is restored with `pg_restore --exit-on-error` into a separate randomized fictional database; the test checks order quantity, versions 001–003 and both RLS flags. The final full-run temporary dump SHA-256 is recorded in the TAP. This is a test fixture, not a backup of any user database.

For a real deployment, use an approved maintenance window: stop writers; record current code/migration versions; take an encrypted, access-controlled backup with the correct PostgreSQL version and verify it through a restore drill into a separate isolated database; apply migration with the controlled migration owner; run scoped integrity checks and audit runtime grants before reopening writes. For rollback, keep the old deployment offline while restoring the verified pre-migration backup into an isolated target; separately recreate and audit roles/grants and validate data and compatibility before switching connections. Never rely on code rollback alone or overwrite the sole backup. This is a proposed procedure, not a completed operational recovery drill on the target environment.

## Compose and privilege review — static only

`compose.yaml` configures separate `MIGRATION_DB_USER/PASSWORD` and `RUNTIME_DB_USER/PASSWORD`, gates migration on DB health and API startup on migration completion, and binds the API host port to loopback. These are configuration observations, **not runtime verification**. Roles, dedicated schema and runtime grants must be provisioned separately. The Compose file has no provisioning service between migration completion and API start, so migration success alone does not prove runtime grants were applied. It also does not define an API container health check; `/health/ready` executes `SELECT 1` and does not verify migrations, RLS, grants or identity provider readiness. Both are release gates for the target environment.

The Dockerfile copies app source, migrations and security tools; `.dockerignore` excludes `.env`, `.env.*`, docs and tests. It does not intentionally copy production credentials, but this was not verified by building/inspecting an image. Compose currently injects database passwords through container environment variables; those can be visible to principals with access to container configuration or the daemon. Use an appropriate secret management mechanism and inspect the final image/runtime configuration before deployment. Network TLS, image hardening, resource limits, role bootstrap and managed PostgreSQL privilege compatibility remain unverified.

## PostgreSQL 16/Compose acceptance still required

1. Provision an isolated PostgreSQL 16 Docker environment with fictional data, separate bootstrap, schema-owner and restricted runtime logins and a dedicated schema. Do not reuse a real volume.
2. Build the actual image and inspect its contents and configuration for credentials. Verify DB health → migrations → owner-run grant provisioning → API startup in that order; verify startup fails closed when provisioning is omitted or migration fails. Add and validate a readiness check that detects schema/grant failures before deployment.
3. Run the complete backend suite with `TEST_DATABASE_URL` pointing to the disposable PostgreSQL 16 database and role-creation permissions reserved for the fixture setup. Confirm runtime sessions, 22 RLS policies, privilege restrictions, pooling, concurrent revocation, negative compromised-context probe, upgrade/failure/restore.
4. Repeat backup/restore and controlled rollback with the actual deployment accounts and reviewed secrets; validate migration checksum and preserved data. Keep old code and database migration compatibility in the deployment record.
5. Obtain independent review and decide whether a stronger database-bound identity/broker is necessary for compromised API/runtime credentials before enabling any MES write endpoint.
