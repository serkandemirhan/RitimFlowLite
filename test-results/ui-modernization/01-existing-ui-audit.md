# Existing UI audit

Date: 2026-11-09. Scope: repository source, shared live UI read-only, loopback application with controlled API fixtures. This is not an assertion that every real-device workflow has passed.

## Architecture

- Frontend: vanilla JavaScript, HTML templates; no React/Vue runtime. `index.html` also retains a local demo/domain implementation.
- Cloud UI: `integration/premium-api.js` renders route content and scope-aware navigation; `?view=...` and History API preserve routes. BFF auth uses `/auth/*`.
- Existing reusable UI: operational-grid, order-grid, transient panels, PDF.js drawing viewer, command journal, work-order drawers and scoped navigation.
- Styling: custom global styles plus premium-workspace CSS. Broad selectors create cascade risks; introducing an unscoped Bootstrap reset would affect operator/PDF dialogs.
- API: integration/api-adapter.js; Fastify 5.12.7 backend. PostgreSQL through pg 8.16.3, schema migrations and tenant/site isolation. No database changes are needed for this UI migration.
- Authentication: OIDC BFF/cookie session, per-site membership and server capabilities. Manager/operator/quality/stock/shipping responsibilities are represented by capabilities, not cosmetic menu hiding alone.
- Planning: backend computes schedule segments from machine queue, duration, shifts, predecessors and capacity. Current move command accepts machine/queue position/revision, not arbitrary fixed start timestamps.
- Build: Node 22/npm 10 target, deterministic RC1 asset allowlist, cloud asset copier. Playwright browser tests, Node tests and disposable native PostgreSQL integration runner.

## Route inventory and preserved purpose

| Routes | Purpose / business behavior to retain |
|---|---|
| overview | Priorities, exceptions, grouped pending work; real counts only |
| orders, detail, order-edit | Order search/sort/filter, roadmap, versioned editing and closing rules |
| batch-create, production-create, po-edit | Production quantities, routes, timing and planning constraints |
| production-orders, production-order | Production order list, release/hold, linked jobs and material flow |
| machine-planning | Queue and calculated time view, assignment, capacity, shift calendar, bulk move preview |
| jobs, job | Worklist, machine/operator assignment, timing, input balances, production/quality history |
| production-monitor | Running/ready/blocked jobs with actual quantities and next actions |
| operator | Dedicated touch workflow: start, pause, resume, production, quality request, complete, handoff and drawing |
| quality-list, quality, rework | Pending output decisions, approval/scrap/rework and traceability |
| inventory | Receipt, location move, delivery to job, balances, scrap and movement history |
| shipping | Allocation, physical dispatch, delivery; combined commands preserve individual movements |
| production-supplier, outsourcing | External operation dispatch/return and quality |
| returns, compensations | Customer returns, quarantine/disposition and documented replacement production |
| master | Materials/customers/parts/machines/operators/locations and route templates |
| search, trace | Cross-record lookup and input/output lot lineage |
| auth login/account/team | Identity, password and membership outside the application shell |

## Established baseline

Before screenshots use the actual application shell and controlled in-memory API data (45 jobs, five machines), with the new UI adapter disabled. They are not customer production screenshots. Existing workflows are preserved in source; only behaviors covered by the regression results are claimed as tested. The dedicated operator interface remains separate from the desktop dashboard.
