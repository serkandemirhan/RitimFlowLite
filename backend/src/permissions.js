'use strict';
const MATRIX=Object.freeze({
 superadmin:Object.freeze(['site.read','orders.read','orders.write','master.write','planning.write','production.write','quality.write','stock.write','shipment.write','members.manage','platform.manage']),
 tenant_admin:Object.freeze(['site.read','orders.read','orders.write','master.write','planning.write','production.write','quality.write','stock.write','shipment.write','members.manage']),
 manager:Object.freeze(['site.read','orders.read','orders.write','master.write','planning.write','production.write','quality.write','stock.write','shipment.write']),
 planner:Object.freeze(['site.read','orders.read','planning.write']),
 operator:Object.freeze(['site.read','orders.read','production.write']),
 quality:Object.freeze(['site.read','orders.read','quality.write']),
 logistics:Object.freeze(['site.read','orders.read','stock.write','shipment.write']),
 viewer:Object.freeze(['site.read','orders.read'])
});
function capabilities(roles){return [...new Set(roles.flatMap(role=>MATRIX[role]||[]))].sort();}
module.exports={MATRIX,capabilities};
