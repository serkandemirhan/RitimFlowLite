(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RitimWorkforce = api;
})(globalThis, function () {
  "use strict";
  const fail = (message) => ({ ok: false, message }),
    operators = ["Operatör A", "Operatör B", "Operatör C"];
  function context(s, id) {
    return s.jobs.find((j) => j.id === id);
  }
  function log(s, j, type, detail) {
    s.events.unshift({
      job: j.id,
      type,
      qty: 0,
      user: s.user,
      time: new Date().toISOString(),
      detail,
    });
  }
  function assign(s, { id, operator } = {}) {
    const j = context(s, id);
    if (!j || s.user !== "Yönetici")
      return fail("Operatör ataması için yönetici gerekli");
    if (!operators.includes(operator)) return fail("Geçerli operatör seçin");
    if (["complete", "shipped"].includes(j.state) || j.ux05?.handover)
      return fail("Kapalı veya vardiya devri bekleyen işe atama yapılamaz");
    if (j.state === "running" && j.owner && j.owner !== operator)
      return fail("Çalışan işi önce gerekçeyle duraklatın");
    const old = j.owner || "Atanmamış";
    j.owner = operator;
    log(s, j, "operator_assign", `${old} → ${operator}`);
    return { ok: true };
  }
  function take(s, { id } = {}) {
    const j = context(s, id);
    if (!j || !operators.includes(s.user))
      return fail("Devralmak için operatör seçin");
    if (j.owner && j.owner !== s.user)
      return fail("İş başka operatöre atanmış");
    if (j.ux05?.handover || ["complete", "shipped"].includes(j.state))
      return fail("Vardiya devri veya kapalı iş için bu işlem kullanılamaz");
    j.owner = s.user;
    log(s, j, "operator_take", "İş operatör tarafından devralındı");
    return { ok: true };
  }
  function machine(s, { id, target, reason, machines = [] } = {}) {
    const j = context(s, id);
    if (!j || s.user !== "Yönetici")
      return fail("Makine değişikliği için yönetici gerekli");
    if (!reason?.trim()) return fail("Makine değişikliği gerekçesi gerekli");
    if (j.state === "running" || j.ux05?.handover)
      return fail("Önce işi duraklatın ve vardiya devrini tamamlayın");
    if (["complete", "shipped"].includes(j.state))
      return fail("Kapalı iş taşınamaz");
    if (
      target &&
      (!machines.includes(target) ||
        s.jobs.some(
          (x) =>
            x.id !== id &&
            x.machine === target &&
            !["complete", "shipped"].includes(x.state),
        ))
    )
      return fail("Makine geçersiz veya dolu");
    const before = j.machine;
    j.machine = target || "";
    log(
      s,
      j,
      "machine_reassign",
      `${before || "Atanmamış"} → ${target || "Makine serbest"} · ${reason.trim()}`,
    );
    return { ok: true };
  }
  function canWork(s, j) {
    if (!j) return false;
    return s.user === "Yönetici" || j.owner === s.user;
  }
  return Object.freeze({ assign, take, machine, canWork, operators });
});
