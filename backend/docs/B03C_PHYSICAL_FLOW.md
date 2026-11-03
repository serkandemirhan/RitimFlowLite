# B03C — physical quantity and operation-flow foundation

Status: isolated development only. No production activation or deployment. Existing frontend behavior and explicit differences are documented in [frontend rule analysis](B03C_FRONTEND_RULES.md).

## Quantity and provenance

Customer `orderedQuantity`, individual work order `plannedQuantity`, and historical production good/scrap/QC-pending are separate from physical quantities. `physical_ledger` is an append-only sequence of direct receipts, dispatches and acceptances; it is not populated from production history. An initial job receipt is supported only against an existing active material reservation and a linked material lot with actual material receipt records. The command checks total active allocations against lot receipts and the work order plan, previously received quantities and outstanding destination transfers. Material receipts and allocations themselves have **no B03C write API**; tests seed fictional records through a privileged fixture.

A dispatch decreases the source lot's available balance immediately and increases in-transit quantity; only a separate accepted movement increases destination received/available balance. Cumulative received quantities stay separate from current availability and from production event totals. `GET physical-balances` returns `plannedQuantity`, cumulative `receivedQuantity`, cumulative `dispatchedQuantity`, `inTransitToQuantity`, `inTransitFromQuantity`, and `availableQuantity`. `reservedQuantity` is null because a trustworthy physical operation-reservation projection is not implemented. Work-order `physicalReceived` is derived from receipt/acceptance ledger entries when present and is null when no evidence exists. A projection does not create or repair movements.

If a work order has any production event, its available quantity is null and physical writes involving that job are refused: production-to-lot consumption and QC reconciliation are not yet implemented. Historical recorded good, scrap and pending event totals remain available in the separate B03B work-order representation and are not treated as stock. Legacy records are not migrated or reconstructed.

## Supported operation flow and constraints

Only **different work orders of the same order and first internal operation** are supported. This matches the same-step P0-04 physical transfer case. Later internal operations, predecessor approved-good reservations, nonterminal external routes, supplier operations and transfer reversal remain unsupported and must not be inferred. B03B later-operation planning and compensation safeguards remain unchanged. Source/target jobs must be open, belong to the same order and operation, have no unreconciled production, and the target's plan must cover received plus in-transit quantities. Dispatch requires a reason and positive safe-integer quantity; lot availability and target capacity are validated under an order row lock. Acceptance locks the same order, rechecks status and target capacity and writes a distinct ledger event. Duplicate acceptance with a different key is 409; the exact same idempotency key replays the original response.

Migration 006 creates tenant/site scoped `flow_transfers` and `physical_ledger` with forced RLS, scoped foreign keys, composite reservation provenance and generated-column foreign keys tying dispatch/accept job, lot and quantity to the source transfer. Unique transfer/event type prevents duplicate physical acceptance. UPDATE/DELETE triggers reject modifications to both histories; table owners and superusers remain privileged and must not be treated as untrusted application roles. Runtime receives INSERT only for the explicit isolated development mode; normal runtime has read-only access. The security model and arbitrary-SQL compromised-runtime limitation from B03A remain unchanged.

## Frontend adapter contract (development draft)

All paths start `/api/v1/sites/{tenantId}/{siteId}/orders/{orderId}` and require a verified Bearer access token. POSTs require `Idempotency-Key`; same actor/site/key and same payload replay their original result, while a changed payload is a conflict. Scope identifiers are selectors, not authority. Manager-equivalent `orders.write` is required for physical writes and `orders.read` for projection.

| Method/path | Body | Result |
|---|---|---|
| `POST /physical-receipts` | `{reservationId,quantity}` | 201 `{orderId,workOrderId,lotId,quantity}`; requires active allocation and received material |
| `POST /physical-transfers` | `{sourceWorkOrderId,destinationWorkOrderId,lotId,quantity,reason}` | 201 transfer id and `in_transit` status; no destination receipt yet |
| `POST /physical-transfers/{transferId}/accept` | `{}` | 201 accepted id/status/quantity; one acceptance event |
| `GET /physical-balances` | — | `{orderId,balances:[...]}`; nulls denote unavailable/unreconciled information |

Expected structured errors include 400 `INVALID_INPUT`, 401 authentication, 403 authorization, 404 scoped record missing and 409 `ALLOCATION_REQUIRED`, `ALLOCATION_INTEGRITY_ERROR`, `INSUFFICIENT_PHYSICAL_STOCK`, `PHYSICAL_CAPACITY_EXCEEDED`, `TRANSFER_ALREADY_ACCEPTED`, `OPERATION_UNSUPPORTED`, `PRODUCTION_RECONCILIATION_REQUIRED`, or `ORDER_CLOSED`. Other integrity errors fail closed. Frontend values and historic events are not silently imported. Unlike the frontend's synthetic child `TRANSFER:<id>` lot label, the backend carries the same explicit material lot reference through a transfer plus a unique transfer identifier; no supplier-batch provenance is invented.

## Verification and boundaries

The complete PostgreSQL 16.10 suite passed **66/66** using a real restricted runtime role and separate migration role; [TAP evidence](evidence/b03c-postgresql16.tap). B03C tests include receipt from allocation, frontend comparison for same-step transfer, source decrement and in-transit separation, duplicate/concurrent acceptance, concurrent overdraw, cross-tenant denial, invalid allocation, unsupported later operation, production reconciliation guard, rollback on audit failure, immutable history triggers and mismatched transfer quantity foreign-key rejection. B03B planning, B01/B02/B03A, migration, readiness and fictional backup/restore tests also ran. Tests use fictional seeded receipt/allocation records, real signed JWTs with simulated JWKS and a disposable PostgreSQL container.

Docker Compose smoke: migrations 001–006 and restricted-role provisioning completed, readiness was 200 and unauthenticated physical transfer was 401. [Compose evidence](evidence/b03c-compose-smoke.log). The isolated local API image was `sha256:6c53e9b382d707eec51dd39062ec7b10be3158c5e0e463f1420565dc782940d1`; it is not a published deployment artifact. No actual identity provider, real material intake, real workshop data or external deployment was tested.

**B04 production execution development: GO only for isolated development**, provided B04 first implements transaction-safe production-to-lot consumption, inspection/rework and current QC reconciliation with tests. Production endpoint activation and deployment remain **NO-GO**. Approved-good reservation between adjacent operations, outsourced operation flow, stock movement reversals, real material receipt/allocation endpoints, physical reserve projections, compensation loss validation and security review remain open.
