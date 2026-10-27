(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RitimDrawings = api;
})(globalThis, function () {
  "use strict";
  const fail = (message) => ({ ok: false, message });
  const list = (s, id) =>
    (s.drawingVersions || []).filter((v) => v.order === id);
  const current = (s, id) => list(s, id).at(-1);
  function add(s, { order: id, revision, reason, url, name } = {}) {
    const o = s.orders.find((o) => o.id === id);
    if (!o || s.user !== "Yönetici")
      return fail("Çizim revizyonu için yönetici gerekli");
    if (!revision?.trim() || !reason?.trim())
      return fail("Revizyon adı ve değişiklik gerekçesi gerekli");
    if (!/^data:(application\/pdf|image\/(png|jpeg));base64,/.test(url || ""))
      return fail("PDF, PNG veya JPEG çizim seçin");
    if (
      list(s, id).some((v) => v.revision === revision.trim()) ||
      (!list(s, id).length && o.revision === revision.trim())
    )
      return fail("Revizyon adı zaten kullanılmış");
    const versions = (s.drawingVersions ??= []);
    if (!list(s, id).length)
      versions.push({
        id: `DRAW:${id}:0`,
        order: id,
        revision: o.revision,
        url: o.drawing || "teknikResim.pdf",
        name: "Önceki çizim",
        reason: "İlk revizyon öncesi korunan mevcut çizim",
        legacy: true,
      });
    const v = {
      id: `DRAW:${id}:${list(s, id).length}`,
      order: id,
      revision: revision.trim(),
      url,
      name,
      reason: reason.trim(),
      user: s.user,
      time: new Date().toISOString(),
      approved: true,
    };
    versions.push(v);
    o.drawing = url;
    o.revision = v.revision;
    return { ok: true, entry: v };
  }
  function acknowledge(s, { job: id } = {}) {
    const j = s.jobs.find((j) => j.id === id),
      v = j && current(s, j.order);
    if (!j || !v) return fail("Onaylanacak revizyon yok");
    if (j.owner && j.owner !== s.user && s.user !== "Yönetici")
      return fail("İşin operatörü revizyonu onaylamalı");
    if (
      (j.drawingAcknowledgements || []).some(
        (a) => a.revision === v.id && a.user === s.user,
      )
    )
      return fail("Revizyon zaten onaylandı");
    (j.drawingAcknowledgements ??= []).push({
      revision: v.id,
      user: s.user,
      time: new Date().toISOString(),
    });
    return { ok: true };
  }
  function acknowledged(s, j) {
    const v = current(s, j.order);
    return (
      !v ||
      (j.drawingAcknowledgements || []).some(
        (a) => a.revision === v.id && a.user === s.user,
      )
    );
  }
  return Object.freeze({ list, current, add, acknowledge, acknowledged });
});
