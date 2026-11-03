/* Pure read model. Historical counters are never converted into stock on read. */
(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports
      ? require("./transfer-ledger.js")
      : root.RitimTransferLedger,
    typeof module === "object" && module.exports
      ? require("./operation-ledger.js")
      : root.RitimOperations,
    typeof module === "object" && module.exports ? require("./stock-ledger.js") : root.RitimStockLedger,
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RitimQuantities = api;
})(globalThis, function (T, O, L) {
  "use strict";
  const keys = [
    "receipts",
    "allocations",
    "dispatches",
    "returns",
    "releases",
    "shipments",
    "customerReturns",
    "entries",
  ];
  const count = (n) => Number.isSafeInteger(n) && n >= 0;
  const sum = (rows, key = "qty") =>
    rows.reduce((n, r) => n + (count(r[key]) ? r[key] : 0), 0);
  const readLedger = (state, id) =>
    Object.fromEntries(
      keys.map((k) => [
        k,
        Array.isArray(state.ux06?.[id]?.[k]) ? state.ux06[id][k] : [],
      ]),
    );
  function jobBalance(j, o, state) {
    const transfers = T.totals(state, j.id);
    const x = j.ux05,
      good = Number(j.good) || 0,
      scrap = Number(j.scrap) || 0;
    const directReceived = x ? x.received : good + scrap,
      received = directReceived + transfers.incoming,
      pending = x?.pending || 0,
      setup = x?.setup || 0,
      rework = x?.rework || 0;
    const planned = Math.max(
        0,
        j.plannedQty == null ? Number(o.qty) || 0 : Number(j.plannedQty),
      ),
      used = good + scrap + pending + setup + rework;
    return {
      planned,
      received,
      directReceived,
      transferredIn: transfers.incoming,
      transferredOut: transfers.outgoing,
      inTransit: transfers.inTransit,
      awaitingTransfer: transfers.awaiting,
      good,
      scrap,
      pending,
      setup,
      rework,
      used,
      unprocessed: Math.max(0, received - used - transfers.outgoing),
      unstarted: Math.max(0, planned - received),
      valid:
        [received, good, scrap, pending, setup, rework, planned].every(count) &&
        used + transfers.outgoing <= received,
    };
  }
  function route(o) {
    const operations = (o.route || []).map((r) =>
      typeof r === "string"
        ? {
            name: r,
            type: /^(Kaplama|Fason|Dış işlem)$/iu.test(r.trim())
              ? "external"
              : "internal",
          }
        : { name: r.name, type: r.type },
    );
    const supported =
      operations.length > 0 &&
      operations.every(
        (r, i) =>
          r.type === "internal" ||
          (r.type === "external" && i === operations.length - 1 && i > 0),
      );
    return {
      operations,
      key: JSON.stringify(operations),
      external: operations.some((r) => r.type === "external"),
      supported,
      terminal: operations.length - 1,
    };
  }
  function operationProof(state, o) {
    return O.project(state, o, jobBalance, route, T.issues(state));
  }
  function productionSources(state, o, closed = false, operation) {
    const r = route(o),
      p = operationProof(state, o),
      op = operation ?? (r.external ? r.terminal - 1 : r.terminal);
    return p.issues.length
      ? []
      : (closed ? p.closedStages[op] : p.stages[op]) || [];
  }
  function orderQuantities(state, o) {
    const d = readLedger(state, o.id),
      r = route(o),
      sources = productionSources(state, o),
      closedSources = productionSources(state, o, true);
    const material = sum(d.receipts),
      allocated = O.allocation(state, o.id),
      dispatched = sum(d.dispatches),
      returned = sum(d.returns),
      recordedApproved = sum(d.releases),
      shipped = sum(d.shipments),
      customerReturn = sum(d.customerReturns.filter(r=>r.status!=='reversed'));
    const verified = sum(sources),
      closedGood = sum(closedSources),
      sourceMap = new Map(
        (r.external ? sources : closedSources).map((s) => [s.job, s.qty]),
      );
    const consumed = new Map();
    let dispatchProofValid = true;
    for (const dispatch of d.dispatches) {
      if (
        dispatch.version !== 1 ||
        dispatch.routeKey !== r.key ||
        dispatch.operation !== r.terminal ||
        !Array.isArray(dispatch.sources) ||
        sum(dispatch.sources) !== dispatch.qty
      ) {
        dispatchProofValid = false;
        continue;
      }
      for (const s of dispatch.sources) {
        const n = (consumed.get(s.job) || 0) + s.qty;
        consumed.set(s.job, n);
        if (!count(s.qty) || n > (sourceMap.get(s.job) || 0))
          dispatchProofValid = false;
      }
    }
    const restocks=L.restocks(state,o.id),restockQty=L.sum(restocks);
    const baseEligible = r.supported
      ? r.external
        ? dispatchProofValid
          ? returned
          : 0
        : Math.min(allocated, closedGood)
      : 0;
    const eligible=baseEligible+restockQty;
    const issues = operationProof(state, o).issues;
    if (
      r.supported &&
      r.terminal > 0 &&
      (r.external ? r.terminal - 1 : r.terminal) > 0 &&
      !sources.some((s) => s.qty > 0)
    )
      issues.push(
        "Son iç operasyonun kabul edilmiş aktarım girdisi ve üretim kanıtı henüz yok.",
      );
    if (!r.external && dispatched > 0)
      issues.push(
        "Mevcut fason hareketleri sipariş rotasıyla uyuşmuyor; final onay ve sevkiyat kapalı.",
      );
    if (!r.supported)
      issues.push(
        "Bu rota için operasyonlar arası tamamlanma ve fiziksel aktarım kanıtı yok; final onay ve sevkiyat kapalı.",
      );
    if (r.external && !dispatchProofValid)
      issues.push(
        "Fason geçmişinin operasyon/üretim kaynağı doğrulanamıyor; kayıtlar korunuyor.",
      );
    const releaseSources = r.external
      ? d.dispatches.map((a) => ({
          dispatch: a.ref,
          qty: sum(d.returns.filter((b) => b.dispatch === a.ref)),
        }))
      : closedSources;
    const sourceKey = r.external ? "dispatch" : "job",
      releaseCaps = new Map(releaseSources.map((a) => [a[sourceKey], a.qty])),
      releaseUsed = new Map();
    const releaseIds = new Set(), returnUsed=new Map();
    let invalidRelease = false;
    for (const a of d.releases) {
      if (
        a.version !== 1 ||
        a.routeKey !== r.key ||
        a.operation !== r.terminal ||
        a.user !== "Yönetici" ||
        !a.id ||
        releaseIds.has(a.id) ||
        !Array.isArray(a.sources) ||
        sum(a.sources) !== a.qty
      ) {
        invalidRelease = true;
        continue;
      }
      releaseIds.add(a.id);
      if(a.kind==='return-restock'){
        for(const source of a.sources){const caseId=source.return,cap=sum(restocks.filter(d=>d.caseId===caseId)),used=(returnUsed.get(caseId)||0)+source.qty;returnUsed.set(caseId,used);const claim=d.customerReturns.find(r=>r.id===caseId&&r.status!=='reversed');if(!claim||!count(source.qty)||used>cap||cap>claim.qty)invalidRelease=true;}
        continue;
      }
      for (const source of a.sources) {
        const id = source[sourceKey],
          used = (releaseUsed.get(id) || 0) + source.qty;
        releaseUsed.set(id, used);
        if (!count(source.qty) || used > (releaseCaps.get(id) || 0))
          invalidRelease = true;
      }
    }
    if (invalidRelease)
      issues.push(
        "Önceki final onaylarının operasyon kanıtı yok; otomatik stok dönüşümü yapılmadı.",
      );
    if (recordedApproved > eligible)
      issues.push("Final onayları tamamlanan son operasyon miktarını aşıyor.");
    const malformed = keys
      .filter((k) => k !== "entries")
      .some((k) => d[k].some((a) => !count(a.qty) || a.qty === 0));
    const danglingReturn =
      d.returns.some((a) => !d.dispatches.some((s) => s.ref === a.dispatch)) ||
      d.customerReturns.some(
        (a) => !d.shipments.some((s) => s.ref === a.shipment),
      );
    const overReturn =
      d.dispatches.some(
        (s) => sum(d.returns.filter((a) => a.dispatch === s.ref)) + L.supplierResolved(state,o.id,s.ref) > s.qty,
      ) ||
      d.shipments.some(
        (s) =>
          sum(d.customerReturns.filter((a) => a.shipment === s.ref && a.status!=='reversed')) > s.qty,
      );
    if (
      malformed ||
      danglingReturn ||
      overReturn ||
      returned > dispatched ||
      allocated > material ||
      customerReturn > shipped
    )
      issues.push("Hareket miktarları veya belge bağlantıları doğrulanamıyor.");
    const approved = invalidRelease ? 0 : Math.min(recordedApproved, eligible);
    if (shipped > approved)
      issues.push(
        "Kayıtlı müşteri sevkiyatı doğrulanmış final onayını aşıyor; geçmiş korundu.",
      );
    const approvalUsed = new Map(),
      approvalCaps = new Map(d.releases.map((a) => [a.id, a.qty]));
    let invalidShipment = false;
    for (const a of d.shipments) {
      if (
        a.version !== 1 ||
        a.routeKey !== r.key ||
        a.operation !== r.terminal ||
        !Array.isArray(a.approvals) ||
        sum(a.approvals) !== a.qty
      ) {
        invalidShipment = true;
        continue;
      }
      for (const proof of a.approvals) {
        const used = (approvalUsed.get(proof.release) || 0) + proof.qty;
        approvalUsed.set(proof.release, used);
        if (
          !count(proof.qty) ||
          !approvalCaps.has(proof.release) ||
          used > approvalCaps.get(proof.release)
        )
          invalidShipment = true;
      }
    }
    if (invalidShipment)
      issues.push(
        "Önceki sevkiyatın final onay bağlantısı doğrulanamıyor; geçmiş korundu.",
      );
    const blocked = issues.length > 0,
      ready = blocked ? 0 : Math.max(0, approved - shipped),
      net = shipped - customerReturn;
    const legacyShipments = (state.shipments || []).filter((s) =>
      (state.jobs || []).some((j) => j.id === s.job && j.order === o.id),
    );
    return {
      d,
      route: r,
      sources,
      closedSources,
      releaseSources,
      material,
      allocated,
      materialFree: material - allocated,
      dispatchable: allocated - dispatched,
      dispatched,
      returned,
      supplierOpen: dispatched - returned - L.supplierResolved(state,o.id),
      returnUnapproved: Math.max(0, eligible - recordedApproved),
      recordedApproved,
      approved,
      ready,
      shipped,
      customerReturn,
      net,
      verified,
      closedGood,
      eligible,
      blocked,
      issues,
      releaseAvailable: blocked ? 0 : Math.max(0, eligible - recordedApproved),
      dispatchAvailable:
        r.supported && r.external
          ? Math.max(0, Math.min(allocated, verified) - dispatched)
          : 0,
      shipAvailable: blocked ? 0 : Math.max(0, Math.min(ready, o.qty - net)),
      percent: o.qty > 0 ? Math.max(0, Math.min(100, (net / o.qty) * 100)) : 0,
      complete: o.qty > 0 && net === o.qty,
      status:
        o.qty > 0 && net === o.qty
          ? "complete"
          : net > 0
            ? "partial"
            : (state.jobs || []).some(
                  (j) => j.order === o.id && j.state === "running",
                )
              ? "running"
              : "waiting",
      historical: { legacyShipments, legacyShipped: sum(legacyShipments) },
    };
  }
  function jobPhysicalStock(state, j, o) {
    const x = orderQuantities(state, o);
    const verified =
      productionSources(state, o, false, j.op).find((s) => s.job === j.id)
        ?.qty || 0;
    let departed = x.d.dispatches.reduce(
      (n, d) => n + sum((d.sources || []).filter((s) => s.job === j.id)),
      0,
    );
    departed += O.sum(
      O.rows(state).filter(
        (r) =>
          r.source === j.id && ["in_transit", "accepted"].includes(r.status),
      ),
    );
    for (const release of x.d.releases) {
      let shipped = x.d.shipments.reduce(
        (n, s) =>
          n + sum((s.approvals || []).filter((a) => a.release === release.id)),
        0,
      );
      for (const source of release.sources || []) {
        const take = Math.min(shipped, source.qty);
        if (source.job === j.id) departed += take;
        shipped -= take;
      }
    }
    return {
      cumulativeGood: j.good,
      verifiedGood: verified,
      onHandGood: x.blocked ? null : Math.max(0, verified - departed),
      departedGood: departed,
    };
  }
  function summary(state, o) {
    const x = orderQuantities(state, o);
    // These are shipment dispositions, not invented physical stage locations.
    const buckets = [
      { name: "Sevk Bekleyen", qty: Math.max(0, o.qty - x.net - x.ready) },
      { name: "Sevke Hazır", qty: x.ready },
      { name: "Sevk Edildi", qty: x.net },
    ].filter((b) => b.qty > 0);
    return { ...x, buckets, shipped: x.net, percent: x.percent };
  }
  return Object.freeze({
    keys,
    count,
    sum,
    readLedger,
    jobBalance,
    jobPhysicalStock,
    route,
    productionSources,
    operationProof,
    allocation: O.allocation,
    compensation: L.compensation,
    receiptLimit: L.receiptLimit,
    orderQuantities,
    summary,
  });
});
