# ADR: Preserve vanilla workflows; integrate upstream UI components

## Decision

Use scoped Tabler CSS/HTML components for the manager shell and shared controls; Tabulator for the work-order data grid; DayPilot Lite Scheduler for a primary three-day machine/resource timeline. Preserve the operator console as a dedicated touch workflow rather than a desktop dashboard.

The adapter runs after the existing application has mounted authorized content. Existing APIs, command journal, version checks, tenant/site scoping and backend scheduling remain authoritative. Other pages retain their existing behavior while receiving shared Tabler form/button/card styles. Their specialized tables are not silently replaced by a partially equivalent grid.

## Boundary

- Timeline events come from real backend schedule segments. Unknown durations are kept in the existing editable unknown-work section.
- Drag requests use the existing machine/queue move command. The UI cancels DayPilot's optimistic date mutation; the server recalculates the schedule. Fixed-start scheduling and event duration resizing are not invented.
- Running work cannot be moved through the new callback. Read-only users do not receive writable planning controls.
- Worklist header filters and sort/pagination use Tabulator. Current server filter scope is retained; cursor pages are loaded before the grid is presented so sorting is not limited to the first server page.
- This cursor drain is a scalability limitation for very large tenants. A future server-paginated Tabulator data provider should replace it before loading unbounded datasets.
- Upstream assets are bundled locally; copyright/license notices are retained. CSS is scoped to `.ritim-ui` to avoid resetting the operator/PDF/auth interfaces.

## Consequences

No backend or schema rewrite. Migration can proceed route by route. Remaining specialized grids still exist temporarily; this is a staged migration, not a claim that every page has been converted. Date navigation beyond the backend's calculated horizon may legitimately show no events; it does not create a new server plan.
