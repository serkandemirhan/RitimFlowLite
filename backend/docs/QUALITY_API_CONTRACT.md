# Current production, quality and shipping contract

This supersedes historical B04A/B04B milestone limitations. Production reporting is not quality approval; classification is not physical stock release.

| Response | Current meaning | Source |
|---|---|---|
| Production `/summary`, `/balances`: `outputs.*` | Original effective production classifications, including supported corrections. Quality decisions do not rewrite these totals. `pending` is NOT current unresolved quality. | [production-execution](../src/production-execution.js) |
| `approvedGoodQuantity: null` | Deprecated compatibility placeholder, not zero approved stock. | Same producer; B04A/B04B1A assertions. |
| `qualityApproval: "not_implemented"` | Deprecated production-only placeholder, not current system capability. | Same producer; no frontend consumers found. |
| Quality `outputs`: `approved`, `rejected`, `rework`, `unresolved` | Current disposition of each eligible good/pending event. | [quality-disposition](../src/quality-disposition.js), [output-projection](../src/output-projection.js) |
| Shipping availability | Approved, eligible output with provenance, completion/release conditions and existing commitments accounted for. Never infer from production `good` or `pending`. | [shipping-service](../src/shipping-service.js) |

Deprecated fields retain their existing values for compatibility with unknown external consumers. Remove/change them only through an explicit version/deprecation plan. The operator frontend uses current quality projections and completion attention, not these placeholders.

## Invariants and read consistency

- Eligible good/pending event quantity = approved + rejected + rework + unresolved. Direct scrap/setup scrap are separate and must not be added to this event denominator.
- Requesting inspection neither creates production nor approves it.
- Rejected output is not shippable. Rework creates traceable new output that requires inspection; never sum both production passes as deliverable stock.
- Scrap compensation is separately authorized production, not reversal of scrap or automatic approval.
- Completion checks current unresolved quality, unfinished rework, input and transfers. Meeting the processing target alone is insufficient.
- Idempotency preserves event identity; conflicting decisions serialize and cannot over-classify an event.
- Separate GETs are not an atomic snapshot. Compare the same scope/order/job after writes settle; repeat reads if concurrent actors change state.

## Regression coverage

[Quality integration tests](../test/b04b1a-quality.test.js) compare production, quality, reservations and shipping through 3 pending → 2 approved/1 unresolved → 2 approved/1 rejected → completed. Early completion fails and only 2 become shippable. Rework allocation/reinspection/provenance, concurrency and authorization are also covered. [Production tests](../test/b04a-production.test.js) preserve legacy response assertions. Device interaction evidence is tracked separately.
