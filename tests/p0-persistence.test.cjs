const test = require("node:test"),
  assert = require("node:assert/strict");
const P = require("../assets/js/persistence.js"),
  { fresh, completed } = require("./p0-fixtures.cjs");
function harness(seed = fresh()) {
  const map = new Map([[P.BASE_KEY, JSON.stringify(seed)]]);
  let failure = "",
    writes = 0;
  const storage = {
    getItem(k) {
      if (failure === "read") throw new DOMException("denied", "SecurityError");
      return map.get(k) ?? null;
    },
    setItem(k, v) {
      writes++;
      if (failure === "quota")
        throw new DOMException("full", "QuotaExceededError");
      if (failure === "write")
        throw new DOMException("denied", "SecurityError");
      if (failure === "silent") return;
      map.set(k, v);
      if (failure === "after") throw Error("interrupted");
    },
  };
  return {
    map,
    storage,
    open: () => P.open({ storage: () => storage, initial: fresh() }),
    fail: (v) => (failure = v),
    get writes() {
      return writes;
    },
  };
}
for (const [name, value] of [
  ["null", null],
  ["jobs null", { ...fresh(), jobs: null }],
  ["orders null", { ...fresh(), orders: null }],
  ["unknown root", { ...fresh(), unknownDatabase: [] }],
  ["future", { ...fresh(), schemaVersion: 2 }],
  ["missing schema", { ...fresh(), schema: undefined }],
  ["nested null", { ...completed(), ux06: { "SIP-P0": { receipts: null } } }],
  ["invalid nested row", { ...fresh(), reworkTasks: [{ remaining: 2 }] }],
])
  test("schema rejects " + name + " without writing", () => {
    const h = harness(value),
      store = h.open(),
      raw = h.map.get(P.BASE_KEY);
    assert.equal(store.ready, false);
    assert.equal(
      store.commit((s) => {
        s.user = "X";
        return { ok: true };
      }).ok,
      false,
    );
    assert.equal(h.map.get(P.BASE_KEY), raw);
    assert.equal(h.writes, 0);
  });
test("malformed JSON is retained exactly and never replaced with defaults", () => {
  const h = harness();
  h.map.set(P.BASE_KEY, "{malformed");
  const s = h.open();
  assert.equal(s.raw, "{malformed");
  assert.equal(s.snapshot(), null);
  assert.equal(s.ready, false);
  assert.equal(h.writes, 0);
});
test("storage getter access failure has no fallback writable demo", () => {
  const s = P.open({
    storage() {
      throw new DOMException("denied", "SecurityError");
    },
    initial: fresh(),
  });
  assert.equal(s.status, "unavailable");
  assert.equal(s.ready, false);
});
test("legacy conversion is explicit separate validated copy and reversible by original key", () => {
  const old = fresh();
  delete old.schema;
  delete old.schemaVersion;
  const h = harness(old),
    raw = h.map.get(P.BASE_KEY),
    s = h.open();
  assert.equal(s.status, "legacy");
  assert.equal(s.commit(() => ({ ok: true })).ok, false);
  const r = P.copy({
    storage: () => h.storage,
    key: P.BASE_KEY + ":copy:test",
    value: old,
    legacy: true,
  });
  assert.equal(r.ok, true);
  assert.equal(h.map.get(P.BASE_KEY), raw);
  const copy = JSON.parse(h.map.get(r.key));
  assert.equal(copy.schemaVersion, 1);
  delete copy.schema;
  delete copy.schemaVersion;
  assert.deepEqual(copy, old);
  assert.equal(h.open().status, "legacy");
});
test("import never overwrites even an existing empty string", () => {
  const h = harness();
  h.map.set("target", "");
  assert.equal(
    P.copy({ storage: () => h.storage, key: "target", value: fresh() }).ok,
    false,
  );
  assert.equal(h.map.get("target"), "");
});
for (const mode of ["quota", "write", "read", "silent", "after"])
  test(
    "failed/interrupted " +
      mode +
      " commits no partial memory and reload reconciles",
    () => {
      const h = harness(),
        s = h.open(),
        before = s.snapshot(),
        raw = s.raw;
      h.fail(mode);
      const r = s.commit((d) => {
        d.events.push({ job: "WO-P0", type: "test", qty: 1 });
        return { ok: true };
      });
      assert.equal(r.ok, false);
      assert.deepEqual(s.snapshot(), before);
      if (mode === "after") {
        assert.equal(s.status, "uncertain");
        assert.equal(s.commit(() => ({ ok: true })).ok, false);
      } else assert.equal(h.map.get(P.BASE_KEY), raw);
      h.fail("");
      const reopened = h.open();
      assert.equal(reopened.snapshot().events.length, mode === "after" ? 1 : 0);
    },
  );
