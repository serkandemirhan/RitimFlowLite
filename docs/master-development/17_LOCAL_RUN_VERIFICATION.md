# Installed-service local run verification — 2026-11-03

**PASS for this local development order journey.** Existing Windows PostgreSQL service on port 5432, database `ritim_local_dev`, schema `ritim`: **65 tables, 28 migrations**. Application connects as `ritim_local_dev_runtime`; migrations/provisioning use a separate non-superuser owner. No database reset, production deployment or push occurred.

## Actual persisted order

| Field | SQL value |
|---|---|
| Order number | SIP-1793716581659 |
| ID | d4aa20ea-3bcc-4eb6-b609-0c89ca61221d |
| Customer | Yerel PostgreSQL Test Müşterisi |
| Part | TEST-PARÇA-001 |
| Quantity | 10 |
| Due date | 2026-11-10 |
| Status | open |

The order was created through the premium wizard and existing encrypted server recovery/domain command, using real local Keycloak authorization-code/PKCE login and BFF session. SQL read under authorized RLS scope and durable completed idempotency receipt (`response_status=201`) confirm the record. Browser reload and site reselection retrieved the same order. This is not localStorage persistence or a mocked backend.

Initial automation waited for a direct browser POST /orders, but the premium application intentionally calls recovery retry and executes the order command internally. The helper was corrected to observe that boundary and reuse an existing verification order on repeated launches. Existing test records were preserved, not deleted to hide the failed automation. Latest proof is in local ignored [JSON](../../artifacts/local-start/order-postgresql.json) and [screenshot](../../artifacts/local-start/order-postgresql.png).

In pgAdmin, select database `ritim_local_dev` and inspect `Schemas -> ritim -> Tables -> orders`. With your authorized database-administrator connection:

```sql
SELECT id, order_number, customer, part_name, ordered_qty, due_date, status
FROM ritim.orders
WHERE order_number = 'SIP-1793716581659';
```

The restricted application identity requires an authorized tenant/site transaction; an unscoped direct SQL query is intentionally not a way to bypass RLS.

## Running application

Frontend: `http://127.0.0.1:4178/?mode=api`; API: `http://127.0.0.1:3000`; local Keycloak issuer: `https://localhost:44739/realms/ritim-dev`. A separate Chrome for Testing window is left open on the verified record. The legacy document tab title still includes fictional demo; the visible API-mode caption and verified SQL refer to actual server data.

Local Java 21 and the repository's existing Keycloak fixture version 26.4.7 were installed under the user's RitimFlowLite tools folder. Downloads were checked against their published SHA-256 digests. No Docker or system-wide Java configuration was required. Keycloak uses its isolated development-file store; MES business data remains in PostgreSQL. Keycloak development mode also listens on loopback HTTP 8080; the app uses the HTTPS issuer above.

The current Windows user's certificate stores contain a localhost-only 14-day development certificate. Browser and Node TLS verification remain enabled; Node trusts only the matching additional certificate file. Fingerprint and paths are in the protected DPAPI identity configuration. For removal after stopping this local environment, remove only that exact fingerprint from CurrentUser Root/My, not other certificates. Certificate renewal is required after expiry; this is not production TLS/key-management acceptance.

Manager test credentials, private-key password and recovery key are generated/protected with Windows DPAPI outside Git; no password/token is printed or committed. This is a fictional local verification identity, not an approved production offline-authorization/revocation policy. Existing Keycloak/BFF/JWT and encrypted recovery checks remain intact.

## Restart commands

If stopped, use separate PowerShell terminals from repository root:

```powershell
powershell -NoProfile -File scripts/windows/local-identity.ps1 -Action Start
powershell -NoProfile -File scripts/windows/local-identity.ps1 -Action Api
powershell -NoProfile -File scripts/windows/ritim.ps1 -Action StartWeb
```

Once the three services are ready, this reuses the saved local test identity, verifies the existing order without creating duplicates and opens the application:

```powershell
powershell -NoProfile -File scripts/windows/local-identity.ps1 -Action VerifyOrder
```

Stop each service with Ctrl+C in its owning terminal and close the verification browser. PostgreSQL service/data remain intact. Do not rerun Initialize over this database. The live servers were left running for the user's requested inspection.
