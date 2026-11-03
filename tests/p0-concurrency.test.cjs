const test = require("node:test"),
  assert = require("node:assert/strict");
const T = require("../assets/js/transactions.js"),
  P = require("../assets/js/persistence.js"),
  I = require("../assets/js/integrity.js"),
  S = require("../assets/js/shipment-service.js"),
  K = require("../assets/js/stock-service.js"),
  Plan = require("../assets/js/planning-service.js"),
  Transfers = require("../assets/js/transfer-service.js");
const { fresh, completed } = require("./p0-fixtures.cjs");
function db(seed = completed()) {
  let raw = JSON.stringify(seed),
    writes = 0,
    mode = "ok",
    held = false;
  const storage = {
    getItem: () => {
      if (mode === "read") throw new DOMException("denied", "SecurityError");
      return raw;
    },
    setItem: (k, v) => {
      writes++;
      if (mode === "quota")
        throw new DOMException("full", "QuotaExceededError");
      raw = v;
      if (mode === "interrupt") throw Error("after write");
    },
  };
  const locks = {
    async request(name, options, fn) {
      assert.deepEqual(options, { mode: "exclusive", ifAvailable: true });
      if (held) return fn(null);
      held = true;
      try {
        return await fn({ name, mode: "exclusive" });
      } finally {
        held = false;
      }
    },
  };
  const open = () =>
    T.open({ storage: () => storage, locks: () => locks, initial: fresh() });
  return {
    open,
    storage,
    locks,
    raw: () => raw,
    writes: () => writes,
    setMode: (v) => (mode = v),
    setRaw: (v) => (raw = v),
    hold: (v) => (held = v),
  };
}
function send(session, kind, args, id, fn) {
  return session.commit(fn, { id, actor: "Yönetici", intent: { kind, args } });
}
const ship = (s, n, ref, id) =>
  send(s, "shipping.ship", { order: "SIP-P0", qty: n, ref }, id, (d) =>
    S.ship(d, "SIP-P0", { qty: n, ref }),
  );