test("draft validation rejects coercion and exceptions without writes", () => {
  const h = harness(),
    s = h.open(),
    before = s.snapshot();
  for (const fn of [
    (d) => {
      d.jobs = null;
      return { ok: true };
    },
    (d) => {
      d.jobs[0].good = NaN;
      return { ok: true };
    },
    (d) => {
      d.events.push({ qty: 1 });
      throw Error("abort");
    },
    (d) => {
      d.jobs[0].good = 1;
      return { ok: false, message: "reject" };
    },
  ]) {
    assert.equal(s.commit(fn).ok, false);
    assert.deepEqual(s.snapshot(), before);
  }
  assert.equal(h.writes, 0);
});
test("readback failure blocks retries; durable history recovers once", () => {
  const h = harness(),
    s = h.open(),
    original = h.storage.setItem;
  h.storage.setItem = (k, v) => {
    original(k, v);
    h.fail("read");
  };
  assert.equal(
    s.commit((d) => {
      d.events.push({ qty: 1 });
      return { ok: true };
    }).ok,
    false,
  );
  assert.equal(s.status, "uncertain");
  h.fail("");
  assert.equal(s.reload(), true);
  assert.equal(s.snapshot().events.length, 1);
});
test("blank storage is missing, but empty string is malformed", () => {
  const h = harness();
  h.map.delete(P.BASE_KEY);
  const s = h.open();
  assert.equal(s.ready, true);
  assert.equal(h.writes, 0);
  h.map.set(P.BASE_KEY, "");
  assert.equal(h.open().ready, false);
});
const Stock = require("../assets/js/stock-service.js"),
  Ship = require("../assets/js/shipment-service.js"),
  Plan = require("../assets/js/planning-service.js"),
  Quality = require("../assets/js/quality-service.js"),
  Drawing = require("../assets/js/drawing-service.js"),
  Work = require("../assets/js/workforce-service.js"),
  Transfer = require("../assets/js/transfer-service.js");
