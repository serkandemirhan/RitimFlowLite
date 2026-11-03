# B03A — historical security boundary investigation

> Historical starting point. For implemented changes, test results and outstanding limitations, see [B03A implementation](B03A_IMPLEMENTATION.md).

28 October 2026. **NO-GO for server-side MES commands.** The B01/B02 baseline is commit `59e638f`. B03A migrations, RLS policies, restricted production roles and restricted-role acceptance have not been implemented. This document and the risk probe are preliminary work, not an approval or deployment procedure.

## Observed boundary

The existing B02 API verifies JWTs and authorizes with database membership, but its database queries and shared runtime role do not yet enforce tenant/site isolation. B01/B02 Compose uses the same elevated database account for migration and API. Its runtime role is not production-safe. Directly granting SELECT on a domain table to a non-superuser without RLS allows cross-tenant reads.

On PostgreSQL 14.19, `security/b03a-risk-probe.cjs` created a temporary schema and random NOLOGIN/NOBYPASSRLS role. With SELECT on orders, that role could read both fictional tenants. The role could also set and change an arbitrary transaction-local `ritim.tenant_id`; an application-selected `SET LOCAL` or `set_config` is therefore not by itself an independently trustworthy DB security boundary. The script checks these expected unsafe observations; its success does **not** mean isolation passed. It removes only its randomly named schema and role.

## Design constraints to resolve before implementation

1. An independently trusted identity must be bound to a transaction. A shared runtime role cannot be permitted to select any user ID or forge authorization by setting a GUC or calling a SECURITY DEFINER function with an arbitrary actor. The identity-binding mechanism and who can create or verify the binding must be specified and tested, including attacker access to SQL through the ordinary runtime role. A separate trusted identity broker or independently verifiable signed context are candidates; neither has been implemented or selected.
2. RLS must fail closed with no binding, constrain tenant and site in USING and WITH CHECK, cover every applicable domain and idempotency table, and be tested with missing context, attempted switches, rollbacks and pooled connection reuse. RLS must not be assumed to protect against table owners, superusers or BYPASSRLS roles. Membership/user/session access also needs narrowly scoped interfaces without revealing other tenants.
3. Separate migration owner, protected authorization-function owner and NOINHERIT/NOBYPASSRLS runtime identities must be provisioned with minimum grants; no runtime DDL or membership-table UPDATE. Any SECURITY DEFINER must have schema-qualified names, trusted search_path with pg_temp last, revoked PUBLIC EXECUTE, explicit ownership and a narrowly granted entry point. Validate privileges on real managed PostgreSQL as well as on-prem.
4. Authorization and membership/user revocation must be serialized through narrowly scoped database-owned locking functions, with no direct runtime UPDATE grants on sensitive tables. Test both orderings under concurrent connections and rollback.
5. Tenant/site selection remains an untrusted selector; API verifies JWT issuer, subject and membership before requesting a DB-bound context. A role claiming `verified:true` is an application-internal marker, not database proof of identity.
6. Schema migrations and API must not use the same database login. Deployment provisioning of roles needs an explicitly controlled privileged operator and a non-superuser migration owner; test managed service restrictions. No credentials or production data belong in source or tests.

B03A acceptance must exercise all existing B01/B02 regressions through the actual restricted API pool, plus negative SQL and API tests for cross-tenant/site reads/writes, attempted context/actor escalation, privileges, idempotency, row-lock races and connection reuse. Record setup/migration role separately. The present privileged baseline tests do not meet this acceptance. PostgreSQL 16/Docker and cloud provider acceptance remain pending.

B03B, after the database boundary passes independent review, should port server domain commands one aggregate at a time with deterministic locking, durable idempotency, transaction-scoped authorization, append-only audit and differential regression against the existing P0/P1 implementations.
