# Executed UX E2E test results

Date: 26 October 2026, Europe/Istanbul. Baseline: `a28d562`.

## Execution and evidence boundaries

**32 executed checks: 14 PASS, 18 FAIL, 0 unresolved test errors.** These checks are deliberately selected acceptance and defect probes, not a statistical quality score. FAIL denotes an unmet expected behavior; several tests inject malformed state or invoke retained global commands to exercise integrity boundaries. A passing subflow does not certify the whole module.

Standalone Playwright ran with installed Google Chrome **155.0.8059.85**, headless, Turkish locale, Europe/Istanbul timezone, HTTP localhost serving this unchanged repository. The in-app browser runtime bootstrapped but returned `Browser is not available: iab`; browser discovery returned `[]`. Latest Playwright's Chromium download attempt failed because that download does not support mac13. Installed Chrome launched successfully, and the browser tests below actually executed. No browser-access failure is being treated as a pass.

Each scenario uses a fresh disposable browser context. Fresh demo tests read only seeded fictional primary-app data; customized fixtures use fictional Audit Firma/Parçası and isolated localStorage. No existing profile, real user data, production backend or resetDemo action was used. Test-only state injection is identified below. The older public sales page's preexisting seed labels were inspected without modification.

Widths: desktop1440, mobile390/360, height1000. T01 covers ten main routes at each width (30 samples). T31 repeats actual production controls at both mobile widths. Most business-flow checks run at1440. T30 only smoke-tests the alternate entry at390. This is Chrome desktop responsive emulation, not real iOS/Android device testing.

The final raw record is [results.json](audit/evidence/results.json); the corrected isolated T24 run is [results-focused.json](audit/evidence/results-focused.json). Initial T04 incorrectly tried to reorder a single-operation route; the harness was corrected to add Tesviye before reordering and a full suite rerun passed T04. Initial T24 locator looked for the original apostrophe ID, but the app rendered it as `undefined`; a corrected isolated test clicked the actual last card and confirmed the missing-order failure. The final record substitutes that focused result and records the rerun reason/time; no application fixes were made between runs.

## Executed checks

