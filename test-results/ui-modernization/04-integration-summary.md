# UI integration summary

## Implemented in the working tree

- Installed pinned Tabler 1.7.4, Tabulator 6.7.1, DayPilot Lite 6.2.0 and build-time PostCSS. Lockfile included. Upstream UI distribution files and licenses are locally packaged.
- Actual Tabler navbar/nav-tabs/form-control/form-select/card-body/badge/btn-primary components/classes are applied to existing authorized HTML. Ritim branding and navigation destinations remain intact.
- Actual Tabulator work-order list: sortable columns, header filters, pagination, column visibility, full-text tooltips, scoped data retrieval, work-order and next-action callbacks. No replacement backend introduced.
- Actual DayPilot Lite Scheduler: three-day machine view, daily zoom, date navigation, status/late coloring, tooltip context and job-detail access. Drop cancels vendor date mutation and calls existing queue/machine move command; running jobs and non-writers cannot move. Unknown-duration work retains its existing controls.
- Operator and auth layouts remain separate; no desktop grid is inserted into the operator console. Existing specialized domain controls and state transitions are retained.
- RC1 and cloud packaging include the new libraries and legal notices.

## Main files

- [UI adapter](../../integration/modern-ui.js)
- [Application bridge](../../integration/premium-api.js)
- [Brand/layout overrides](../../assets/css/modern-ui.css)
- [Vendor preparation](../../scripts/build-ui-vendors.cjs)
- [Browser verification](../../scripts/verify-ui-modernization.cjs)
- [Controlled UI fixtures](../../tests/ui-modernization-fixture.js)
- [Entry point](../../index.html), [RC1 allowlist](../../release/rc1.config.json), [cloud packaging](../../scripts/build-cloud.cjs)
- [Dependencies](../../package.json), [lockfile](../../package-lock.json)

## Evidence

Screenshots in [before](screenshots/before/) and [after](screenshots/after/) cover the actual application with controlled fixtures at six requested sizes. These fixed directories are overwritten on rerun instead of accumulating dated folders. No customer production data was changed. See [functional regression](05-functional-regression.md) and [remaining issues](06-remaining-issues.md) before release.

## Release state

Local implementation and build verification. This modernization has not been published to production. It must not be described as the entire nine-phase mission complete: specialized screens and real-device end-to-end acceptance still need additional work.

## Production monitor follow-up

Production monitor now reuses Tabulator with server-supplied scoped rows, customer and order-date columns, status filtering, local pagination, column visibility and preserved list/card toggle. Compact metrics, collapsed counter explanation and responsive controls were visually inspected. The preview uses controlled local fixtures; production is unchanged.
