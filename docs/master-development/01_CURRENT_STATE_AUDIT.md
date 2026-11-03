# Current state audit — 2026-11-03

## Scope and evidence

Working directory: `D:/Projects/RitimFlowLite/RitimFlowLite`. Actual HEAD: `53153882cda16ff86550612faa0e85f8a130676b`, branch `main`, initially clean. No reset, merge, push, deployment, database mutation or demo-data reset was performed.

This is an initial M0 audit, not acceptance of the master program. Remote-tracking references below are locally available Git objects; they were not refreshed from the remote server.

## Critical repository discrepancy

HEAD is the static HTML/localStorage demo. It has no package manifest, backend directory, migration runner, authenticated API or premium integration directory. Its README explicitly excludes production use. GitHub Actions publishes the whole repository to GitHub Pages.

The required implementation exists on another locally recorded reference:

| Reference | SHA | Finding |
|---|---|---|
| origin/main | 5315388 | Current static demo |
| origin/backend/b01-foundation | 9367eef | Backend development history |
| origin/integration/operator-quality | 02e75e91d5ef02f5bf7f1f2b15bf5bb81ee7f9bd | Backend, premium integration, OIDC, recovery, warehouse, shipping, outsourcing, rework and returns |

`git merge-base --is-ancestor 5315388 02e75e9` exits 0. Integration has 19 commits absent from main. Historical backend features are available in Git, **not integrated into current HEAD**. Preserve them rather than recreating their logic. User approval is needed for merging because the master brief explicitly forbids merges without instruction.

## Current functionality

HEAD includes orders/work orders, operator demo, material allocation, supplier dispatch/return, final quality, shipping, customer-return quantity accounting and reconciliation. See [functionality inventory](03_MASTER_FUNCTIONALITY_MATRIX.md). These use mutable browser state, not server authorization or multi-user transactions.

Current domain baseline: `node --test tests/p0-domain.test.cjs` — **25 passed, 0 failed**, rerun on this computer. Tests cover pure reads, quantity conservation, supported-route restrictions, final release, partial shipping, return quarantine arithmetic, duplicate document rejection and approval lineage. They do not validate PostgreSQL, authentication, concurrency or synchronization.

## Historical implementation inspected read-only

At integration reference: backend migrations `001_foundation` through `007_production_execution`; migration runner serializes execution using a transaction advisory lock, tracks SHA-256 checksums and rejects unknown versions. Do not edit historical SQL to accommodate this machine.

Backend dependencies: Fastify 5.12.7, jose 6.1.3, pg 8.16.3. Scripts expose start, migrate, unit and database integration tests. Identity requires a server-verified principal. Configuration requires issuer/audience/JWKS together. Runtime provisioning rejects superuser, BYPASSRLS, ownership and role memberships; isolated-development grants are explicit. These are source observations, not local security acceptance.

Integration has separate auth-provider, API adapter, pending-command recovery and premium UI modules. Its history includes Keycloak/OIDC browser tests and encrypted recovery reports. No migration to Supabase or offline identity has been approved or verified here. Tenant/RLS, membership, audit and idempotency behavior still require full code review and real database reruns after restoring the implementation to the working branch.

## Runtime and Windows

| Item | Observed |
|---|---|
| OS | Windows 10 Home, 10.0.18362 |
| Node/npm | 24.12.0 / 11.6.2 |
| Git | 2.52.0.windows.1 |
| PostgreSQL service | postgresql-x64-18, Running |
| Client binaries | psql, pg_dump, pg_restore 18.6 under C:/Program Files/PostgreSQL/18/bin |
| Required integration runtime | Node 22.x, npm 10.x; .nvmrc 22.20.0 |

Client version does not prove server version; authenticated server queries have not run. Database ownership, credentials, existing databases, encoding and extensions are unverified. No credentials were requested in chat or printed. No environment file exists in HEAD's tracked tree; private environment values were not read.

Windows blockers: Node major mismatch; current browser test defaults to a macOS Chrome executable and requires Playwright, which has no dependency manifest in HEAD. Historical Docker tooling must be replaced or supplemented for local startup; Docker is not a prerequisite authorized by this program. Browser automation and all requested responsive widths remain NOT TESTED on this computer.

## Milestone disposition

- M0: PARTIAL — repository discrepancy and baseline established; deeper integration audit pending branch decision.
- M1/M2: BLOCKED — implementation absent from current checkout, supported runtime and dedicated database not provisioned.
- M3: awaiting explicit decisions in [ADR](04_ARCHITECTURE_DECISIONS.md).
- M4–M12: not accepted. No overall development or production GO.

Next: approve incorporation of the existing integration history; then inspect its instructions and reports, use supported Node, securely configure a dedicated database and rerun its real tests before implementing new domain logic.
