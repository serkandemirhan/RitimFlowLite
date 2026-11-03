# Navigation and role matrix

Authority: [permissions](../../backend/src/permissions.js), [authorization](../../backend/src/authorization.js), [operator discovery](../../backend/src/operator-work-orders.js). Menus never replace server authorization.

| Role | Existing capabilities | Proposed primary areas |
|---|---|---|
| viewer | site.read, orders.read | Bugün, Siparişler, authorized reports |
| planner | site.read, orders.read, planning.write | Siparişler, Planlama |
| operator | site.read, orders.read, production.write | Üretim / Bana Atanan İşler |
| quality | site.read, orders.read, quality.write | Kalite |
| logistics | site.read, orders.read, stock.write, shipment.write | Depo, Lojistik |
| manager | Site/order reads and orders/planning/production/quality/stock/shipment writes | Applicable business areas |
| tenant_admin | Manager capabilities plus members.manage | Business and tenant administration |
| superadmin | Tenant-admin capabilities plus platform.manage | Authorized platform administration |

Important distinction: current assignment uses orders.write, so planner's planning.write alone does not grant reassignment. Do not silently change this mapping. Manager without active operator membership does not gain another operator's My Jobs; discovery uses verified identity/current assignment. Multiple roles combine explicit capabilities.

Membership write/admin product remains incomplete despite defined capability names. Local/offline membership, Supabase mapping and synchronized revocation need [ADR approval](04_ARCHITECTURE_DECISIONS.md).
