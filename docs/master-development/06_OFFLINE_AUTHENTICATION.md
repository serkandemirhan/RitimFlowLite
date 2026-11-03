# Offline authentication — BLOCKED

Current [identity](../../backend/src/identity.js), [BFF](../../backend/src/oidc-bff.js) and [authorization](../../backend/src/authorization.js) enforce verified token claims and active database membership. Cached JWKS or an existing session is insufficient for first-time or prolonged-offline login. The BFF uses expiring in-memory sessions and external provider discovery/login.

No approved offline password/identity service, authorization lease, cloud/local identity mapping or outage revocation policy exists. PostgreSQL service-account authentication is not application-user login. Native session 401 verifies fail-closed behavior only. Existing Keycloak and encrypted recovery are preserved.

Required [ADR A/F](04_ARCHITECTURE_DECISIONS.md): local identity service versus bounded cloud-authorization cache, maximum outage lease, first offline-user provisioning, emergency revocation, cloud password/revocation behavior, and whether devices must mutate without LAN access. Do not silently choose these.

After approval, test first/repeat offline login, session expiry, outage beyond lease, local/cloud revocation, password changes, old backup restoration, clock manipulation, wrong identity/site, and reconnect. Disconnect provider/internet while keeping actual local frontend/API/DB running. None is marked PASS now.
