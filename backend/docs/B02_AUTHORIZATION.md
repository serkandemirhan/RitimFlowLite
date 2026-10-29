# B02 — Identity, tenant/site authorization and deployment

> Historical B02 design: B03A now installs RLS and a runtime provisioning helper. See [B03A implementation](B03A_IMPLEMENTATION.md) for current status and limitations.

Status: foundation only; not production ready. No MES write endpoint exists. The frontend remains unchanged. Cloud and on-premise use the same code, PostgreSQL migrations, API and permissions.

## Trust boundary

`makeOidcVerifier` is the server-selected identity-provider adapter. Its output is only verified `(issuer, subject)`. The API accepts a bearer JWT access token with `typ=at+jwt`, an explicitly configured HTTPS issuer, audience and JWKS URL, `kid`, `sub`, `iat`, `exp`, and an allowed signature algorithm (production default RS256). Signature, issuer, audience, expiry, issuance time, maximum token age (one hour), key and algorithm are verified by `jose`; token-provided `jku`, `x5u` and embedded keys are rejected. Configure a provider that emits RFC 9068 access tokens: ID tokens and providers that do not emit `at+jwt` are not supported without a reviewed adapter change. The configured JWKS is cached and refreshed for key rotation; a removed key can remain accepted while cached, and membership disablement is checked independently in PostgreSQL. Tests use real signatures and a simulated HTTPS JWKS transport; a live provider has not been validated.

`users(issuer,subject)` is mapped server-side to an active user. Frontend user, role and tenant claims/headers never grant authority. Tenant/site path values are selectors; matching active DB ownership and grants are mandatory. A missing verifier fails closed. Health endpoints are unauthenticated and do not expose business data. `GET /api/v1/session` returns only the authenticated user's permitted sites, and the site capabilities endpoint rechecks the requested scope.

## Permission matrix

| Role | site.read | orders.read | orders.write | planning.write | production.write | quality.write | stock.write | shipment.write | members.manage | platform.manage |
|---|---|---|---|---|---|---|---|---|---|---|
| superadmin (platform grant) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| tenant_admin (all sites in own tenant) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| manager (site) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| planner (site) | ✓ | ✓ | — | ✓ | — | — | — | — | — | — |
| operator (site) | ✓ | ✓ | — | — | ✓ | — | — | — | — | — |
| quality (site) | ✓ | ✓ | — | — | — | ✓ | — | — | — | — |
| logistics (site) | ✓ | ✓ | — | — | — | — | ✓ | ✓ | — | — |
| viewer (legacy site role) | ✓ | ✓ | — | — | — | — | — | — | — | — |

Capabilities are policy descriptions, not implemented endpoints. Multiple active grants combine. Platform grants are global and must be provisioned via a separate privileged administrative procedure; there is no bootstrap bypass or membership-management endpoint. Both tenant and site membership records support revocation without deleting history.

## Database and concurrency

All future mutations must call `executeCommand` with a **server-selected** capability, never a capability from client input. It checks the active user, tenant/site ownership and active grants inside the same DB transaction before idempotency or handler execution. `FOR SHARE` locks active user, site and grant rows until commit; a concurrent revoke/disable waits for an already authorized transaction, and subsequent operations fail. Durable receipts are scoped by tenant, site, actor and key; different payload under the same key conflicts. A denial or handler exception rolls back receipt and changes. No session-level `SET` tenant context exists, so pooled connections cannot inherit another request's tenant setting. B03 must test all future handlers for scoped queries and use the same transaction client.

Migration 002 adds tenant membership, platform grant, site role and revocation structures. Composite tenant/site foreign keys remain in B01. B01 historical rows are not migrated or deleted. Schema migrations must be run by a separate migration role.

### RLS and application role — release blocker

PostgreSQL RLS is **not implemented or enabled**. Application query scoping is the current defense, not database-enforced row isolation; direct SQL or a future incorrectly scoped query can cross tenants. No claim of production tenant isolation is made. Before production choose and independently test RLS with transaction-local `set_config(..., true)` and pool/revocation tests, or an equally strong independently reviewed DB boundary; tables must use FORCE RLS where applicable, and the runtime role must not own tables or have `BYPASSRLS`/superuser privileges. Do not apply unreviewed illustrative SQL to a live database.

The intended runtime role is LOGIN, not owner, no schema CREATE/DDL, no role administration, no superuser/BYPASSRLS; grant only SELECT on `users`, `tenants`, `sites`, membership and platform-grant tables for B02 reads. For future command use grant SELECT/INSERT/UPDATE on `idempotency_records` only after policy/RLS is established; audit/business privileges must be added per reviewed endpoint. No INSERT/UPDATE/DELETE on users or grants belongs to the API role. A separate controlled provisioning role manages identities/grants and a separate migration owner performs DDL. PostgreSQL row-locking `SELECT ... FOR SHARE` also requires UPDATE privilege on at least one column of each locked table: plain SELECT alone is insufficient. Granting UPDATE on sensitive identity/grant columns to the API would permit escalation. Design and test narrowly scoped, hardened SECURITY DEFINER locking functions or an equally safe mechanism with independent review before deploying a restricted runtime role; the exact SQL grants are deliberately not presented as complete. **These least-privilege roles and grants are not provisioned by B02**; the development Compose currently shares the migration/database account with the API and is not a secure production deployment. Prevent untrusted database access and complete isolation work before real use.

## Cloud and on-premise configuration

Set `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` together to the configured provider's exact issuer, API audience and trusted HTTPS JWKS URL. Empty configuration disables authenticated endpoints; a partial configuration stops startup. Secrets must be injected via environment/secret manager, never committed. Cloud: managed OIDC provider issuing supported access JWTs, managed PostgreSQL with `DB_SSL=verify`, trusted CA, distinct runtime/migration DB accounts and network restrictions. On-premise: an OIDC-compatible local provider/reverse proxy with valid HTTPS DNS/certificate and accessible JWKS; configure the issuing CA in Node's trust store (for a private CA, mount its certificate and configure `NODE_EXTRA_CA_CERTS`), not TLS verification bypass. Configure PostgreSQL TLS according to deployment topology; Compose's `DB_SSL=disable` and same account are development-only. IdP administration, user provisioning, grant/revocation workflow, secrets, backup and actual provider interoperability require separate acceptance.

## Remaining security work and B03 plan

- Provision least-privilege roles, enforce and test database-level isolation; add concurrent pool leakage tests and adversarial direct-query tests.
- Add audited membership provisioning/revocation and platform-admin lifecycle with separation of duties and no public elevation; implement service identity lifecycle if needed.
- Test managed and on-prem providers, actual TLS/CA/key rotation and token format; token revocation at the provider is not checked online (valid JWT remains usable until expiry/max age unless DB user/grant is revoked). Define key compromise/cache invalidation policy.
- Add rate limits, network ingress controls, abuse monitoring, security audit logging, clock synchronization, disaster recovery and independent security review.
- Port domain commands from existing P0/P1 services one aggregate at a time, applying scoped authorization and deterministic locks inside transactions, idempotency, domain validation and append-only movement/audit history. Differential and concurrent regression tests must precede enabling each endpoint.
- Run Docker Compose with real PostgreSQL 16 and cloud database; local testing used PostgreSQL 14 and does not certify those environments.
