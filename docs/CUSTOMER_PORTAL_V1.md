# Customer portal v1 (review candidate, not deployed)


## Integration review (2026-11-18)

- Renamed the unshipped portal migration to **076**: versions 070?074 are already used by the deployed platform and 075 is reserved for the local hybrid pilot. No previously applied migration was edited.
- Fixed accessible names on sharing form controls; the original exact-label browser test failed before this correction.
- On the GitHub 069 baseline plus 076: **284 backend tests passed**, zero failures/skips; **292 domain tests passed**; pinned Playwright Chromium desktop/mobile test passed; cloud build passed. Native PostgreSQL 18.6 readiness and real backup/restore passed.
- Browser coverage uses mocked API responses and simulated EventSource; PostgreSQL/API tests separately exercise live streams and revocation. It does not prove real identity-provider onboarding, Vercel proxy buffering or physical-device operation.
- Screenshots overwrite the fixed artifacts/customer-portal directory (customer and sharing, mobile and desktop). Backend evidence stays in artifacts/native-postgres.

### Release blocked by baseline drift

A read-only check of the configured cloud database found versions 001?074, while origin/main contains 001?069. Main pushes trigger Vercel deployments. Do not merge this branch into main or run its standalone migrator against that database: the current migrator deliberately rejects unknown versions 070?074 and readiness requires exact migration parity. First reconcile the deployed platform implementation and its migration history with main, then rebase this portal change, retest, back up, migrate and reprovision the restricted runtime before routing traffic. Do not delete migration history or bypass readiness to make the deployment pass. The local 075 hybrid pilot is not implicitly approved for production by this portal change.

The current development workspace also has the portal integrated alongside platform/hybrid changes; those unrelated changes are intentionally not included in this feature branch. No live grants, accounts or production data were changed during review.

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
