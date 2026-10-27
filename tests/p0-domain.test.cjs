const test = require("node:test");
const assert = require("node:assert/strict");
const Q = require("../assets/js/quantity-model.js");
const S = require("../assets/js/shipment-service.js");
const { fresh, completed } = require("./p0-fixtures.cjs");
const quantities = (s) => Q.orderQuantities(s, s.orders[0]);
const approve = (s, qty = 20) => S.release(s, "SIP-P0", { qty });
const ship = (s, qty = 20, ref = "SHIP-1") => S.ship(s, "SIP-P0", { qty, ref });

test("P0-01: reads are pure and never create/migrate ledgers", () => {
  const s = fresh(),
    before = JSON.stringify(s);
  for (let n = 0; n < 3; n++) {
    Q.summary(s, s.orders[0]);
    Q.jobBalance(s.jobs[0], s.orders[0]);
  }
  assert.equal(JSON.stringify(s), before);
});
test("P0-01: UX05 acceptance equation keeps 25 physical and 50 unstarted distinct", () => {
  const s = completed({ qty: 250, planned: 150 }),
    j = s.jobs[0];
  Object.assign(j, { good: 60, scrap: 3, state: "running" });
  Object.assign(j.ux05, { received: 100, pending: 12 });
  const b = Q.jobBalance(j, s.orders[0]);
  assert.deepEqual(
    [
      b.received,
      b.good,
      b.scrap,
      b.setup,
      b.pending,
      b.rework,
      b.unprocessed,
      b.unstarted,
    ],
    [100, 60, 3, 0, 12, 0, 25, 50],
  );
  assert.equal(b.used + b.unprocessed, b.received);
  assert.equal(approve(s, 60).ok, false);
});
test("P0-01: 20/20 shipped →100%, return5 →75% and reopened, quarantine is not ready", () => {
  const s = completed();
  assert.equal(approve(s).ok, true);
  assert.equal(ship(s).ok, true);
  let x = Q.summary(s, s.orders[0]);
  assert.equal(x.percent, 100);
  assert.equal(x.complete, true);
  s.ux06["SIP-P0"].customerReturns.push({
    qty: 5,
    shipment: "SHIP-1",
    reason: "Test",
  });
  x = Q.summary(s, s.orders[0]);
  assert.equal(x.percent, 75);
  assert.equal(x.complete, false);
  assert.equal(x.status, "partial");
  assert.equal(x.ready, 0);
  assert.equal(x.customerReturn, 5);
  assert.equal(ship(s, 5, "SHIP-2").ok, false);
});
test("P0-01: external dispatch and supplier return never count as customer shipment", () => {
  const s = completed({ route: ["İmalat", "Kaplama"] });
  assert.equal(S.dispatch(s, "SIP-P0", { qty: 20, ref: "EXT-1" }).ok, true);
  s.ux06["SIP-P0"].returns.push({ qty: 10, dispatch: "EXT-1" });
  assert.equal(Q.summary(s, s.orders[0]).percent, 0);
  assert.equal(quantities(s).net, 0);
});
test("P0-01: legacy shipments and good remain explicit history, never promoted or written", () => {
  const s = completed();
  s.shipments = [{ job: "WO-P0", qty: 12 }];
  s.jobs[0].ux05.legacyGood = 20;
  s.jobs[0].ux05.legacyBaseline = 20;
  const before = JSON.stringify(s);
  const x = quantities(s);
  assert.equal(x.historical.legacyShipped, 12);
  assert.equal(x.net, 0);
  assert.equal(x.verified, 0);
  assert.equal(x.ready, 0);
  assert.equal(JSON.stringify(s), before);
});
test("P0-01: almost-complete quantities do not round to completed status", () => {
  const s = completed({ qty: 1000000 });
  approve(s, 1000000);
  ship(s, 999999);
  const x = Q.summary(s, s.orders[0]);
  assert.equal(x.complete, false);
  assert.equal(x.percent, 99.9999);
});
test("P0-02: no release or shipment before job completion or final QA", () => {
  const s = completed();
  s.jobs[0].state = "running";
  assert.equal(approve(s).ok, false);
  assert.equal(ship(s).ok, false);
  s.jobs[0].state = "complete";
  assert.equal(ship(s).ok, false);
  assert.equal(approve(s).ok, true);
  assert.equal(ship(s).ok, true);
});
for (const route of [
  ["İmalat", "Tesviye"],
  ["İmalat", "Tesviye", "Kaplama"],
  ["İmalat", "Kaplama", "Montaj"],
  ["İmalat", "Kaplama", "Fason"],
])
  test(
    "P0-02: fail closed without transfer lineage: " + route.join(" → "),
    () => {
      const s = completed({ route });
      s.jobs.push({
        ...structuredClone(s.jobs[0]),
        id: "WO-LAST",
        op: route.length - 1,
      });
      assert.equal(approve(s).ok, false);
      assert.equal(ship(s).ok, false);
      assert.match(quantities(s).issues.join(" "), /aktarım/);
    },
  );
