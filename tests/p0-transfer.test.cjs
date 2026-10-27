const test = require("node:test");
const assert = require("node:assert/strict");
const Q = require("../assets/js/quantity-model.js");
const L = require("../assets/js/transfer-ledger.js");
const T = require("../assets/js/transfer-service.js");
const S = require("../assets/js/shipment-service.js");
const { completed } = require("./p0-fixtures.cjs");
const { fixture } = require("./p0-transfer-fixture.cjs");
const issue = (s, opts = {}) =>
  T.issue(s, {
    id: "TR-1",
    source: s.jobs[0].id,
    destination: "TARGET",
    inputLot: L.rawLot(s.jobs[0].id),
    qty: 25,
    reason: "Makine değişimi",
    ...opts,
  });
const balance = (s, i = 0) => Q.jobBalance(s.jobs[i], s.orders[0], s);
function rejectsUnchanged(s, fn) {
  const before = JSON.stringify(s);
  assert.equal(fn().ok, false);
  assert.equal(JSON.stringify(s), before);
}
test("P0-04: 25 physical units leave source immediately, remain in transit until acceptance; 50 unstarted stay planned", () => {
  const s = fixture(),
    before = structuredClone(s.jobs[0]);
  assert.equal(issue(s).ok, true);
  assert.deepEqual(s.jobs[0], before);
  assert.equal(balance(s).unprocessed, 0);
  assert.equal(balance(s).unstarted, 50);
  assert.equal(balance(s).inTransit, 25);
  assert.equal(balance(s, 1).unprocessed, 0);
  assert.equal(balance(s, 1).awaitingTransfer, 25);
  assert.equal(T.accept(s, { id: "TR-1" }).ok, true);
  assert.equal(balance(s, 1).unprocessed, 25);
  assert.equal(balance(s).inTransit, 0);
  assert.equal(balance(s).received, 100);
  assert.equal(
    balance(s).used + balance(s).unprocessed + balance(s).transferredOut,
    100,
  );
  assert.equal(Q.orderQuantities(s, s.orders[0]).material, 150);
  assert.equal(Q.orderQuantities(s, s.orders[0]).allocated, 150);
  assert.deepEqual(L.issues(s), []);
});
test("P0-04: read-only projection never creates lots or converts old records", () => {
  const s = fixture(),
    before = JSON.stringify(s);
  L.lots(s, s.jobs[0]);
  L.issues(s);
  balance(s);
  Q.orderQuantities(s, s.orders[0]);
  assert.equal(JSON.stringify(s), before);
  assert.equal(s.physicalTransfers, undefined);
});
for (const qty of [0, -1, 1.5, NaN, Infinity, 26, 50, 75])
  test(`P0-04: reject nonphysical/invalid quantity ${qty}`, () => {
    const s = fixture();
    rejectsUnchanged(s, () => issue(s, { qty }));
  });
