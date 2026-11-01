# Fictional local OIDC fixture

This Compose stack is for isolated development only. It uses Keycloak 26.4.7 with a persistent PostgreSQL volume, binds HTTPS to loopback and imports the `ritim-dev` fictional realm only when its database is first initialized. It does not provision application users or permissions: application PostgreSQL memberships remain authoritative. The real integration test creates and drops its own randomly named schema and database roles; never point it at a real user database.

Example (use a private temporary directory and do not commit the resulting files):

```sh
export OIDC_FIXTURE_DIR="$(mktemp -d)"
chmod 700 "$OIDC_FIXTURE_DIR"
read -rs -p 'Fictional test-user password (12+ characters): ' OIDC_TEST_PASSWORD; echo; export OIDC_TEST_PASSWORD
read -rs -p 'Fictional Keycloak DB password: ' KEYCLOAK_DB_PASSWORD; echo; export KEYCLOAK_DB_PASSWORD
read -r -p 'Fictional Keycloak admin username: ' KEYCLOAK_ADMIN_USERNAME; export KEYCLOAK_ADMIN_USERNAME
read -rs -p 'Fictional Keycloak admin password: ' KEYCLOAK_ADMIN_PASSWORD; echo; export KEYCLOAK_ADMIN_PASSWORD
node oidc-dev/prepare.cjs
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -keyout "$OIDC_FIXTURE_DIR/tls.key" -out "$OIDC_FIXTURE_DIR/tls.crt" -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost' >/dev/null 2>&1
chmod 644 "$OIDC_FIXTURE_DIR/tls.key" "$OIDC_FIXTURE_DIR/tls.crt"
docker compose -p ritim-oidc-fictional -f oidc-dev/compose.yaml up -d
export NODE_EXTRA_CA_CERTS="$OIDC_FIXTURE_DIR/tls.crt"
```

The private directory is required because the Keycloak container must read the development certificate and private key. `NODE_EXTRA_CA_CERTS` trusts only this process; production requires a real trusted certificate. The Playwright fixture uses isolated browser contexts and ignores this fixture certificate only there. Do not use these settings or credentials in production. Stop the stack with `docker compose -p ritim-oidc-fictional -f oidc-dev/compose.yaml stop`; its volume and fixtures remain intact. Explicitly manage fixture disposal yourself. Recreating the realm with new fixture UUIDs while reusing an existing Keycloak database will not re-import it; use a new isolated project/volume rather than deleting an existing one.

Real integration test from the frontend worktree, after creating a separate fictional PostgreSQL 16 database and configuring `TEST_DATABASE_URL` for an administrative test role:

```sh
export RITIM_BACKEND_DIR=/path/to/backend-b01/backend
export TEST_DATABASE_URL=postgresql://fictional-test-admin@127.0.0.1:55487/postgres
node --test tests/oidc-keycloak-browser.cjs
```

The test needs Chrome (`AUDIT_CHROME` if needed), Node 22, installed dependencies in both worktrees and the same `OIDC_FIXTURE_DIR`/`OIDC_TEST_PASSWORD`. It uses actual Keycloak login and no password grant. The API BFF settings are `OIDC_ISSUER=https://localhost:44739/realms/ritim-dev`, `OIDC_AUDIENCE=ritim-api`, `OIDC_JWKS_URL=$OIDC_ISSUER/protocol/openid-connect/certs`, `OIDC_BFF_CLIENT_ID=ritim-web`, `OIDC_BFF_APP_ORIGIN=http://127.0.0.1:44729`, `OIDC_BFF_REDIRECT_URI=$OIDC_BFF_APP_ORIGIN/auth/callback`. The API audience must differ from the browser client ID. Endpoint enablement remains subject to the existing isolated-development flag.

