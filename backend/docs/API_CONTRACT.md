# REST contract draft

B01/B02 endpoints implemented:

| Method | Path | Authentication | Semantics |
|---|---|---|---|
| GET | `/health/live` | none | 200 `{"status":"ok"}` when process responds. |
| GET | `/health/ready` | none | 200 when DB responds; 503 `DATABASE_UNAVAILABLE` otherwise. Does not certify schema version. |
| GET | `/api/v1/session` | required | Returns the verified identity and authorized tenant/site memberships, roles and capabilities; 401 without an accepted bearer token. |

| GET | `/api/v1/sites/{tenantId}/{siteId}/capabilities` | required | 200 with database-derived scope roles/capabilities; 403 if the requested scope is not authorized. |

Bearer tokens must be signed JWT access tokens with `typ: at+jwt`, configured issuer/audience, `kid`, `iat`, `exp` and `sub`. Scope identifiers are selectors, never evidence of access. Session membership results expose only sites the identity can access. No role or tenant claim is trusted as authorization. See [B02 authorization](B02_AUTHORIZATION.md).

Errors use `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Unsupported routes/methods return 404. No create/update/delete business route is exposed.

## Future endpoints — design only, not implemented

Examples: `GET /api/v1/sites/{siteId}/orders`, `POST /api/v1/sites/{siteId}/orders`, `POST /api/v1/sites/{siteId}/work-orders/{id}/production-events`, `POST /api/v1/sites/{siteId}/transfers/{id}/accept`, `POST /api/v1/sites/{siteId}/shipments`, `POST /api/v1/sites/{siteId}/customer-returns`. Every future operation requires verified identity, server-resolved tenant and site membership, explicitly checked permissions, input schema and a single database transaction with durable idempotency and audit/movement writes. A client idempotency key must be unique per actor/site and reused for the exact retry; conflicting content returns 409. API does not accept client-provided role/user as authority. Distinguish 401 authentication, 403 authorization, 409 conflict/business invariant, 422 validation and 503 temporary unavailability. Exact semantics and stable error codes remain to be approved alongside implementation.
