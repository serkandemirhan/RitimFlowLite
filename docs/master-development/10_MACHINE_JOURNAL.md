# Machine journal

[Production execution](../../backend/src/production-execution.js) records lifecycle and classifications; [assignment](../../backend/src/assignment.js) retains handover history. Native tests verify identity, input conservation, drawing/quality gates, transitions, retries and audit rollback. These are manual MES events, not spindle telemetry or validated OEE.

| Field | Existing support / gap |
|---|---|
| Job/machine/operator | Work-order/assignment records; dedicated historical journal query pending |
| Production start/end | Lifecycle/audit events; cross-job machine timeline pending |
| Shift | Complete scoped shift/calendar association missing |
| Setup start/end | setup_scrap is a quantity; structured setup duration missing |
| Pause/downtime | Pause reason text; codes, intervals and open-interval handling missing |
| Good/scrap/QC | Reconciled events/dispositions; grouped journal must avoid double counting |
| Notes/time | Event/audit payloads; typed journal notes and sync clock provenance pending |

Recommended UI: few active-job lifecycle buttons and reason selection; larger shops gain journal filters on the same model. Define event/shift contract before implementation. Status PARTIAL; no complete machine-journal acceptance.
