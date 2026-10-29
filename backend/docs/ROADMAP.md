# Backend roadmap

1. **B02 identity and isolation:** JWT verification, database membership and scoped capability checks implemented; membership administration, service accounts, database least-privilege provisioning, RLS decision enforcement and live provider acceptance remain open. Keep business writes disabled.
2. **B03 transaction and domain bridge:** first provision and test restricted database roles and isolation, then model versioned routes and aggregates, deterministic row locks, command payload canonicalization and audit/outbox policy. Build differential tests against existing JS P0/P1 services; add concurrent clients, restart, timeout, duplicate and rollback tests. Do not trust browser-provided history.
3. **B04 order/planning/material/production:** server endpoints behind B02 and B03 with UX-05 and UX-06 numerical cases, existing tests and concurrent database enforcement.
4. **B05 transfer, inspection, rework and external operations:** lot provenance, state transitions and supplier reconciliation; design the intermediate-external route separately.
5. **B06 final release, shipping, return, compensation:** gate shipment on last operation + final quality and approved inventory; net customer shipments determine completion; multi-client overspend/replay tests.
6. **B07 drawings/integrity/operations:** drawing object storage and acknowledgments, read-only reconciliation with supported legacy exceptions, export/backup/recovery and observability.
7. **B08 deployments:** same immutable container and migrations for cloud/on-prem; TLS, secret management, production DB roles/RLS policy, backup/restore drills, disaster recovery, performance, load/security tests, deployment and migration rollback plan. Require real device acceptance and explicit release review.

Browser localStorage import is a separate consent-based migration project; no automatic migration is included here. Both editions remain non-production until all critical security, business invariants and operations gates are complete.

B03B development now includes first-operation order/route/planning APIs, guarded by an explicit isolated-development flag. Later-operation reservations, material, production and quality flows remain to be implemented; see [B03B implementation](B03B_ORDERS_PLANNING.md). Production write activation remains NO-GO.

B03C provides an isolated, append-only same-operation physical dispatch/accept foundation. Production-to-lot consumption, QC reconciliation, adjacent-operation approved-good reservations, supplier flows, reversals and material-allocation commands remain open for subsequent development. See [B03C physical flow](B03C_PHYSICAL_FLOW.md).

## B04A development boundary

First-internal-operation lifecycle and reconciled input consumption are available only in isolated development. B04B must specify quality decisions and pending reconciliation, assignment/drawing acknowledgements and release boundaries before adding subsequent workflows; production activation remains NO-GO. See [B04A](B04A_PRODUCTION_EXECUTION.md).
