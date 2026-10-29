# B04B-1 domain review and implementation status

Status: incomplete. No quality, release, downstream planning, assignment, handover or reservation endpoint is enabled by this document or the standalone projection. Development and release remain blocked until the database and API work and verification below are complete.

## Frontend comparison

`quality-service.js` allows a manager to disposition a pending result in portions into good, scrap and rework; it retains inspection identity and input-lot references. Direct good recording requires a manager or an explicit per-user/per-operation self-inspection policy. B04A records good and pending separately, does not implement that policy, and creates no downstream quality release. This phase must require explicit traceable quality evidence even for recorded good. This is intentionally stricter than frontend self-inspection and must not turn a pending result into approved stock without a decision.

`planning-service.js` computes adjacent-operation capacity from previous good production minus active reservations and reserves the input when creating the downstream work order. `operation-ledger.js` separates reserved, in-transit and received states. Reservations do not create physical receipts. B03B currently permits work-order creation only for the first internal operation; B03C permits only same-operation transfers and rejects dispatch after production. The new reservation contract must account for that deliberate restriction instead of using an untrusted work order or silently enabling downstream execution.

`workforce-service.js` requires a manager to assign an operator or change machine, rejects changes to a running job until paused, requires a reason for machine change and prevents assigning a busy machine. Explicit take-over cannot override another owner. B04A requires one existing active machine/operator assignment and checks the authenticated operator. A server command must safely verify the assignee's current site membership and serialize assignment changes against production. `drawing-service.js` binds acknowledgement to the current revision, job and user; B04A fails closed whenever any drawing revision exists, and that restriction must remain until a secure revision acknowledgement model is implemented.

## Safe projection scaffold

`src/output-projection.js` is a pure, standalone calculation scaffold. It fails closed on invalid quantities, orphan references, duplicate IDs, over-disposition and over-reservation. Neither good nor pending is available without an explicit approval. It is not connected to the HTTP API or database and does not validate authentication, physical ledger provenance, route sequence or concurrency; it must not be treated as an inventory authority.

## Required remaining implementation

- Add immutable tenant/site-scoped production-event quality dispositions and output reservations with composite provenance keys, forced RLS, runtime grants and readiness checks; prevent incompatible mutations outside isolated development.
- Lock the order and validate physical B04A event/lot consumption, current quality authority, drawing and operation sequence under the same transaction. Ensure approved, rejected and rework portions cannot exceed the produced event quantity. Audit and idempotency writes must roll back together.
- Introduce a safe downstream planning and reservation contract, atomically constrain source availability and destination planned capacity, and distinguish reservation from physical dispatch and receipt. Keep downstream production and B03C cross-operation movement disabled.
- Reconcile resolved pending quantities into completion without erasing historical events. Define unresolved rework handling and avoid treating classified good as final release.
- Implement safe machine/operator assignment with membership verification and locking; retain drawing revision fail-closed behavior until acknowledgements are implemented.
- Test PostgreSQL 16 restricted-role concurrent requests, revocation, cross-tenant/site, duplicate commands, audit rollback, migration/readiness and isolated Docker Compose, plus the full B01–B04A suite. No production activation.

## Continuation: reservation release projection (incomplete)

The pure projection now accepts append-only partial reservation releases and validates the source event, lot, work order and destination identity. It rejects duplicate release IDs, over-release and invalid provenance without modifying the input. Because these arrays do not encode a trustworthy global event order, it conservatively rejects gross reservations above approval even when later releases could make a final balance fit; safe re-reservation after a release needs an ordered persistent ledger. This is a calculation-only test scaffold and neither authorizes nor persists a command.

The B04A completion gate still checks historical pending output; no quality decision endpoint, PostgreSQL disposition/reservation ledger, next-operation planning, assignment command, migration or development route is implemented in this continuation. These are required before B04B-1 acceptance. Do not enable downstream production, dispatch, reservation or quality writes based on this scaffold.