| ID | Expected behavior | Result | Actual observation / scope |
|---|---|---|---|
| T01 | Fresh demo initial render and all routes at 1440/390/360 | **FAIL** | 30 route/width samples rendered; only audit route overflows: 763px at 390, 760px at 360. This aggregate fails layout, not all routes. |
| T02 | Dashboard active work KPI applies running filter | **FAIL** | Active KPI opens 6 jobs with filter=all, although running count is 1. |
| T03 | Back from order detail retains search | **FAIL** | Search Braketi becomes empty after detail → back. |
| T04 | Wizard autocomplete threshold, route reorder, creation | **PASS** | Below 3 chars: no suggestions; Demo: 5 suggestions; added/reordered Tesviye; created 250 order with 150 first job. |
| T05 | Additional work order specifies operation and planned quantity | **FAIL** | Only additionalJobId and additionalMachine fields; created op=0 with no plannedQty. |
| T06 | 250/150/100 acceptance: 60 good + 3 scrap + 12 pending +25 unprocessed; 50 unstarted | **PASS** | 100 received = 60 good + 3 scrap +12 pending +25 unprocessed; 50 planned/unstarted; no current audit warning. |
| T07 | Prevent physical receipt before material allocation | **PASS** | No allocation: physical receipt remains zero, with explanatory toast. |
| T08 | Prevent allocation above material and negative material receipt | **PASS** | 100 received; allocation101 and receipt−1 rejected; allocated remains zero. |
| T09 | Prevent production beyond physically unprocessed quantity | **PASS** | 11 pending against 10 received rejected. |
| T10 | Inspection/rework conserve quantity and reject operator approval | **PASS** | 20 pending → 12 good/3 scrap/5 rework → 4 good/1 scrap; final16 good/4 scrap. Operator approval button disabled. |
| T11 | Work order closure rejects pending and unstarted quantity | **PASS** | Pending10 plus unstarted140 prevents closing plan150. |
| T12 | Handover requires different user and explicit resume | **PASS** | Same-user takeover blocked; different user takes over with job still paused. |
| T13 | Partial external dispatch/return/final release/shipment/customer return | **PASS** | 60 external dispatched in two documents,30 returned,20 approved,15 customer shipped,5 returned; open30, ready5, net10, quarantine5. |
| T14 | Main order progress uses net customer shipments | **FAIL** | 20/20 customer shipped in UX06; main summary remains 0/20 and0%. |
| T15 | UX06 final release waits for intermediate internal operations | **FAIL** | 10 approved while job is still operation0 on İmalat→Tesviye. |
| T16 | Outbound external movement removes source physical stock | **FAIL** | Source received10/good10 still displayed alongside supplier-open10, no outbound physical dimension and no warning. Does not demonstrate duplicate UX06 dispatch. |
| T17 | Legacy shipment function cannot bypass final QA | **FAIL** | Programmatic openShip opens retained legacy form; saving10 succeeds with final releases0, marks job shipped. Normal disabled button was not clicked. |
| T18 | Allocation audit detects per-job overplan and dangling job reference | **FAIL** | Injected material250; allocation200 against plan150 plus allocation50 to missing job: warnings empty. |
| T19 | Audit is read-only | **FAIL** | Calling audit creates state.ux06 and empty per-order arrays in memory. |
| T20 | Unassigned work order opens its own operator context | **FAIL** | Unassigned DEMO-IE-004 operator link shows DEMO-IE-001. |
| T21 | Mobile navigation exposes audit and transaction history | **FAIL** | First-paint mobile bottom nav has only General/Orders/Jobs/Production/Shipping. Later renders add Fason; history and audit still absent. |
| T22 | PDF load and wizard modal Escape | **PASS** | Default PDF returned200 and iframe exists; Escape closes modal. PDF rendering, pinch and toolbar zoom not asserted. |
| T23 | Drawing revision has immutable history | **FAIL** | File upload replaces drawing with same revisionA, no revision-history field and no event. Synthetic small PDF used only to verify upload data handling, not PDF rendering. |
| T24 | Apostrophe-containing order ID remains navigable | **FAIL** | Apostrophe in ID becomes undefined in rendered link; clicking reaches Sipariş bulunamadı. Corrected focused reproduction replaces an initial locator timeout. |
| T25 | Storage failure does not report successful material commit | **FAIL** | Injected quota exception: receipt remains10 in memory; no receipt persisted. Error toast appears. Failure means mutation is not atomic, not that no error message appeared. |
| T26 | Wrong-shape persisted state has recovery screen | **FAIL** | Injected valid JSON with jobs:null: pageerror reading filter of null; empty page content and no recovery. |
| T27 | Duplicate supplier waybill and unapproved shipment rejected | **PASS** | Duplicate external waybill rejected; zero approved stock disables customer shipping. |
| T28 | Keyboard drawing activation | **FAIL** | Focused drawing pseudo-button + Enter does not open dialog. |
| T29 | Machine conflict guard preserves assignment and history | **PASS** | Assigning CNC-01 job to occupied CNC-02 rejected; original machine preserved. |
| T30 | Alternate sales page loads separately | **PASS** | Older sales page initial render succeeds at390; not a manufacturing-completeness assertion. |
| T31 | Acceptance production controls at 390px and 360px | **PASS** | Actual receipt/start/good/scrap/pending button flow at390 and360: same100/60/3/12 quantities, no production-page document overflow. |
| T32 | Closing job drawing retains selected work order | **FAIL** | Work-order detail → drawing → close → Operations tab results in İş bulunamadı. |

## Visual evidence

- [Desktop dashboard](audit/evidence/1440-home.png) and [360px dashboard](audit/evidence/360-home.png): unstyled action-centre/order-flow controls and collapsed labels.
- [390px audit](audit/evidence/390-audit.png) and [360px audit](audit/evidence/360-audit.png): whole-document width grows beyond viewport; intended table scroller is not containing intrinsic grid size.
- [250/150/100 balance](audit/evidence/acceptance-250-150-100.png), [390px production flow](audit/evidence/acceptance-390.png), [360px production flow](audit/evidence/acceptance-360.png): accepted quantity arithmetic and working large controls.
- [Shipped order still at zero progress](audit/evidence/shipped-order-zero-progress.png): final UX06 net20 but order summary stays0.
- [Legacy shipping](audit/evidence/1440-shipping.png) and [alternate sales page](audit/evidence/alternate-sales-390.png): duplicated shipping surfaces and separately maintained app.

