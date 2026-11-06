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

## Supabase cloud invitations and account recovery

The historical foundation description above does not describe the current cloud entrypoint. [cloud-app.js](src/cloud-app.js) enables the domain workflows and Supabase BFF. Migration 044 adds tenant-scoped invitations; run migrations and runtime provisioning before publishing this version.

Activation order:

1. Configure verified-sender SMTP in Supabase **Authentication → Emails → SMTP Settings**. Disable email link tracking. The default Supabase sender is not a production mail service.
2. Set Site URL to the application's exact HTTPS origin. Add `https://ritimflow-test.vercel.app/auth/join**` to Redirect URLs for this installation; invitations pass a UUID in the query string.
3. Install the [invite template](security/invitation-email.html) for **Invite user**, the [existing-account template](security/invitation-existing-account-email.html) for **Magic link or OTP**, and the [password recovery template](security/password-recovery-email.html) for **Reset password**. These templates are for this BFF, not an unrelated browser-side Supabase application.
4. In Vercel's server environment, configure `SUPABASE_SECRET_KEY` from Supabase's secret API keys. Never expose this key through frontend configuration or a `PUBLIC`/`VITE` variable. The ordinary database connection remains the restricted `ritim_runtime` role.
5. After SMTP and templates are verified, set `AUTH_INVITATIONS_ENABLED=true` and `AUTH_RECOVERY_ENABLED=true`, then redeploy. Leave both false or absent before configuration is complete.
6. Send an authorized test invitation from **Firma ve ekip**. Verify mailbox delivery, acceptance, first-password setup, correct site/role, login, logout, and password reset. Repeat with an existing account, a cancelled invitation and an expired invitation. Delivery status means the provider accepted the request, not proof of inbox delivery.

Invitations expire after seven days; Supabase email tokens may expire earlier. Resending is explicit and throttled to two minutes per invitation. HTTP timeouts are recorded as unknown, not automatically retried. Users gain no membership until the server verifies a confirmed provider email matching the invitation. Revoked inviters, disabled users, wrong emails, expired and cancelled invitations fail closed. Existing account passwords are preserved. The initial-password cookie is signed, purpose-bound, HttpOnly and expires after ten minutes. Invitation records are accessible only through narrow security-definer functions; the runtime cannot directly read or mutate identity or invitation tables.

Automated verification uses mocked email providers plus a disposable real PostgreSQL cluster. It does not establish real SMTP delivery. Do not enable these features on production until the live mailbox round trip succeeds.
