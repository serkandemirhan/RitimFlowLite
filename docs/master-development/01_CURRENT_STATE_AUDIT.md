# Current state audit — 2026-11-03

## Current continuation: both branches reconciled

Latest requested local run: installed service database `ritim_local_dev` initialized with 65 tables/28 migrations, separate owner/runtime roles, real native Keycloak/BFF login and persisted 10-piece order **SIP-1793716581659**, verified by restricted SQL and browser reload. [Proof](17_LOCAL_RUN_VERIFICATION.md) supersedes the earlier persistent-installation/login blockers below. Existing databases were not reset; only the new explicit development DB and local fictional identity fixture were provisioned. A-G design direction was approved; detailed production/offline/sync policy remains open.

User approved the second merge while asking to continue the master task. Audited HEAD is `2ffcdc1ebc782ed5d217cbf802dc090465c0085e` (backend merge), with integration `02e75e9` and backend `9367eef` both ancestors. Tests include the Windows helper changes in this checkpoint's working tree. No push/deployment. Migration inventory is now **001-028**, not only 001-007. [Current matrix](03_MASTER_FUNCTIONALITY_MATRIX.md) supersedes the original demo inventory.

Native Windows PostgreSQL **18.6**, SCRAM for all local/host logins: **142 backend tests passed, zero fail/skip/cancel**. Seven role-using suites now create random per-role credentials rather than depending on trust authentication; no bootstrap password is shared with runtime/migration roles. All historical migrations are unchanged. Restricted-role Fastify smoke applied 28 migrations, repeated with zero changes, returned liveness/readiness 200 and unauthenticated session 401. Backup/restore recovery tests passed.

Additional Windows operations rehearsal passed: initialize a separate development DB with migration/runtime identities, migrate/provision/readiness, backup and restore into a new test DB; fictional order quantity 42, all 28 migration checksums, FORCE RLS and existing database ownership preserved. Destructive/repeated targets were refused. Clusters were stopped in finally; the installed PostgreSQL Windows service and its databases/authentication configuration were never modified. Private stopped test clusters are not the user's persistent workshop database.

Windows operational scripts now include secure local initialization, migrations, provisioning, backup/restore, diagnostics, API/web startup and test actions. Passwords are supplied by a local credential prompt and generated role credentials stored with Windows DPAPI in a current-user-only folder outside Git. That interactive setup has not been executed against the user's existing service. Backend unit command now covers all current pure suites (**37/37**); integration command includes previously omitted quality/recovery/upgrade suites.

M0 discovery and initial functionality mapping are complete for the reconciled code. M1 native validation PASS; persistent development service setup and live user identity remain BLOCKED awaiting local credentials/configuration. M2 premium authenticated browser acceptance remains incomplete. M3-M5 require explicit A-G architecture decisions. No overall product GO.

## Historical continuation after first approved integration merge

The user approved merging `origin/integration/operator-quality`. Audit checkpoint `eed41d8` and merge `ac360fb` are local commits. Conflicts in ten demo/UI/test files were resolved using expanded integration implementations; main's historical audit evidence was retained. The integration tip is now an ancestor of HEAD. No push occurred.

**Correction:** the initial ancestry statement below was wrong: a multi-command shell masked a failing exit code. Actual shared base is `a28d5621f175f2e3f5f101396807d9eba60c4ff7`. Both histories were preserved by the merge. Initial HEAD observations below are historical.

**Additional backend gap:** integration contains only migrations 001-007. `origin/backend/b01-foundation` has 18 further commits absent from the merged HEAD: warehouse, shipping, rework, outsourcing, returns, drawing acknowledgement, OIDC BFF and secure recovery APIs already called by the frontend. Approval for this second merge is pending. Do not recreate or mock the missing endpoints.

Node 22.20.0/npm 10.9.3 were installed under the user's local application-data RitimFlowLite tools directory without changing system Node. Official Node ZIP SHA-256 matched its published checksum list. Both dependency lockfiles installed with lifecycle scripts disabled. Windows Playwright Chromium was installed.

Supported-runtime reruns: 292 domain, 14 backend unit, 12 packaging and 14 recovery tests pass. Packaging initially failed four tests due to Windows separators; actual paths now normalize to URL format before the unchanged exact allowlist check. PostgreSQL accepts loopback TCP connections; authenticated database access remains untested.

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

Integration initially had 19 commits absent from main. Historical features were available in Git but absent from the initial HEAD. See the correction above for ancestry and merge results. Further backend integration remains pending separate approval.

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