All 17 captured PNGs are in [evidence](audit/evidence/). Full-page screenshots include the fixed bottom navigation at its viewport position. Small-target counts and route headings are recorded in the raw layout samples. All ten routes had a title and rendered; layout failures were restricted to UX07 in this tested sweep. No broad automated WCAG compliance claim is made.

## Console, page errors and resources

The full-run telemetry recorded:

1. One console resource404. The local HTTP-server log identifies `/favicon.ico` as the404; no app JavaScript/CSS/PDF failed in the route sweep.
2. Two aborted requests for Chrome's internal PDF extension URL (`chrome-extension://.../index.html`) when drawing dialogs were closed. These are browser PDF-viewer lifecycle events, not broken application HTTP resources. They also mean embedded PDF visual/zoom behavior needs manual target-browser verification.
3. One pageerror `Cannot read properties of null (reading 'filter')`, deliberately triggered by T26's invalid persisted-state fixture. No JavaScript pageerror was recorded in ordinary fresh-data journeys in this run.

The focused T24 run recorded the same favicon404 console message. It reached a missing-order screen rather than throwing JavaScript syntax errors. Raw records retain these events; they are not suppressed to manufacture a clean run.

The public URL was attempted through the web tool, which could not retrieve it. Direct read-only HTTP fetch succeeded: HTML, PDF and all five JS/five CSS assets returned200 and matched local SHA-256 hashes. See [live comparison](audit/evidence/live-source-comparison.json). Local browser behavior therefore uses identical source assets, but a live-host browser E2E execution was **not** performed. Deployment cache, response-header and service-worker behavior are not certified.

## Additional executed checks

`node --check` passed for both extracted inline scripts and every file in `assets/js/`. All repository source paths, links and overrides were reviewed; no package-based test runner existed before this audit (`assets/test` is a one-byte placeholder). No dependencies were added to the repository; Playwright was installed under `/tmp/ritim-ux-audit` for this audit.

## Reproduce

From repository root, start the local server in one terminal:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

In another terminal (a temporary install, not a repository dependency):

```sh
npm install --prefix /tmp/ritim-ux-audit playwright
NODE_PATH=/tmp/ritim-ux-audit/node_modules node docs/audit/run-audit.cjs
```

The harness defaults to the installed macOS Chrome path. Set `AUDIT_CHROME` to another installed compatible Chrome executable or `AUDIT_BASE_URL` to a dedicated isolated local test server. It writes screenshots and raw results under `docs/audit/evidence`. Do not point it at a shared production backend. To repeat a focused check, set e.g. `AUDIT_TEST_IDS=T24`; focused output goes to `results-focused.json` and does not overwrite the full report. Running the complete final harness regenerates all32 results without the earlier locator error.

## Not executed / incomplete validation

- Physical remainder transfer, reservation reassignment, supplier scrap/rework/lost closure, return disposition, reversal, compensation production, My Jobs and authenticated role access have no complete implemented journey to run. Classified from source, not marked passed.
- Real multi-tab/concurrent stock contention, multi-user service permissions, backend transactions and schema migration; no backend exists here. Quota and wrong-shape recovery were tested through controlled injection only.
- Real Android/iOS browser, scanner/glove use, small-height hardware, full keyboard/screen-reader audit, measured color contrast and touch accuracy.
- PDF content readability, native PDF zoom/pinch/download or revision acknowledgement. Default PDF HTTP retrieval and iframe presence passed; synthetic revision upload does not prove PDF rendering.
- Full alternate-sales end-to-end flows, live-host browser tests, exhaustive combinations of every validation boundary, time-zone midnight behavior, and full mobile wizard/shipment/return journeys. Mobile production and route layouts did execute.

No tests were fabricated or marked passed merely because a button exists. See [audit report](UX_AUDIT_REPORT.md) for interpretation and [backlog](UX_GAP_BACKLOG.md) for fixes and acceptance criteria.
