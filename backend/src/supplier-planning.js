'use strict';
const {number,fail}=require('./orders-planning');

async function lanes(c,s){
 const rows=(await c.query(`SELECT w.id,w.production_order_id,w.work_order_number,w.status,w.planned_qty,
 op.name operation,o.order_number,o.customer,COALESCE(i.part_name,o.part_name) part_name,
 e.id dispatch_id,e.supplier_id,su.name supplier_name,su.code supplier_code,e.quantity,
 e.expected_return_date::text expected_return_date,
 COALESCE((SELECT SUM(r.quantity) FROM production_supplier_events r WHERE
 (r.tenant_id,r.site_id,r.dispatch_id)=(e.tenant_id,e.site_id,e.id) AND r.kind='return'),0) returned
 FROM work_orders w
 JOIN operations op ON (op.tenant_id,op.site_id,op.id)=(w.tenant_id,w.site_id,w.operation_id)
 JOIN orders o ON (o.tenant_id,o.site_id,o.id)=(w.tenant_id,w.site_id,w.order_id)
 JOIN production_orders p ON (p.tenant_id,p.site_id,p.id)=(w.tenant_id,w.site_id,w.production_order_id)
 LEFT JOIN order_items i ON (i.tenant_id,i.site_id,i.id)=(p.tenant_id,p.site_id,p.order_item_id)
 LEFT JOIN production_supplier_events e ON (e.tenant_id,e.site_id,e.work_order_id)=(w.tenant_id,w.site_id,w.id) AND e.kind='dispatch'
 LEFT JOIN outsourcing_suppliers su ON (su.tenant_id,su.site_id,su.id)=(e.tenant_id,e.site_id,e.supplier_id)
 WHERE w.tenant_id=$1 AND w.site_id=$2 AND op.kind='external' AND o.status='open'
 AND w.status NOT IN ('complete','cancelled') ORDER BY w.id,e.created_at,e.id LIMIT 4001`,[s.tenantId,s.siteId])).rows;
 if(rows.length>4000)fail(409,'BOARD_LIMIT','Fason planlama panosu kayıt sınırını aşıyor');
 return group(rows);
}
function group(rows){
 const jobs=new Map(),lanes=new Map();
 function add(id,name,job){if(!lanes.has(id))lanes.set(id,{id,name,kind:'supplier',jobs:[]});lanes.get(id).jobs.push(job)}
 for(const r of rows){
  if(!jobs.has(r.id))jobs.set(r.id,{row:r,dispatched:0,returned:0});
  const job=jobs.get(r.id);if(!r.dispatch_id)continue;
  const quantity=number(r.quantity),returned=number(r.returned),outstanding=number(quantity-returned);
  job.dispatched+=quantity;job.returned+=returned;
  if(outstanding>0)add(r.supplier_id,r.supplier_name,card(r,{key:r.dispatch_id,quantity:outstanding,expectedReturnDate:r.expected_return_date,state:'outside'}));
 }
 for(const {row:r,dispatched,returned} of jobs.values()){
  const remaining=number(number(r.planned_qty)-dispatched);
  if(remaining>0)add('pending','Fasona gönderilecek',card(r,{key:r.id+'-pending',quantity:remaining,state:'pending'}));
  if(returned>0)add('returned','Fasondan dönen',card(r,{key:r.id+'-returned',quantity:returned,state:'returned'}));
 }
 return [...lanes.values()].sort((a,b)=>a.name.localeCompare(b.name,'tr'));
}
function card(r,extra){return {id:r.id,productionOrderId:r.production_order_id,number:r.work_order_number,partName:r.part_name,orderNumber:r.order_number,customer:r.customer,operation:r.operation,status:r.status,...extra}}
module.exports={lanes,group};
