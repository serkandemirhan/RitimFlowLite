(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RitimQuality = api;
})(globalThis, function () {
  "use strict";
  const fail = (message) => ({ ok: false, message }),
    count = (n) => Number.isSafeInteger(n) && n >= 0;
  const stamp = () => new Date().toISOString();
  const canSelf = (s, j) =>
    s.user === "Yönetici" ||
    !!(s.qualityPolicies || [])
      .filter((p) => p.order === j.order && p.operation === j.op)
      .at(-1)
      ?.users.includes(s.user);
  function policy(s, { order, operation, users } = {}) {
    if (s.user !== "Yönetici") return fail("Politika için yönetici gerekli");
    if (
      !s.orders.some((o) => o.id === order && o.route[operation]) ||
      !Array.isArray(users) ||
      users.some((u) => !["Operatör A", "Operatör B", "Operatör C"].includes(u))
    )
      return fail("Geçerli operasyon ve kullanıcı seçin");
    (s.qualityPolicies ??= []).push({
      order,
      operation,
      users: [...users],
      time: stamp(),
      user: s.user,
    });
    return { ok: true };
  }
  function inspect(
    s,
    {
      job: id,
      good,
      scrap,
      rework,
      defect = "Kontrolde yeniden işlem gereği",
    } = {},
  ) {
    const j = s.jobs.find((j) => j.id === id),
      x = j?.ux05,
      n = good + scrap + rework;
    if (s.user !== "Yönetici" || !x)
      return fail("Kontrol onayı için yönetici ve iş emri gerekli");
    if (![good, scrap, rework].every(count) || !n || n > x.pending)
      return fail("Kontrol miktarı bekleyen miktarı aşıyor");
    const serial = (s.inspectionCases || []).length + 1,
      key = `QC:${id}:${serial}`;
    const lots = (s.physicalLotUses || [])
      .filter((u) => u.job === id)
      .map((u) => u.lot);
    const entry = {
      id: key,
      job: id,
      order: j.order,
      operation: j.op,
      good,
      scrap,
      rework,
      qty: n,
      defect,
      inputLots: [...new Set(lots.length ? lots : [`INPUT:${id}`])],
      user: s.user,
      time: stamp(),
    };
    x.pending -= n;
    j.good += good;
    j.scrap += scrap;
    (s.inspectionCases ??= []).push(entry);
    if (rework)
      (s.reworkTasks ??= []).push({
        id: `RW:${key}`,
        inspection: key,
        job: id,
        order: j.order,
        qty: rework,
        remaining: rework,
        executed: 0,
        results: [],
        defect,
        inputLots: entry.inputLots,
        owner: j.owner || "",
        status: "waiting",
      });
    x.rework += rework;
    return { ok: true, entry };
  }
  function registerLegacy(s, { job: id, reason } = {}) {
    const j = s.jobs.find((j) => j.id === id);
    if (s.user !== "Yönetici" || !j?.ux05 || !reason?.trim())
      return fail("Yönetici ve kaynak açıklaması gerekli");
    const linked = (s.reworkTasks || [])
        .filter((t) => t.job === id)
        .reduce((n, t) => n + t.remaining, 0),
      qty = j.ux05.rework - linked;
    if (!count(qty) || !qty) return fail("Bağlanmamış eski rework miktarı yok");
    const key = "RW:LEGACY:" + id + ":" + (s.reworkTasks || []).length;
    (s.reworkTasks ??= []).push({
      id: key,
      inspection: "Eski kayıt — kontrol kimliği bilinmiyor",
      job: id,
      order: j.order,
      qty,
      remaining: qty,
      executed: 0,
      results: [],
      defect: reason,
      inputLots: ["Eski kaynak — lot bilinmiyor"],
      owner: j.owner || "",
      status: "waiting",
      legacy: true,
      user: s.user,
      time: stamp(),
    });
    return { ok: true };
  }
  function assign(s, { id, owner } = {}) {
    const t = (s.reworkTasks || []).find((t) => t.id === id);
    if (
      s.user !== "Yönetici" ||
      !t ||
      !t.remaining ||
      !["Operatör A", "Operatör B", "Operatör C"].includes(owner)
    )
      return fail("Yönetici ve açık rework işi gerekli");
    t.owner = owner;
    (t.assignments ??= []).push({ owner, user: s.user, time: stamp() });
    return { ok: true };
  }
  function execute(s, { id, qty } = {}) {
    const t = (s.reworkTasks || []).find((t) => t.id === id);
    if (!t || !(s.user === "Yönetici" || t.owner === s.user))
      return fail("Rework işi için atanmış operatör veya yönetici gerekli");
    if (!count(qty) || !qty || qty > t.remaining - t.executed)
      return fail("Rework yapılacak miktarı aşıyor");
    t.executed += qty;
    t.status = "inspection";
    (t.execution ??= []).push({ qty, user: s.user, time: stamp() });
    return { ok: true };
  }
  function rework(s, { job: id, task, good, scrap } = {}) {
    const j = s.jobs.find((j) => j.id === id),
      x = j?.ux05;
    if (s.user !== "Yönetici" || !x)
      return fail("Rework kontrolü için yönetici gerekli");
    const n = good + scrap;
    if (![good, scrap].every(count) || !n || n > x.rework)
      return fail("Rework bakiyesi aşılıyor");
    const t = (s.reworkTasks || []).find(
      (t) => t.job === id && t.remaining > 0 && (!task || t.id === task),
    );
    if (!t || n > t.executed)
      return fail("Önce ilgili rework işini kalite kuyruğunda tamamlayın");
    t.executed -= n;
    t.remaining -= n;
    t.results.push({ good, scrap, user: s.user, time: stamp() });
    t.status = t.remaining ? "waiting" : "complete";
    x.rework -= n;
    j.good += good;
    j.scrap += scrap;
    return { ok: true, entry: t };
  }
  return Object.freeze({
    canSelf,
    policy,
    inspect,
    execute,
    rework,
    registerLegacy,
    assign,
  });
});
