'use strict';
const {identifier,fail}=require('./orders-planning');
function ids(value){
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||value.length>5)fail(400,'INVALID_INPUT','En fazla 5 belge seçin.');
 const result=value.map(identifier);
 if(new Set(result).size!==result.length)fail(400,'INVALID_INPUT','Aynı belge bir kez seçilebilir.');
 return result;
}
async function link(c,s,job,decision,documents=[]){
 for(const document of documents){
  const r=await c.query("SELECT 1 FROM work_documents WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND work_order_id=$4 AND context='quality'",[s.tenantId,s.siteId,document,job]);
  if(!r.rowCount)fail(409,'DOCUMENT_UNAVAILABLE','Belge bu işe ait değil veya silinmiş. Belge listesini yenileyin.');
  await c.query('INSERT INTO quality_document_links(tenant_id,site_id,decision_id,document_id) VALUES($1,$2,$3,$4)',[s.tenantId,s.siteId,decision,document]);
 }
}
// Alias is supplied only by the source code, never by a request.
function projection(alias){return `COALESCE((SELECT jsonb_agg(jsonb_build_object('id',doc.id,'filename',doc.filename) ORDER BY doc.created_at,doc.id) FROM quality_document_links l JOIN work_documents doc ON (doc.tenant_id,doc.site_id,doc.id)=(l.tenant_id,l.site_id,l.document_id) WHERE (l.tenant_id,l.site_id,l.decision_id)=(${alias}.tenant_id,${alias}.site_id,${alias}.id)),'[]'::jsonb)`}
module.exports={ids,link,projection};
