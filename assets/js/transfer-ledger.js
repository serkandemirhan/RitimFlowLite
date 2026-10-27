/* Read-only physical lots. Existing receipts remain untouched; each job's direct
 * receipts form an explicitly aggregated input lot, never a supplier batch claim. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RitimTransferLedger = api;
})(globalThis, function () {
  "use strict";
  const count = (n) => Number.isSafeInteger(n) && n >= 0;
  const sum = (rows) =>
    rows.reduce((n, r) => n + (count(r?.qty) ? r.qty : 0), 0);
  const rows = (state) =>
    Array.isArray(state?.physicalTransfers)
      ? state.physicalTransfers.filter((t) => t && typeof t === "object")
      : [];
  const active = (t) => t.status !== "reversed";
  const uses = (state) =>
    Array.isArray(state?.physicalLotUses)
      ? state.physicalLotUses.filter((t) => t && typeof t === "object")
      : [];
  const operationRows = (state) =>
    Array.isArray(state?.operationInputs)
      ? state.operationInputs.filter((a) => a && typeof a === "object")
      : [];
  const rawLot = (id) => `INPUT:${id}`;
  function totals(state, id) {
    const all = rows(state);
    return {
      incoming: sum(
        [...all, ...operationRows(state)].filter(
          (t) => t.destination === id && t.status === "accepted",
        ),
      ),
      outgoing: sum(all.filter((t) => t.source === id && active(t))),
      awaiting: sum(
        [...all, ...operationRows(state)].filter(
          (t) => t.destination === id && t.status === "in_transit",
        ),
      ),
      inTransit: sum(
        all.filter((t) => t.source === id && t.status === "in_transit"),
      ),
    };
  }
  function lots(state, j) {
    const x = j.ux05,
      all = rows(state);
    if (!x) return [];
    const direct = x.received - x.legacyBaseline;
    const booked = uses(state).filter((u) => u.job === j.id);
    let consumed = Math.max(
      0,
      j.good +
        j.scrap +
        x.pending +
        x.setup +
        x.rework -
        x.legacyBaseline -
        sum(booked),
    );
    const inputs = [
      { id: rawLot(j.id), qty: direct, origin: "İş emri toplu giriş lotu" },
      ...[
        ...all,
        ...operationRows(state).map((t) => ({
          ...t,
          outputLot: `OPINPUT:${t.id}`,
        })),
      ]
        .filter((t) => t.destination === j.id && t.status === "accepted")
        .map((t) => ({ id: t.outputLot, qty: t.qty, origin: t.id })),
    ];
    return inputs.map((lot) => {
      const reserved = sum(
        all.filter(
          (t) => t.source === j.id && t.inputLot === lot.id && active(t),
        ),
      );
      const remaining =
        lot.qty - reserved - sum(booked.filter((u) => u.lot === lot.id));
      const used = Math.min(consumed, Math.max(0, remaining));
      consumed -= used;
      return {
        ...lot,
        reserved,
        available: Math.max(0, remaining - used),
        valid: count(remaining),
      };
    });
  }
  function issues(state) {
    const all = rows(state),
      result = [],
      ids = new Set();
    if (
      state.physicalTransfers !== undefined &&
      !Array.isArray(state.physicalTransfers)
    )
      return ["Fiziksel transfer defteri okunamıyor."];
    if (
      (state.physicalTransfers || []).some(
        (t) => !t || typeof t !== "object",
      ) ||
      (state.physicalLotUses !== undefined &&
        !Array.isArray(state.physicalLotUses))
    )
      return ["Fiziksel transfer veya lot tüketim kaydı okunamıyor."];
    if (
      (state.physicalLotUses || []).some(
        (u) =>
          !u ||
          typeof u !== "object" ||
          !count(u.qty) ||
          !u.qty ||
          !state.jobs?.some((j) => j.id === u.job),
      )
    )
      return ["Fiziksel lot tüketim bağlantısı doğrulanamıyor."];
    for (const t of all) {
      const a = state.jobs?.find((j) => j.id === t.source),
        b = state.jobs?.find((j) => j.id === t.destination);
      const o = state.orders?.find((o) => o.id === t.order);
      if (
        !a ||
        !b ||
        !o ||
        a === b ||
        a.order !== o.id ||
        b.order !== o.id ||
        a.op !== t.operation ||
        b.op !== t.operation ||
        t.routeKey !== JSON.stringify(o.route) ||
        !Array.isArray(t.history) ||
        t.version !== 1 ||
        !t.id ||
        ids.has(t.id) ||
        t.outputLot !== `TRANSFER:${t.id}` ||
        !count(t.qty) ||
        !t.qty ||
        !["in_transit", "accepted", "reversed"].includes(t.status)
      ) {
        result.push(
          "Fiziksel transfer bağlantısı veya miktarı doğrulanamıyor.",
        );
      }
      ids.add(t.id);
    }
    for (const j of state.jobs || []) {
      const related = [...all, ...operationRows(state)].filter(
        (t) => t.source === j.id || t.destination === j.id,
      );
      if (!related.length) continue;
      const x = j.ux05,
        n = totals(state, j.id);
      const allocated = sum(
        (state.ux06?.[j.order]?.allocations || []).filter(
          (a) => a.job === j.id,
        ),
      );
      const released = sum(
        (state.allocationReleases || []).filter(
          (a) => a.job === j.id && a.order === j.order,
        ),
      );
      if (
        !x ||
        ![
          x.received,
          x.legacyBaseline,
          x.legacyGood,
          j.good,
          j.scrap,
          x.pending,
          x.setup,
          x.rework,
        ].every(count) ||
        (j.op > 0 &&
          (x.received !== 0 || x.legacyBaseline !== 0 || x.legacyGood !== 0)) ||
        x.received < x.legacyBaseline ||
        x.received - x.legacyBaseline > allocated - released ||
        j.good + j.scrap + x.pending + x.setup + x.rework + n.outgoing >
          x.received + n.incoming
      ) {
        result.push(`${j.id}: fiziksel transfer bakiyesi doğrulanamıyor.`);
        continue;
      }
      const inputs = lots(state, j);
      const booked = uses(state).filter((u) => u.job === j.id);
      if (
        booked.some(
          (u) => !count(u.qty) || !u.qty || !inputs.some((l) => l.id === u.lot),
        ) ||
        sum(booked) >
          j.good + j.scrap + x.pending + x.setup + x.rework - x.legacyBaseline
      )
        result.push(`${j.id}: fiziksel lot tüketimi doğrulanamıyor.`);
      if (
        inputs.some((l) => !l.valid) ||
        all
          .filter((t) => t.source === j.id || t.destination === j.id)
          .some(
            (t) =>
              t.source === j.id &&
              active(t) &&
              !inputs.some((l) => l.id === t.inputLot),
          )
      )
        result.push(`${j.id}: transfer giriş lotu doğrulanamıyor.`);
    }
    return [...new Set(result)];
  }
  return Object.freeze({ rows, totals, lots, issues, rawLot, uses });
});
