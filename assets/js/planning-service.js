/* Explicit job plans and adjacent-operation input reservations. No migration. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(
    node ? require("./quantity-model.js") : root.RitimQuantities,
    node ? require("./operation-ledger.js") : root.RitimOperations,
    node ? require("./transfer-ledger.js") : root.RitimTransferLedger,
  );
  if (node) module.exports = api;
  else root.RitimPlanning = api;
})(globalThis, function (Q, O, T) {
  "use strict";
  const fail = (message) => ({ ok: false, message });
  const stamp = () => new Date().toISOString();
  const closed = (j) => ["complete", "shipped"].includes(j.state);
  const plan = (j, o) => Q.jobBalance(j, o).planned;
  function guard(s, o) {
    if (s.user !== "Yönetici")
      return "Planlama için Yönetici kullanıcısı gerekli";
    if (!o) return "Sipariş bulunamadı";
    const d = Q.readLedger(s, o.id),
      key = Q.route(o).key;
    if (
      [...d.dispatches, ...d.releases, ...d.shipments].some(
        (r) => r.routeKey !== key,
      )
    )
      return "Mevcut fason/sevkiyat geçmişi rota ile uyuşmuyor; girdi yeniden ayrılamaz";
    return Q.operationProof(s, o).issues[0];
  }
  function capacity(s, o, op) {
    const jobs = s.jobs.filter((j) => j.order === o.id && j.op === op),
      planned = jobs.reduce((n, j) => n + plan(j, o), 0);
    const previous = op > 0 ? Q.productionSources(s, o, true, op - 1) : [];
    const sources = previous.map((a) => ({
      ...a,
      available: Math.max(0, a.qty - O.reserved(s, a.job)),
    }));
    const limit = op === 0 ? o.qty + Q.compensation(s,o.id) : O.sum(previous);
    return {
      planned,
      limit,
      available: Math.max(
        0,
        Math.min(
          limit - planned,
          op === 0 ? limit : sources.reduce((n, a) => n + a.available, 0),
        ),
      ),
      sources,
    };
  }
  function initialize(j) {
    j.ux05 = {
      received: 0,
      pending: 0,
      setup: 0,
      rework: 0,
      allocatable: 0,
      handover: null,
      receipts: [],
      legacyGood: 0,
      legacyBaseline: 0,
    };
  }
  function event(s, j, action, qty, reason) {
    (s.planningEvents ??= []).push({
      job: j.id,
      order: j.order,
      action,
      qty,
      reason,
      user: s.user,
      time: stamp(),
    });
  }
  function create(
    s,
    { order, id, operation, qty, machine = "", machines = [] } = {},
  ) {
    const o = s.orders.find((o) => o.id === order),
      error = guard(s, o);
    if (error) return fail(error);
    id = typeof id === "string" ? id.trim() : "";
    if (!id || s.jobs.some((j) => j.id === id))
      return fail("Benzersiz iş emri numarası gerekli");
    const route = Q.route(o);
    if (
      !Q.count(operation) ||
      !route.supported ||
      route.operations[operation]?.type !== "internal"
    )
      return fail("Desteklenen rotadan bir iç operasyon seçin");
    if (
      machine &&
      (!machines.includes(machine) ||
        s.jobs.some((j) => j.machine === machine && !closed(j)))
    )
      return fail("Makine geçersiz veya başka açık işe atanmış");
    const c = capacity(s, o, operation);
    if (!Q.count(qty) || qty < 1 || !Q.count(c.available) || qty > c.available)
      return fail(
        "Plan miktarı kalan operasyon kapasitesini veya onaylı girdiyi aşıyor",
      );
    const j = {
      id,
      order: o.id,
      op: operation,
      plannedQty: qty,
      machine,
      state: "waiting",
      good: 0,
      scrap: 0,
      planningVersion: 1,
      routeKey: route.key,
    };
    initialize(j);
    const entries = [];
    let remaining = qty;
    if (operation > 0) {
      for (const source of c.sources) {
        const take = Math.min(remaining, source.available);
        if (!take) continue;
        const key = `${id}:INPUT:${entries.length + 1}`;
        entries.push({
          id: key,
          version: 1,
          order: o.id,
          source: source.job,
          destination: id,
          operation,
          routeKey: route.key,
          inputLot: `GOOD:${source.job}`,
          qty: take,
          initialQty: take,
          status: "reserved",
          history: [
            { action: "reserve", qty: take, user: s.user, time: stamp() },
          ],
        });
        remaining -= take;
      }
      if (remaining) return fail("Önceki operasyon girdisi yetersiz");
    }
    s.jobs.push(j);
    if (entries.length) (s.operationInputs ??= []).push(...entries);
    event(s, j, "create", qty, "Operasyon planı ve girdi rezervasyonu");
    return { ok: true, job: j };
  }
  function reduce(s, { job: id, qty, reason } = {}) {
    const j = s.jobs.find((j) => j.id === id),
      o = s.orders.find((o) => o.id === j?.order),
      error = guard(s, o);
    if (error) return fail(error);
    if (!j || closed(j) || j.ux05?.handover)
      return fail("Kapalı veya devredilmeyi bekleyen plan azaltılamaz");
    if (typeof reason !== "string" || !reason.trim())
      return fail("Plan azaltma gerekçesi gerekli");
    const b = Q.jobBalance(j, o, s),
      next = b.planned - qty;
    if (
      !Q.count(qty) ||
      !qty ||
      !Q.count(next) ||
      next < b.received + b.awaitingTransfer
    )
      return fail(
        "Yalnızca teslim alınmamış ve yola çıkmamış plan azaltılabilir",
      );
    const reservations = O.rows(s).filter(
      (r) => r.destination === id && r.status === "reserved",
    );
    if (j.op > 0 && qty > O.sum(reservations))
      return fail("Serbest bırakılabilecek operasyon rezervasyonu yetersiz");
    const release =
      j.op === 0 ? Math.max(0, O.allocation(s, o.id, id) - next) : 0;
    if (
      release >
      O.allocation(s, o.id, id) -
        (j.ux05 ? j.ux05.received - j.ux05.legacyBaseline : 0)
    )
      return fail("Fiziksel teslim alınan tahsis serbest bırakılamaz");
    let remaining = qty;
    for (const r of reservations) {
      const take = Math.min(remaining, r.qty);
      if (!take) break;
      r.history.push({
        action: "release",
        qty: take,
        reason: reason.trim(),
        user: s.user,
        time: stamp(),
      });
      if (take === r.qty) r.status = "cancelled";
      else r.qty -= take;
      remaining -= take;
    }
    if (release)
      (s.allocationReleases ??= []).push({
        order: o.id,
        job: id,
        qty: release,
        reason: reason.trim(),
        time: stamp(),
        user: s.user,
      });
    j.plannedQty = next;
    if (!next) {
      j.state = "complete";
      j.planningState = "cancelled";
    }
    event(s, j, "reduce", qty, reason.trim());
    return { ok: true, job: j };
  }
  function move(s, { id, action } = {}) {
    const r = O.rows(s).find((r) => r.id === id),
      o = s.orders.find((o) => o.id === r?.order),
      error = guard(s, o);
    if (error) return fail(error);
    if (!r) return fail("Operasyon rezervasyonu bulunamadı");
    const j = s.jobs.find((j) => j.id === r.destination),
      src = s.jobs.find((j) => j.id === r.source);
    if (closed(j) || j.ux05?.handover || src.ux05?.handover)
      return fail("İş emri fiziksel harekete uygun değil");
    if (action === "send" && r.status === "reserved") r.status = "in_transit";
    else if (action === "accept" && r.status === "in_transit") {
      const b = Q.jobBalance(j, o, s);
      if (b.unstarted < b.awaitingTransfer)
        return fail("Hedef kapasitesi yetersiz");
      r.status = "accepted";
    } else
      return fail(
        "Hareket bu işlem için uygun durumda değil; tekrar uygulanamaz",
      );
    r.history.push({ action, user: s.user, time: stamp() });
    return { ok: true, entry: r };
  }
  return Object.freeze({ create, reduce, move, capacity });
});
