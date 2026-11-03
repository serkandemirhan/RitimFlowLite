# Initial functionality matrix

Scope: actual HEAD 5315388. PARTIAL means browser-demo support, not secure production support. No business API, PostgreSQL dependency, verified identity or server permissions exist in this checkout. Runtime browser and mobile checks were not rerun; all mobile acceptance is NOT TESTED. Historical integration implementations must be inventoried again after branch reconciliation.

All business rows require local-server offline operation and an approved synchronization classification; neither is implemented in HEAD. Primary navigation below is proposed, not a new routing implementation.

| Function | Current source / page | Status | Tests / limitations | Proposed destination |
|---|---|---|---|---|
| Overview / Work Center | index.html, ux-shell.js / home | PARTIAL | Quantity tests only; browser not rerun | Bugün |
| Customer orders | ux-orders-workorders.js / orders, orderDetail | PARTIAL | Client state; no authoritative numbering API | Siparişler |
| Operation routes | index.html / order wizard | PARTIAL | Domain tests reject unsupported terminal routes | Siparişler / Rota |
| Work orders | index.html / jobs, detail | PARTIAL | No authenticated assignment | Planlama |
| Planning / machine scheduling | index.html / job creation | PARTIAL | Transactional persisted queue and priority NOT IMPLEMENTED | Planlama / Makine İş Sıraları |
| Operator production | ux-operator.js / production | PARTIAL | Quantity and closure guards; role dropdown is insecure | Üretim |
| Machine journal / downtime | index.html / history, operator sections | PARTIAL | No validated complete journal, capacity or spindle signals | Üretim / Makine Günlüğü |
| Technical drawings | index.html / drawing modal, teknikResim.pdf | PARTIAL | Revision authorization not accepted | Related order/work order |
| Quality | ux-operator.js, ux-logistics.js / quality actions | PARTIAL | Final-release domain guards pass; no server permission | Kalite |
| Rework | ux-operator.js / production buckets | PARTIAL | No accepted physical rework task lifecycle | Kalite / Yeniden İşleme |
| Materials / warehouse | ux-logistics.js / logistics | PARTIAL | Allocation arithmetic; no database stock ledger | Depo |
| Physical transfers | quantity-model.js / route guards | NOT IMPLEMENTED | Unsupported chains fail closed | Depo / Transferler |
| Outsourcing | shipment-service.js, ux-logistics.js / dispatch, returns | PARTIAL | Partial dispatch and return tests pass | Lojistik / Fason |
| Shipping | shipment-service.js, ux-logistics.js / shipping | PARTIAL | Approval lineage and partial shipment tests pass | Lojistik / Sevkiyat |
| Customer returns | ux-logistics.js / customerReturn | PARTIAL | Net demand/quarantine arithmetic; no accepted full disposition | Lojistik / İadeler |
| Master data | index.html / embedded suggestions and demo data | PARTIAL | Central scoped CRUD/import not accepted | Yönetim / Ana Veriler |
| Traceability | quantity-model.js, shipment-service.js / reconciliation | PARTIAL | Local approval references; no immutable lot genealogy | Raporlar ve İzlenebilirlik |
| Reporting | ux-audit.js / audit, history | PARTIAL | Pure-read tests pass; no authoritative reporting API | Raporlar ve İzlenebilirlik |
| Administration | index.html / user dropdown | NOT IMPLEMENTED | No secure tenant/site/membership administration | Sistem Ayarları |
| Authentication / audit / recovery | localStorage demo | NOT IMPLEMENTED | No secure login, append-only server audit or encrypted recovery in HEAD | Kullanıcı / Sistem Ayarları |

Source paths in this table are under `assets/js` unless stated otherwise. Existing [screen map](../UX_SCREEN_MAP.md) and [audit](../UX_AUDIT_REPORT.md) describe earlier baselines; their screenshots and findings are historical evidence, not current Windows acceptance. The current 25-test domain rerun is recorded in [test results](14_TEST_RESULTS.md).
