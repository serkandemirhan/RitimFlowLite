const test = require("node:test"),
  assert = require("node:assert/strict");
const Q = require("../assets/js/quantity-model.js"),
  P = require("../assets/js/planning-service.js"),
  S = require("../assets/js/shipment-service.js"),
  T = require("../assets/js/transfer-service.js");
const { fresh, completed } = require("./p0-fixtures.cjs");
const create = (s, id, qty, operation = 0, machine = "") =>
  P.create(s, {
    order: s.orders[0].id,
    id,
    qty,
    operation,
    machine,
    machines: ["CNC-01", "CNC-02", "CNC-03"],
  });
const unchanged = (s, fn) => {
  const before = JSON.stringify(s);
  assert.equal(fn().ok, false);
  assert.equal(JSON.stringify(s), before);
};
function moveAll(s, id) {
  for (const r of s.operationInputs.filter((r) => r.destination === id)) {
    assert.equal(P.move(s, { id: r.id, action: "send" }).ok, true);
    assert.equal(P.move(s, { id: r.id, action: "accept" }).ok, true);
  }
}
function finish(s, id) {
  const j = s.jobs.find((j) => j.id === id);
  assert.equal(T.consume(s, j, j.plannedQty, "good").ok, true);
  j.good = j.plannedQty;
  j.state = "complete";
}
test("P0-05: split 150 into 100+50 across machines and reject additional 1", () => {
  const s = fresh({ qty: 150 });
  s.jobs = [];
  assert.equal(create(s, "A", 100, 0, "CNC-01").ok, true);
  assert.equal(create(s, "B", 50, 0, "CNC-02").ok, true);
  unchanged(s, () => create(s, "C", 1));
  assert.equal(P.capacity(s, s.orders[0], 0).available, 0);
});
test("P0-05: existing unknown job plan conservatively occupies order quantity without migration", () => {
  const s = fresh({ qty: 150 });
  delete s.jobs[0].plannedQty;
  unchanged(s, () => create(s, "B", 1));
});
for (const qty of [0, -1, 1.5, NaN, Infinity, 151])
  test(`P0-05: invalid plan ${qty} is atomic`, () => {
    const s = fresh({ qty: 150 });
    s.jobs = [];
    unchanged(s, () => create(s, "A", qty));
  });