test("P0-04: duplicate issue and acceptance/reload retries cannot create stock", () => {
  let s = fixture();
  assert.equal(issue(s).ok, true);
  rejectsUnchanged(s, () => issue(s));
  s = JSON.parse(JSON.stringify(s));
  assert.equal(T.accept(s, { id: "TR-1" }).ok, true);
  rejectsUnchanged(s, () => T.accept(s, { id: "TR-1" }));
  rejectsUnchanged(s, () => issue(s, { id: "TR-2", qty: 1 }));
});
test("P0-04: pending destination capacity includes other in-transit lots", () => {
  const s = fixture();
  assert.equal(issue(s, { qty: 15 }).ok, true);
  assert.equal(issue(s, { id: "TR-2", qty: 10 }).ok, true);
  rejectsUnchanged(s, () => issue(s, { id: "TR-3", qty: 1 }));
  assert.equal(T.accept(s, { id: "TR-2" }).ok, true);
  assert.equal(T.accept(s, { id: "TR-1" }).ok, true);
  assert.equal(balance(s, 1).unprocessed, 25);
});
test("P0-04: reverse transit requires physical return confirmation and reason, retains history", () => {
  const s = fixture();
  issue(s);
  rejectsUnchanged(s, () => T.reverse(s, { id: "TR-1", reason: "İptal" }));
  rejectsUnchanged(s, () => T.reverse(s, { id: "TR-1", returned: true }));
  assert.equal(
    T.reverse(s, { id: "TR-1", reason: "Kaynağa geldi", returned: true }).ok,
    true,
  );
  assert.equal(balance(s).unprocessed, 25);
  assert.equal(balance(s, 1).awaitingTransfer, 0);
  assert.deepEqual(
    s.physicalTransfers[0].history.map((e) => e.action),
    ["issue", "reverse"],
  );
  rejectsUnchanged(s, () => T.accept(s, { id: "TR-1" }));
  rejectsUnchanged(s, () =>
    T.reverse(s, { id: "TR-1", reason: "Yine", returned: true }),
  );
});
test("P0-04: accepted unused lot can be physically returned; original 25/50 balances restored", () => {
  const s = fixture();
  issue(s);
  T.accept(s, { id: "TR-1" });
  assert.equal(
    T.reverse(s, {
      id: "TR-1",
      reason: "Yanlış hedef; geri geldi",
      returned: true,
    }).ok,
    true,
  );
  assert.equal(balance(s).unprocessed, 25);
  assert.equal(balance(s).unstarted, 50);
  assert.equal(balance(s, 1).received, 0);
  assert.deepEqual(L.issues(s), []);
});
test("P0-04: accepted consumed or forwarded lot cannot be reversed", () => {
  const s = fixture();
  issue(s);
  T.accept(s, { id: "TR-1" });
  s.jobs[1].good = 1;
  rejectsUnchanged(s, () =>
    T.reverse(s, { id: "TR-1", reason: "İade", returned: true }),
  );
  s.jobs[1].good = 0;
  s.jobs.push({ ...s.jobs[1], id: "THIRD", ux05: undefined });
  assert.equal(
    issue(s, {
      id: "TR-2",
      source: "TARGET",
      destination: "THIRD",
      inputLot: "TRANSFER:TR-1",
      qty: 10,
    }).ok,
    true,
  );
  rejectsUnchanged(s, () =>
    T.reverse(s, { id: "TR-1", reason: "İade", returned: true }),
  );
  assert.equal(T.accept(s, { id: "TR-2" }).ok, true);
  assert.equal(balance(s, 1).unprocessed, 15);
  assert.equal(balance(s, 2).unprocessed, 10);
  assert.deepEqual(L.issues(s), []);
});
test("P0-04: transfer input produces verified goods without duplicate raw allocation, QA still required", () => {
  const s = fixture();
  issue(s);
  T.accept(s, { id: "TR-1" });
  s.jobs[1].good = 25;
  s.jobs[1].state = "complete";
  assert.equal(Q.orderQuantities(s, s.orders[0]).verified, 85);
  assert.equal(S.ship(s, s.orders[0].id, { qty: 25, ref: "NO-QA" }).ok, false);
  assert.equal(S.release(s, s.orders[0].id, { qty: 25 }).ok, true);
  assert.equal(
    S.ship(s, s.orders[0].id, { qty: 25, ref: "CUSTOMER" }).ok,
    true,
  );
  assert.equal(Q.orderQuantities(s, s.orders[0]).net, 25);
  rejectsUnchanged(s, () =>
    issue(s, {
      id: "TR-3",
      source: "TARGET",
      destination: s.jobs[0].id,
      inputLot: "TRANSFER:TR-1",
      qty: 1,
    }),
  );
});
for (const change of [
  (s) => (s.jobs[1].op = 1),
  (s) => (s.jobs[1].order = "OTHER"),
  (s) => (s.jobs[1].state = "complete"),
  (s) => (s.jobs[1].plannedQty = 24),
  (s) => (s.user = "Operatör A"),
  (s) => (s.jobs[0].ux05.handover = { from: "A" }),
])
  test("P0-04: invalid destination, permission or handover has no partial writes", () => {
    const s = fixture();
    change(s);
    rejectsUnchanged(s, () => issue(s));
  });
