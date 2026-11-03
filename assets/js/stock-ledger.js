(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RitimStockLedger = api;
})(globalThis, function () {
  "use strict";
  const sum = (a) => a.reduce((n, r) => n + r.qty, 0);
  const dispositions = (s, o) =>
    (s.supplierDispositions || []).filter((r) => r.order === o);
  const supplierResolved = (s, o, ref) =>
    dispositions(s, o)
      .filter((r) => !ref || r.dispatch === ref)
      .reduce((n, r) => n + (r.kind === "rework" ? r.remaining : r.qty), 0);
  const restocks = (s, o) =>
    (s.returnDispositions || []).filter(
      (r) => r.order === o && ["restock", "rework-restock"].includes(r.kind),
    );
  const compensation = (s, o, op = 0) =>
    sum(
      (s.compensations || []).filter(
        (r) => r.order === o && r.operation === op,
      ),
    );
  const receiptLimit = (s, o) =>
    o.qty +
    compensation(s, o.id) +
    sum((s.materialAuthorizations || []).filter((r) => r.order === o.id));
  return Object.freeze({
    sum,
    dispositions,
    supplierResolved,
    restocks,
    compensation,
    receiptLimit,
  });
});
