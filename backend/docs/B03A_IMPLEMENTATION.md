# B03A — PostgreSQL scope and authorization boundary

Status: **defense in depth implemented; not production ready. NO-GO for enabling MES commands until the remaining gates are closed.** No MES write route has been added. B01/B02 baseline commit: `59e638f`. The current changes are uncommitted.

## Threat model and trust decision

1. An authenticated API caller supplies only a scope selector. The verified JWT identity is resolved server-side; membership and capability are checked on the DB transaction. Untrusted role, actor and tenant claims do not grant access. Existing endpoints expose session and capabilities, no business writes.
2. A developer accidentally omitting tenant/site predicates after authorization encounters forced RLS on every B01 tenant/site business table and idempotency records. Without scope, rows are invisible and writes fail. Policies use transaction-local `ritim.tenant` and `ritim.site`; idempotency additionally uses `ritim.actor`. Table owners have FORCE RLS; superusers and BYPASSRLS roles still bypass policies.
3. **A compromised API process or stolen runtime DB credential can execute arbitrary SQL, forge these settings, call security-definer entry points with another user, and read other tenants.** The negative test demonstrates this. RLS is not an independent security boundary for this threat. Database functions trust the API to pass a JWT-verified identity; a GUC is never treated as proof of membership in the API flow. Strong protection needs a separate trusted identity broker or independently verifiable cryptographically bound database context plus a threat-reviewed secret boundary.

`ritim_open_scope` checks active user, site ownership, platform/tenant/site membership and locks their rows using owner privileges. The API checks capabilities returned by this function. The locks are held until the same transaction commits or rolls back: concurrent revocation waits for an already-authorized command, and the next command fails. `set_config(..., true)` scopes context to the transaction. `inTransaction` rolls back on failure and releases the connection; tests with a single reused connection verify that neither commit nor rollback retains context. Rebinding an already-scoped transaction through the scope function fails, but arbitrary SQL can change settings directly, as described above.

## Privilege matrix

| Identity | Scope | Privileges |
|---|---|---|
| Infrastructure provisioner | Database and cluster role setup | Creates distinct non-superuser owner and runtime logins and dedicated schema; sets credentials out of band. Not used by API. |
| Migration/schema owner | Dedicated schema | Owns tables/functions; applies checksum migrations and grants runtime privileges; not superuser, BYPASSRLS or runtime. Its ownership is privileged and must not be used for normal API. |
| Restricted runtime | Dedicated schema | USAGE; SELECT on scoped domain tables; SELECT/INSERT/UPDATE on scoped idempotency; EXECUTE only on five reviewed identity, membership, scope, policy and migration-status functions. No direct users or membership table access, business writes, schema CREATE/DDL, role creation, superuser, BYPASSRLS or inherited role memberships. |
| PUBLIC | Dedicated schema | No table/function grants and no schema CREATE after provisioning. |

`003_scope_rls.sql` installs RLS, locks grants through a `SECURITY DEFINER` owner, revokes PUBLIC EXECUTE and pins its search path to `pg_catalog`, the trusted schema and `pg_temp` last. `security/provision-runtime.js` checks role flags, membership and ownership, removes PUBLIC/runtime grants in the dedicated schema, and applies the minimal allowlist. Run as the schema owner in a controlled transaction. This helper requires a dedicated schema: it revokes PUBLIC privileges throughout that schema and must not be pointed at a shared schema. Inventory existing grants and ownership independently before production use; an existing externally granted privilege in another schema/database is outside its scope.

### Provisioning outline (cloud and on-prem)

An infrastructure administrator creates a dedicated schema owned by a non-superuser migration login and a distinct `LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION` runtime login without role memberships. Provision both passwords through the deployment's secret manager, never in source. Ensure runtime owns no objects, cannot CREATE in the trusted schema, and has CONNECT to the intended DB. Apply `npm run migrate` using the migration login and `PGOPTIONS='-c search_path=<dedicated_schema>'`. As that same owner, run `RITIM_DB_SCHEMA=<schema> RITIM_RUNTIME_ROLE=<runtime> node security/provision-runtime.js`, with the owner's DB connection in `DATABASE_URL` or PG environment. Provisioning changes are transactional and must be reviewed before use. The API runs with the restricted login and identical schema search path.

Compose now accepts separate `MIGRATION_DB_USER/PASSWORD` and `RUNTIME_DB_USER/PASSWORD` plus `RITIM_DB_SCHEMA`; roles and schema must be pre-provisioned. The bootstrap database user is not the API or migration account. The helper is included in the image. Local Compose uses `DB_SSL=disable` inside its network; real cloud/on-prem deployments require reviewed TLS, CA and secrets. Docker/Compose and PostgreSQL 16 have not been tested here. Migrating a running installation and rollout/rollback of RLS with old API versions require a separate plan.

## Verification and remaining gates

Final PostgreSQL 14.19 / Node 22 run: `TEST_DATABASE_URL=<disposable privileged database> npm test` — **36/36 tests, zero failures/skips**. This includes 25 B01/B02 tests and 11 B03A tests (one parent and 10 subtests). B01/B02 use the privileged isolated test setup; B03A creates a separate non-superuser migration owner and a real restricted LOGIN for application queries. Creating temporary roles/schema and seeding fixtures require the privileged setup role. The B03A API test uses a test identity adapter; separate B02 tests exercise real JWT signatures and key rotation. A deliberate compromised-runtime probe successfully forges context and is an expected exposure, not a passed isolation guarantee. No real IdP, managed database, Docker or PostgreSQL 16 was exercised.

Before B03B, review grants on the actual target database, test migrations and provisioning with real managed and on-prem accounts, test PostgreSQL 16/Docker and deployment rollback, independently review SECURITY DEFINER and SQL injection surfaces, add security audit/rate limiting, and decide whether the compromised-process threat requires a stronger identity boundary. Before each MES command, add server-authorized capability checks, domain invariants, deterministic row locks, idempotency, movement history and concurrency regressions. No application role business-write permissions exist yet.

## B03A.1 deployment verification update

PostgreSQL 14 migration failure, fictional backup/restore, actual restricted-login privilege audit and real HTTP listener were additionally exercised. Docker/PostgreSQL 16 remain unavailable; Compose provisioning order and readiness are unresolved. See [B03A.1 deployment verification](B03A1_DEPLOYMENT_VERIFICATION.md) and its test evidence for current counts and release gates.

## PostgreSQL 16 / Compose follow-up

The prior Docker limitation has been addressed in the local fictional fixture. See [Docker verification](B03A1_DOCKER_VALIDATION.md) for current results, readiness behavior and residual security limitations.
