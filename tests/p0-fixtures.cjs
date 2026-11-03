const Q = require("../assets/js/quantity-model.js");
function fresh({ qty = 20, planned = qty, route = ["İmalat"] } = {}) {
  return {
    schema: "ritim-flow-lite", schemaVersion: 1,
    user: "Yönetici",
    orders: [
      {
        id: "SIP-P0",
        customer: "Kurgusal Test Firma",
        part: "Test Parçası",
        partNo: "TEST",
        qty,
        route,
        revision: "A",
        due: "2026-11-01",
        created: "2026-10-26",
        drawing: "teknikResim.pdf",
      },
    ],
    jobs: [
      {
        id: "WO-P0",
        order: "SIP-P0",
        op: 0,
        plannedQty: planned,
        machine: "CNC-01",
        state: "waiting",
        good: 0,
        scrap: 0,
      },
    ],
    shipments: [],
    events: [],
  };
}
function completed(options = {}) {
  const s = fresh(options),
    j = s.jobs[0],
    n = j.plannedQty;
  j.state = "complete";
  j.good = n;
  j.ux05 = {
    received: n,
    pending: 0,
    setup: 0,
    rework: 0,
    legacyGood: 0,
    legacyBaseline: 0,
    handover: null,
    receipts: [{ qty: n }],
  };
  s.ux06 = { "SIP-P0": Object.fromEntries(Q.keys.map((k) => [k, []])) };
  s.ux06["SIP-P0"].receipts = [{ qty: n, ref: "MAT" }];
  s.ux06["SIP-P0"].allocations = [{ qty: n, job: j.id }];
  return s;
}
module.exports = { fresh, completed };
