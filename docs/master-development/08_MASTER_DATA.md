# Master data inventory

Current baseline `2ffcdc1`. Keep one tenant/site model for small and larger workshops.

| Catalog | Actual support / remaining gap |
|---|---|
| Customers | Order customer text/search; separate CRUD/identity catalog missing |
| Parts/products | Order part name, optional part number (028); central product catalog missing |
| Materials | Scoped inventory GET/POST; piece-based quantities, limited catalog pagination |
| Machines | Site machines/assignment selectors; complete maintenance/compatibility management missing |
| Work centers | Complete catalog/API missing |
| Operation types | Supported internal/external kinds; arbitrary route extensions unsupported |
| Route templates | Route wizard exists; authoritative saved-template/copy catalog missing |
| Employees/memberships | Identity/membership and eligible-operator reads; complete admin/import UI missing |
| Suppliers | Scoped outsourcing supplier creation/reads; full lifecycle pending |
| Warehouses/locations | Scoped plant/warehouse/region/container API; full hierarchy editing/import pending |
| Shifts | Complete model/API missing |
| Downtime reasons | Pause text; coded catalog missing |
| Quality rules | Explicit disposition/evidence; reusable rule catalog missing |
| Drawing definitions | Revision/document/publication/acknowledgement; external storage/scanning acceptance pending |

Sources: [inventory-service](../../backend/src/inventory-service.js), [outsourcing-service](../../backend/src/outsourcing-service.js), [integration-contracts](../../backend/src/integration-contracts.js), [orders-planning](../../backend/src/orders-planning.js). Real backend tests passed, but central master-data product acceptance remains PARTIAL.

Recommended UX: minimal customer/part/order entry, optional advanced details later; authorized inline creation only for existing APIs; search/reuse without automatic name merges. CSV/Excel import needs an explicit validation, duplicate, scope and transactional outcome contract. No unsupported customer/product creation endpoint was fabricated.
