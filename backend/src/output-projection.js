'use strict';
// Pure B04B-1 projection. This module alone is not an authorization, persistence,
// transaction, reservation or release boundary and is not wired to an API.
function projectOutput({events, decisions, reservations, releases = []}) {
  if (![events, decisions, reservations, releases].every(Array.isArray)) throw Error('INVALID_SNAPSHOT');
  const seen = new Set();
  const unique = (kind, id) => {
    if (typeof id !== 'string' || !id || seen.has(kind + ':' + id)) throw Error('INVALID_IDENTIFIER');
    seen.add(kind + ':' + id);
  };
  const quantity = n => {
    if (!Number.isSafeInteger(n) || n <= 0) throw Error('INVALID_QUANTITY');
    return n;
  };
  const add = (a, b) => {
    const n = a + b;
    if (!Number.isSafeInteger(n)) throw Error('INVALID_QUANTITY');
    return n;
  };
  const byEvent = new Map();
  for (const e of events) {
    if (!e || !['good', 'pending'].includes(e.kind) || typeof e.lotId !== 'string' || !e.lotId || typeof e.workOrderId !== 'string' || !e.workOrderId) throw Error('INVALID_EVENT');
    unique('event', e.id);
    byEvent.set(e.id, { eventId: e.id, lotId: e.lotId, workOrderId: e.workOrderId, kind: e.kind, produced: quantity(e.quantity), approved: 0, rejected: 0, scrap: 0, rework: 0, reserved: 0 });
  }
  for (const d of decisions) {
    if (!d || !['approved', 'rejected', 'scrap', 'rework'].includes(d.outcome)) throw Error('INVALID_DECISION');
    unique('decision', d.id);
    const row = byEvent.get(d.eventId);
    if (!row || row.lotId !== d.lotId || row.workOrderId !== d.workOrderId) throw Error('INVALID_PROVENANCE');
    row[d.outcome] = add(row[d.outcome], quantity(d.quantity));
    if (row.approved + row.rejected + row.scrap + row.rework > row.produced) throw Error('OVER_DISPOSITION');
  }
  const reservationById = new Map();
  for (const r of reservations) {
    if (!r || typeof r.destinationWorkOrderId !== 'string' || !r.destinationWorkOrderId) throw Error('INVALID_RESERVATION');
    unique('reservation', r.id);
    const row = byEvent.get(r.eventId);
    if (!row || row.lotId !== r.lotId || row.workOrderId !== r.workOrderId || row.workOrderId === r.destinationWorkOrderId) throw Error('INVALID_PROVENANCE');
    const n = quantity(r.quantity);
    row.reserved = add(row.reserved, n);
    // Until commands have a durable shared order, fail closed on gross reservations.
    if (row.reserved > row.approved) throw Error('OVER_RESERVATION');
    reservationById.set(r.id, {row, reservation:r, remaining:n});
  }
  for (const release of releases) {
    if (!release || typeof release.reservationId !== 'string') throw Error('INVALID_RELEASE');
    unique('release', release.id);
    const item = reservationById.get(release.reservationId);
    if (!item || item.reservation.eventId !== release.eventId || item.reservation.lotId !== release.lotId || item.reservation.workOrderId !== release.workOrderId || item.reservation.destinationWorkOrderId !== release.destinationWorkOrderId) throw Error('INVALID_PROVENANCE');
    const n = quantity(release.quantity);
    if (n > item.remaining) throw Error('OVER_RELEASE');
    item.remaining -= n;
    item.row.reserved -= n;
  }
  for (const row of byEvent.values()) if (row.reserved > row.approved) throw Error('OVER_RESERVATION');
  return [...byEvent.values()].map(row => ({...row, undisposed: row.produced - row.approved - row.rejected - row.scrap - row.rework, available: row.approved - row.reserved}));
}
module.exports = {projectOutput};
