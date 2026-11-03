# Local/cloud architecture

Observed: premium browser -> [API adapter](../../integration/api-adapter.js) -> local development proxy -> [Fastify](../../backend/src/app.js) -> PostgreSQL. [Command handling](../../backend/src/command.js) retains scoped authorization, durable idempotency, business mutation and audit in one transaction. Forced RLS and restricted service roles remain intact. Anonymous browser demo data is not API manufacturing truth.

[Local proxy](../../integration/dev-server.cjs) is loopback development tooling, not a production LAN/TLS deployment. [OIDC BFF](../../backend/src/oidc-bff.js) uses the existing identity provider and time-limited server sessions; it is not an offline identity service. Native PostgreSQL 18.6 tests prove local domain execution without Docker, not internet-outage login.

Target cloud frontend is Vercel and cloud database/authentication is Supabase. Persistent cloud Fastify hosting, installation authority, local identity, LAN service/TLS and synchronization remain subject to [A-G approval](04_ARCHITECTURE_DECISIONS.md). Recommended topology is one local server per site plus managed cloud Fastify sharing domain code. This remains a proposal. No cloud deployment, Supabase identity migration or direct browser-table mutation was performed. A persistent Fastify process is not assumed to run unchanged as a Vercel Function.
