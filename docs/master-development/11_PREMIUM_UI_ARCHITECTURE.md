# Premium UI architecture

Existing [premium API application](../../integration/premium-api.js), [adapter](../../integration/api-adapter.js) and [HTML shell](../../index.html) provide orders, planning, operator/quality, warehouse, rework, outsourcing, shipping, returns, scoped navigation and trace links. Preserve real API calls and encrypted recovery rather than replacing them with mock boards.

Local entry: `http://127.0.0.1:4178/?mode=api`. Root without API mode is fictional demo. Premium startup explicitly restricts loopback; removing that restriction requires the approved LAN/TLS/identity deployment contract.

Keep seven areas: Bugün, Siparişler, Planlama, Üretim, Kalite, Depo, Lojistik; role-aware secondary administration, reports/traceability and settings. Object ownership follows LIST -> DETAIL -> ACTION. Distinguish historical production, planned remainder, physical input, dispositions, reservations/transit and net customer delivery.

Windows: six navigation/simple-order tests pass; latest individual demo browser results are 109/110 with PDF failure. Real premium authenticated journeys remain NOT TESTED here. [Factory UI report](../factory-journey/UX_FIX_CONTINUATION.md) and [Gate 4](../../backend/docs/GATE4_RECONCILIATION_REPORT.md) are historical environment evidence.

No visual redesign was performed during source/Windows restoration. Before changing a screen, capture actual baseline at 320/360/390/430/768/1280/1440px; after changes exercise real action/loading/error/empty/retry behavior and capture results. Screenshots are not functional or physical-device acceptance. PDF rendering/document security remains open.
