'use strict';
const crypto=require('node:crypto');
const {number,fail,audit}=require('./orders-planning');
module.exports=async function(c,s,order,p,key){
   const a=await c.query(`SELECT a.quantity_pieces,d.work_order_id source_job,d.output_lot_id,d.lot_id original_input,w.operation_id,w.production_order_id FROM rework_allocations a JOIN output_dispositions d ON (d.tenant_id,d.site_id,d.order_id,d.id)=(a.tenant_id,a.site_id,a.order_id,a.decision_id) JOIN work_orders w ON (w.tenant_id,w.site_id,w.order_id,w.id)=(d.tenant_id,d.site_id,d.order_id,d.work_order_id) WHERE a.tenant_id=$1 AND a.site_id=$2 AND a.order_id=$3 AND a.id=$4 AND d.outcome='rework'`,[s.tenantId,s.siteId,order,p.allocationId]);
   if(!a.rowCount||!a.rows[0].output_lot_id)fail(409,'INVALID_PROVENANCE','Rework allocation provenance missing');
   if((await c.query('SELECT 1 FROM rework_inputs WHERE tenant_id=$1 AND site_id=$2 AND (allocation_id=$3 OR work_order_id=$4)',[s.tenantId,s.siteId,p.allocationId,a.rows[0].source_job])).rowCount)fail(409,'REWORK_CYCLE_UNSUPPORTED','Allocation already bound or further rework cycle unsupported');
   const released=await c.query('SELECT COALESCE(SUM(quantity_pieces),0) n FROM rework_allocation_releases WHERE tenant_id=$1 AND site_id=$2 AND order_id=$3 AND allocation_id=$4',[s.tenantId,s.siteId,order,p.allocationId]),quantity=number(a.rows[0].quantity_pieces)-number(released.rows[0].n);if(quantity<=0)fail(409,'REWORK_QUANTITY_EXCEEDED','No outstanding allocation');
   const job=crypto.randomUUID(),lot=crypto.randomUUID(),id=crypto.randomUUID();
   await c.query('INSERT INTO work_orders(tenant_id,site_id,id,order_id,operation_id,work_order_number,planned_qty,production_order_id,purpose) VALUES($1,$2,$3,$4,$5,$6,$7,$8,\'rework\')',[s.tenantId,s.siteId,job,order,a.rows[0].operation_id,p.workOrderNumber||require('./record-number').recordNumber('TMR'),quantity,a.rows[0].production_order_id]);
   await c.query("INSERT INTO lots(tenant_id,site_id,id,order_id,lot_code,kind,originating_lot_id) VALUES($1,$2,$3,$4,$5,'rework',$6)",[s.tenantId,s.siteId,lot,order,'REWORK-'+lot,a.rows[0].original_input]);
   await c.query('INSERT INTO rework_inputs(tenant_id,site_id,order_id,id,allocation_id,work_order_id,input_lot_id,source_output_lot_id,quantity_pieces,actor_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[s.tenantId,s.siteId,order,id,p.allocationId,job,lot,a.rows[0].output_lot_id,quantity,s.identity.userId,key]);
   await audit(c,s,'rework.input_bound','work_order',job,{...p,inputId:id,inputLotId:lot,sourceOutputLotId:a.rows[0].output_lot_id,quantity});return {status:201,body:{id,workOrderId:job,inputLotId:lot,sourceOutputLotId:a.rows[0].output_lot_id,quantity,executionSupported:true}};
};
