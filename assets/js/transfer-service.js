/* Explicit issue/accept/reverse commands; storage is the caller's transaction. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(
    node ? require("./quantity-model.js") : root.RitimQuantities,
    node ? require("./transfer-ledger.js") : root.RitimTransferLedger,
  );
  if (node) module.exports = api;
  else root.RitimTransfers = api;
})(globalThis, function (Q, L) {
  "use strict";
  const fail = (message) => ({ ok: false, message });
  const closed = (j) => ["complete", "shipped"].includes(j.state);
  function guard(s) {
    if (s.user !== "Yönetici")
      return "Fiziksel transfer için Yönetici kullanıcısı gerekli";
    return L.issues(s)[0];
  }
  function initialize(j) {
    j.ux05 ??= {
      received: j.good + j.scrap,
      pending: 0,
      setup: 0,
      rework: 0,
      allocatable: 0,
      handover: null,
      receipts: [],
      legacyBaseline: j.good + j.scrap,
      legacyGood: j.good,
    };
  }
  function issue(s, { id, source, destination, inputLot, qty, reason } = {}) {
    const error = guard(s);
    if (error) return fail(error);
    if (
      typeof id !== "string" ||
      !id.trim() ||
      L.rows(s).some((t) => t.id === id.trim())
    )
      return fail(
        "Benzersiz hareket numarası gerekli; aynı hareket tekrar gönderilemez",
      );
    const a = s.jobs.find((j) => j.id === source),
      b = s.jobs.find((j) => j.id === destination);
    const o = s.orders.find((o) => o.id === a?.order);
    if (
      !a ||
      !b ||
      !o ||
      a === b ||
      a.order !== b.order ||
      a.op !== b.op ||
      Q.route(o).operations[a.op]?.type !== "internal"
    )
      return fail(
        "Aynı sipariş ve aynı iç operasyonun farklı iş emirlerini seçin",
      );
    if (closed(a) || closed(b) || a.ux05?.handover || b.ux05?.handover)
      return fail(
        "Kapalı veya vardiya devri bekleyen iş emri transfer alamaz/gönderemez",
      );
    if (typeof reason !== "string" || !reason.trim())
      return fail("Transfer gerekçesi gerekli");
    const ab = Q.jobBalance(a, o, s),
      bb = Q.jobBalance(b, o, s),
      t = L.totals(s, b.id);
    const lot = L.lots(s, a).find((l) => l.id === inputLot);
    const allocated = Q.allocation(s, o.id, a.id);
    if (
      !a.ux05 ||
      a.ux05.received - a.ux05.legacyBaseline > allocated ||
      !ab.valid ||
      !bb.valid ||
      !Q.count(qty) ||
      qty === 0 ||
      !lot?.valid ||
      qty > lot.available ||
      qty > ab.unprocessed ||
      qty >
        bb.unstarted -
          t.awaiting -
          (s.operationInputs || [])
            .filter((r) => r.destination === b.id && r.status === "reserved")
            .reduce((n, r) => n + r.qty, 0)
    )
      return fail(
        "İşlenmemiş fiziksel lot veya hedef plan kapasitesi yetersiz",
      );
    const now = new Date().toISOString();
    const entry = {
      version: 1,
      id: id.trim(),
      source,
      destination,
      inputLot,
      outputLot: `TRANSFER:${id.trim()}`,
      qty,
      reason: reason.trim(),
      order: o.id,
      operation: a.op,
      routeKey: JSON.stringify(o.route),
      status: "in_transit",
      history: [
        { action: "issue", user: s.user, time: now, reason: reason.trim() },
      ],
    };
    initialize(b);
    (s.physicalTransfers ??= []).push(entry);
    return { ok: true, entry };
  }
  function accept(s, { id } = {}) {
    const error = guard(s);
    if (error) return fail(error);
    const t = L.rows(s).find((t) => t.id === id);
    if (!t || t.status !== "in_transit")
      return fail("Bu hareket kabul beklemiyor; tekrar kabul yapılamaz");
    const j = s.jobs.find((j) => j.id === t.destination),
      o = s.orders.find((o) => o.id === t.order);
    if (
      closed(j) ||
      j.ux05?.handover ||
      Q.jobBalance(j, o, s).unstarted < L.totals(s, j.id).awaiting
    )
      return fail(
        "Hedef iş emri kabul için uygun değil veya plan kapasitesi yetersiz",
      );
    t.status = "accepted";
    t.history.push({
      action: "accept",
      user: s.user,
      time: new Date().toISOString(),
    });
    return { ok: true, entry: t };
  }
  function reverse(s, { id, reason, returned } = {}) {
    const error = guard(s);
    if (error) return fail(error);
    const t = L.rows(s).find((t) => t.id === id);
    if (!t || t.status === "reversed")
      return fail("Hareket zaten geri alınmış veya bulunamadı");
    const source = s.jobs.find((j) => j.id === t.source);
    if (closed(source) || source.ux05?.handover)
      return fail(
        "Kaynak iş emri kapalı veya vardiya devri bekliyor; fiziksel dönüş kabul edilemez",
      );
    if (returned !== true)
      return fail("Parçaların kaynakta fiziksel dönüşünü doğrulayın");
    if (t.status === "accepted") {
      const destination = s.jobs.find((j) => j.id === t.destination);
      const lot = L.lots(s, destination).find((l) => l.id === t.outputLot);
      if (
        !lot ||
        lot.available !== t.qty ||
        L.rows(s).some(
          (r) => r.inputLot === t.outputLot && r.status !== "reversed",
        )
      )
        return fail(
          "Kabul edilmiş lot tüketilmiş veya başka transfere bağlı; geri alınamaz",
        );
    }
    if (typeof reason !== "string" || !reason.trim())
      return fail("Geri alma gerekçesi gerekli");
    t.status = "reversed";
    t.history.push({
      action: "reverse",
      user: s.user,
      reason: reason.trim(),
      time: new Date().toISOString(),
    });
    return { ok: true, entry: t };
  }
  function consume(s, j, qty, type) {
    if (
      !L.rows(s).some((t) => t.source === j.id || t.destination === j.id) &&
      !(s.operationInputs || []).some((t) => t.destination === j.id)
    )
      return { ok: true };
    const error = L.issues(s)[0];
    if (error) return fail(error);
    if (!Q.count(qty) || qty === 0)
      return fail("Geçerli üretim miktarı gerekli");
    let remaining = qty;
    const entries = [];
    for (const lot of L.lots(s, j)) {
      const n = Math.min(remaining, lot.available);
      if (n)
        entries.push({
          job: j.id,
          lot: lot.id,
          qty: n,
          type,
          time: new Date().toISOString(),
        });
      remaining -= n;
    }
    if (remaining) return fail("Üretim için işlenmemiş fiziksel lot yetersiz");
    (s.physicalLotUses ??= []).push(...entries);
    return { ok: true };
  }
  return Object.freeze({ issue, accept, reverse, consume });
});
