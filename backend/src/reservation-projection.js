'use strict';
// Ordered event projection only: persistence, provenance validation and locks remain mandatory.
function projectReservations(approved, events) {
 if (!Number.isSafeInteger(approved) || approved < 0 || !Array.isArray(events)) throw Error('INVALID_SNAPSHOT');
 const ids=new Set(),reservations=new Map();let last=0,reserved=0,released=0;
 for(const e of events){
  if(!e||!Number.isSafeInteger(e.sequence)||e.sequence<=last||typeof e.id!=='string'||!e.id||ids.has(e.id)||!Number.isSafeInteger(e.quantity)||e.quantity<=0)throw Error('INVALID_EVENT');
  last=e.sequence;ids.add(e.id);
  if(e.kind==='reserve'){
   if(typeof e.destinationWorkOrderId!=='string'||!e.destinationWorkOrderId)throw Error('INVALID_DESTINATION');
   if(e.quantity>approved-reserved)throw Error('OVER_RESERVATION');
   reservations.set(e.id,{destinationWorkOrderId:e.destinationWorkOrderId,quantity:e.quantity,outstanding:e.quantity});reserved+=e.quantity;
  } else if(e.kind==='release'){
   const r=reservations.get(e.reservationId);if(!r||r.destinationWorkOrderId!==e.destinationWorkOrderId)throw Error('INVALID_PROVENANCE');
   if(e.quantity>r.outstanding)throw Error('OVER_RELEASE');
   r.outstanding-=e.quantity;reserved-=e.quantity;released+=e.quantity;
   if(!Number.isSafeInteger(released))throw Error('INVALID_QUANTITY');
  }else throw Error('INVALID_EVENT');
 }
 return {approved,reserved,released,available:approved-reserved,reservations:[...reservations].map(([id,r])=>({id,...r}))};
}
module.exports={projectReservations};
