# Factory journey acceptance

Native Windows/PostgreSQL regression: **142/142**, fictional data, real restricted DB logins. No full Windows browser factory PASS. [Historical Gate 4](../../backend/docs/GATE4_RECONCILIATION_REPORT.md) used real Keycloak/source/package in a different environment.

| Journey step | Current support / Windows evidence |
|---|---|
| 1 Customer | Order customer text; independent customer catalog gap |
| 2 Part | Order part name/optional number; central catalog gap |
| 3 Order | Scoped idempotent orders API; b03b-planning |
| 4 Route template | Supported route definition tested; saved-template catalog gap |
| 5 Work orders | Quantity-safe first/downstream planning; b03b-planning, b04b1a-quality |
| 6 Machine/operator | Explicit assignment/handover; b04a-production, b04b1a-quality |
| 7 Machine sequence | Persisted queue NOT IMPLEMENTED |
| 8-10 Warehouse receipt/move/pick | Immutable movements/genealogy; inventory-balance, b04b1a-quality |
| 11 Drawing | Exact revision/publication/user/job gate backend-tested; Windows PDF browser FAIL |
| 12 Production | Assigned actor and received input; b04a-production, b04b1a-quality |
| 13 Setup/downtime | Pause/resume; structured shift/setup-time journal gap |
| 14 Quality | Provenance-linked approved/rejected/rework; b04b1a-quality |
| 15 Rework | Explicit linked input and supported cycle; b04b1a-quality |
| 16-17 Outsource/return/inspect | Supported internal-external-internal route; b04b1a-quality |
| 18 Next operation | Approved reservation, dispatch, receipt, execution; b03c-flow, b04b1a-quality |
| 19-20 Shipping/delivery | Dedicated immutable shipping events; b04b1a-quality |
| 21-23 RMA/quarantine/disposition | Delivery bounds, actual receipt and explicit decisions; b04b1a-quality |
| 24 Genealogy/reconciliation | Linked warehouse/output/logistics/RMA cross-module assertions; b04b1a-quality |

Backend suites exercise replay/idempotency, isolation, concurrency, lost responses, encryption and audit rollback. Demo browser tests do not prove authenticated factory behavior. Remaining acceptance: secure local provider configuration, source/package premium journeys, seven widths, approved offline outage tests and approved sync reconnect/replay. Physical iPhone/Android acceptance is NOT TESTED.