test("P0-05: duplicate id, missing job id, role and occupied/unknown machines reject", () => {
  const s = fresh({ qty: 150, planned: 50 });
  for (const [id, ma] of [
    ["WO-P0", ""],
    ["", ""],
    ["B", "UNKNOWN"],
    ["B", "CNC-01"],
  ])
    unchanged(s, () => create(s, id, 50, 0, ma));
  s.user = "Operatör A";
  unchanged(s, () => create(s, "B", 50));
});
test("P0-05: physical 25 remains while unstarted 50 is explicitly released from plan and raw allocation", () => {
  const s = completed({ qty: 250, planned: 150 }),
    j = s.jobs[0];
  j.good = 60;
  j.scrap = 3;
  j.state = "running";
  j.ux05.received = 100;
  j.ux05.pending = 12;
  assert.equal(
    P.reduce(s, { job: j.id, qty: 50, reason: "Yeni makine planı" }).ok,
    true,
  );
  const b = Q.jobBalance(j, s.orders[0], s);
  assert.equal(b.unprocessed, 25);
  assert.equal(b.planned, 100);
  assert.equal(b.unstarted, 0);
  assert.equal(Q.orderQuantities(s, s.orders[0]).materialFree, 50);
  assert.equal(Q.allocation(s, s.orders[0].id, j.id), 100);
  unchanged(s, () =>
    P.reduce(s, { job: j.id, qty: 1, reason: "Fiziksel parçayı azalt" }),
  );
  assert.equal(create(s, "NEW", 50).ok, true);
  assert.equal(s.ux06[s.orders[0].id].allocations[0].qty, 150);
});
test("P0-05: 100+50 downstream reserves eligible good, neither raw receipt nor physical availability is created", () => {
  const s = completed({ qty: 150, route: ["İmalat", "Tesviye"] });
  assert.equal(create(s, "A", 100, 1, "CNC-02").ok, true);
  assert.equal(create(s, "B", 50, 1, "CNC-03").ok, true);
  unchanged(s, () => create(s, "C", 1, 1));
  assert.equal(Q.jobBalance(s.jobs[1], s.orders[0], s).received, 0);
  assert.equal(s.jobs[1].ux05.received, 0);
  assert.equal(Q.orderQuantities(s, s.orders[0]).material, 150);
  assert.equal(Q.orderQuantities(s, s.orders[0]).allocated, 150);
  moveAll(s, "A");
  assert.equal(Q.jobBalance(s.jobs[1], s.orders[0], s).received, 100);
  assert.equal(s.jobs[1].ux05.received, 0);
  finish(s, "A");
  assert.equal(S.release(s, s.orders[0].id, { qty: 100 }).ok, true);
  assert.equal(
    S.ship(s, s.orders[0].id, { qty: 100, ref: "PARTIAL" }).ok,
    true,
  );
  moveAll(s, "B");
  finish(s, "B");
  assert.equal(S.release(s, s.orders[0].id, { qty: 50 }).ok, true);
  assert.equal(S.ship(s, s.orders[0].id, { qty: 50, ref: "REST" }).ok, true);
  assert.equal(Q.orderQuantities(s, s.orders[0]).percent, 100);
  assert.equal(s.jobs[0].good, 150);
});
test("P0-05: only completed approved good creates downstream plans; pending, scrap, setup and rework excluded", () => {
  const s = completed({ qty: 100, route: ["İmalat", "Tesviye"] });
  s.jobs[0].good = 60;
  s.jobs[0].scrap = 40;
  assert.equal(create(s, "NEXT", 60, 1).ok, true);
  unchanged(s, () => create(s, "EXCESS", 1, 1));
  for (const mutate of [
    (j) => (j.state = "running"),
    (j) => {
      j.good = 90;
      j.ux05.pending = 10;
    },
    (j) => {
      j.good = 90;
      j.ux05.rework = 10;
    },
  ]) {
    const x = completed({ route: ["İmalat", "Tesviye"] });
    mutate(x.jobs[0]);
    unchanged(x, () => create(x, "NEXT", 1, 1));
  }
});
test("P0-05: cancelled reservations release source once and retain history", () => {
  const s = completed({ qty: 150, route: ["İmalat", "Tesviye"] });
  create(s, "A", 100, 1);
  assert.equal(
    P.reduce(s, { job: "A", qty: 40, reason: "Plan değişikliği" }).ok,
    true,
  );
  assert.equal(s.operationInputs[0].qty, 60);
  assert.equal(s.operationInputs[0].initialQty, 100);
  assert.equal(create(s, "B", 90, 1).ok, true);
  unchanged(s, () => create(s, "C", 1, 1));
  assert.equal(P.reduce(s, { job: "A", qty: 60, reason: "İptal" }).ok, true);
  assert.equal(s.operationInputs[0].status, "cancelled");
  unchanged(s, () => P.reduce(s, { job: "A", qty: 60, reason: "Tekrar" }));
  assert.equal(create(s, "C", 60, 1).ok, true);
});
test("P0-05: send/accept retry and reduction of in-transit/received inputs reject", () => {
  const s = completed({ route: ["İmalat", "Tesviye"] });
  create(s, "NEXT", 20, 1);
  const id = s.operationInputs[0].id;
  assert.equal(P.move(s, { id, action: "send" }).ok, true);
  unchanged(s, () => P.move(s, { id, action: "send" }));
  unchanged(s, () => P.reduce(s, { job: "NEXT", qty: 1, reason: "Yolda" }));
  assert.equal(P.move(s, { id, action: "accept" }).ok, true);
  unchanged(s, () => P.move(s, { id, action: "accept" }));
  unchanged(s, () =>
    P.reduce(s, { job: "NEXT", qty: 1, reason: "Kabul edilmiş" }),
  );
});
test("P0-05: third operation cannot skip the second, full three-step lineage unlocks only final job", () => {
  const s = completed({ route: ["İmalat", "Tesviye", "Montaj"] });
  unchanged(s, () => create(s, "SKIP", 20, 2));
  create(s, "SECOND", 20, 1);
  moveAll(s, "SECOND");
  finish(s, "SECOND");
  assert.equal(S.release(s, s.orders[0].id, { qty: 20 }).ok, false);
  create(s, "THIRD", 20, 2);
  moveAll(s, "THIRD");
  finish(s, "THIRD");
  assert.equal(S.release(s, s.orders[0].id, { qty: 20 }).ok, true);
});
test("P0-05: multi-internal route with terminal supplier cannot dispatch op0 output", () => {
  const s = completed({ route: ["İmalat", "Tesviye", "Kaplama"] });
  assert.equal(
    S.dispatch(s, s.orders[0].id, { qty: 20, ref: "EARLY" }).ok,
    false,
  );
  create(s, "SECOND", 20, 1);
  moveAll(s, "SECOND");
  finish(s, "SECOND");
  assert.equal(S.dispatch(s, s.orders[0].id, { qty: 20, ref: "EXT" }).ok, true);
  s.ux06[s.orders[0].id].returns.push({ qty: 20, dispatch: "EXT" });
  assert.equal(S.release(s, s.orders[0].id, { qty: 20 }).ok, true);
});
test("P0-05: route edit, source reopening or output reduction invalidate input proof at commit", () => {
  for (const change of [
    (s) => (s.orders[0].route[1] = "Montaj"),
    (s) => (s.jobs[0].state = "running"),
    (s) => (s.jobs[0].good = 10),
  ]) {
    const s = completed({ route: ["İmalat", "Tesviye"] });
    create(s, "NEXT", 20, 1);
    change(s);
    unchanged(s, () =>
      P.move(s, { id: s.operationInputs[0].id, action: "send" }),
    );
    assert.equal(Q.orderQuantities(s, s.orders[0]).shipAvailable, 0);
  }
});
test("P0-05: internal-external-internal remains closed; external jobs cannot be falsely planned as internal", () => {
  const s = completed({ route: ["İmalat", "Kaplama", "Montaj"] });
  unchanged(s, () => create(s, "NEXT", 20, 1));
  unchanged(s, () => create(s, "LAST", 20, 2));
});
test("P0-05: wrong order, wrong good lot, oversized target reservations and duplicate proofs fail closed", () => {
  for (const change of [
    (s) => (s.operationInputs[0].order = "OTHER"),
    (s) => (s.operationInputs[0].inputLot = "FAKE"),
    (s) => (s.jobs[1].plannedQty = 10),
    (s) => s.operationInputs.push({ ...s.operationInputs[0] }),
  ]) {
    const s = completed({ route: ["İmalat", "Tesviye"] });
    create(s, "NEXT", 20, 1);
    change(s);
    unchanged(s, () =>
      P.move(s, { id: s.operationInputs[0].id, action: "send" }),
    );
    assert.equal(Q.orderQuantities(s, s.orders[0]).shipAvailable, 0);
  }
});
test("P0-05: same-operation physical movement cannot consume capacity already reserved for operation inputs", () => {
  const s = completed({ qty: 40, route: ["İmalat", "Tesviye"] });
  create(s, "A", 20, 1);
  create(s, "B", 20, 1);
  moveAll(s, "A");
  unchanged(s, () =>
    T.issue(s, {
      id: "COLLISION",
      source: "A",
      destination: "B",
      inputLot: "OPINPUT:A:INPUT:1",
      qty: 1,
      reason: "Capacity collision",
    }),
  );
});
test("P0-05: malformed existing plan cannot turn capacity into an unbounded plan", () => {
  const s = fresh({ qty: 150 });
  s.jobs[0].plannedQty = "not-a-number";
  unchanged(s, () => create(s, "NEW", 1));
});
test("P0-05: one downstream plan draws from two upstream job lots without duplicate spending", () => {
  const s = completed({ qty: 150, planned: 100, route: ["İmalat", "Tesviye"] });
  const j = structuredClone(s.jobs[0]);
  j.id = "UPSTREAM-B";
  j.plannedQty = 50;
  j.good = 50;
  j.ux05.received = 50;
  j.ux05.receipts = [{ qty: 50 }];
  s.jobs.push(j);
  s.ux06[s.orders[0].id].receipts.push({ qty: 50, ref: "RAW-B" });
  s.ux06[s.orders[0].id].allocations.push({ job: j.id, qty: 50 });
  assert.equal(create(s, "COMBINED", 150, 1).ok, true);
  assert.deepEqual(
    s.operationInputs.map((r) => r.qty),
    [100, 50],
  );
  moveAll(s, "COMBINED");
  finish(s, "COMBINED");
  assert.equal(Q.orderQuantities(s, s.orders[0]).releaseAvailable, 150);
});
test("P0-05: route rewrite cannot re-reserve good already sent to an external operation", () => {
  const s = completed({ route: ["İmalat", "Kaplama"] });
  assert.equal(
    S.dispatch(s, s.orders[0].id, { qty: 20, ref: "SENT" }).ok,
    true,
  );
  s.orders[0].route = ["İmalat", "Tesviye"];
  unchanged(s, () => create(s, "DOUBLE-INPUT", 20, 1));
});
