const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const I = require("../assets/js/integrity.js"),
  P = require("../assets/js/persistence.js"),
  S = require("../assets/js/shipment-service.js"),
  K = require("../assets/js/stock-service.js"),
  C = require("../assets/js/quality-service.js"),
  D = require("../assets/js/drawing-service.js"),
  T = require("../assets/js/transfer-service.js"),
  Plan = require("../assets/js/planning-service.js");
const { fresh, completed } = require("./p0-fixtures.cjs"),
  { fixture } = require("./p0-transfer-fixture.cjs");
const codes = (s) => I.validate(s).critical.map((f) => f.code);
const valid = (s) => assert.deepEqual(I.validate(s).critical, []);
const freeze = (o) => {
  if (o && typeof o === "object") {
    Object.values(o).forEach(freeze);
    Object.freeze(o);
  }
  return o;
};
const hash = (s) =>
  crypto.createHash("sha256").update(JSON.stringify(s)).digest("hex");
const ship = (s) => {
  assert.equal(S.release(s, "SIP-P0", { qty: 20 }).ok, true);
  assert.equal(S.ship(s, "SIP-P0", { qty: 20, ref: "SHIP" }).ok, true);
  return s;
};
const transfer = () => {
  const s = fixture();
  assert.equal(
    T.issue(s, {
      id: "MOVE",
      source: "WO-P0",
      destination: "TARGET",
      inputLot: "INPUT:WO-P0",
      qty: 25,
      reason: "split",
    }).ok,
    true,
  );
  return s;
};
const external = () => {
  const s = completed({ route: ["İmalat", "Kaplama"] });
  assert.equal(
    S.dispatch(s, "SIP-P0", {
      qty: 20,
      ref: "EXT",
      supplier: "Demo",
      due: "2026-12-01",
    }).ok,
    true,
  );
  return s;
};
const returned = () => {
  const s = ship(completed());
  K.customerReturn(s, {
    order: "SIP-P0",
    shipment: "SHIP",
    qty: 5,
    reason: "Hasar",
  });
  return s;
};
const inspected = () => {
  const s = completed();
  s.jobs[0].good = 0;
  s.jobs[0].ux05.pending = 20;
  C.inspect(s, { job: "WO-P0", good: 12, scrap: 3, rework: 5 });
  return s;
};
test("250/150/100 and 60 good + 3 scrap + 12 pending + 25 unprocessed; 50 unstarted", () => {
  const s = fixture(),
    before = hash(s),
    r = I.validate(freeze(s));
  assert.equal(r.valid, true);
  const b = r.balances.jobs[0];
  assert.equal(b.planned, 150);
  assert.equal(b.received, 100);
  assert.equal(b.physicalUnprocessed, 25);
  assert.equal(b.unstartedPlan, 50);
  assert.equal(b.historicalGood, 60);
  assert.equal(hash(s), before);
});
test("fresh, completed and every read is pure without creating ledgers", () => {
  for (const s of [fresh(), completed(), fixture()]) {
    const before = hash(s);
    valid(freeze(s));
    valid(s);
    assert.equal(hash(s), before);
  }
});
const invalidCases = [
  [
    "overplan physical receive",
    () => {
      const s = completed({ qty: 250, planned: 150 });
      s.jobs[0].ux05.received = 200;
      s.jobs[0].good = 200;
      return s;
    },
    "RECEIVED_OVER_PLAN",
  ],
  [
    "150 planned / 200 allocated",
    () => {
      const s = completed({ qty: 250, planned: 150 });
      s.ux06["SIP-P0"].allocations[0].qty = 200;
      return s;
    },
    "ALLOCATION_OVER_PLAN",
  ],
  [
    "missing work order allocation",
    () => {
      const s = completed();
      s.ux06["SIP-P0"].allocations.push({ job: "MISSING", qty: 1 });
      return s;
    },
    "ALLOCATION_JOB_REFERENCE",
  ],
  [
    "work order invalid operation",
    () => {
      const s = fresh();
      s.jobs[0].op = 9;
      return s;
    },
    "JOB_OPERATION_REFERENCE",
  ],
  [
    "missing order",
    () => {
      const s = fresh();
      s.jobs[0].order = "MISSING";
      return s;
    },
    "SCHEMA_INVALID",
  ],
  [
    "duplicate work order",
    () => {
      const s = fresh();
      s.jobs.push({ ...s.jobs[0] });
      return s;
    },
    "DUPLICATE_IDENTIFIER",
  ],
  [
    "duplicate order",
    () => {
      const s = fresh();
      s.orders.push({ ...s.orders[0] });
      return s;
    },
    "DUPLICATE_IDENTIFIER",
  ],
  [
    "orphan ledger",
    () => {
      const s = fresh();
      s.ux06 = { MISSING: { receipts: [{ qty: 1 }] } };
      return s;
    },
    "LEDGER_ORDER_REFERENCE",
  ],
  [
    "negative production",
    () => {
      const s = completed();
      s.jobs[0].good = -1;
      return s;
    },
    "SCHEMA_INVALID",
  ],
  [
    "NaN inventory",
    () => {
      const s = completed();
      s.ux06["SIP-P0"].receipts[0].qty = NaN;
      return s;
    },
    "SCHEMA_INVALID",
  ],
  [
    "unsafe integer",
    () => {
      const s = completed();
      s.jobs[0].plannedQty = Number.MAX_SAFE_INTEGER + 1;
      return s;
    },
    "SCHEMA_INVALID",
  ],
  [
    "fractional pieces",
    () => {
      const s = completed();
      s.jobs[0].scrap = 0.5;
      return s;
    },
    "SCHEMA_INVALID",
  ],
  [
    "production exceeds received",
    () => {
      const s = completed();
      s.jobs[0].ux05.setup = 1;
      return s;
    },
    "PRODUCTION_BALANCE",
  ],
  [
    "negative material balance",
    () => {
      const s = completed();
      s.ux06["SIP-P0"].receipts[0].qty = 19;
      return s;
    },
    "MATERIAL_BALANCE",
  ],
  [
    "invalid material conversion",
    () => {
      const s = completed();
      Object.assign(s.ux06["SIP-P0"].receipts[0], {
        inputQty: 2.5,
        piecesPerUnit: 3,
        unit: "kg",
      });
      return s;
    },
    "MATERIAL_CONVERSION",
  ],
  [
    "invalid material unit",
    () => {
      const s = completed();
      Object.assign(s.ux06["SIP-P0"].receipts[0], {
        inputQty: 20,
        piecesPerUnit: 1,
        unit: "box",
      });
      return s;
    },
    "MATERIAL_CONVERSION",
  ],
  [
    "negative allocation after release",
    () => {
      const s = completed();
      s.allocationReleases = [{ order: "SIP-P0", job: "WO-P0", qty: 21 }];
      return s;
    },
    "NEGATIVE_ALLOCATION",
  ],
  [
    "unknown operator",
    () => {
      const s = fresh();
      s.jobs[0].owner = "Nobody";
      return s;
    },
    "ASSIGNMENT_USER",
  ],
  [
    "duplicate transfer command",
    () => {
      const s = transfer();
      s.physicalTransfers.push(structuredClone(s.physicalTransfers[0]));
      return s;
    },
    "DUPLICATE_IDENTIFIER",
  ],
  [
    "duplicate acceptance",
    () => {
      const s = transfer();
      T.accept(s, { id: "MOVE" });
      s.physicalTransfers[0].history.push({ action: "accept" });
      return s;
    },
    "MOVEMENT_ACCEPTANCE",
  ],
  [
    "missing movement source",
    () => {
      const s = transfer();
      s.physicalTransfers[0].source = "NO";
      return s;
    },
    "MOVEMENT_REFERENCE",
  ],
  [
    "orphan transfer lot",
    () => {
      const s = transfer();
      s.physicalTransfers[0].inputLot = "NO";
      return s;
    },
    "LOT_REFERENCE",
  ],
  [
    "orphan consumption without transfers",
    () => {
      const s = completed();
      s.physicalLotUses = [{ job: "WO-P0", lot: "NO", qty: 1 }];
      return s;
    },
    "LOT_REFERENCE",
  ],
  [
    "lot overdraw",
    () => {
      const s = completed();
      s.physicalLotUses = [{ job: "WO-P0", lot: "INPUT:WO-P0", qty: 21 }];
      return s;
    },
    "LOT_OVERDRAWN",
  ],
  [
    "duplicate shipment command",
    () => {
      const s = ship(completed());
      s.ux06["SIP-P0"].shipments.push(
        structuredClone(s.ux06["SIP-P0"].shipments[0]),
      );
      return s;
    },
    "DUPLICATE_IDENTIFIER",
  ],
  [
    "shipment exceeds approved",
    () => {
      const s = ship(completed());
      const t = s.ux06["SIP-P0"].shipments[0];
      t.qty = 21;
      t.approvals[0].qty = 21;
      return s;
    },
    "SHIPMENT_OVER_APPROVED",
  ],
  [
    "missing final approval",
    () => {
      const s = ship(completed());
      s.ux06["SIP-P0"].shipments[0].approvals[0].release = "NO";
      return s;
    },
    "SHIPMENT_OVER_APPROVED",
  ],
  [
    "final release before completion",
    () => {
      const s = ship(completed());
      s.jobs[0].state = "running";
      return s;
    },
    "FINAL_RELEASE_BEFORE_ELIGIBLE",
  ],
  [
    "inspection exceeds production",
    () => {
      const s = inspected();
      s.inspectionCases[0].good = 30;
      s.inspectionCases[0].qty = 38;
      return s;
    },
    "INSPECTION_BEFORE_PRODUCTION",
  ],
  [
    "invalid supplier reconciliation",
    () => {
      const s = external();
      s.ux06["SIP-P0"].returns.push({ dispatch: "EXT", qty: 21 });
      return s;
    },
    "SUPPLIER_RECONCILIATION",
  ],
  [
    "supplier return orphan",
    () => {
      const s = external();
      s.ux06["SIP-P0"].returns.push({ dispatch: "NO", qty: 1 });
      return s;
    },
    "SUPPLIER_RETURN_REFERENCE",
  ],
  [
    "customer return orphan",
    () => {
      const s = returned();
      s.ux06["SIP-P0"].customerReturns[0].shipment = "NO";
      return s;
    },
    "CUSTOMER_RETURN_REFERENCE",
  ],
  [
    "quarantine over disposition",
    () => {
      const s = returned();
      const c = s.ux06["SIP-P0"].customerReturns[0];
      s.returnDispositions = [
        {
          id: "RD:1",
          order: "SIP-P0",
          caseId: c.id,
          kind: "scrap",
          qty: 6,
          user: "Yönetici",
          reason: "test",
        },
      ];
      return s;
    },
    "RETURN_QUARANTINE_BALANCE",
  ],
  [
    "rework provenance missing",
    () => {
      const s = inspected();
      s.reworkTasks[0].inspection = "NO";
      return s;
    },
    "REWORK_PROVENANCE",
  ],
  [
    "fake legacy exemption",
    () => {
      const s = inspected();
      s.reworkTasks[0].legacy = true;
      s.reworkTasks[0].inspection = "NO";
      return s;
    },
    "REWORK_PROVENANCE",
  ],
  [
    "rework quantity mismatch",
    () => {
      const s = inspected();
      s.reworkTasks[0].remaining = 6;
      return s;
    },
    "REWORK_RECONCILIATION",
  ],
  [
    "compensation exceeds loss",
    () => {
      const s = completed();
      s.compensations = [
        {
          order: "SIP-P0",
          operation: 0,
          source: "WO-P0",
          qty: 1,
          user: "Yönetici",
          reason: "loss",
        },
      ];
      return s;
    },
    "COMPENSATION_EXCESS",
  ],
  [
    "compensation missing source",
    () => {
      const s = completed();
      s.compensations = [
        {
          order: "SIP-P0",
          operation: 0,
          source: "NO",
          qty: 1,
          user: "Yönetici",
          reason: "loss",
        },
      ];
      return s;
    },
    "COMPENSATION_EXCESS",
  ],
  [
    "drawing acknowledgement missing revision",
    () => {
      const s = fresh();
      s.jobs[0].drawingAcknowledgements = [
        { revision: "NO", user: "Yönetici" },
      ];
      return s;
    },
    "DRAWING_ACK_REFERENCE",
  ],
  ["null fields", () => ({ ...fresh(), jobs: null }), "SCHEMA_INVALID"],
  ["root null", () => null, "SCHEMA_INVALID"],
  [
    "unknown schema",
    () => ({ ...fresh(), schemaVersion: 99 }),
    "SCHEMA_INVALID",
  ],
  [
    "required disposition field missing",
    () => ({ ...fresh(), returnDispositions: [{}] }),
    "REQUIRED_FIELD",
  ],
];
for (const [name, make, code] of invalidCases)
  test(name, () => {
    const s = make(),
      before = hash(s);
    assert.ok(
      codes(freeze(s)).includes(code),
      JSON.stringify(I.validate(s).findings),
    );
    assert.equal(hash(s), before);
  });
