# Customer portal and platform reconciliation

The customer portal at /customer-portal.html exposes only explicitly shared orders. Tenant administrators manage grants at /customer-sharing.html. Customers receive no internal viewer role or site membership. The portal uses existing active identities; account onboarding is not included.

## Included changes

- Restores deployed platform migrations 070-074, runtime grants, platform management pages, workspace-aware login and /platform routing to the GitHub source.
- Adds portal migration 076, explicit order projections, optional quality results and linked quality documents, revocation, and short SSE windows.
- Fixes accessible names on sharing controls, the RC1 public asset allowlist/root-relative asset handling, and legacy rework result entry in the quality page. Operator controls stay limited to their current supported workflow.
- The unpublished 075 hybrid pilot is excluded from this production branch.

All 74 deployed migration checksums were verified against source using read-only access. No old migration contents were changed.

## Supported deployment states

The release explicitly supports the complete, checksum-valid 001-074 baseline and the complete 001-074 plus 076 schema. It does not accept arbitrary missing migrations or unknown versions. In the 074 state, /health/ready reports status ok and features.customerPortal=false; authenticated portal API requests return 503 FEATURE_NOT_ENABLED. Other application functions remain available.

After the owner applies 076, readiness requires the portal's restricted function grants and denies direct runtime table access. It reports features.customerPortal=true and portal APIs activate without restarting. Partial/unrecorded portal schema, changed checksums and unexpected versions still fail readiness. The local hybrid workspace has its own additional migration history and is not this release's supported 074 baseline.

## Deployment and activation

1. Finish final GitHub checks, then merge PR #2. Main triggers Vercel. The application can deploy safely against the existing 074 database with the portal pending.
2. Verify the deployed /health/ready response and existing login/platform routes.
3. Before activation, verify a current recoverable database backup. Generate the SQL with node scripts/windows/build-customer-portal-upgrade.cjs. The output is artifacts/cloud-setup/supabase-upgrade-076.sql.
4. Execute the entire script as the existing schema owner in Supabase SQL Editor or with protected owner credentials. It verifies all 74 checksums, applies only 076 and grants only the four new portal functions. It is repeatable when history is unchanged. The normal ritim_runtime account intentionally cannot run it.
5. Confirm the SQL returns 076 and /health/ready reports features.customerPortal=true. Test admin/customer login, explicit sharing, cross-customer rejection, linked document access, revocation and SSE reconnect through the deployed proxy before issuing real customer shares.

Do not remove 076 after application. Revoke shares to disable customer access; a code rollback after activation must retain awareness of schema 076. Previously downloaded documents cannot be recalled.

## Data boundary

Every order detail, document and stream refresh validates identity, active grant and the order's current customer_id. Names are not authorization keys. Internal notes, staff identities, costs, supplier details and arbitrary work documents are excluded. Quality documents require both quality/document opt-in and a decision linked to the same order/work order. The runtime has no direct access to the private shares table; fixed-search-path security-definer functions implement grants. As in the existing architecture, the app must authenticate identities; arbitrary runtime SQL compromise is not addressed by this feature.

The browser does not persist production data in local storage. SSE revalidates every two seconds, ends after twenty seconds and reconnects within the current thirty-second function limit. This is near-real-time polling, not transaction-triggered push. Real proxy buffering, external identity onboarding and physical-device acceptance remain activation checks.

## Verification

Node 22.20.0, pinned Playwright Chromium and disposable PostgreSQL 18.6 were used. The combined backend suite passes 295/295 with zero skips/failures; this includes 074-to-076 repeatability, preserved history/tenant data, rejected drift, restricted permissions, ready-but-disabled 074 behavior, authenticated 503 before activation and successful reads afterward. Restricted runtime readiness and real backup/restore pass. A read-only readiness check against the configured live 074 database also passes with customerPortal=false.

Portal mobile/desktop rendering, safe text, revocation, reconnect and admin lookup pass. Browser API/SSE are mocked; separate database/API tests exercise real streams. Cloud build and all 12 packaging tests pass. Full source/packaged browser and final GitHub checks are tracked on PR #2.

Only restricted runtime access was available for the live database. No live schema changes, customer accounts, shares or business records were made during integration. Activation still requires owner access or user execution of the prepared SQL.

Screenshots overwrite artifacts/customer-portal; backend evidence uses artifacts/native-postgres. Use the repository cleanup script when replacing other test outputs; retain fixtures and database backups.
