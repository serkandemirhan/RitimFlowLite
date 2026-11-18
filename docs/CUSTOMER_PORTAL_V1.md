# Customer portal v1 (review candidate, not deployed)


## Integration review (2026-11-18)

- Renamed the unshipped portal migration to **076**: versions 070?074 are already used by the deployed platform and 075 is reserved for the local hybrid pilot. No previously applied migration was edited.
- Fixed accessible names on sharing form controls; the original exact-label browser test failed before this correction.
- On the GitHub 069 baseline plus 076: **284 backend tests passed**, zero failures/skips; **292 domain tests passed**; pinned Playwright Chromium desktop/mobile test passed; cloud build passed. Native PostgreSQL 18.6 readiness and real backup/restore passed.
- Browser coverage uses mocked API responses and simulated EventSource; PostgreSQL/API tests separately exercise live streams and revocation. It does not prove real identity-provider onboarding, Vercel proxy buffering or physical-device operation.
- Screenshots overwrite the fixed artifacts/customer-portal directory (customer and sharing, mobile and desktop). Backend evidence stays in artifacts/native-postgres.

### Platform reconciliation and remaining release step

The feature branch now includes the deployed platform migrations 070?074, their runtime grants, platform management pages, workspace-aware login and /platform routing. A read-only check confirmed that all 74 deployed migration checksums match these files. The unpublished hybrid pilot 075 is deliberately absent from this release.

The combined branch passes **295 backend tests** on disposable PostgreSQL, including a real 074-to-076 upgrade test, exact history preservation, repeat execution, restricted grants, rejection of altered histories and rejection of unexpected 075. Runtime readiness and backup/restore pass. Mobile/desktop portal verification and cloud build pass. The RC1 packaging allowlist now includes the PWA and other UI assets already referenced by the application, with root-relative links normalized before fingerprinting; all 12 packaging tests pass.

Before merging (main triggers Vercel):

1. Finish all GitHub checks for the final commit and verify a current recoverable backup of the target database.
2. Generate the owner-executed script with `node scripts/windows/build-customer-portal-upgrade.cjs`. The result is `artifacts/cloud-setup/supabase-upgrade-076.sql`.
3. Execute the complete script once as the existing schema owner in Supabase SQL Editor, or use protected migration credentials. It verifies all 001?074 checksums, adds only 076 and grants only the four new portal functions. It can be safely repeated when history is unchanged. Do not use the restricted application account or bypass the checks.
4. Merge PR #2 immediately after the successful 076 result, wait for Vercel, and verify /health/ready plus customer/admin login, scope isolation and stream reconnect. The old deployment can report not-ready between migration and deployment because readiness requires exact migration parity.
5. Keep sharing disabled operationally (no grants) until real external-account and proxy acceptance succeeds. Revoking shares is the feature rollback; preserve migration history. A code rollback must retain schema 076 awareness.

Only the restricted runtime connection was available during review, so no live schema changes, grants, accounts or customer data were made. The missing owner access/SQL execution is the remaining release dependency.


## Scope

The customer portal is a separate, read-only view of explicitly shared orders. It does not grant the internal `viewer` role or any site membership. The existing internal production application remains unchanged.

- Customer entry: `/customer-portal.html`.
- Tenant administrator sharing entry: `/customer-sharing.html`.
- Login uses the existing secure cookie session. Only these two return paths are allowlisted.
- Administrators select customer and order, an existing active account, and whether quality results and linked quality documents may be shared. Revoking a share denies subsequent reads, downloads and stream snapshots.
- Account onboarding is not implemented here. First-time external users need an existing active identity; known scoped usernames and previously shared users can be selected. Never grant an internal employee/viewer role merely to enable the portal.
- Orders lacking a stable `customer_id` must be explicitly linked through existing master-data workflows before sharing. Customer names are not an authorization key.

## Data boundary

All external responses are explicit projections, not internal order API payloads. Every detail, document and stream read validates the authenticated user, active share and current order customer. Cross-tenant/site/customer IDs and another user's share are denied. Internal notes, staff identity, cost data, supplier details and arbitrary work documents are not projected. Quality attachments require both quality/document opt-in and a quality decision linked to the same order/work order.

The database uses restricted runtime roles and fixed-search-path security-definer functions. The private share table has no direct runtime access. As with the existing architecture, the application is trusted to verify identity; protection against arbitrary SQL execution as the runtime is not claimed. The portal does not broaden internal scope-opening permissions.

No production data is kept in browser local storage. Previously downloaded documents cannot be recalled when a grant is revoked.

## Updates

The selected order uses server-sent events. The server checks current data and authorization every 2 seconds, with a 20-second connection window and client reconnect. This fits the current 30-second Vercel function budget. It is near-real-time snapshot refresh, not transaction-triggered push and not a latency guarantee. UI shows last update and connection state. Test reconnect and proxy buffering in staging before release. Rate/capacity planning is required before large customer rollout.

## Migration and release

1. Back up the target database according to existing procedures.
2. Apply additive migration `076_customer_portal.sql` with the migration owner and reprovision the restricted runtime using the existing provisioning command. Do not edit checksums of older migrations.
3. Verify `/health/ready`, tenant-admin sharing, a customer with no internal memberships, and cross-customer rejection in staging.
4. Run database and browser gates below and review mobile/desktop output.
5. Obtain release approval separately. This PR does not merge or deploy itself.

Do not remove migration 076 after it has been recorded by the migrator. Feature rollback should remove UI access and revoke grants while retaining migration history; coordinate an explicit additive database rollback if needed.

## Verification commands

Use the repository's Node 22.20.0 / npm 10.9.3 toolchain and a disposable privileged PostgreSQL database, never production:

```sh
npm ci
npm ci --prefix backend
export TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/DISPOSABLE_DATABASE
npm run test:portal --prefix backend
npm run test:unit --prefix backend
npx playwright install chromium
npm run test:portal:ui
node scripts/build-cloud.cjs
```

The dedicated customer-portal workflow uses PostgreSQL 16 and pinned Playwright. A system-browser fallback is useful local evidence but is not equivalent to the pinned browser CI gate. Tests seed and remove isolated schemas/roles. Video, live factory cameras, email invitations, account provisioning, notifications and universal per-piece genealogy are out of scope.

## Local verification evidence (2026-11-18)

- Required Node 22.20.0 was installed into a temporary tool directory, without changing project dependencies.
- Real PostgreSQL 18.6 isolated-schema portal tests: 10 passed, including 500 stale grants, result-cap signaling, scoped downloads, live updates and revocation. PostgreSQL 16 is configured in the new CI workflow and still needs its CI result.
- Domain regressions: 292 passed. Cloud public build succeeded.
- A full backend attempt had 281 passing assertions and one unavailable backup/restore subtest (reported as two failures including its parent): `pg_dump` is not present in the local disposable PostgreSQL distribution. This is not a full-suite pass.
- Browser test was authored but could not run locally: the locked Chromium download returned a truncated archive, and installed Chromium could not create its singleton socket (`Operation not permitted`). Mobile/desktop visual acceptance and browser behavior remain unverified until that test runs in CI or another supported executor.

Do not treat this review candidate as production-ready until the outstanding browser and backup/restore gates are completed.
- Final backend rerun on the completed code, excluding only `b03a-migration-recovery.test.js`: 280 passed, 0 failed, 0 skipped. The excluded backup/restore suite remains outstanding, not silently counted as passed.