const cases = [
  [
    "material",
    fresh(),
    (s) =>
      Stock.receive(s, {
        order: "SIP-P0",
        inputQty: 5,
        unit: "adet",
        piecesPerUnit: 1,
        supplier: "Demo",
        stockCode: "X",
        ref: "MAT",
      }),
  ],
  [
    "plan",
    fresh({ qty: 40, planned: 20 }),
    (s) =>
      Plan.create(s, { order: "SIP-P0", id: "WO-NEW", operation: 0, qty: 20 }),
  ],
  [
    "dispatch",
    completed({ route: ["İmalat", "Kaplama"] }),
    (s) => Ship.dispatch(s, "SIP-P0", { qty: 5, ref: "EXT" }),
  ],
  ["final QA", completed(), (s) => Ship.release(s, "SIP-P0", { qty: 20 })],
  [
    "drawing",
    fresh(),
    (s) =>
      Drawing.add(s, {
        order: "SIP-P0",
        revision: "B",
        reason: "Test",
        url: "data:image/png;base64,YQ==",
        name: "test.png",
      }),
  ],
  [
    "assignment",
    fresh(),
    (s) => Work.assign(s, { id: "WO-P0", operator: "Operatör A" }),
  ],
];
const shipped = completed();
Ship.release(shipped, "SIP-P0", { qty: 20 });
cases.push([
  "shipment",
  structuredClone(shipped),
  (s) => Ship.ship(s, "SIP-P0", { qty: 5, ref: "S1" }),
]);
Ship.ship(shipped, "SIP-P0", { qty: 20, ref: "S1" });
cases.push([
  "customer return",
  structuredClone(shipped),
  (s) =>
    Stock.customerReturn(s, {
      order: "SIP-P0",
      shipment: "S1",
      qty: 5,
      reason: "Test",
    }),
]);
const returned = structuredClone(shipped);
Stock.customerReturn(returned, {
  order: "SIP-P0",
  shipment: "S1",
  qty: 5,
  reason: "Test",
});
cases.push([
  "return disposition",
  returned,
  (s) =>
    Stock.disposeReturn(s, {
      order: "SIP-P0",
      caseId: s.ux06["SIP-P0"].customerReturns[0].id,
      qty: 5,
      kind: "restock",
      reason: "Checked",
    }),
]);
const ext = completed({ route: ["İmalat", "Kaplama"] });
Ship.dispatch(ext, "SIP-P0", { qty: 10, ref: "E1" });
cases.push([
  "external return",
  ext,
  (s) =>
    Stock.supplierReturn(s, {
      order: "SIP-P0",
      dispatch: "E1",
      qty: 5,
      kind: "good",
      reason: "Test",
    }),
]);
const pending = completed();
pending.jobs[0].good = 0;
pending.jobs[0].ux05.pending = 20;
cases.push([
  "inspection",
  pending,
  (s) => Quality.inspect(s, { job: "WO-P0", good: 10, scrap: 5, rework: 5 }),
]);
const rework = structuredClone(pending);
Quality.inspect(rework, { job: "WO-P0", good: 10, scrap: 5, rework: 5 });
Quality.execute(rework, { id: rework.reworkTasks[0].id, qty: 5 });
cases.push([
  "rework",
  rework,
  (s) => Quality.rework(s, { job: "WO-P0", good: 4, scrap: 1 }),
]);
cases.push([
  "compensation",
  rework,
  (s) =>
    Stock.compensate(s, {
      order: "SIP-P0",
      source: "WO-P0",
      qty: 2,
      reason: "Test",
    }),
]);
const transfer = require("./p0-transfer-fixture.cjs").fixture();
cases.push([
  "transfer",
  transfer,
  (s) =>
    Transfer.issue(s, {
      id: "T1",
      source: "WO-P0",
      destination: "TARGET",
      inputLot: "INPUT:WO-P0",
      qty: 5,
      reason: "Test",
    }),
]);

