const test = require("node:test"),
  assert = require("node:assert/strict");
const { fresh, completed } = require("./p0-fixtures.cjs"),
  Q = require("../assets/js/quantity-model.js"),
  S = require("../assets/js/shipment-service.js"),
  P = require("../assets/js/planning-service.js"),
  W = require("../assets/js/workforce-service.js"),
  C = require("../assets/js/quality-service.js"),
  D = require("../assets/js/drawing-service.js"),
  K = require("../assets/js/stock-service.js");
const unchanged = (s, fn) => {
  const before = JSON.stringify(s);
  assert.equal(fn().ok, false);
  assert.equal(JSON.stringify(s), before);
};
const ship = (s) => {
  assert.equal(S.release(s, s.orders[0].id, { qty: 20 }).ok, true);
  assert.equal(S.ship(s, s.orders[0].id, { qty: 20, ref: "SHIP" }).ok, true);
};
test("P1-02: assignment, self-take and ownership prevent machine impersonation", () => {
  const s = fresh();
  s.user = "Operatör A";
  unchanged(s, () => W.assign(s, { id: "WO-P0", operator: "Operatör B" }));
  assert.equal(W.take(s, { id: "WO-P0" }).ok, true);
  s.user = "Operatör B";
  assert.equal(W.canWork(s, s.jobs[0]), false);
  unchanged(s, () => W.take(s, { id: "WO-P0" }));
  s.user = "Yönetici";
  assert.equal(W.assign(s, { id: "WO-P0", operator: "Operatör B" }).ok, true);
  assert.equal(s.events.length, 2);
});
test("P1-03: machine release preserves physical 25 and plan 50, occupied target and running reassignment reject", () => {
  const s = completed({ qty: 250, planned: 150 }),
    j = s.jobs[0];
  j.state = "running";
  j.good = 60;
  j.scrap = 3;
  j.ux05.received = 100;
  j.ux05.pending = 12;
  unchanged(s, () => W.machine(s, { id: j.id, target: "", reason: "Acil iş" }));
  j.state = "paused";
  const before = structuredClone(j.ux05);
  assert.equal(
    W.machine(s, { id: j.id, target: "", reason: "Acil iş" }).ok,
    true,
  );
  assert.deepEqual(j.ux05, before);
  assert.equal(Q.jobBalance(j, s.orders[0], s).unprocessed, 25);
  assert.equal(Q.jobBalance(j, s.orders[0], s).unstarted, 50);
});
test("P1-06: operation-specific self-inspection grant can be revoked", () => {
  const s = fresh();
  assert.equal(
    C.policy(s, { order: s.orders[0].id, operation: 0, users: ["Operatör A"] })
      .ok,
    true,
  );
  s.user = "Operatör A";
  assert.equal(C.canSelf(s, s.jobs[0]), true);
  s.user = "Operatör B";
  assert.equal(C.canSelf(s, s.jobs[0]), false);
  s.user = "Yönetici";
  C.policy(s, { order: s.orders[0].id, operation: 0, users: [] });
  s.user = "Operatör A";
  assert.equal(C.canSelf(s, s.jobs[0]), false);
});
test("P1-07: rework links inspection→execution→result and cannot be counted twice", () => {
  const s = completed(),
    j = s.jobs[0];
  j.good = 0;
  j.ux05.pending = 20;
  assert.equal(
    C.inspect(s, { job: j.id, good: 12, scrap: 3, rework: 5, defect: "Çapak" })
      .ok,
    true,
  );
  const t = s.reworkTasks[0];
  assert.equal(t.inspection, s.inspectionCases[0].id);
  unchanged(s, () => C.rework(s, { job: j.id, good: 4, scrap: 1 }));
  assert.equal(C.execute(s, { id: t.id, qty: 5 }).ok, true);
  assert.equal(C.rework(s, { job: j.id, good: 4, scrap: 1 }).ok, true);
  assert.equal(j.good, 16);
  assert.equal(j.scrap, 4);
  assert.equal(j.ux05.rework, 0);
  unchanged(s, () => C.rework(s, { job: j.id, good: 1, scrap: 0 }));
});
test("P1-13: drawing revisions retain old bytes, unique names and operator acknowledgements", () => {
  const s = fresh(),
    o = s.orders[0],
    old = o.drawing;
  assert.equal(
    D.add(s, {
      order: o.id,
      revision: "B",
      reason: "Ölçü değişikliği",
      url: "data:application/pdf;base64,JVBERg==",
      name: "b.pdf",
    }).ok,
    true,
  );
  assert.equal(s.drawingVersions[0].url, old);
  assert.equal(D.acknowledged(s, s.jobs[0]), false);
  assert.equal(D.acknowledge(s, { job: "WO-P0" }).ok, true);
  assert.equal(D.acknowledged(s, s.jobs[0]), true);
  unchanged(s, () =>
    D.add(s, {
      order: o.id,
      revision: "B",
      reason: "Tekrar",
      url: "data:application/pdf;base64,JVBERg==",
    }),
  );
  assert.equal(
    D.add(s, {
      order: o.id,
      revision: "C",
      reason: "Tolerans",
      url: "data:image/png;base64,YQ==",
    }).ok,
    true,
  );
  assert.equal(D.acknowledged(s, s.jobs[0]), false);
});
test("P1-04: supplier/unit receipts convert to pieces and reject duplicate documents/fractional output", () => {
  const s = fresh({ qty: 100 });
  const a = {
    order: s.orders[0].id,
    inputQty: 2.5,
    unit: "kg",
    piecesPerUnit: 20,
    supplier: "Tedarikçi",
    stockCode: "Çelik",
    ref: "RAW",
  };
  assert.equal(K.receive(s, a).ok, true);
  assert.equal(Q.orderQuantities(s, s.orders[0]).material, 50);
  unchanged(s, () => K.receive(s, a));
  unchanged(s, () => K.receive(s, { ...a, ref: "X", piecesPerUnit: 1 }));
  assert.equal(K.receive(s, { ...a, ref: "RAW-2" }).ok, true);
  unchanged(s, () => K.receive(s, { ...a, ref: "RAW-3" }));
  assert.equal(
    K.authorize(s, { order: s.orders[0].id, qty: 50, reason: "Emniyet stoğu" })
      .ok,
    true,
  );
  assert.equal(K.receive(s, { ...a, ref: "RAW-3" }).ok, true);
});
test("P1-05: supplier good+scrap+rework+loss reconciles exactly, only approved good releases", () => {
  const s = completed({ route: ["İmalat", "Kaplama"] }),
    id = s.orders[0].id;
  S.dispatch(s, id, {
    qty: 20,
    ref: "EXT",
    supplier: "Fason",
    due: "2026-01-01",
  });
  for (const [kind, qty] of [
    ["good", 10],
    ["scrap", 3],
    ["rework", 5],
    ["lost", 2],
  ])
    assert.equal(
      K.supplierReturn(s, {
        order: id,
        dispatch: "EXT",
        kind,
        qty,
        reason: "Mutabakat",
      }).ok,
      true,
    );
  assert.equal(Q.orderQuantities(s, s.orders[0]).supplierOpen, 0);
  assert.equal(Q.orderQuantities(s, s.orders[0]).releaseAvailable, 10);
  const r = s.supplierDispositions.find((r) => r.kind === "rework");
  assert.equal(
    K.supplierRework(s, { id: r.id, good: 4, scrap: 1, reason: "İşlendi" }).ok,
    true,
  );
  assert.equal(Q.orderQuantities(s, s.orders[0]).supplierOpen, 0);
  assert.equal(Q.orderQuantities(s, s.orders[0]).releaseAvailable, 14);
  unchanged(s, () =>
    K.supplierReturn(s, { order: id, dispatch: "EXT", kind: "good", qty: 1 }),
  );
});
test("P1-08: returned five reopen demand, restock final QA permits exactly five replacement shipments", () => {
  const s = completed(),
    id = s.orders[0].id;
  ship(s);
  const r = K.customerReturn(s, {
    order: id,
    shipment: "SHIP",
    qty: 5,
    reason: "Kontrol",
  });
  assert.equal(r.ok, true);
  assert.equal(Q.orderQuantities(s, s.orders[0]).percent, 75);
  assert.equal(Q.orderQuantities(s, s.orders[0]).ready, 0);
  assert.equal(
    K.disposeReturn(s, {
      order: id,
      caseId: r.entry.id,
      qty: 5,
      kind: "restock",
      reason: "Tekrar kontrol edildi",
    }).ok,
    true,
  );
  assert.equal(Q.orderQuantities(s, s.orders[0]).ready, 5);
  assert.equal(S.ship(s, id, { qty: 5, ref: "RESHIP" }).ok, true);
  assert.equal(Q.orderQuantities(s, s.orders[0]).percent, 100);
  unchanged(s, () =>
    K.disposeReturn(s, {
      order: id,
      caseId: r.entry.id,
      qty: 1,
      kind: "restock",
      reason: "Tekrar",
    }),
  );
  unchanged(s, () =>
    K.reverseReturn(s, { order: id, caseId: r.entry.id, reason: "Sil" }),
  );
});
test("P1-08: return rework retains provenance and only good result restores ready stock", () => {
  const s = completed(),
    id = s.orders[0].id;
  ship(s);
  const r = K.customerReturn(s, {
    order: id,
    shipment: "SHIP",
    qty: 5,
    reason: "Hasar",
  }).entry;
  K.disposeReturn(s, {
    order: id,
    caseId: r.id,
    qty: 5,
    kind: "rework",
    reason: "Onarım",
  });
  assert.equal(Q.orderQuantities(s, s.orders[0]).ready, 0);
  assert.equal(
    K.returnRework(s, {
      id: s.returnReworks[0].id,
      good: 4,
      scrap: 1,
      reason: "Tekrar kontrol",
    }).ok,
    true,
  );
  assert.equal(Q.orderQuantities(s, s.orders[0]).ready, 4);
  unchanged(s, () =>
    K.returnRework(s, {
      id: s.returnReworks[0].id,
      good: 1,
      scrap: 0,
      reason: "Tekrar",
    }),
  );
});
test("P1-08: unused return can be reversed once with immutable quantity and reason", () => {
  const s = completed(),
    id = s.orders[0].id;
  ship(s);
  const r = K.customerReturn(s, {
    order: id,
    shipment: "SHIP",
    qty: 5,
    reason: "Yanlış kayıt",
  }).entry;
  assert.equal(
    K.reverseReturn(s, { order: id, caseId: r.id, reason: "Kayıt hatası" }).ok,
    true,
  );
  assert.equal(r.qty, 5);
  assert.equal(Q.orderQuantities(s, s.orders[0]).net, 20);
  unchanged(s, () =>
    K.reverseReturn(s, { order: id, caseId: r.id, reason: "Yeniden" }),
  );
  assert.equal(
    K.customerReturn(s, {
      order: id,
      shipment: "SHIP",
      qty: 5,
      reason: "Yeni iade",
    }).ok,
    true,
  );
  assert.equal(Q.orderQuantities(s, s.orders[0]).blocked, false);
});
test("P1-15: 10 ordered with two scrap permits two replacement inputs/jobs without changing demand", () => {
  const s = completed({ qty: 10 }),
    j = s.jobs[0],
    id = s.orders[0].id;
  j.good = 8;
  j.scrap = 2;
  unchanged(s, () =>
    P.create(s, { order: id, id: "COMP", operation: 0, qty: 2 }),
  );
  assert.equal(
    K.compensate(s, {
      order: id,
      source: j.id,
      qty: 2,
      reason: "Hurda telafisi",
    }).ok,
    true,
  );
  assert.equal(
    P.create(s, { order: id, id: "COMP", operation: 0, qty: 2 }).ok,
    true,
  );
  assert.equal(
    K.receive(s, {
      order: id,
      inputQty: 2,
      unit: "adet",
      piecesPerUnit: 1,
      supplier: "Demo",
      stockCode: "Parça",
      ref: "REPLACE",
    }).ok,
    true,
  );
  assert.equal(s.orders[0].qty, 10);
  assert.equal(j.scrap, 2);
  unchanged(s, () =>
    K.compensate(s, { order: id, source: j.id, qty: 1, reason: "Fazla" }),
  );
});
test("P1-07: legacy rework is linked only explicitly, assigned and selected independently", () => {
  const s = completed(),
    j = s.jobs[0];
  j.good = 12;
  j.ux05.rework = 8;
  const before = JSON.stringify(s);
  C.canSelf(s, j);
  assert.equal(JSON.stringify(s), before);
  unchanged(s, () => C.registerLegacy(s, { job: j.id, reason: "" }));
  assert.equal(
    C.registerLegacy(s, { job: j.id, reason: "Eski kontrol defteri" }).ok,
    true,
  );
  const t = s.reworkTasks[0];
  assert.equal(t.legacy, true);
  assert.equal(j.ux05.rework, 8);
  unchanged(s, () => C.registerLegacy(s, { job: j.id, reason: "Tekrar" }));
  assert.equal(C.assign(s, { id: t.id, owner: "Operatör A" }).ok, true);
  s.user = "Operatör B";
  unchanged(s, () => C.execute(s, { id: t.id, qty: 8 }));
  s.user = "Operatör A";
  assert.equal(C.execute(s, { id: t.id, qty: 8 }).ok, true);
  s.user = "Yönetici";
  assert.equal(
    C.rework(s, { job: j.id, task: t.id, good: 7, scrap: 1 }).ok,
    true,
  );
  assert.equal(j.good, 19);
  assert.equal(j.scrap, 1);
});
test("P1-03: urgent job uses released machine without moving prior material", () => {
  const s = completed(),
    j = s.jobs[0];
  j.state = "paused";
  const copy = structuredClone(j.ux05);
  s.jobs.push({
    ...structuredClone(j),
    id: "URGENT",
    machine: "",
    state: "waiting",
  });
  assert.equal(
    W.machine(s, { id: j.id, target: "", reason: "Acil iş" }).ok,
    true,
  );
  assert.equal(
    W.machine(s, {
      id: "URGENT",
      target: "CNC-01",
      reason: "Acil sipariş",
      machines: ["CNC-01"],
    }).ok,
    true,
  );
  assert.deepEqual(j.ux05, copy);
  unchanged(s, () =>
    W.machine(s, {
      id: j.id,
      target: "CNC-01",
      reason: "Dolu",
      machines: ["CNC-01"],
    }),
  );
});
test("P1 stock commands reject unauthorized dispositions without writes", () => {
  const s = completed();
  ship(s);
  const id = s.orders[0].id,
    r = K.customerReturn(s, {
      order: id,
      shipment: "SHIP",
      qty: 2,
      reason: "Hasar",
    }).entry;
  s.user = "Operatör A";
  for (const fn of [
    () =>
      K.disposeReturn(s, {
        order: id,
        caseId: r.id,
        qty: 2,
        kind: "restock",
        reason: "X",
      }),
    () => K.reverseReturn(s, { order: id, caseId: r.id, reason: "X" }),
    () => K.authorize(s, { order: id, qty: 2, reason: "X" }),
    () =>
      K.compensate(s, { order: id, source: s.jobs[0].id, qty: 2, reason: "X" }),
  ])
    unchanged(s, fn);
});
test("P1-15: replacement production reaches exactly ten net shipments", () => {
  const s = completed({ qty: 10 }),
    j = s.jobs[0],
    id = s.orders[0].id;
  j.good = 8;
  j.scrap = 2;
  K.compensate(s, { order: id, source: j.id, qty: 2, reason: "Hurda" });
  P.create(s, { order: id, id: "COMP", operation: 0, qty: 2 });
  K.receive(s, {
    order: id,
    inputQty: 2,
    unit: "adet",
    piecesPerUnit: 1,
    supplier: "Demo",
    stockCode: "Parça",
    ref: "NEW",
  });
  const replacement = s.jobs.find((j) => j.id === "COMP");
  s.ux06[id].allocations.push({ job: replacement.id, qty: 2 });
  replacement.ux05 = {
    received: 2,
    pending: 0,
    rework: 0,
    setup: 0,
    legacyBaseline: 0,
    legacyGood: 0,
    receipts: [{ qty: 2 }],
    handover: null,
  };
  replacement.good = 2;
  replacement.state = "complete";
  assert.equal(S.release(s, id, { qty: 10 }).ok, true);
  assert.equal(S.ship(s, id, { qty: 10, ref: "TEN" }).ok, true);
  assert.equal(Q.orderQuantities(s, s.orders[0]).percent, 100);
  unchanged(s, () => S.ship(s, id, { qty: 1, ref: "EXCESS" }));
});
