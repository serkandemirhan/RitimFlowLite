'use strict';
const {audit,fail}=require('./orders-planning');
async function latest(c,s,job){return (await c.query(`SELECT id,occurred_at,payload,ritim_audit_actor_name(tenant_id,site_id,id) actor_name FROM audit_events
 WHERE tenant_id=$1 AND site_id=$2 AND entity_type='work_order' AND entity_id=$3 AND event_type='production.quality_skipped'
 ORDER BY occurred_at DESC,id DESC LIMIT 1`,[s.tenantId,s.siteId,job])).rows[0]||null;}
async function assertActive(c,s,job){if(await latest(c,s,job))fail(409,'QUALITY_CONTROL_CANCELLED','İş emri operatör tarafından kalite kontrolü atlanarak kapatıldı. Bekleyen kontrol görevi iptal edildi.');}
async function record(c,s,job,quality,reason){
 const events=quality.rows.filter(x=>x.undisposed>0).map(x=>({eventId:x.eventId,quantity:x.undisposed})),quantity=events.reduce((n,e)=>n+e.quantity,0);
 if(!quantity)fail(409,'QUALITY_SKIP_UNAVAILABLE','Atlanacak bekleyen kalite kontrolü kalmadı. İş bilgilerini yenileyin.');
 const message='İş emri operatör tarafından kapatıldı; kalite kontrolü atlandı ve bekleyen kontrol görevleri iptal edildi.';
 await audit(c,s,'production.quality_skipped','work_order',job,{reason,message,quantity,events});
 await audit(c,s,'operator.lifecycle','work_order',job,{state:'completed_without_quality',message,quantity,reason});
 return quantity;
}
module.exports={latest,assertActive,record};