test("transfer preserves historical production but moves exactly 25 physical remainder", () => {
  const s = transfer();
  valid(s);
  T.accept(s, { id: "MOVE" });
  valid(s);
  const b = I.validate(s).balances.jobs;
  assert.equal(b[0].historicalGood, 60);
  assert.equal(b[0].physicalUnprocessed, 0);
  assert.equal(b[0].unstartedPlan, 50);
  assert.equal(b[1].physicalUnprocessed, 25);
  assert.equal(T.accept(s, { id: "MOVE" }).ok, false);
});
test("supported legacy totals and explicit legacy rework are warnings, not invented lots", () => {
  const s = completed();
  delete s.jobs[0].ux05;
  valid(s);
  assert.ok(I.validate(s).warnings.some((f) => f.code === "LEGACY_PRODUCTION"));
  const t = completed();
  t.jobs[0].good = 15;
  t.jobs[0].ux05.rework = 5;
  C.registerLegacy(t, { job: "WO-P0", reason: "old paper ledger" });
  valid(t);
  C.execute(t, { id: t.reworkTasks[0].id, qty: 5 });
  C.rework(t, { job: "WO-P0", good: 5, scrap: 0 });
  valid(t);
});
test("supplier partial dispatch/return + scrap/rework/loss conserve quantity", () => {
  const s = external();
  for (const [kind, qty] of [
    ["good", 10],
    ["scrap", 3],
    ["rework", 5],
    ["lost", 2],
  ]) {
    K.supplierReturn(s, {
      order: "SIP-P0",
      dispatch: "EXT",
      kind,
      qty,
      reason: "reconcile",
    });
    valid(s);
  }
  const t = s.supplierDispositions.find((t) => t.kind === "rework");
  K.supplierRework(s, { id: t.id, good: 4, scrap: 1, reason: "done" });
  valid(s);
  S.release(s, "SIP-P0", { qty: 14 });
  valid(s);
});
test("customer return quarantine, restock, reship and rework conserve exactly", () => {
  for (const kind of ["restock", "rework", "scrap"]) {
    const s = returned();
    valid(s);
    const c = s.ux06["SIP-P0"].customerReturns[0];
    assert.equal(I.validate(s).balances.orders[0].quarantine, 5);
    K.disposeReturn(s, {
      order: "SIP-P0",
      caseId: c.id,
      qty: 5,
      kind,
      reason: "decision",
    });
    valid(s);
    if (kind === "rework") {
      K.returnRework(s, {
        id: s.returnReworks[0].id,
        good: 4,
        scrap: 1,
        reason: "done",
      });
      valid(s);
    }
    if (kind === "restock") {
      S.ship(s, "SIP-P0", { qty: 5, ref: "RESHIP" });
      valid(s);
    }
  }
});
test("quality rework inspection execution and results retain valid origin", () => {
  const s = inspected();
  valid(s);
  C.execute(s, { id: s.reworkTasks[0].id, qty: 5 });
  valid(s);
  C.rework(s, { job: "WO-P0", good: 4, scrap: 1 });
  valid(s);
});
test("drawing versions and acknowledgement are valid; tampering detected", () => {
  const s = fresh();
  D.add(s, {
    order: "SIP-P0",
    revision: "B",
    reason: "dimension",
    url: "data:application/pdf;base64,YQ==",
    name: "b.pdf",
  });
  D.acknowledge(s, { job: "WO-P0" });
  valid(s);
  s.orders[0].revision = "X";
  assert.ok(codes(s).includes("DRAWING_CURRENT_REFERENCE"));
});
test("compensation raises production plan and receipt limit without changing demand", () => {
  const s = completed({ qty: 10 });
  s.jobs[0].good = 8;
  s.jobs[0].scrap = 2;
  K.compensate(s, { order: "SIP-P0", source: "WO-P0", qty: 2, reason: "loss" });
  Plan.create(s, { order: "SIP-P0", id: "COMP", operation: 0, qty: 2 });
  valid(s);
  assert.equal(s.orders[0].qty, 10);
});
test("adjacent operation reservation/send/accept and production valid", () => {
  const s = completed({ route: ["İmalat", "Tesviye"] });
  Plan.create(s, { order: "SIP-P0", id: "NEXT", operation: 1, qty: 20 });
  valid(s);
  Plan.move(s, { id: s.operationInputs[0].id, action: "send" });
  valid(s);
  Plan.move(s, { id: s.operationInputs[0].id, action: "accept" });
  valid(s);
  const j = s.jobs[1];
  T.consume(s, j, 20, "good");
  j.good = 20;
  j.state = "complete";
  valid(s);
  S.release(s, "SIP-P0", { qty: 20 });
  valid(s);
});
function store(s) {
  let raw = JSON.stringify(s),
    writes = 0;
  const storage = {
    getItem: () => raw,
    setItem: (k, v) => {
      writes++;
      raw = v;
    },
  };
  return {
    session: P.open({
      storage: () => storage,
      initial: fresh(),
      validateTransaction: I.guard,
    }),
    raw: () => raw,
    writes: () => writes,
  };
}
test("invalid affected record remains read-only at persistence boundary", () => {
  const s = completed({ qty: 250, planned: 150 });
  s.ux06["SIP-P0"].allocations[0].qty = 200;
  const db = store(s),
    before = db.raw();
  const r = db.session.commit((d) => {
    d.jobs[0].owner = "Operatör A";
    return { ok: true };
  });
  assert.equal(r.ok, false);
  assert.equal(db.writes(), 0);
  assert.equal(db.raw(), before);
  assert.deepEqual(db.session.snapshot(), s);
});
test("new invalid transaction is rejected before storage without partial state", () => {
  const s = completed();
  const db = store(s);
  const r = db.session.commit((d) => {
    d.ux06["SIP-P0"].allocations.push({ job: "NO", qty: 1 });
    return { ok: true };
  });
  assert.equal(r.ok, false);
  assert.equal(db.writes(), 0);
  assert.deepEqual(db.session.snapshot(), s);
});
test("unrelated valid order and role selection remain usable beside invalid data", () => {
  const s = completed();
  s.ux06["SIP-P0"].allocations.push({ job: "NO", qty: 1 });
  const other = fresh();
  other.orders[0].id = "OTHER";
  other.jobs[0].order = "OTHER";
  other.jobs[0].id = "OTHER-JOB";
  s.orders.push(other.orders[0]);
  s.jobs.push(other.jobs[0]);
  const db = store(s);
  assert.equal(
    db.session.commit((d) => {
      d.jobs[1].owner = "Operatör A";
      return { ok: true };
    }).ok,
    true,
  );
  assert.equal(
    db.session.commit((d) => {
      d.user = "Operatör B";
      return { ok: true };
    }).ok,
    true,
  );
  assert.equal(db.writes(), 2);
});
test("schema-invalid persisted data retains P0-07 recovery and raw export", () => {
  for (const raw of ["{broken", JSON.stringify({ ...fresh(), jobs: null })]) {
    let writes = 0;
    const db = P.open({
      storage: () => ({ getItem: () => raw, setItem: () => writes++ }),
      initial: fresh(),
      validateTransaction: I.guard,
    });
    assert.equal(db.ready, false);
    assert.equal(db.raw, raw);
    assert.equal(db.commit(() => ({ ok: true })).ok, false);
    assert.equal(writes, 0);
  }
});
test("audit cannot invoke storage and is deterministic on deeply frozen snapshots", () => {
  const s = ship(completed()),
    before = hash(s);
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw Error("audit touched storage");
    },
  });
  try {
    assert.deepEqual(I.validate(freeze(s)), I.validate(s));
    assert.equal(hash(s), before);
  } finally {
    if (old) Object.defineProperty(globalThis, "localStorage", old);
    else delete globalThis.localStorage;
  }
});
test("duplicate inspection records cannot approve production twice", () => {
  const s = inspected();
  const c = structuredClone(s.inspectionCases[0]);
  c.id = "QC:SECOND";
  c.rework = 0;
  c.qty = c.good + c.scrap;
  s.inspectionCases.push(c);
  assert.ok(codes(s).includes("INSPECTION_TOTAL"));
});
test("supplier rework needs matching return and scrap records", () => {
  const s = external();
  K.supplierReturn(s, {
    order: "SIP-P0",
    dispatch: "EXT",
    qty: 5,
    kind: "rework",
    reason: "defect",
  });
  K.supplierRework(s, {
    id: s.supplierDispositions[0].id,
    good: 4,
    scrap: 1,
    reason: "fixed",
  });
  s.ux06["SIP-P0"].returns[0].qty = 3;
  assert.ok(codes(s).includes("SUPPLIER_REWORK_BALANCE"));
});
test("supplier disposition preserves exact dispatch source proof", () => {
  const s = external();
  K.supplierReturn(s, {
    order: "SIP-P0",
    dispatch: "EXT",
    qty: 2,
    kind: "scrap",
    reason: "defect",
  });
  s.supplierDispositions[0].sources = [{ job: "NO", qty: 20 }];
  assert.ok(codes(s).includes("SUPPLIER_SOURCE_PROVENANCE"));
});
test("return rework must preserve case and disposition provenance", () => {
  const s = returned();
  K.disposeReturn(s, {
    order: "SIP-P0",
    caseId: s.ux06["SIP-P0"].customerReturns[0].id,
    qty: 5,
    kind: "rework",
    reason: "repair",
  });
  s.returnReworks[0].caseId = "NO";
  assert.ok(codes(s).includes("RETURN_REWORK_BALANCE"));
});
test("reversed customer return cannot retain a stock disposition", () => {
  const s = returned();
  const c = s.ux06["SIP-P0"].customerReturns[0];
  K.disposeReturn(s, {
    order: "SIP-P0",
    caseId: c.id,
    qty: 5,
    kind: "scrap",
    reason: "bad",
  });
  c.status = "reversed";
  assert.ok(codes(s).includes("RETURN_QUARANTINE_BALANCE"));
});
test("shipment cannot predate linked final approval", () => {
  const s = ship(completed());
  s.ux06["SIP-P0"].shipments[0].date = "2000-01-01";
  assert.ok(codes(s).includes("MOVEMENT_CHRONOLOGY"));
});
test("material duplicate document is detected", () => {
  const s = completed();
  s.ux06["SIP-P0"].receipts.push({ ...s.ux06["SIP-P0"].receipts[0] });
  assert.ok(codes(s).includes("DUPLICATE_IDENTIFIER"));
});
test("unsafe aggregate arithmetic is reported without normalizing counters", () => {
  const s = fresh({ qty: Number.MAX_SAFE_INTEGER });
  s.ux06 = {
    "SIP-P0": { receipts: [{ qty: Number.MAX_SAFE_INTEGER }, { qty: 1 }] },
  };
  assert.ok(codes(s).includes("UNSAFE_BALANCE"));
});
test("new timestamped receipt history must match actual direct receipts", () => {
  const s = completed();
  s.jobs[0].ux05.receipts = [{ qty: 19, time: "2026-10-27", user: "Yönetici" }];
  assert.ok(codes(s).includes("RECEIPT_HISTORY_MISMATCH"));
});
test("transferred good history does not become on-hand good at source", () => {
  const s = completed({ route: ["İmalat", "Tesviye"] });
  Plan.create(s, { order: "SIP-P0", id: "NEXT", operation: 1, qty: 20 });
  Plan.move(s, { id: s.operationInputs[0].id, action: "send" });
  const b = I.validate(s).balances.jobs[0];
  assert.equal(b.historicalGood, 20);
  assert.equal(b.onHandGood, 0);
  assert.equal(b.departedGood, 20);
  valid(s);
});
test("out-of-order transfer history is invalid even with a single acceptance", () => {
  const s = transfer();
  T.accept(s, { id: "MOVE" });
  s.physicalTransfers[0].history.reverse();
  assert.ok(codes(s).includes("MOVEMENT_HISTORY"));
});
test("operation reservation initial amount and released amount reconcile", () => {
  const s = completed({ route: ["İmalat", "Tesviye"] });
  Plan.create(s, { order: "SIP-P0", id: "NEXT", operation: 1, qty: 20 });
  Plan.reduce(s, { job: "NEXT", qty: 5, reason: "split" });
  valid(s);
  s.operationInputs[0].qty = 14;
  assert.ok(codes(s).includes("RESERVATION_HISTORY"));
});
test("operation cancellation preserves initial reservation and release history", () => {
  const s = completed({ route: ["İmalat", "Tesviye"] });
  Plan.create(s, { order: "SIP-P0", id: "NEXT", operation: 1, qty: 20 });
  Plan.reduce(s, { job: "NEXT", qty: 20, reason: "cancel" });
  valid(s);
});
test("orphan existing event cannot be changed through unscoped mutation bypass", () => {
  const s = completed();
  s.events = [{ job: "NO", qty: 1 }];
  const db = store(s);
  assert.equal(
    db.session.commit((d) => {
      d.events[0].qty = 2;
      return { ok: true };
    }).ok,
    false,
  );
  assert.equal(db.writes(), 0);
});
test("unsafe legacy route remains read-only without treating absent provenance as corruption", () => {
  const s = fresh({ route: ["İmalat", "Kaplama", "Montaj"] });
  valid(s);
  assert.ok(I.validate(s).warnings.some((f) => f.code === "UNSUPPORTED_ROUTE"));
  const db = store(s);
  assert.equal(
    db.session.commit((d) => {
      d.jobs[0].owner = "Operatör A";
      return { ok: true };
    }).ok,
    false,
  );
});
test("duplicate allocations are not deduplicated: sum still enforces plan", () => {
  const s = completed();
  s.ux06["SIP-P0"].allocations.push({ ...s.ux06["SIP-P0"].allocations[0] });
  assert.ok(codes(s).includes("ALLOCATION_OVER_PLAN"));
});
test("historical exception cannot hide an actual missing job reference", () => {
  const s = completed();
  s.shipments = [{ job: "NO", qty: 5 }];
  assert.ok(codes(s).includes("JOB_REFERENCE"));
});
test("changed affected invalid order cannot be silently repaired via generic commit", () => {
  const s = completed();
  s.ux06["SIP-P0"].allocations[0].qty = 21;
  const db = store(s);
  assert.equal(
    db.session.commit((d) => {
      d.ux06["SIP-P0"].allocations[0].qty = 20;
      return { ok: true };
    }).ok,
    false,
  );
  assert.equal(db.writes(), 0);
});
test("cross-order allocation and movement references are rejected", () => {
  const s = transfer(),
    o = { ...s.orders[0], id: "OTHER" };
  s.orders.push(o);
  s.jobs[1].order = "OTHER";
  assert.ok(codes(s).includes("MOVEMENT_REFERENCE"));
  s.ux06["SIP-P0"].allocations.push({ job: "TARGET", qty: 1 });
  assert.ok(codes(s).includes("ALLOCATION_JOB_REFERENCE"));
});
test("cross-order machine conflicts identify both affected orders", () => {
  const s = fresh(),
    o = { ...s.orders[0], id: "OTHER" };
  s.orders.push(o);
  s.jobs.push({ ...s.jobs[0], id: "OTHER-JOB", order: "OTHER" });
  assert.deepEqual(
    new Set(
      I.validate(s)
        .critical.filter((f) => f.code === "MACHINE_ASSIGNMENT_CONFLICT")
        .map((f) => f.refs.order),
    ),
    new Set(["SIP-P0", "OTHER"]),
  );
});
test("historical downstream totals without lot provenance are supported warnings", () => {
  const s = fresh({ route: ["İmalat", "Tesviye"] });
  const j = s.jobs[0];
  j.op = 1;
  j.good = 5;
  delete j.plannedQty;
  j.ux05 = {
    received: 5,
    legacyBaseline: 5,
    legacyGood: 5,
    pending: 0,
    rework: 0,
    setup: 0,
  };
  valid(s);
  assert.ok(
    I.validate(s).warnings.some((f) => f.code === "DOWNSTREAM_RAW_RECEIPT"),
  );
});
test("historical baseline cannot be forged by a new transaction", () => {
  const s = completed(),
    db = store(s);
  assert.equal(
    db.session.commit((d) => {
      d.jobs[0].ux05.legacyGood = 10;
      d.jobs[0].ux05.legacyBaseline = 10;
      return { ok: true };
    }).ok,
    false,
  );
  assert.equal(db.writes(), 0);
});
test("legacy shipment archive cannot be appended by a new transaction", () => {
  const db = store(completed());
  assert.equal(
    db.session.commit((d) => {
      d.shipments.push({ job: "WO-P0", qty: 1 });
      return { ok: true };
    }).ok,
    false,
  );
  assert.equal(db.writes(), 0);
});
test("mixed historical receipt detail remains a warning while new receipts are bounded", () => {
  const s = completed();
  s.jobs[0].good = 0;
  s.jobs[0].state = "waiting";
  s.jobs[0].ux05.received = 5;
  s.jobs[0].ux05.receipts.push({
    qty: 5,
    time: "2026-10-27",
    user: "Yönetici",
  });
  valid(s);
  assert.ok(
    I.validate(s).warnings.some((f) => f.code === "RECEIPT_HISTORY_MISMATCH"),
  );
  s.jobs[0].ux05.receipts[1].qty = 6;
  assert.ok(codes(s).includes("RECEIPT_HISTORY_EXCESS"));
});
test("assigned machine must exist in the current local demo catalog", () => {
  const s = fresh();
  s.jobs[0].machine = "CNC-MISSING";
  assert.ok(codes(s).includes("ASSIGNMENT_MACHINE"));
});

test("machine catalog validation permits supported assignments and rejects an unknown machine before persistence", () => {
  for (const machine of ["", "CNC-01", "CNC-02", "CNC-03"]) {
    const s = fresh();
    s.jobs[0].machine = machine;
    valid(s);
  }
  const s = fresh(), db = store(s), raw = db.raw();
  const result = db.session.commit((draft) => {
    draft.jobs[0].machine = "CNC-MISSING";
    return { ok: true };
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === "ASSIGNMENT_MACHINE"));
  assert.equal(db.writes(), 0);
  assert.equal(db.raw(), raw);
  assert.deepEqual(db.session.snapshot(), s);
});
