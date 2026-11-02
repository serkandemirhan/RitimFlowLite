# REST contract draft

B01/B02 endpoints implemented:

| Method | Path | Authentication | Semantics |
|---|---|---|---|
| GET | `/health/live` | none | 200 `{"status":"ok"}` when process responds. |
| GET | `/health/ready` | none | 200 only when DB connectivity, installed migration checksums, runtime role, selected grants and RLS table flags pass; 503 `DATABASE_UNAVAILABLE` otherwise. Does not certify identity provider availability or every possible policy/grant. |
| GET | `/api/v1/session` | required | Returns the verified identity and authorized tenant/site memberships, roles and capabilities; 401 without an accepted bearer token. |

| GET | `/api/v1/sites/{tenantId}/{siteId}/capabilities` | required | 200 with database-derived scope roles/capabilities; 403 if the requested scope is not authorized. |

Bearer tokens must be signed JWT access tokens with `typ: at+jwt`, configured issuer/audience, `kid`, `iat`, `exp` and `sub`. Scope identifiers are selectors, never evidence of access. Session membership results expose only sites the identity can access. No role or tenant claim is trusted as authorization. See [B02 authorization](B02_AUTHORIZATION.md).

Errors use `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Unsupported routes/methods return 404. No create/update/delete business route is exposed.

## Future endpoints — design only, not implemented

Examples: `GET /api/v1/sites/{siteId}/orders`, `POST /api/v1/sites/{siteId}/orders`, `POST /api/v1/sites/{siteId}/work-orders/{id}/production-events`, `POST /api/v1/sites/{siteId}/transfers/{id}/accept`, `POST /api/v1/sites/{siteId}/shipments`, `POST /api/v1/sites/{siteId}/customer-returns`. Every future operation requires verified identity, server-resolved tenant and site membership, explicitly checked permissions, input schema and a single database transaction with durable idempotency and audit/movement writes. A client idempotency key must be unique per actor/site and reused for the exact retry; conflicting content returns 409. API does not accept client-provided role/user as authority. Distinguish 401 authentication, 403 authorization, 409 conflict/business invariant, 422 validation and 503 temporary unavailability. Exact semantics and stable error codes remain to be approved alongside implementation.

## B03A database context

Site capability requests authorize membership and set transaction-local scope in the same transaction. Session membership discovery uses narrowly scoped database functions. No MES mutations are exposed. A caller cannot assert user, role or scope through headers. Database functions assume the API has authenticated the actor; a compromised runtime database credential can forge context and is not isolated by RLS. See [B03A](B03A_IMPLEMENTATION.md).

## B03B isolated-development endpoints

Draft order, route and work-order planning endpoints are documented in [B03B orders and planning](B03B_ORDERS_PLANNING.md). They are disabled by default and are not a production API.

## B03C isolated physical flow

Draft physical receipt, dispatch, acceptance and balance endpoints are documented in [B03C physical flow](B03C_PHYSICAL_FLOW.md). They are disabled by default and unsupported later/fason/production-consumption flows fail closed.

## B04A development-only production contract

See [B04A production execution](B04A_PRODUCTION_EXECUTION.md) for authenticated lifecycle, result and reconciled-balance endpoints, idempotency and fail-closed quality/assignment boundaries. No final release or downstream stock is created.

### B04B-1A — development-only production quality classification

All paths below use `/api/v1/sites/{tenantId}/{siteId}/orders/{orderId}/work-orders/{workOrderId}/quality` and require a verified identity and authorized site membership. These routes exist only with isolated development enabled. `POST /decisions` requires `quality.write`, a persistent `Idempotency-Key`, and JSON `{ "eventId": "uuid", "lotId": "uuid", "outcome": "approved|rejected|rework", "quantity": 1, "evidence": "inspection reference" }`. The evidence is a required actor-supplied reference, not a verified inspection document or drawing approval. The source must be a reconciled good or pending output from the first supported internal operation. A single order lock serializes production and quality decisions. The response is 201 with decision ID, submitted fields, `classificationOnly: true` and `downstreamReleaseSupported: false`; duplicate keys replay the same result. Bad input is 400; unauthorized scope/role is 403; provenance, drawing restrictions and over-disposition fail closed with 409.

`GET` requires `orders.read` and returns `outputs` per reconciled production event with `eventId`, `lotId`, `kind`, `produced`, `approved`, `rejected`, `rework` and `unresolved`; it also explicitly marks downstream release unsupported. Historical production quantities are not altered. Existing B04A completion continues to block on historical pending quantities even after classification; completion reconciliation is intentionally deferred. Output classified as approved is not physical stock available for dispatch or reservation. Drawing revisions fail closed because acknowledgement is not yet implemented.

### B04B-1B output provenance extension

For new `good` or `pending` production results, the existing response adds `outputLotId`, a server-generated event-specific UUID; existing `lotId` continues to identify the consumed input lot. Scrap and setup-scrap return `outputLotId: null`. The quality decision request keeps its original `eventId` and input `lotId` contract; optional `outputLotId`, when supplied, must match the server's provenance or the request fails with `INVALID_PROVENANCE`. New quality decisions carry a database-enforced link to the output identity. Older decisions remain unchanged.

Quality summaries add `outputLotId`, `provenanceStatus` (`linked` or `historical_unreconciled`) and `eligibleForReservation: false`. Historical events are never backfilled or silently reinterpreted: null means no trustworthy output identity exists. Neither creation of an output identity nor approval releases stock. Reservations and downstream movement remain unsupported.

### B04B-1B — isolated development output reservations

All routes below use `/api/v1/sites/{tenantId}/{siteId}/orders/{orderId}`, authenticated server identity and authorized tenant/site scope. Mutations require `planning.write` and an `Idempotency-Key`. None of these commands dispatches, receives or releases physical inventory.

- `POST /downstream-work-orders`: `{ "outputLotId": "uuid", "operationId": "uuid", "workOrderNumber": "text", "plannedQuantity": 8 }`. Creates a first adjacent internal-operation work order and its initial reservation atomically; returns work-order and reservation IDs with `physicalReceipt: false`.
- `POST /output-reservations`: `{ "outputLotId": "uuid", "destinationWorkOrderId": "uuid", "quantity": 5 }`. Reserves additional approved quantity for an existing waiting adjacent work order only, within outstanding destination capacity.
- `POST /output-reservations/{reservationId}/releases`: `{ "quantity": 3 }`. Appends a partial release against that reservation; retrying the same command key returns the same receipt.
- `GET /output-lots/{outputLotId}/reservations`: returns produced, approved, rejected, rework-required, unresolved quality, outstanding reserved, cumulative released and available-approved quantities, plus reservations and ordered event history. Available approved quantity is a planning balance, not physical stock.

The earlier B04B-1B foundation description of `eligibleForReservation: false` applied before reservation commands existed. Quality summaries now set this flag only when a linked output has approved quantity not already reserved; this flag does not guarantee a suitable destination or authorize physical movement. Historical events without linked output identity remain unavailable. Unsupported external/non-adjacent operations, physical downstream movement and downstream execution remain closed.

### B04B-1C — isolated development assignment and completion

The existing `POST …/production/complete` keeps the operator identity/assignment, work-order state and physical reconciliation gates. Its quality gate now requires all good/pending output to have explicit quality dispositions and rejects any rework-required quantity until a safe rework lifecycle exists. Historical production is not rewritten and a decision is not physical release. Quality decisions and completion serialize on the order lock.

Manager-equivalent users with `orders.write` may call the following under `/api/v1/sites/{tenantId}/{siteId}/orders/{orderId}/work-orders/{workOrderId}/assignment`, with a durable `Idempotency-Key`:

- `POST /operator`: `{ "operatorId": "uuid", "reason": "text" }`; assigns an active site operator to an unowned waiting/paused work order. Existing owners require explicit handover.
- `POST /machine`: `{ "machineId": "uuid", "reason": "text" }`; changes machine for a waiting/paused assigned work order. Machine must belong to the site and be free.
- `POST /handover`: `{ "previousOperatorId": "uuid", "newOperatorId": "uuid", "reason": "text" }`; verifies current owner and active new operator. No implicit takeover.

These are independent append-audited, idempotent transactions; assignment history retains released prior rows. Downstream work orders still cannot execute production. Any drawing revision still blocks production and quality; no revision acknowledgement endpoint or automatic approval exists.

The B04B-1C completion rule above supersedes the earlier B04B-1A note that resolved historical pending events always block completion; unresolved output and unsupported rework still block it.

### B04B-2 cross-operation movements (isolated development only)

Paths are relative to `/api/v1/sites/{tenantId}/{siteId}/orders/{orderId}`. Both commands require `stock.write`, a unique persistent `Idempotency-Key`, and `{ "quantity": positiveSafeInteger }`. `POST /output-reservations/{reservationId}/dispatches` returns 201 `{id, orderId, reservationId, quantity, outputLotId, destinationWorkOrderId, inTransit}`. `POST /operation-dispatches/{dispatchId}/receipts` returns 201 `{id, orderId, dispatchId, quantity, inputLotId, destinationWorkOrderId}`. Repeating the same key and payload returns the same result; an altered payload using the key is rejected. `GET /output-lots/{outputLotId}/movements` exposes classified output, reservation, dispatched, received, transit and remaining quantities. `GET /work-orders/{workOrderId}/operation-inputs` exposes each received lot and genealogy. Dispatch/receipt neither approve quality nor start production. Invalid inputs return 400, insufficient capability 403, nonexistent scoped references 404 and invalid provenance, route, or excessive quantity 409; no local fallback is permitted. See `B04B2_CROSS_OPERATION_FLOW.md` for accounting and limitations.

### Downstream production (isolated development only)

The existing `/work-orders/{workOrderId}/production/{start,pause,resume,results,complete,summary,balances}` contract also supports the immediately following internal operation. `results` consumes `{lotId, kind, quantity}` only from a physically received operation input lot owned by that work order. `GET /work-orders/{workOrderId}/operation-inputs` reports `received` and `availablePhysicalInput` separately, with lot genealogy. Dispatch/receipt can continue while the destination is running or paused. Drawing revisions still fail closed, quality remains an explicit separate decision and later operations are unsupported. See `DOWNSTREAM_PRODUCTION_READINESS.md`.

### Operator/quality integration discovery and fictional input

The isolated-development-only assignment options, fictional material intake/allocation and reload reads, production and quality event histories, and downstream discovery contracts are documented in [INTEGRATION_API_DEPENDENCIES.md](INTEGRATION_API_DEPENDENCIES.md). Fictional onboarding cannot be used as a real supplier receiving system. Existing physical receipt, assignment, downstream reservation and movement commands are reused and remain separate transactions.

### Assigned operator work orders (isolated development only)

`GET /api/v1/sites/{tenantId}/{siteId}/operator/work-orders?limit=50&after={workOrderId}` requires a verified bearer identity and an active `operator` membership at that site. A manager, tenant administrator or superadmin without an active operator membership receives 403; a user with both manager and operator roles sees only their own active assignments. The server obtains ownership from the verified identity and `work_assignments` with `released_at IS NULL`; client ownership selectors and other query parameters are rejected. The endpoint is not registered outside explicitly isolated development. The same tenant/site authorization transaction and forced RLS apply; the existing restricted runtime grants are sufficient, and no migration is needed.

Response: `{workOrders: [{id, orderId, workOrderNumber, partName, partNumber, operation: {id,name,sequence,kind}, machine: {id,code}|null, status, plannedQuantity, producedQuantity, remainingQuantity, physicalInputAvailable, qualityPendingQuantity, drawingRestriction, reconciliationWarning}], nextAfter}`. `producedQuantity` includes historical good, pending, scrap and setup scrap; `remainingQuantity` is plan minus recorded production. `physicalInputAvailable` is the reconciled current received input less consumption and is not a planning remainder. `qualityPendingQuantity` is unresolved quality on good and pending output; it is not approved stock. An existing drawing revision yields `DRAWING_ACKNOWLEDGEMENT_UNSUPPORTED`, and does not imply an approval. When provenance/quantity reconciliation or the operation is unsupported, the four derived quantities are null and `reconciliationWarning` identifies the failure; the endpoint never invents values. Individual production mutations retain all original authorization and drawing guards.

`limit` is 1–100 (default 50); UUID `after` is an exclusive work-order ID cursor, with deterministic ascending UUID ordering; `nextAfter` is null on the last page. Each response is one repeatable-read transaction; assignment changes committed after its snapshot appear on the next request. Pagination across separate requests is not a frozen snapshot. Missing/invalid authentication returns 401, unauthorized scope or non-operator returns 403, and invalid pagination or unknown parameters returns 400.

### Development drawing publication and operator acknowledgement

These endpoints exist only in isolated development. A manager uses `POST /api/v1/sites/{tenant}/{site}/orders/{order}/drawings/publish` with an idempotency key and `{revision,reason,contentBase64}` (a PDF up to 5 MiB). The server validates the envelope, computes SHA-256, and atomically creates immutable revision, document, publication and audit records. The endpoint is a fictional development document store, not a production document-management or malware-scanning service. An old revision with no explicit publication remains blocked; it is never guessed or migrated.

`GET .../work-orders/{job}/drawing` returns the current publication/revision, checksum and whether the verified requesting actor acknowledged this publication for that work order. `GET .../drawing/document` returns the current verified bytes as `contentBase64` after checking SHA-256. Opening a document has no acknowledgement side effect. An active assigned operator uses `POST .../drawing/acknowledge` with an idempotency key and the exact `{publicationId,revisionId}`; the server locks the order, checks current assignment and membership, rejects stale publication identities and writes an immutable audit-linked record. Publication and production commands lock the same order. A new publication invalidates prior acknowledgement without modifying it. Start, resume, results and complete require the assigned operator's current acknowledgement; pause remains available as a safe stop even if a revision changes while running. No-drawing orders retain existing behavior. Unpublished historical drawings fail closed.

These claims apply to authenticated requests through the application; the existing documented compromised-runtime arbitrary SQL limitation remains. Document delivery, file scanning, tamper protection, secure document storage and live identity provider integration require separate production work.

## Isolated-development warehouse inventory

All paths below are relative to `/api/v1/sites/{tenantId}/{siteId}/inventory`. Reads require verified identity and site membership with `orders.read`; commands require `stock.write`, `Idempotency-Key`, and the existing transaction/audit boundary. Cookie-authenticated premium clients register commands with the encrypted recovery API before retrying. All quantities in this initial contract are positive integral **pieces**; other units fail closed. Endpoints are disabled outside isolated development.

- `GET /materials`, `GET /materials/{materialId}`; `POST /materials` body `{code,description,baseUnit:"piece",lotTracking:true}`.
- `GET /locations`; `POST /locations` body `{kind,code,parentId}`, with `plant → warehouse → region → container` and `parentId:null` for a plant.
- `POST /receipts` body `{materialId,locationId,lotCode,supplierRef,documentRef,quantity}`. A unique lot and an inbound movement are recorded.
- `GET /balances` projects piece balances for each warehouse lot/container; `GET /movements` includes recorded picks and the linked order, work order, production lot and reservation IDs.
- `POST /move` body `{lotId,sourceLocationId,destinationLocationId,quantity}`; `POST /scrap` body `{lotId,sourceLocationId,quantity}`.
- `POST /pick` body `{lotId,sourceLocationId,orderId,workOrderId,quantity}`. This debits the warehouse and atomically creates the linked order-scoped production lot, reservation and B03C physical receipt; it does not create production output. Only a supported first internal operation is eligible. The order-specific material receipt uses an internal `WH-PICK-…` reference, while the original supplier receipt remains separately traceable through the warehouse pick.

Identical key and command retries return the original receipt; a differing command with the same key is rejected. Unsupported units/flows, insufficient physical stock, capacity conflicts, invalid site ownership and authorization failures are rejected. Production and quality quantities continue to come from their own ledgers; no warehouse balance is inferred from historic production.

Material listing is limited to 500 records; pagination and a complete large-catalog search remain production work.

### Shipping API (isolated development)

Under `/api/v1/sites/{tenant}/{site}/orders/{order}/shipping`, `GET /` returns shipping orders, approved final-operation lots, aggregate allocated/dispatched/delivered/in-transit quantities and append-only event history. `POST /orders` creates a shipping order. `POST /orders/{shippingOrder}/allocate` accepts `{outputLotId, quantity}`; `/dispatch` accepts `{allocationId, quantity}`; `/deliver` accepts `{dispatchId, quantity}`. Each command requires `shipment.write` and an idempotency key; each persists audit with the movement. The order row is locked for the entire transaction. Availability uses quality approval minus downstream reservations and shipping allocations. Only completed final internal operations on supported one/two-operation internal routes qualify. Delivery is an explicit command, never inferred. Customer returns and allocation release are not supported.

Restricted PostgreSQL concurrency, audit rollback and fictional real-Keycloak source/package flows are covered by the shipping acceptance tests. These endpoints remain isolated-development only and are not approved for production activation.

`totals.availableToShip` is the lesser of approved, unreserved, unallocated lot quantity and remaining customer-order capacity after legacy net shipments and shipping allocations. Closed/cancelled orders report zero available; their history remains readable. A shipping allocation is also deducted from the existing output-lot availability projection. Allocations currently cannot be released or corrected through this development API.
Historical production without a trustworthy event-specific output lot is not made shippable or backfilled. Existing shipment/return history remains intact and is counted only for the order capacity limit; no customer-return command is exposed.
Shipping-order status and totals are derived from immutable events; an order can be `draft`, `allocated`, `in_transit`, `partially_delivered`, `partially_dispatched`, or `delivered`. Per-order and aggregate responses separately expose `awaitingDispatch` and `inTransit` quantities.
# Development-only rework decision discovery

`GET /api/v1/sites/{tenantId}/{siteId}/quality/rework-decisions?limit=50&after={decisionId}` requires an active site membership with `quality.write`. Results are ordered by decision UUID and use `nextAfter` for pagination. Each item identifies its order, work order, original production event, input lot, output lot when available, classified quantity and provenance status. A missing output lot is reported as `historical_unreconciled`.

The response includes the classified `quantity`, outstanding `allocated`, `available` to allocate, and allocation records with any bound work order, input lot and source output lot. These quantities are rework claims, not available normal inventory. Historical decisions without trusted output provenance remain read-only.

`POST /api/v1/sites/{tenantId}/{siteId}/orders/{orderId}/rework-allocations` requires `quality.write`, an idempotency key and a body `{ "decisionId": "<uuid>", "quantity": 1 }`. It serializes on the order, requires a rework decision with verified output provenance and caps cumulative outstanding claims at that decision. It creates an immutable allocation and audit record in the command transaction; it does not create a work order or physical movement, and execution remains disabled. The encrypted recovery command uses kind `operation`, command `reworkAllocate`, target/orderId equal to the order and the same payload.

`POST /api/v1/sites/{tenantId}/{siteId}/orders/{orderId}/rework-allocations/{allocationId}/releases` releases a positive quantity from an unbound claim. It uses the same order lock, authorization, idempotency and audit boundary. The encrypted recovery operation is `reworkRelease`, with `resourceId` set to the allocation. Once an input is bound, releasing any part of that allocation is rejected.

`POST /api/v1/sites/{tenantId}/{siteId}/orders/{orderId}/rework-allocations/{allocationId}/work-order` accepts `{ "workOrderNumber": "..." }` with `quality.write` and an idempotency key. It creates a work order, rework input lot and immutable source-output binding in one transaction, for the entire outstanding allocation. The encrypted recovery operation is `reworkWorkOrder` with the allocation as `resourceId`. Existing operator assignment, drawing acknowledgement and production APIs apply. Rework output requires an explicit quality decision; further rework of that output is rejected. This development-only backend slice is not yet connected to the premium Rework UI.

### Fason geliştirme API'si

İç → fason → iç rota, tedarikçi, sevk, kısmi dönüş, giriş kontrolü ve onaylı dönüşün sonraki işe fiziksel teslim sözleşmesi için [Gate 2 Fason uygulama notlarına](GATE2_OUTSOURCING_IMPLEMENTATION.md) bakın. Bu uçlar yalnız izole geliştirme modunda açıktır.
