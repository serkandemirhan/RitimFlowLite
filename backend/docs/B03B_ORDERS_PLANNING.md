# B03B — isolated development order and planning API

Status: **development only; no production or SaaS readiness.** B03A transaction, authentication, RLS and idempotency mechanisms remain in use. Production deployment/activation is NO-GO. Frontend and its localStorage data were not changed.

## Activation and database model

All B03B routes are absent unless both `NODE_ENV=test` or `NODE_ENV=development` and `RITIM_ISOLATED_DEVELOPMENT=true` are explicitly set. Production mode with the flag is rejected at startup. Compose uses `RITIM_NODE_ENV` (default `production`) and the same flag for both provisioning and API. Use only isolated fictional test databases. Runtime provisioning grants INSERT on orders, operations, work orders and audit, plus UPDATE of the order-number column solely to permit row locking; default non-development provisioning removes these grants. The normal runtime still cannot write these tables. These development grants must not be enabled against a production database. The compromised runtime credential/SQL threat described in B03A remains: RLS is defense in depth, not cryptographic tenant identity binding.

Existing B01 relations already supplied tenant/site-scoped composite keys, ordered operation references, work orders, audit history and idempotency. Migration 005 adds optional part name and due date to orders without replacing old records. No assignment, physical movement, production, quality, shipment or return write API is introduced. Status and existing pieces stay distinct.

An order may exist without route or work order. Routes contain ordered `{name,kind}` (`internal` or `external`) operations and are defined once; replacement is currently rejected even before planning. This conservative rule preserves references and movement history; route editing requires a separately reviewed change. A route may record external operations, but current frontend-supported behavior does not support a nonterminal external operation. If an external operation precedes another operation, planning is refused. Only the first internal operation can be planned. Later internal operations and external operations remain blocked until server-side approved-output provenance and input reservation exist. This deliberately does not invent physical input.

For uncompensated orders, planning capacity is ordered pieces minus total existing plans for that operation. Existing compensation quantities are shown but any order with compensation is blocked from planning until server-side loss reconciliation is implemented; existing records alone are not treated as proof of an authorized increase. First-operation plan creation takes a row lock on the order before computing capacity, serializing competing requests. Shipment progress comes from customer shipments less customer returns, never from production. Work order `plannedQuantity` is its own denominator. `recordedGood`, `recordedScrap`, `recordedQcPending` and `recordedProduction` are sums of historical production event entries, not a validated current location/QC balance; these must not be used as ready inventory. `physicalReceived` is now derived from B03C ledger receipt/acceptance events when present; it remains null when no trusted physical movement exists. The future production/inspection model must reconcile event transitions without double counting. Zero or unavailable data is never silently manufactured.

## Contract for a future frontend adapter

All endpoints are under `/api/v1/sites/{tenantId}/{siteId}`; tenant/site values are untrusted selectors, with the JWT identity and DB membership checked server-side. Authorization: order/route creation `orders.write`; work order creation `planning.write`; reads `orders.read`. The client must provide `Authorization: Bearer <verified access token>`; each POST requires a durable `Idempotency-Key`. Same actor/site/key and exact command replay the stored status and body; different payload using the same key returns 409. Each write validates data and authorization, locks the order when relevant, and persists audit and idempotency in one transaction.

| Method/path | Request | Response |
|---|---|---|
| `POST /orders` | `{orderNumber,customer,partNumber,partName,orderedQuantity,dueDate?}`; date is `YYYY-MM-DD` | 201 order including id, ordered quantity, netShipped and status; creates no job |
| `GET /orders` | — | `{orders:[...]}`; currently at most 200 entries, no pagination contract yet |
| `GET /orders/{orderId}` | — | Order with ordered `route:[{id,sequence,name,kind}]` |
| `POST /orders/{orderId}/route` | `{operations:[{name,kind},...]}` | 201 ordered operations with server UUIDs; existing route replacement is 409 |
| `POST /orders/{orderId}/work-orders` | `{operationId,workOrderNumber,plannedQuantity}` | 201 work order and its individual recorded event totals |
| `GET /orders/{orderId}/work-orders` | — | `{workOrders:[...]}` |
| `GET /orders/{orderId}/operations/{operationId}/availability` | — | `{operationId,orderedQuantity,compensationQuantity,planningLimit,plannedQuantity,availableQuantity,supported,reason}` |

Use JSON numbers that are positive safe integers for piece quantities. Body validation rejects null, negative, fractional and oversized amounts. Errors use `{error:{code,message,requestId}}`, including 400 `INVALID_INPUT`, 401 authentication, 403 authorization, 404 missing scoped record, 409 conflicts or unsupported operations. Unexpected DB failures are 500 without exposing DB details. Scope/path values are UUIDs. Order date may be null. This contract is an initial development draft; pagination, richer materials, assignment and error-code compatibility are not final.

## Verification and remaining work

PostgreSQL 16.10, real restricted runtime and separate migration role: complete suite **55/55 passed**; [TAP evidence](evidence/b03b-postgresql16.tap). The B03B suite uses real RSA-signed JWTs with a simulated JWKS endpoint. It covers unauthenticated and unauthorized calls, order without job, route locking, 10 ordered → 5+5 → zero available, overplan rejection, equal-key concurrent retry, simultaneous overplanning, scoped denial, audit/receipt rollback after injected DB permission failure, and order versus work-order progress. Availability at 5 and 0 is compared to the existing frontend planning service. The prior B01/B02/B03A tests and PostgreSQL 16 migration/backup regression were rerun. The recovery test upgrades fictional 001/002 data through 005 and injects a failing 006.

Docker Compose smoke with isolated flag: migration and provisioning completed, readiness returned 200 and an unauthenticated POST returned 401. [Compose evidence](evidence/b03b-compose-smoke.log). No real OIDC provider, real production data or external deployment was tested.

Remaining gates: independent security review of dev grants and B03A runtime impersonation; real provider and target deployment validation; robust DB-side guard against arbitrary SQL bypass if that threat is in scope; server-side controlled routing revision, material/lot reservations and audit reconciliation; later-operation quality provenance; complete current balances instead of historical event sums; true production and shipment concurrency logic; pagination and API versioning review. Do not activate writes until these are addressed and explicitly approved.

Final local Compose API image: `sha256:058cc4dc7202775e97233f5dd518c5b70224f60b883374d5249a30649872d9df`; this is a local test image, not a published or approved artifact.

B03C adds same-operation physical transfer foundations without changing B03B planning capacity; see [B03C physical flow](B03C_PHYSICAL_FLOW.md).
