/* One mutation boundary for final approval, external dispatch and customer shipment.
 * Persistence remains the existing caller's responsibility; no storage migration. */
(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports
      ? require("./quantity-model.js")
      : root.RitimQuantities,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RitimShipping = api;
})(globalThis, function (Q) {
  "use strict";
  const fail = (message) => ({ ok: false, message });
  const valid = (n, max) => Q.count(n) && n > 0 && n <= max;
  function context(state, id) {
    const o = state.orders?.find((o) => o.id === id);
    return o ? { o, x: Q.orderQuantities(state, o) } : null;
  }
  function writable(state, id) {
    state.ux06 ??= {};
    state.ux06[id] ??= {};
    const d = state.ux06[id];
    for (const k of Q.keys) d[k] ??= [];
    return d;
  }
  function dispatch(state, id, { qty, ref, supplier = "", due = "" } = {}) {
    const c = context(state, id);
    if (!c) return fail("Sipariş bulunamadı");
    const { o, x } = c;
    if (!valid(qty, x.dispatchAvailable))
      return fail(
        "Fason gönderimi için doğrulanmış sağlam üretim veya uygun rota yok",
      );
    ref = typeof ref === "string" ? ref.trim() : "";
    if (!ref) return fail("Fason gönderim irsaliyesi gerekli");
    if (x.d.dispatches.some((a) => a.ref === ref))
      return fail("İrsaliye numarası zaten kullanılmış");
    // Older unlinked dispatches cannot be retroactively attached to new production.
    if (
      x.d.dispatches.some((a) => a.version !== 1 || a.routeKey !== x.route.key)
    )
      return fail("Önceki fason kayıtlarının kaynağı doğrulanamıyor");
    let remaining = qty;
    const sources = [];
    for (const s of x.sources) {
      const used = x.d.dispatches.reduce(
          (n, a) => n + Q.sum((a.sources || []).filter((b) => b.job === s.job)),
          0,
        ),
        take = Math.min(remaining, Math.max(0, s.qty - used));
      if (take) {
        sources.push({ job: s.job, qty: take });
        remaining -= take;
      }
    }
    if (remaining) return fail("Doğrulanmış üretim kaynağı yetersiz");
    const entry = {
      qty,
      ref,
      supplier,
      due,
      date: new Date().toISOString(),
      version: 1,
      routeKey: x.route.key,
      operation: x.route.terminal,
      sources,
    };
    writable(state, o.id).dispatches.push(entry);
    return { ok: true, entry };
  }
  function release(state, id, { qty } = {}) {
    const c = context(state, id);
    if (!c) return fail("Sipariş bulunamadı");
    const { o, x } = c;
    if (state.user !== "Yönetici")
      return fail("Son kontrol onayı için Yönetici kullanıcısı gerekli");
    if (!valid(qty, x.releaseAvailable))
      return fail(
        x.issues[0] ||
          "Son operasyon tamamlanmalı; kontrol onayına uygun miktar yetersiz",
      );
    const key = x.route.external ? "dispatch" : "job";
    let remaining = qty;
    const sources = [];
    for (const source of x.releaseSources) {
      const used = x.d.releases.reduce(
          (n, a) =>
            n + Q.sum((a.sources || []).filter((b) => b[key] === source[key])),
          0,
        ),
        take = Math.min(remaining, Math.max(0, source.qty - used));
      if (take) {
        sources.push({ [key]: source[key], qty: take });
        remaining -= take;
      }
    }
    if (remaining)
      return fail("Final kontrol için son operasyon kaynağı yetersiz");
    let sequence = x.d.releases.length + 1;
    while (x.d.releases.some((a) => a.id === `FINAL-${sequence}`)) sequence++;
    const entry = {
      id: `FINAL-${sequence}`,
      qty,
      date: new Date().toISOString(),
      version: 1,
      routeKey: x.route.key,
      operation: x.route.terminal,
      user: state.user,
      sources,
    };
    writable(state, o.id).releases.push(entry);
    return { ok: true, entry };
  }
  function ship(state, id, { qty, ref } = {}) {
    const c = context(state, id);
    if (!c) return fail("Sipariş bulunamadı");
    const { o, x } = c;
    // Recomputed at commit time. Disabled buttons are not a permission check.
    if (!valid(qty, x.shipAvailable))
      return fail(
        x.issues[0] ||
          "Tamamlanmış son operasyon ve final kalite onayı olmadan veya uygun miktarı aşarak sevkiyat yapılamaz",
      );
    ref = typeof ref === "string" ? ref.trim() : "";
    if (!ref) return fail("Müşteri sevk irsaliyesi gerekli");
    if (x.d.shipments.some((a) => a.ref === ref))
      return fail("İrsaliye zaten kullanılmış");
    let remaining = qty;
    const approvals = [];
    for (const release of x.d.releases) {
      const used = x.d.shipments.reduce(
          (n, a) =>
            n +
            Q.sum((a.approvals || []).filter((b) => b.release === release.id)),
          0,
        ),
        take = Math.min(remaining, Math.max(0, release.qty - used));
      if (take) {
        approvals.push({ release: release.id, qty: take });
        remaining -= take;
      }
    }
    if (remaining)
      return fail("Final kalite onayına bağlı sevk miktarı yetersiz");
    const entry = {
      qty,
      ref,
      date: new Date().toISOString(),
      version: 1,
      routeKey: x.route.key,
      operation: x.route.terminal,
      user: state.user,
      approvals,
    };
    writable(state, o.id).shipments.push(entry);
    return { ok: true, entry };
  }
  return Object.freeze({ dispatch, release, ship });
});
