/* Pure operation-input reservation and provenance projection. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RitimOperations = api;
})(globalThis, function () {
  "use strict";
  const count = (n) => Number.isSafeInteger(n) && n >= 0;
  const rows = (s) =>
    Array.isArray(s?.operationInputs)
      ? s.operationInputs.filter((a) => a && typeof a === "object")
      : [];
  const active = (r) => r.status !== "cancelled";
  const sum = (a) => a.reduce((n, r) => n + (count(r.qty) ? r.qty : 0), 0);
  const reserved = (s, id) =>
    sum(rows(s).filter((r) => r.source === id && active(r)));
  const incoming = (s, id, status) =>
    sum(rows(s).filter((r) => r.destination === id && r.status === status));
  const allocation = (s, o, id) =>
    sum((s.ux06?.[o]?.allocations || []).filter((a) => !id || a.job === id)) -
    sum(
      (s.allocationReleases || []).filter(
        (a) => a.order === o && (!id || a.job === id),
      ),
    );
  function project(s, o, balance, route, transferIssues) {
    const r = route(o),
      issues = [...transferIssues],
      stages = [],
      closedStages = [];
    if (s.operationInputs !== undefined && !Array.isArray(s.operationInputs))
      issues.push("Operasyon girdi defteri okunamıyor.");
    if (
      Array.isArray(s.operationInputs) &&
      s.operationInputs.some((a) => !a || typeof a !== "object")
    )
      issues.push("Operasyon girdi kaydı okunamıyor.");
    const jobIds = new Set(
      s.jobs.filter((j) => j.order === o.id).map((j) => j.id),
    );
    const inputs = rows(s).filter(
        (a) =>
          a.order === o.id || jobIds.has(a.source) || jobIds.has(a.destination),
      ),
      ids = new Set();
    for (const a of inputs) {
      const src = s.jobs.find((j) => j.id === a.source),
        dst = s.jobs.find((j) => j.id === a.destination);
      if (
        a.order !== o.id ||
        a.inputLot !== `GOOD:${a.source}` ||
        !src ||
        !dst ||
        src.order !== o.id ||
        dst.order !== o.id ||
        src.op + 1 !== dst.op ||
        a.operation !== dst.op ||
        a.routeKey !== r.key ||
        a.version !== 1 ||
        !a.id ||
        ids.has(a.id) ||
        !count(a.qty) ||
        !a.qty ||
        !["reserved", "in_transit", "accepted", "cancelled"].includes(
          a.status,
        ) ||
        !Array.isArray(a.history)
      )
        issues.push(
          "Operasyon girdisinin kaynak, rota veya miktar bağlantısı doğrulanamıyor.",
        );
      ids.add(a.id);
    }
    for (let op = 0; op < r.operations.length; op++) {
      if (r.operations[op].type !== "internal") {
        stages[op] = [];
        closedStages[op] = [];
        continue;
      }
      const previous = new Map(
        (closedStages[op - 1] || []).map((a) => [a.job, a.qty]),
      );
      const demand = new Map();
      for (const a of inputs.filter((a) => a.operation === op && active(a))) {
        demand.set(a.source, (demand.get(a.source) || 0) + a.qty);
      }
      for (const [source, qty] of demand)
        if (qty > (previous.get(source) || 0))
          issues.push(
            "Operasyon rezervasyonu önceki tamamlanmış sağlam çıktıyı aşıyor.",
          );
      stages[op] = [];
      closedStages[op] = [];
      for (const j of s.jobs.filter((j) => j.order === o.id && j.op === op)) {
        const x = j.ux05,
          b = balance(j, o, s);
        if (j.planningVersion === 1 && j.routeKey !== r.key)
          issues.push(
            "İş emri planının rotası değişmiş; plan yeniden doğrulanmalı.",
          );
        if (
          sum(inputs.filter((a) => a.destination === j.id && active(a))) >
          b.planned
        )
          issues.push(
            "Ayrılan operasyon girdisi hedef iş emri planını aşıyor.",
          );
        if (
          !x ||
          !b.valid ||
          !count(x.legacyGood) ||
          !count(x.legacyBaseline) ||
          x.legacyGood > b.good
        )
          continue;
        const direct = b.directReceived - x.legacyBaseline,
          available = b.received - x.legacyBaseline - b.transferredOut;
        if (
          !count(direct) ||
          !count(available) ||
          direct > allocation(s, o.id, j.id)
        )
          continue;
        if (
          op > 0 &&
          (direct !== 0 || x.legacyBaseline !== 0 || x.legacyGood !== 0)
        )
          continue;
        // Downstream production must fit accepted adjacent-operation inputs (including same-step transfers).
        if (op > 0 && b.received === 0) continue;
        const source = {
          job: j.id,
          qty: Math.min(b.good - x.legacyGood, available),
        };
        stages[op].push(source);
        if (
          ["complete", "shipped"].includes(j.state) &&
          !b.unprocessed &&
          !b.unstarted &&
          !b.pending &&
          !b.rework &&
          !x.handover
        )
          closedStages[op].push(source);
      }
    }
    return { stages, closedStages, issues: [...new Set(issues)] };
  }
  return Object.freeze({
    rows,
    active,
    sum,
    reserved,
    incoming,
    allocation,
    project,
  });
});