test("P0-02: partial external returns prove terminal quantities only; no over-release", () => {
  const s = completed({ route: ["İmalat", "Kaplama"] });
  assert.equal(S.dispatch(s, "SIP-P0", { qty: 12, ref: "EXT-A" }).ok, true);
  assert.equal(S.dispatch(s, "SIP-P0", { qty: 8, ref: "EXT-B" }).ok, true);
  assert.equal(approve(s, 1).ok, false);
  s.ux06["SIP-P0"].returns.push({ qty: 10, dispatch: "EXT-A" });
  assert.equal(approve(s, 11).ok, false);
  assert.equal(approve(s, 6).ok, true);
  assert.equal(approve(s, 4).ok, true);
  assert.equal(approve(s, 1).ok, false);
  assert.equal(ship(s, 10).ok, true);
  assert.equal(quantities(s).supplierOpen, 10);
});
test("P0-02: legacy dispatch and release records are held without conversion", () => {
  const s = completed({ route: ["İmalat", "Kaplama"] });
  s.ux06["SIP-P0"].dispatches.push({ qty: 20, ref: "OLD" });
  s.ux06["SIP-P0"].returns.push({ qty: 20, dispatch: "OLD" });
  s.ux06["SIP-P0"].releases.push({ qty: 20 });
  const before = JSON.stringify(s);
  assert.equal(quantities(s).ready, 0);
  assert.equal(ship(s).ok, false);
  assert.equal(approve(s).ok, false);
  assert.equal(JSON.stringify(s), before);
});
test("P0-02: route edits invalidate old final approval at commit time", () => {
  const s = completed();
  approve(s);
  s.orders[0].route = ["İmalat", "Tesviye"];
  assert.equal(ship(s).ok, false);
  assert.equal(s.ux06["SIP-P0"].shipments.length, 0);
});
test("P0-02: completion is revalidated, not cached in approval", () => {
  const s = completed();
  approve(s);
  s.jobs[0].state = "running";
  assert.equal(ship(s).ok, false);
  s.jobs[0].state = "complete";
  s.jobs[0].ux05.pending = 1;
  assert.equal(ship(s).ok, false);
});
test("P0-02: only selected manager can approve; rejected action has no writes", () => {
  const s = completed();
  s.user = "Operatör A";
  const before = JSON.stringify(s);
  assert.equal(approve(s).ok, false);
  assert.equal(JSON.stringify(s), before);
});
test("P0-02: pending/rework/unprocessed/unstarted/insufficient allocation block final release", () => {
  for (const mutate of [
    (j) => (j.ux05.pending = 1),
    (j) => (j.ux05.rework = 1),
    (j) => (j.good = 19),
    (j) => (j.plannedQty = 21),
  ]) {
    const s = completed();
    mutate(s.jobs[0]);
    assert.equal(approve(s).ok, false);
  }
  const s = completed();
  s.ux06["SIP-P0"].allocations[0].qty = 19;
  assert.equal(approve(s).ok, false);
});
test("P0-03: invalid quantities, missing/duplicate waybill, over-shipment all reject", () => {
  const s = completed();
  approve(s);
  for (const qty of [-1, 0, 0.5, 21, NaN, Infinity, "1"])
    assert.equal(ship(s, qty).ok, false);
  assert.equal(ship(s, 1, " ").ok, false);
  assert.equal(ship(s, 8, "SHIP-A").ok, true);
  assert.equal(ship(s, 1, "SHIP-A").ok, false);
  assert.equal(ship(s, 13, "SHIP-B").ok, false);
  assert.equal(ship(s, 12, "SHIP-B").ok, true);
  assert.equal(ship(s, 1, "SHIP-C").ok, false);
});
test("P0-03: forged/old untagged release cannot unlock shipment", () => {
  const s = completed();
  s.ux06["SIP-P0"].releases.push({ qty: 20, date: "2026-10-01" });
  assert.equal(ship(s).ok, false);
  assert.equal(quantities(s).ready, 0);
});
test("P0-03: final approval and shipment retain existing history byte-for-byte", () => {
  const s = completed();
  s.shipments = [{ job: "WO-P0", qty: 3, time: "old" }];
  const old = JSON.stringify(s.shipments),
    jobs = JSON.stringify(s.jobs);
  approve(s);
  ship(s, 4);
  assert.equal(JSON.stringify(s.shipments), old);
  assert.equal(JSON.stringify(s.jobs), jobs);
  assert.equal(s.ux06["SIP-P0"].shipments.length, 1);
});
test("partial dispatch preserves allocated/good bound and document uniqueness", () => {
  const s = completed({ route: ["İmalat", "Kaplama"] });
  assert.equal(S.dispatch(s, "SIP-P0", { qty: 12, ref: "EXT" }).ok, true);
  assert.equal(S.dispatch(s, "SIP-P0", { qty: 1, ref: "EXT" }).ok, false);
  assert.equal(S.dispatch(s, "SIP-P0", { qty: 9, ref: "OTHER" }).ok, false);
  assert.equal(S.dispatch(s, "SIP-P0", { qty: 8, ref: "OTHER" }).ok, true);
  assert.equal(quantities(s).dispatchAvailable, 0);
});
test("unsupported or malformed operation types cannot enable final release", () => {
  const s = completed({ route: [{ name: "Custom", type: "unknown" }] });
  assert.equal(approve(s).ok, false);
});
test("UX06 partial dispatch remains available during upstream production; only terminal good return can release", () => {
  const s = completed({ qty: 250, planned: 150, route: ["İmalat", "Kaplama"] }),
    j = s.jobs[0];
  j.state = "running";
  j.good = 60;
  j.scrap = 3;
  Object.assign(j.ux05, { received: 100, pending: 12 });
  s.ux06["SIP-P0"].receipts[0].qty = 100;
  s.ux06["SIP-P0"].allocations[0].qty = 100;
  assert.equal(
    S.dispatch(s, "SIP-P0", { qty: 40, ref: "EXT-PARTIAL" }).ok,
    true,
  );
  assert.equal(approve(s, 1).ok, false);
  s.ux06["SIP-P0"].returns.push({ qty: 25, dispatch: "EXT-PARTIAL" });
  assert.equal(approve(s, 25).ok, true);
  assert.equal(ship(s, 25).ok, true);
  assert.equal(quantities(s).net, 25);
  assert.equal(Q.jobBalance(j, s.orders[0]).unprocessed, 25);
});
test("P0-02: replacement job cannot inherit another job final quality approval", () => {
  const s = completed();
  approve(s);
  s.jobs[0].id = "REPLACEMENT";
  s.ux06["SIP-P0"].allocations[0].job = "REPLACEMENT";
  assert.equal(ship(s).ok, false);
});
test("P0-03: each partial shipment retains links to the exact final approvals consumed", () => {
  const s = completed();
  approve(s, 8);
  approve(s, 12);
  ship(s, 10, "A");
  ship(s, 10, "B");
  const d = s.ux06["SIP-P0"];
  assert.deepEqual(d.shipments[0].approvals, [
    { release: "FINAL-1", qty: 8 },
    { release: "FINAL-2", qty: 2 },
  ]);
  assert.deepEqual(d.shipments[1].approvals, [{ release: "FINAL-2", qty: 10 }]);
  d.shipments[1].approvals[0].release = "MISSING";
  assert.equal(quantities(s).blocked, true);
});
test("P0-02: removing external operation cannot release stock already dispatched externally", () => {
  const s = completed({ route: ["İmalat", "Kaplama"] });
  S.dispatch(s, "SIP-P0", { qty: 20, ref: "EXT" });
  s.orders[0].route = ["İmalat"];
  assert.equal(approve(s).ok, false);
  assert.equal(ship(s).ok, false);
});
