'use strict';
const {fail}=require('./orders-planning');
const {stockNumber:n}=require('./material-stock');
// Historical unclassified debits retain their previous approved-stock treatment.
// New scrap/returns explicitly attribute the removed quantity, without changing history.
const projection=`SELECT l.id,l.incoming_quality_required required,
 COALESCE((SELECT SUM(CASE WHEN m.destination_location_id IS NOT NULL THEN m.quantity_pieces ELSE 0 END)-SUM(CASE WHEN m.source_location_id IS NOT NULL THEN m.quantity_pieces ELSE 0 END) FROM inventory_movements m WHERE (m.tenant_id,m.site_id,m.lot_id)=(l.tenant_id,l.site_id,l.id)),0) physical,
 COALESCE((SELECT SUM(quantity) FROM inventory_lot_inspections i WHERE (i.tenant_id,i.site_id,i.lot_id)=(l.tenant_id,l.site_id,l.id) AND outcome='approved'),0) approved,
 COALESCE((SELECT SUM(quantity) FROM inventory_lot_inspections i WHERE (i.tenant_id,i.site_id,i.lot_id)=(l.tenant_id,l.site_id,l.id) AND outcome='rejected'),0) rejected,
 COALESCE((SELECT SUM(r.quantity) FROM raw_material_returns r JOIN raw_material_issues i ON (i.tenant_id,i.site_id,i.id)=(r.tenant_id,r.site_id,r.issue_id) WHERE (i.tenant_id,i.site_id,i.lot_id)=(l.tenant_id,l.site_id,l.id)),0) returned,
 COALESCE((SELECT SUM(CASE WHEN d.restore THEN -d.approved ELSE COALESCE(d.approved,m.quantity_pieces) END) FROM inventory_movements m LEFT JOIN inventory_quality_debits d ON (d.tenant_id,d.site_id,d.movement_id)=(m.tenant_id,m.site_id,m.id) WHERE (m.tenant_id,m.site_id,m.lot_id)=(l.tenant_id,l.site_id,l.id) AND (m.kind IN ('pick','scrap') OR d.restore)),0) used_approved,
 COALESCE((SELECT SUM(CASE WHEN d.restore THEN -d.rejected ELSE d.rejected END) FROM inventory_quality_debits d JOIN inventory_movements m ON (m.tenant_id,m.site_id,m.id)=(d.tenant_id,d.site_id,d.movement_id) WHERE (m.tenant_id,m.site_id,m.lot_id)=(l.tenant_id,l.site_id,l.id)),0) used_rejected
 FROM inventory_lots l WHERE l.tenant_id=$1 AND l.site_id=$2 AND ($3::uuid[] IS NULL OR l.id=ANY($3::uuid[]))`;
async function states(c,s,lotIds){
 const rows=(await c.query(projection,[s.tenantId,s.siteId,lotIds])).rows;
 return Object.fromEntries(rows.map(r=>{
 if(!r)fail(404,'NOT_FOUND','LOT bulunamadı');
 const physical=n(r.physical),approved=r.required?n(Math.max(0,Number(r.approved)+Number(r.returned)-Number(r.used_approved))):physical,rejected=r.required?n(Math.max(0,Number(r.rejected)-Number(r.used_rejected))):0;
 return [r.id,{physical,available:Math.min(physical,approved),rejected:Math.min(physical,rejected),pending:n(Math.max(0,physical-approved-rejected)),qualityRequired:r.required}];}));
}
async function state(c,s,id){const r=(await states(c,s,[id]))[id];if(!r)fail(404,'NOT_FOUND','LOT bulunamadı');return r;}
function attribution(v,quantity,source){
 const buckets={approved:v.available,rejected:v.rejected,pending:v.pending};
 if(!source){const nonempty=Object.keys(buckets).filter(k=>buckets[k]>0);if(nonempty.length!==1)fail(409,'QUALITY_SOURCE_REQUIRED','LOT birden fazla kalite durumunda. Çıkışın hangi miktardan yapılacağını seçin.');source=nonempty[0]}
 if(!Object.hasOwn(buckets,source))fail(400,'INVALID_INPUT','Geçerli kalite durumu seçin');
 if(quantity>buckets[source])fail(409,'QUALITY_QUANTITY_EXCEEDED','Seçilen kalite durumundaki miktar yetersiz');
 return {approved:0,rejected:0,pending:0,[source]:quantity};
}
async function record(c,s,movementId,quantities,restore=false){await c.query('INSERT INTO inventory_quality_debits(tenant_id,site_id,movement_id,approved,rejected,pending,restore) VALUES($1,$2,$3,$4,$5,$6,$7)',[s.tenantId,s.siteId,movementId,quantities.approved,quantities.rejected,quantities.pending,restore])}
module.exports={projection,state,states,attribution,record};