`manager`, `operator-a`, `operator-b`, `quality` and `tenant-b` are fictional identity-provider users. The test binds their verified issuer/subject identities to explicit local tenant/site membership records; IdP role claims do not provide authorization. The browser obtains an opaque HttpOnly session cookie and never stores access or refresh tokens in localStorage. The server validates signed issuer/audience-bound tokens on protected requests and consults current PostgreSQL membership and RLS. State, nonce and PKCE bind the authorization flow; exact origin is required for cookie-authenticated mutations. Sessions are memory-only, bounded by token expiry, and lost on server restart; there is no refresh-token storage or automatic renewal. Logout invalidates the local session and directs the browser to the identity provider. An already issued bearer token cannot generally be revoked by this local logout alone. Arbitrary SQL execution by a compromised runtime remains outside the documented RLS trust boundary. This setup is not a production deployment, production identity configuration or production readiness claim.

## Canonical issuer across host and Compose

The historical `localhost` issuer above is suitable only when the API runs on the host. In a container, `localhost` is that container and cannot reach the host-published Keycloak port. For the isolated shared-network fixture use a single URL, e.g. `https://127.0.0.1.nip.io:44749/realms/ritim-dev`. Host DNS must resolve the name to loopback; the Keycloak Compose service receives that identical name as a network alias. Set `KEYCLOAK_ISSUER_ORIGIN=https://127.0.0.1.nip.io:44749`, `KEYCLOAK_DNS_ALIAS=127.0.0.1.nip.io`, `KEYCLOAK_PORT=44749`, and `KEYCLOAK_CONTAINER_PORT=44749` before starting a **new isolated** fixture project. Generate a temporary certificate with `subjectAltName=DNS:127.0.0.1.nip.io`; never reuse it for production. Existing realms, volumes and users are not modified by this setup.

`api-compose.yaml` starts the real API image on the identity Compose network with the externally provisioned fictional PostgreSQL runtime role and the same canonical `OIDC_TEST_ISSUER` for BFF discovery and JWT verification. Mount the matching fixture certificate as `NODE_EXTRA_CA_CERTS`; this adds a test trust anchor rather than disabling certificate or hostname checks. The browser must also trust this certificate through its operating-system trust store or a separately managed isolated test trust store. Installing trust can require explicit OS authorization; remove any temporary trust after testing. Never use `ignoreHTTPSErrors`, a certificate-error bypass, a different issuer identity, or TLS verification disablement to claim acceptance. `127.0.0.1.nip.io` requires working host DNS; if unavailable, supply a stable name with host DNS/hosts mapping, matching Keycloak network alias and certificate.

The fixture variables `OIDC_TEST_PGHOST`, `OIDC_TEST_PGPORT`, `OIDC_TEST_PGDATABASE`, `OIDC_TEST_PGUSER`, `OIDC_TEST_SCHEMA`, `OIDC_TEST_NETWORK`, `OIDC_TEST_ISSUER`, `OIDC_FIXTURE_DIR` and a securely generated `RECOVERY_ENCRYPTION_KEY` are required for the API Compose file. Provision the database and membership using the existing controlled migration/runtime role workflow; do not point this fixture at a real database. `RECOVERY_KEY_VERSION` is a fixture-only version. This example does not imply cloud production readiness.

The fixture scripts `verify-pkce.cjs`, `verify-operator.cjs` and `rotate-test-key.cjs` exercise the actual BFF endpoints with a TLS-validating Node HTTP client and fictional fixture credentials. They are supporting evidence, not a substitute for the `tests/oidc-compose-browser.cjs` browser flow. Run them only with the fixture UI proxy on `127.0.0.1:44729`, the API Compose service on port 44759 and the isolated realm. Set `OIDC_FIXTURE_DIR`, `OIDC_TEST_PASSWORD`, `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`, and `NODE_EXTRA_CA_CERTS=$OIDC_FIXTURE_DIR/tls.crt` in a private shell; do not print or commit values. The rotation script modifies only the selected fictional Keycloak realm.
