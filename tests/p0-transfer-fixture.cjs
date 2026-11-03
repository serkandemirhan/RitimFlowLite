const { completed } = require("./p0-fixtures.cjs");
function fixture() {
  const s = completed({ qty: 250, planned: 150 });
  Object.assign(s.jobs[0], { good: 60, scrap: 3, state: "running" });
  Object.assign(s.jobs[0].ux05, { received: 100, pending: 12 });
  s.jobs.push({
    id: "TARGET",
    order: s.orders[0].id,
    op: 0,
    plannedQty: 25,
    machine: "CNC-02",
    state: "waiting",
    good: 0,
    scrap: 0,
  });
  return s;
}
module.exports = { fixture };
