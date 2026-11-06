'use strict';
const {identifier,fail,number}=require('./orders-planning');

// Cursor positions are looked up in the same tenant and site as the result set.
// Counts describe the complete search, independently of the current page.
async function list(c,s,kind,query={}){
 const q=query.q??'',limit=Number(query.limit??50),after=query.after?identifier(query.after):null;
 if(typeof q!=='string'||q.length>120||!Number.isSafeInteger(limit)||limit<1||limit>100)fail(400,'INVALID_INPUT','Invalid search or page size');
 const movement=kind==='movements',type=query.kind||'';
 if(movement&&type&&!['receipt','move','pick','scrap'].includes(type))fail(400,'INVALID_INPUT','Invalid movement kind');
 const args=[s.tenantId,s.siteId,q.trim(),after,limit+1];
 const source=movement?`inventory_movements m JOIN inventory_lots l ON (l.tenant_id,l.site_id,l.id)=(m.tenant_id,m.site_id,m.lot_id) JOIN inventory_materials a ON (a.tenant_id,a.site_id,a.id)=(l.tenant_id,l.site_id,l.material_id) LEFT JOIN inventory_picks p ON (p.tenant_id,p.site_id,p.movement_id)=(m.tenant_id,m.site_id,m.id)`:'inventory_materials m';
 const filter=`m.tenant_id=$1 AND m.site_id=$2 AND strpos(lower(${movement?"concat_ws(' ',a.code,a.description,l.lot_code,m.document_ref)":"concat_ws(' ',m.code,m.description)"}),lower($3))>0`+(movement?' AND ($6=\'\' OR m.kind=$6)':'');
 if(movement)args.push(type);
 const cursor=movement?`(m.occurred_at,m.id)<(SELECT occurred_at,id FROM inventory_movements WHERE tenant_id=$1 AND site_id=$2 AND id=$4)`:`(m.code,m.id)>(SELECT code,id FROM inventory_materials WHERE tenant_id=$1 AND site_id=$2 AND id=$4)`;
 if(after){const exists=await c.query(`SELECT id FROM ${movement?'inventory_movements':'inventory_materials'} WHERE tenant_id=$1 AND site_id=$2 AND id=$3`,[s.tenantId,s.siteId,after]);if(!exists.rowCount)fail(400,'INVALID_INPUT','Cursor unavailable in this site');}
 const columns=movement?`m.id,m.lot_id AS "lotId",l.lot_code AS "lotCode",a.code AS "materialCode",m.kind,m.source_location_id AS "sourceLocationId",m.destination_location_id AS "destinationLocationId",m.quantity_pieces AS quantity,m.document_ref AS "documentRef",m.occurred_at AS "occurredAt",p.order_id AS "orderId",p.work_order_id AS "workOrderId",p.production_lot_id AS "productionLotId",p.reservation_id AS "reservationId"`:`m.id,m.code,m.description,m.base_unit AS "baseUnit",m.lot_tracking AS "lotTracking"`;
 const rows=await c.query(`SELECT ${columns} FROM ${source} WHERE ${filter} AND ($4::uuid IS NULL OR ${cursor}) ORDER BY ${movement?'m.occurred_at DESC,m.id DESC':'m.code,m.id'} LIMIT $5`,args);
 // Parameter positions stay stable for both queries; unused cursor parameters
 // are explicitly typed so PostgreSQL can prepare the count safely.
 const count=await c.query(`SELECT count(*) total FROM ${source} WHERE ${filter} AND ($4::uuid IS NULL OR $4::uuid IS NOT NULL) AND $5::int>0`,args);
 const items=rows.rows.slice(0,limit).map(x=>movement?{...x,quantity:number(x.quantity)}:x);
 return {[kind]:items,total:Number(count.rows[0].total),nextAfter:rows.rows.length>limit?items.at(-1).id:null};
}
module.exports={list};
