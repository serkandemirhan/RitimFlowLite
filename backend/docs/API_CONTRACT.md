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
