# Ritim MES backend B01/B02

Node 22 and PostgreSQL. No mutating business API is enabled. Configure `DATABASE_URL` or standard `PG*` environment variables; `DB_SSL=verify` requires certificate validation. Never place credentials in source, logs or committed env files.

```sh
cd backend
npm ci
npm run migrate
npm start
TEST_DATABASE_URL=postgresql://... npm test
```

`GET /health/live` checks process liveness; `GET /health/ready` checks database connectivity; `GET /api/v1/session` requires a verified access token and active database identity; it fails closed when OIDC is unconfigured. Run DB integration tests against an **explicit disposable database** via `TEST_DATABASE_URL=postgresql://... npm test`. For unit-only execution use `npm run test:unit`. The integration suite creates objects in a new random schema and drops only that schema. Never point tests at live data.

For local Compose, pre-provision a dedicated schema, distinct migration owner and restricted runtime login, apply migrations, then provision runtime grants as described in [B03A](docs/B03A_IMPLEMENTATION.md). Copy `.env.example` to `.env` and set the separate passwords. Do not use the bootstrap database user for either service. The Compose migration → runtime-grant provisioning → API sequence and PostgreSQL 16 tests were verified with fictional data; see [Docker validation](docs/B03A1_DOCKER_VALIDATION.md). Database persists in a named volume; do not run `docker compose down -v` if data should be preserved. API binds loopback on the host by default. Migration is a dedicated one-off container gated by database health.

This is a foundation, not a production-ready security or business implementation. See [architecture](docs/ARCHITECTURE.md), [domain mapping](docs/DOMAIN_MAPPING.md), [API draft](docs/API_CONTRACT.md), [authentication and authorization](docs/B02_AUTHORIZATION.md) and [roadmap](docs/ROADMAP.md).