cases.push([
  "policy",
  fresh(),
  (s) =>
    Quality.policy(s, { order: "SIP-P0", operation: 0, users: ["Operatör A"] }),
]);
cases.push([
  "rework assignment",
  rework,
  (s) => Quality.assign(s, { id: s.reworkTasks[0].id, owner: "Operatör A" }),
]);
const executeRework = structuredClone(rework);
executeRework.reworkTasks[0].executed = 0;
cases.push([
  "rework execution",
  executeRework,
  (s) => Quality.execute(s, { id: s.reworkTasks[0].id, qty: 5 }),
]);
const legacyRework = completed();
legacyRework.jobs[0].good = 15;
legacyRework.jobs[0].ux05.rework = 5;
cases.push([
  "legacy rework explicit link",
  legacyRework,
  (s) => Quality.registerLegacy(s, { job: "WO-P0", reason: "Eski defter" }),
]);
cases.push([
  "material authorization",
  fresh(),
  (s) => Stock.authorize(s, { order: "SIP-P0", qty: 5, reason: "Ek stok" }),
]);
cases.push([
  "return reversal",
  returned,
  (s) =>
    Stock.reverseReturn(s, {
      order: "SIP-P0",
      caseId: s.ux06["SIP-P0"].customerReturns[0].id,
      reason: "Hatalı giriş",
    }),
]);
const returnWork = structuredClone(returned);
Stock.disposeReturn(returnWork, {
  order: "SIP-P0",
  caseId: returnWork.ux06["SIP-P0"].customerReturns[0].id,
  qty: 5,
  kind: "rework",
  reason: "Onarım",
});
cases.push([
  "return rework result",
  returnWork,
  (s) =>
    Stock.returnRework(s, {
      id: s.returnReworks[0].id,
      good: 4,
      scrap: 1,
      reason: "Kontrol",
    }),
]);
const supplierWork = structuredClone(ext);
Stock.supplierReturn(supplierWork, {
  order: "SIP-P0",
  dispatch: "E1",
  qty: 5,
  kind: "rework",
  reason: "Onarım",
});
cases.push([
  "supplier rework result",
  supplierWork,
  (s) =>
    Stock.supplierRework(s, {
      id: s.supplierDispositions[0].id,
      good: 4,
      scrap: 1,
      reason: "Kontrol",
    }),
]);
const drawing = structuredClone(fresh());
Drawing.add(drawing, {
  order: "SIP-P0",
  revision: "B",
  reason: "Test",
  url: "data:image/png;base64,YQ==",
  name: "b.png",
});
cases.push([
  "drawing acknowledgement",
  drawing,
  (s) => Drawing.acknowledge(s, { job: "WO-P0" }),
]);
const owned = fresh();
owned.user = "Operatör A";
cases.push(["take ownership", owned, (s) => Work.take(s, { id: "WO-P0" })]);
const paused = completed();
paused.jobs[0].state = "paused";
cases.push([
  "machine release",
  paused,
  (s) => Work.machine(s, { id: "WO-P0", target: "", reason: "Acil" }),
]);
cases.push([
  "plan reduction",
  fresh(),
  (s) => Plan.reduce(s, { job: "WO-P0", qty: 5, reason: "Revizyon" }),
]);
const moving = completed({ route: ["İmalat", "Tesviye"] });
Plan.create(moving, { order: "SIP-P0", id: "NEXT", operation: 1, qty: 20 });
cases.push([
  "operation send",
  structuredClone(moving),
  (s) => Plan.move(s, { id: s.operationInputs[0].id, action: "send" }),
]);
Plan.move(moving, { id: moving.operationInputs[0].id, action: "send" });
cases.push([
  "operation accept",
  moving,
  (s) => Plan.move(s, { id: s.operationInputs[0].id, action: "accept" }),
]);
const transferAccept = structuredClone(transfer);
Transfer.issue(transferAccept, {
  id: "T1",
  source: "WO-P0",
  destination: "TARGET",
  inputLot: "INPUT:WO-P0",
  qty: 5,
  reason: "Test",
});
cases.push([
  "transfer accept",
  transferAccept,
  (s) => Transfer.accept(s, { id: "T1" }),
]);
cases.push([
  "transfer reverse",
  transferAccept,
  (s) => Transfer.reverse(s, { id: "T1", reason: "İptal", returned: true }),
]);
for (const [name, seed, command] of cases)
  for (const mode of ["quota", "write"])
    test(
      "critical " +
        name +
        " " +
        mode +
        " preserves state/history, then retry persists",
      () => {
        const h = harness(seed),
          store = h.open();
        assert.equal(store.ready, true, store.reason);
        const raw = store.raw,
          before = store.snapshot();
        h.fail(mode);
        const r = store.commit(command);
        assert.equal(r.ok, false);
        assert.equal(
          h.writes,
          1,
          "command must reach persistence, not just fail validation: " +
            r.message,
        );
        assert.deepEqual(store.snapshot(), before);
        assert.equal(h.map.get(P.BASE_KEY), raw);
        h.fail("");
        const success = store.commit(command);
        assert.equal(success.ok, true, success.message);
        assert.deepEqual(h.open().snapshot(), success.state);
      },
    );

for (const failure of ["quota", "write", "after", "silent"])
  test("copy failure " + failure + " never changes source", () => {
    const h = harness(),
      raw = h.map.get(P.BASE_KEY);
    h.fail(failure);
    const r = P.copy({
      storage: () => h.storage,
      key: "new-copy",
      value: fresh(),
    });
    assert.equal(r.ok, false);
    assert.equal(h.map.get(P.BASE_KEY), raw);
    if (failure === "after") {
      assert.equal(r.uncertain, true);
      assert.equal(P.decode(h.map.get("new-copy")).kind, "ready");
    }
  });
test("externally changed malformed storage blocks commit without overwrite", () => {
  const h = harness(),
    s = h.open(),
    before = s.snapshot();
  h.map.set(P.BASE_KEY, "{external broken");
  const r = s.commit((d) => {
    d.user = "Operatör A";
    return { ok: true };
  });
  assert.equal(r.ok, false);
  assert.equal(h.writes, 0);
  assert.deepEqual(s.snapshot(), before);
  assert.equal(h.map.get(P.BASE_KEY), "{external broken");
  assert.equal(s.reload(), false);
});
test("reserved dictionary identifiers enter recovery, without prototype mutation", () => {
  const s = fresh();
  s.orders[0].id = "__proto__";
  s.jobs[0].order = "__proto__";
  const before = Object.keys(Object.prototype);
  assert.equal(P.validate(s).ok, false);
  assert.deepEqual(Object.keys(Object.prototype), before);
});
