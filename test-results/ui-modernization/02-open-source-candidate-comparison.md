# Open-source candidate comparison

Sources reviewed on 2026-11-09. Repository activity/license metadata is retained in [source-metadata.json](source-metadata.json). Visual/effort judgments below are engineering assessments; bundle figures for rejected frameworks are qualitative because no migration bundles were built.

| Candidate / source | Commercial license | Visual/mobile/navigation | Tables/forms/dialogs/accessibility | Planning/drag | Compatibility, bundle and maintenance cost | Decision |
|---|---|---|---|---|---|---|
| [Shadcn Admin](https://github.com/satnaing/shadcn-admin) | MIT | Polished responsive admin shell | React composition, mature primitives and table patterns | Additional scheduler needed | Requires React/Vite/router migration; high integration and ongoing adapter cost | Reject for current vanilla architecture |
| [TailAdmin Free React](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard) | MIT free repository; paid editions excluded | Strong navigation and responsive panels | Ready components; accessibility still requires application testing | Not a manufacturing scheduling engine | React/Tailwind runtime and template conventions; larger migration surface | Reject |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | MIT | Flexible, consistent; shell assembled from blocks | Accessible primitives; source-owned React components | Requires additional timeline/drag libraries | Excellent React option; high rewrite cost here, ongoing ownership of copied components | Reject |
| [Tabler](https://github.com/tabler/tabler) | MIT | Compact Bootstrap-based HTML navigation/layout | Forms/cards/badges/tables; JS behavior/accessibility must be integrated | No manufacturing scheduler | Direct HTML compatibility; scoped upstream CSS avoids unrelated resets; low framework migration cost | Select foundation |
| [React Admin](https://github.com/marmelab/react-admin) | MIT core; commercial extensions excluded | Professional CRUD shell, responsive Material UI | Strong data/auth providers, forms and tables | Additional manufacturing scheduler needed | React and provider conversion required; would duplicate existing command/auth architecture | Reject |
| [Tabulator](https://github.com/tabulator-tables/tabulator) | MIT | Dense responsive scrolling data grid | Built-in header filters, sort, pagination, resize, row actions; keyboard/mobile testing required | Not a scheduling component | Vanilla JS; separate data-grid responsibility; full distribution currently used | Select worklist component |
| [DayPilot Lite](https://javascript.daypilot.org/open-source/) | Apache-2.0; installed LICENSE/NOTICE retained | Resource rows, multi-day time headers and events | Dedicated scheduler; accessible fallback queue retained | Installed 6.2.0 includes Scheduler and move callback | Vanilla script integration, ~428 KB uncompressed package JS; schedule remains server-owned | Select planning renderer |
| [FullCalendar](https://fullcalendar.io/license) | MIT Standard; Premium commercial restrictions | Mature calendar | Good calendar interactions | Resource timeline is not an unrestricted free Standard substitute | Would require a paid resource timeline choice or unsuitable layout | Reject for resource timeline |
| [React Calendar Timeline](https://github.com/namespace-ee/react-calendar-timeline) | MIT | Resource timeline | Application supplies details/forms | Move/resize primitives | React dependency unnecessary here | Reject |
| [SortableJS](https://github.com/SortableJS/Sortable) | MIT | Useful touch-compatible Kanban/list ordering | Not a shell or data grid | List drag-and-drop | Would duplicate existing queue logic; no timeline | Keep as researched alternative; not installed |

All five primary admin candidates were compared across appearance, framework compatibility, commercial use, activity, responsiveness, navigation, tables, forms/dialogs, scheduling, dragging, accessibility, performance, customization, maintainability and integration complexity. None is assumed to make the entire application accessible automatically.

## Verified installed dependency licenses

- @tabler/core 1.7.4: npm metadata MIT; CSS copyright header and upstream dev LICENSE retained. Tagged release LICENSE URL did not resolve, so the upstream LICENSE provenance is explicitly recorded rather than implying tagged verification.
- tabulator-tables 6.7.1: bundled MIT LICENSE retained.
- @daypilot/daypilot-lite-javascript 6.2.0: bundled Apache-2.0 LICENSE and NOTICE retained; Scheduler API checked against installed TypeScript declarations.
- postcss: build-time CSS parser; exact version pinned in package-lock, MIT. Updated after audit flagged the initial version; final audit is clean.

Tabler CSS, Tabulator and DayPilot are separate responsibilities, not competing application frameworks. No paid template, React runtime, external CDN or proprietary scheduler is introduced.
