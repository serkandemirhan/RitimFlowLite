(function (root, factory) {
  const node = typeof module === "object" && module.exports,
    api = factory(
      node ? require("./quantity-model.js") : root.RitimQuantities,
      node ? require("./stock-ledger.js") : root.RitimStockLedger,
    );
  if (node) module.exports = api;
  else root.RitimStock = api;
})(globalThis, function (Q, L) {
  "use strict";
  const fail = (message) => ({ ok: false, message }),
    stamp = () => new Date().toISOString(),
    valid = (n, max) => Q.count(n) && n > 0 && n <= max;
  function context(s, id) {
    const o = s.orders.find((o) => o.id === id);
    return o ? { o, x: Q.orderQuantities(s, o) } : null;
  }
  function ledger(s, id) {
    s.ux06 ??= {};
    s.ux06[id] ??= {};
    for (const k of Q.keys) s.ux06[id][k] ??= [];
    return s.ux06[id];
  }
  function event(s, o, kind, qty, meta) {
    ledger(s, o).entries.unshift({
      kind,
      qty,
      meta,
      user: s.user,
      time: stamp(),
    });
  }
  function receive(
    s,
    { order: id, inputQty, unit, piecesPerUnit, supplier, stockCode, ref } = {},
  ) {
    const c = context(s, id);
    if (!c) return fail("Sipariş yok");
    const raw = inputQty * piecesPerUnit,
      n = Math.round(raw);
    if (
      !Number.isFinite(inputQty) ||
      inputQty <= 0 ||
      !Number.isFinite(piecesPerUnit) ||
      piecesPerUnit <= 0 ||
      Math.abs(raw - n) > 1e-8 ||
      !valid(n, L.receiptLimit(s, c.o) - c.x.material) ||
      !["adet", "kg", "m", "çubuk"].includes(unit)
    )
      return fail(
        "Birim dönüşümü tam üretim adedi vermeli ve izinli kabul miktarını aşmamalı",
      );
    if (!supplier?.trim() || !stockCode?.trim() || !ref?.trim())
      return fail("Tedarikçi, stok kodu ve irsaliye gerekli");
    if (c.x.d.receipts.some((r) => r.ref === ref.trim()))
      return fail("İrsaliye zaten kabul edilmiş");
    ledger(s, id).receipts.push({
      qty: n,
      inputQty,
      unit,
      piecesPerUnit,
      supplier: supplier.trim(),
      stockCode: stockCode.trim(),
      ref: ref.trim(),
      date: stamp(),
    });
    event(
      s,
      id,
      "Malzeme kabul",
      n,
      `${supplier} · ${inputQty} ${unit} × ${piecesPerUnit} · ${ref}`,
    );
    return { ok: true };
  }
  function authorize(s, { order: id, qty, reason } = {}) {
    const c = context(s, id);
    if (
      !c ||
      s.user !== "Yönetici" ||
      !valid(qty, Number.MAX_SAFE_INTEGER) ||
      !reason?.trim()
    )
      return fail(
        "Fazla malzeme için yönetici, pozitif adet ve gerekçe gerekli",
      );
    (s.materialAuthorizations ??= []).push({
      order: id,
      qty,
      reason: reason.trim(),
      user: s.user,
      time: stamp(),
    });
    event(s, id, "Ek malzeme izni", qty, reason);
    return { ok: true };
  }
  function supplierReturn(
    s,
    { order: id, dispatch, qty, kind = "good", reason } = {},
  ) {
    const c = context(s, id),
      d = c?.x.d.dispatches.find((d) => d.ref === dispatch);
    if (!d) return fail("Fason gönderimi yok");
    const used =
      Q.sum(c.x.d.returns.filter((r) => r.dispatch === dispatch)) +
      L.supplierResolved(s, id, dispatch);
    if (!valid(qty, d.qty - used))
      return fail("Gönderimin açık miktarı aşılıyor");
    if (!["good", "scrap", "rework", "lost"].includes(kind))
      return fail("Geçersiz dönüş sonucu");
    if (kind !== "good" && (s.user !== "Yönetici" || !reason?.trim()))
      return fail("Fark kapatma için yönetici ve gerekçe gerekli");
    if (kind === "good")
      ledger(s, id).returns.push({
        qty,
        dispatch,
        date: stamp(),
        user: s.user,
      });
    else
      (s.supplierDispositions ??= []).push({
        id: `SD:${(s.supplierDispositions || []).length + 1}`,
        order: id,
        dispatch,
        qty,
        kind,
        remaining: kind === "rework" ? qty : 0,
        reason,
        user: s.user,
        time: stamp(),
        sources: d.sources,
      });
    event(
      s,
      id,
      "Fason dönüş / mutabakat",
      qty,
      `${dispatch} · ${kind} · ${reason || ""}`,
    );
    return { ok: true };
  }
  function supplierRework(s, { id, good, scrap, reason } = {}) {
    const d = (s.supplierDispositions || []).find(
        (r) => r.id === id && r.kind === "rework",
      ),
      n = good + scrap;
    if (
      s.user !== "Yönetici" ||
      !d ||
      ![good, scrap].every(Q.count) ||
      !n ||
      n > d.remaining ||
      !reason?.trim()
    )
      return fail("Rework sonucu, yönetici ve gerekçe gerekli");
    d.remaining -= n;
    (d.results ??= []).push({
      good,
      scrap,
      reason,
      user: s.user,
      time: stamp(),
    });
    if (good)
      ledger(s, d.order).returns.push({
        qty: good,
        dispatch: d.dispatch,
        rework: id,
        date: stamp(),
      });
    if (scrap)
      (s.supplierDispositions ??= []).push({
        id: `SD:${s.supplierDispositions.length + 1}`,
        order: d.order,
        dispatch: d.dispatch,
        qty: scrap,
        kind: "scrap",
        reason,
        rework: id,
        user: s.user,
        time: stamp(),
      });
    return { ok: true };
  }
  function customerReturn(s, { order: id, shipment, qty, reason } = {}) {
    const c = context(s, id),
      a = c?.x.d.shipments.find((a) => a.ref === shipment);
    if (!a || !reason?.trim())
      return fail("Sevkiyat ve iade gerekçesi gerekli");
    const used = Q.sum(
      c.x.d.customerReturns.filter(
        (r) => r.shipment === shipment && r.status !== "reversed",
      ),
    );
    if (!valid(qty, a.qty - used)) return fail("İade miktarı sevkiyatı aşıyor");
    const entry = {
      id: `CR:${id}:${c.x.d.customerReturns.length + 1}`,
      qty,
      shipment,
      reason,
      date: stamp(),
      status: "quarantine",
    };
    ledger(s, id).customerReturns.push(entry);
    event(s, id, "Müşteri iadesi / karantina", qty, `${shipment} · ${reason}`);
    return { ok: true, entry };
  }
  function returnCase(s, order, id) {
    return ledger(s, order).customerReturns.find((r) => r.id === id);
  }
  function approveRestock(s, o, id, qty) {
    const route = Q.route(o);
    ledger(s, o.id).releases.push({
      id: `RETURN-QA:${o.id}:${ledger(s, o.id).releases.length + 1}`,
      version: 1,
      kind: "return-restock",
      routeKey: route.key,
      operation: route.terminal,
      user: s.user,
      date: stamp(),
      qty,
      sources: [{ return: id, qty }],
    });
  }
  function disposeReturn(s, { order: id, caseId, qty, kind, reason } = {}) {
    const c = context(s, id);
    if (!c || s.user !== "Yönetici" || !reason?.trim() || c.x.blocked)
      return fail(
        "İade kararı için doğrulanmış sevkiyat, yönetici ve gerekçe gerekli",
      );
    const r = c.x.d.customerReturns.find(
        (r) => r.id === caseId && r.status !== "reversed",
      ),
      past = (s.returnDispositions || []).filter(
        (d) => d.caseId === caseId && !d.kind.startsWith("rework-"),
      );
    if (
      !r ||
      !valid(qty, r.qty - L.sum(past)) ||
      !["restock", "scrap", "rework"].includes(kind)
    )
      return fail("Karantina miktarı veya karar geçersiz");
    const d = {
      id: `RD:${(s.returnDispositions || []).length + 1}`,
      order: id,
      caseId,
      qty,
      kind,
      reason,
      user: s.user,
      time: stamp(),
      shipment: r.shipment,
    };
    (s.returnDispositions ??= []).push(d);
    if (kind === "restock") approveRestock(s, c.o, caseId, qty);
    if (kind === "rework")
      (s.returnReworks ??= []).push({
        id: `RR:${d.id}`,
        order: id,
        caseId,
        qty,
        remaining: qty,
        results: [],
      });
    event(s, id, "İade kalite kararı", qty, `${caseId} · ${kind} · ${reason}`);
    return { ok: true };
  }
  function returnRework(s, { id, good, scrap, reason } = {}) {
    const t = (s.returnReworks || []).find((r) => r.id === id),
      n = good + scrap;
    if (
      !t ||
      s.user !== "Yönetici" ||
      ![good, scrap].every(Q.count) ||
      !n ||
      n > t.remaining ||
      !reason?.trim()
    )
      return fail("İade rework miktarı, yönetici ve gerekçe gerekli");
    const c = context(s, t.order);
    if (c.x.blocked) return fail("İade kaynağı doğrulanamıyor");
    t.remaining -= n;
    t.results.push({ good, scrap, reason, user: s.user, time: stamp() });
    for (const [kind, qty] of [
      ["rework-restock", good],
      ["rework-scrap", scrap],
    ])
      if (qty)
        (s.returnDispositions ??= []).push({
          id: `RD:${(s.returnDispositions || []).length + 1}`,
          order: t.order,
          caseId: t.caseId,
          qty,
          kind,
          reason,
          rework: id,
          user: s.user,
          time: stamp(),
        });
    if (good) approveRestock(s, c.o, t.caseId, good);
    return { ok: true };
  }
  function reverseReturn(s, { order: id, caseId, reason } = {}) {
    const c = context(s, id),
      r = c?.x.d.customerReturns.find((r) => r.id === caseId);
    if (
      s.user !== "Yönetici" ||
      !r ||
      r.status === "reversed" ||
      c.x.net + r.qty > c.o.qty ||
      !reason?.trim() ||
      (s.returnDispositions || []).some((d) => d.caseId === caseId)
    )
      return fail("Yalnızca kararı verilmemiş iade gerekçeyle geri alınabilir");
    r.status = "reversed";
    (r.history ??= []).push({
      action: "reverse",
      reason,
      user: s.user,
      time: stamp(),
    });
    event(s, id, "İade ters kaydı", r.qty, reason);
    return { ok: true };
  }
  function compensate(s, { order: id, source, qty, reason } = {}) {
    const c = context(s, id);
    if (!c || s.user !== "Yönetici" || !reason?.trim())
      return fail("Telafi planı için yönetici ve gerekçe gerekli");
    let loss = 0;
    const j = s.jobs.find((j) => j.order === id && j.id === source);
    if (j) loss = j.scrap + (j.ux05?.setup || 0);
    else {
      const d = (s.supplierDispositions || []).find(
        (d) =>
          d.order === id &&
          d.id === source &&
          ["scrap", "lost"].includes(d.kind),
      );
      if (d) loss = d.qty;
      const r = (s.returnDispositions || []).find(
        (d) =>
          d.order === id &&
          d.id === source &&
          ["scrap", "rework-scrap"].includes(d.kind),
      );
      if (r) loss = r.qty;
    }
    const used = L.sum(
      (s.compensations || []).filter(
        (r) => r.order === id && r.source === source,
      ),
    );
    if (!valid(qty, loss - used))
      return fail("Belgelenmiş kaybın kalan miktarı aşılıyor");
    (s.compensations ??= []).push({
      order: id,
      source,
      operation: 0,
      qty,
      reason,
      user: s.user,
      time: stamp(),
    });
    event(s, id, "Kayıp telafi izni", qty, `${source} · ${reason}`);
    return { ok: true };
  }
  return Object.freeze({
    receive,
    authorize,
    supplierReturn,
    supplierRework,
    customerReturn,
    disposeReturn,
    returnRework,
    reverseReturn,
    compensate,
  });
});