const ready = () => {
  const s = completed();
  S.release(s, "SIP-P0", { qty: 20 });
  return s;
};
test("stale session ships against latest snapshot; 20 cannot be spent twice as 15+15", async () => {
  const b = db(ready()),
    a = b.open(),
    c = b.open();
  assert.equal((await ship(a, 15, "A", "id-A")).ok, true);
  const r = await ship(c, 15, "B", "id-B");
  assert.equal(r.ok, false);
  const s = JSON.parse(b.raw());
  assert.equal(s.ux06["SIP-P0"].shipments.length, 1);
  assert.equal(s.transactionState.revision, 1);
  assert.equal(c.snapshot().transactionState, undefined);
  assert.equal(c.check().changed, true);
  assert.equal(I.validate(s).valid, true);
});
test("stale safe command retains the earlier history and increments revision", async () => {
  const b = db(ready()),
    a = b.open(),
    c = b.open();
  await ship(a, 5, "A", "A");
  assert.equal((await ship(c, 5, "B", "B")).ok, true);
  const s = JSON.parse(b.raw());
  assert.deepEqual(
    s.ux06["SIP-P0"].shipments.map((r) => r.ref),
    ["A", "B"],
  );
  assert.deepEqual(
    s.transactionState.commands.map((r) => r.revision),
    [1, 2],
  );
  assert.equal(s.transactionState.revision, 2);
  assert.equal(c.check().changed, false);
});
test("durable idempotency receipt prevents replay after reopening session", async () => {
  const b = db(ready());
  const first = await ship(b.open(), 5, "A", "same");
  const raw = b.raw(),
    writes = b.writes();
  const replay = await ship(b.open(), 5, "A", "same");
  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(b.raw(), raw);
  assert.equal(b.writes(), writes);
});
test("same key with different payload is rejected", async () => {
  const b = db(ready());
  await ship(b.open(), 5, "A", "same");
  const raw = b.raw();
  const r = await ship(b.open(), 4, "B", "same");
  assert.equal(r.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(b.raw(), raw);
});
test("missing command id cannot mutate", async () => {
  const b = db();
  const r = await b.open().commit(() => {
    throw Error("must not execute");
  });
  assert.equal(r.code, "COMMAND_REQUIRED");
  assert.equal(b.writes(), 0);
});
test("unavailable Web Locks fails closed including copies", async () => {
  const b = db(),
    s = T.open({
      storage: () => b.storage,
      locks: () => undefined,
      initial: fresh(),
    });
  const r = await send(s, "test", {}, "A", () => {
    throw Error("must not run");
  });
  assert.equal(r.code, "LOCK_UNSUPPORTED");
  assert.equal(b.writes(), 0);
  assert.equal(
    (
      await T.copy({
        storage: () => b.storage,
        locks: () => undefined,
        key: "copy",
        value: fresh(),
      })
    ).code,
    "LOCK_UNSUPPORTED",
  );
});
test("contended exclusive lock fails closed and same id retries safely", async () => {
  const b = db(ready()),
    s = b.open();
  b.hold(true);
  const r = await ship(s, 5, "A", "A");
  assert.equal(r.code, "LOCK_BUSY");
  assert.equal(b.writes(), 0);
  b.hold(false);
  assert.equal((await ship(s, 5, "A", "A")).ok, true);
});
test("wrong lock mode cannot enter writer", async () => {
  const b = db(),
    s = T.open({
      storage: () => b.storage,
      initial: fresh(),
      locks: () => ({ request: (name, o, fn) => fn({ name, mode: "shared" }) }),
    });
  assert.equal(
    (await send(s, "test", {}, "A", () => ({ ok: true }))).code,
    "LOCK_INVALID",
  );
  assert.equal(b.writes(), 0);
});
test("lock access rejection fails closed", async () => {
  const b = db(),
    s = T.open({
      storage: () => b.storage,
      initial: fresh(),
      locks: () => {
        throw Error("denied");
      },
    });
  assert.equal(
    (await send(s, "test", {}, "A", () => ({ ok: true }))).code,
    "LOCK_FAILURE",
  );
  assert.equal(b.writes(), 0);
});
test("quota failure preserves memory, raw history and revision; retry same id succeeds once", async () => {
  const b = db(ready()),
    s = b.open(),
    raw = b.raw(),
    before = s.snapshot();
  b.setMode("quota");
  const r = await ship(s, 5, "A", "A");
  assert.equal(r.ok, false);
  assert.equal(b.raw(), raw);
  assert.deepEqual(s.snapshot(), before);
  b.setMode("ok");
  assert.equal((await ship(s, 5, "A", "A")).ok, true);
  assert.equal((await ship(s, 5, "A", "A")).duplicate, true);
  assert.equal(JSON.parse(b.raw()).transactionState.revision, 1);
});
test("interrupted acknowledgement leaves complete receipt and blocks until reload", async () => {
  const b = db(ready()),
    s = b.open();
  b.setMode("interrupt");
  const r = await ship(s, 5, "A", "A");
  assert.equal(r.uncertain, true);
  assert.equal(s.ready, false);
  assert.equal(s.snapshot().transactionState, undefined);
  b.setMode("ok");
  s.reload();
  assert.equal((await ship(s, 5, "A", "A")).duplicate, true);
  assert.equal(JSON.parse(b.raw()).ux06["SIP-P0"].shipments.length, 1);
});
test("malformed latest data is preserved and opens recovery", async () => {
  const b = db(),
    s = b.open();
  b.setRaw("{broken");
  const r = await send(s, "test", {}, "A", () => {
    throw Error("must not execute");
  });
  assert.equal(r.code, "RECOVERY_REQUIRED");
  assert.equal(s.raw, "{broken");
  assert.equal(s.ready, false);
  assert.equal(b.writes(), 0);
});
test("deleted snapshot is never replaced by initial demo during transaction", async () => {
  const b = db(),
    s = b.open();
  b.setRaw(null);
  assert.equal(
    (await send(s, "test", {}, "A", () => ({ ok: true }))).code,
    "REVISION_ROLLBACK",
  );
  assert.equal(b.raw(), null);
  assert.equal(b.writes(), 0);
});
test("latest schema/integrity is checked before accepting invalid affected writes", async () => {
  const seed = completed();
  seed.ux06["SIP-P0"].allocations[0].qty = 21;
  const b = db(seed),
    s = b.open(),
    raw = b.raw();
  const r = await send(s, "workforce", {}, "A", (d) => {
    d.jobs[0].owner = "Operatör A";
    return { ok: true };
  });
  assert.equal(r.ok, false);
  assert.equal(b.raw(), raw);
  assert.equal(b.writes(), 0);
});
test("command cannot forge protocol metadata", async () => {
  const b = db(),
    s = b.open();
  const r = await send(s, "test", {}, "A", (d) => {
    d.transactionState = { version: 1, revision: 0, commands: [] };
    return { ok: true };
  });
  assert.equal(r.code, "PROTOCOL_MUTATION");
  assert.equal(b.writes(), 0);
});
test("async draft mutator is rejected before persistence", async () => {
  const b = db();
  const r = await send(b.open(), "test", {}, "A", async () => ({ ok: true }));
  assert.equal(r.code, "ASYNC_COMMAND");
  assert.equal(b.writes(), 0);
});
test("caller cannot mutate returned result into internal committed memory", async () => {
  const b = db(ready()),
    s = b.open(),
    r = await ship(s, 5, "A", "A");
  r.state.jobs[0].good = 999;
  assert.equal(s.snapshot().jobs[0].good, 20);
  assert.equal(JSON.parse(b.raw()).jobs[0].good, 20);
});
test("actor is captured from submitting tab rather than latest global role", async () => {
  const b = db(ready()),
    a = b.open(),
    c = b.open();
  await send(a, "role", {}, "role", (d) => {
    d.user = "Operatör A";
    return { ok: true };
  });
  assert.equal((await ship(c, 5, "A", "A")).ok, true);
  assert.equal(
    JSON.parse(b.raw()).transactionState.commands.at(-1).actor,
    "Yönetici",
  );
});
test("reservation revalidation prevents two plans consuming the same approved output", async () => {
  const b = db(completed({ route: ["İmalat", "Tesviye"] })),
    a = b.open(),
    c = b.open();
  for (const [s, id] of [
    [a, "NEXT-A"],
    [c, "NEXT-B"],
  ]) {
    const args = { order: "SIP-P0", id, operation: 1, qty: 15 };
    const r = await send(s, "planning.create", args, id, (d) =>
      Plan.create(d, args),
    );
    assert.equal(r.ok, id === "NEXT-A");
  }
  assert.equal(JSON.parse(b.raw()).operationInputs.length, 1);
});
test("concurrent final quality releases cannot approve the same quantity twice", async () => {
  const b = db(),
    a = b.open(),
    c = b.open();
  for (const [s, id] of [
    [a, "A"],
    [c, "B"],
  ]) {
    const r = await send(s, "shipping.release", { qty: 15 }, id, (d) =>
      S.release(d, "SIP-P0", { qty: 15 }),
    );
    assert.equal(r.ok, id === "A");
  }
  assert.equal(JSON.parse(b.raw()).ux06["SIP-P0"].releases.length, 1);
});
test("customer return and restock source budgets are revalidated", async () => {
  const seed = ready();
  S.ship(seed, "SIP-P0", { qty: 20, ref: "SHIP" });
  const b = db(seed),
    a = b.open(),
    c = b.open();
  const args = { order: "SIP-P0", shipment: "SHIP", qty: 15, reason: "bad" };
  assert.equal(
    (
      await send(a, "stock.customerReturn", args, "A", (d) =>
        K.customerReturn(d, args),
      )
    ).ok,
    true,
  );
  assert.equal(
    (
      await send(c, "stock.customerReturn", args, "B", (d) =>
        K.customerReturn(d, args),
      )
    ).ok,
    false,
  );
  const claim = JSON.parse(b.raw()).ux06["SIP-P0"].customerReturns[0],
    dispose = {
      order: "SIP-P0",
      caseId: claim.id,
      qty: 15,
      kind: "restock",
      reason: "checked",
    };
  assert.equal(
    (
      await send(a, "stock.disposeReturn", dispose, "C", (d) =>
        K.disposeReturn(d, dispose),
      )
    ).ok,
    true,
  );
  assert.equal(
    (
      await send(c, "stock.disposeReturn", dispose, "D", (d) =>
        K.disposeReturn(d, dispose),
      )
    ).ok,
    false,
  );
  const s = JSON.parse(b.raw());
  assert.equal(s.returnDispositions.length, 1);
  assert.equal(I.validate(s).valid, true);
});
test("snapshot protocol validation rejects corrupt/unsupported revisions and duplicate keys", async () => {
  const b = db(ready());
  await ship(b.open(), 5, "A", "A");
  const good = JSON.parse(b.raw());
  for (const mutate of [
    (s) => (s.transactionState.version = 2),
    (s) => (s.transactionState.revision = 2),
    (s) => (s.transactionState.commands[0].fingerprint = "bad"),
    (s) =>
      s.transactionState.commands.push({ ...s.transactionState.commands[0] }),
  ]) {
    const s = structuredClone(good);
    mutate(s);
    assert.equal(P.validate(s).ok, false);
    assert.equal(I.validate(s).valid, false);
  }
  assert.equal(P.validate(good).ok, true);
});
test("pure integrity preserves protocol and original records byte-equivalent", async () => {
  const b = db(ready());
  await ship(b.open(), 5, "A", "A");
  const s = JSON.parse(b.raw()),
    raw = JSON.stringify(s);
  assert.equal(I.validate(s).valid, true);
  assert.equal(JSON.stringify(s), raw);
});
test("latest read denial preserves the last readable raw snapshot for export", async () => {
  const b = db(ready()),
    s = b.open(),
    raw = b.raw();
  b.setMode("read");
  const r = await ship(s, 5, "A", "A");
  assert.equal(r.ok, false);
  assert.equal(s.ready, false);
  assert.equal(s.raw, raw);
  assert.equal(b.writes(), 0);
  b.setMode("ok");
  assert.equal(b.raw(), raw);
});
test("snapshot revision rollback is rejected without overwriting the older stored record", async () => {
  const b = db(ready()),
    s = b.open();
  await ship(s, 5, "A", "A");
  const old = b.raw();
  await ship(s, 5, "B", "B");
  b.setRaw(old);
  assert.equal((await ship(s, 1, "C", "C")).code, "REVISION_ROLLBACK");
  assert.equal(b.raw(), old);
});
test("canonical payload order has the same durable fingerprint", async () => {
  assert.equal(
    await T.fingerprint(
      { kind: "test", args: { qty: 1, id: "A" } },
      "Yönetici",
    ),
    await T.fingerprint(
      { args: { id: "A", qty: 1 }, kind: "test" },
      "Yönetici",
    ),
  );
});
test("explicit copies share the exclusive lock and refuse any existing target", async () => {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
    },
    locks = { request: (name, options, fn) => fn({ name, mode: "exclusive" }) };
  const raw = JSON.stringify(completed());
  values.set("original", raw);
  const args = {
    storage: () => storage,
    locks: () => locks,
    key: "copy",
    value: fresh(),
  };
  assert.equal((await T.copy(args)).ok, true);
  const copied = values.get("copy");
  assert.equal((await T.copy({ ...args, value: completed() })).ok, false);
  assert.equal(values.get("copy"), copied);
  assert.equal(values.get("original"), raw);
});
test("unserializable result is rejected before the write instead of losing acknowledgement after commit", async () => {
  const b = db(),
    s = b.open(),
    raw = b.raw();
  const r = await send(s, "test", {}, "A", (d) => {
    d.jobs[0].owner = "Operatör A";
    return { ok: true, callback: () => {} };
  });
  assert.equal(r.code, "COMMAND_RESULT_INVALID");
  assert.equal(b.writes(), 0);
  assert.equal(b.raw(), raw);
  assert.deepEqual(s.snapshot(), JSON.parse(raw));
});