test("P0-04: missing lot/reason, same job, unsupported operation and legacy good are not transferable", () => {
  const s = fixture();
  for (const args of [
    { inputLot: "missing" },
    { reason: "" },
    { destination: s.jobs[0].id },
  ])
    rejectsUnchanged(s, () => issue(s, args));
  delete s.jobs[0].ux05;
  rejectsUnchanged(s, () => issue(s));
});
test("P0-04: accept revalidates route, target capacity and state after issue", () => {
  for (const mutate of [
    (s) => s.orders[0].route.push("Tesviye"),
    (s) => (s.jobs[1].plannedQty = 10),
    (s) => (s.jobs[1].state = "complete"),
    (s) => (s.user = "Operatör B"),
  ]) {
    const s = fixture();
    issue(s);
    mutate(s);
    rejectsUnchanged(s, () => T.accept(s, { id: "TR-1" }));
  }
});
test("P0-04: corrupted movement blocks transfer and customer shipping", () => {
  const s = fixture();
  issue(s);
  s.physicalTransfers[0].qty = 26;
  assert.ok(L.issues(s).length);
  assert.equal(Q.orderQuantities(s, s.orders[0]).shipAvailable, 0);
  rejectsUnchanged(s, () => T.accept(s, { id: "TR-1" }));
});

test("P0-04: consumed transfer lot cannot be resurrected by later direct receipts", () => {
  const s = fixture();
  issue(s);
  T.accept(s, { id: "TR-1" });
  assert.equal(T.consume(s, s.jobs[1], 25, "good").ok, true);
  s.jobs[1].good = 25;
  s.jobs[1].plannedQty = 50;
  s.jobs[1].ux05.received = 25;
  s.ux06[s.orders[0].id].receipts.push({ qty: 25, ref: "NEW" });
  s.ux06[s.orders[0].id].allocations.push({ qty: 25, job: "TARGET" });
  assert.equal(
    L.lots(s, s.jobs[1]).find((l) => l.id === "TRANSFER:TR-1").available,
    0,
  );
  rejectsUnchanged(s, () =>
    T.reverse(s, { id: "TR-1", reason: "İade", returned: true }),
  );
  assert.equal(balance(s, 1).unprocessed, 25);
  assert.deepEqual(L.issues(s), []);
});
test("P0-04: cumulative good remains history when verified good leaves the location", () => {
  const s = completed();
  assert.equal(Q.jobPhysicalStock(s, s.jobs[0], s.orders[0]).onHandGood, 20);
  S.release(s, s.orders[0].id, { qty: 20 });
  S.ship(s, s.orders[0].id, { qty: 15, ref: "SHIP" });
  assert.equal(Q.jobPhysicalStock(s, s.jobs[0], s.orders[0]).onHandGood, 5);
  assert.equal(s.jobs[0].good, 20);
});
test("P0-04: malformed new ledger fields fail closed without rewriting storage", () => {
  for (const corrupt of [
    (s) => s.physicalTransfers.push(null),
    (s) => (s.physicalTransfers[0].history = null),
    (s) => (s.physicalLotUses = {}),
    (s) => (s.physicalLotUses = [null]),
  ]) {
    const s = fixture();
    issue(s);
    corrupt(s);
    assert.ok(L.issues(s).length);
    rejectsUnchanged(s, () => T.accept(s, { id: "TR-1" }));
    assert.equal(Q.orderQuantities(s, s.orders[0]).shipAvailable, 0);
  }
});
test("P0-04: pending acceptance reserves target plan independently of source availability", () => {
  const s = fixture();
  s.jobs[1].plannedQty = 20;
  assert.equal(issue(s, { qty: 15 }).ok, true);
  assert.equal(balance(s).unprocessed, 10);
  rejectsUnchanged(s, () => issue(s, { id: "TR-2", qty: 10 }));
  assert.equal(issue(s, { id: "TR-2", qty: 5 }).ok, true);
});
test('P0-04: physical return cannot silently reopen a closed or handed-over source',()=>{
  for(const change of [s=>s.jobs[0].state='complete',s=>s.jobs[0].ux05.handover={from:'A'}]) {
    const s=fixture();issue(s);change(s);
    rejectsUnchanged(s,()=>T.reverse(s,{id:'TR-1',reason:'Geri geldi',returned:true}));
  }
});
