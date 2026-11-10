'use strict';
const crypto=require('node:crypto');
const {data,payload,identifier,cmd,scoped,fail}=require('./orders-planning');
const {fileData}=require('./operator-workflow');
function ids(value=[]){if(!Array.isArray(value)||value.length>5||new Set(value).size!==value.length)fail(400,'INVALID_INPUT','En fazla 5 farklı belge ekleyin.');return value.map(identifier)}
async function attach(c,s,movementId,documentIds){
 for(const id of documentIds){const r=await c.query('UPDATE inventory_documents SET movement_id=$4 WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND actor_id=$5 AND movement_id IS NULL RETURNING id',[s.tenantId,s.siteId,id,movementId,s.identity.userId]);if(!r.rowCount)fail(409,'DOCUMENT_UNAVAILABLE','Belge bu mal kabule bağlanamıyor.');}
}
function routes(api){const base='/sites/:tenantId/:siteId/inventory';
 api.post(base+'/documents',{bodyLimit:7500000},async(req,reply)=>{const s=data(req),f=fileData(payload(req)),p={filename:f.filename,sha256:f.sha256};const r=await cmd(req,'inventory.document.add','stock.write',p,async c=>{const id=crypto.randomUUID();await c.query('INSERT INTO inventory_documents(tenant_id,site_id,id,actor_id,filename,mime,content,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[s.tenantId,s.siteId,id,s.identity.userId,f.filename,f.mime,f.content,f.sha256]);return {status:201,body:{id,filename:f.filename,mime:f.mime}}});return reply.code(r.status).send(r.body)});
 api.get(base+'/documents/:documentId',req=>scoped(req,async(c,s)=>{const r=await c.query('SELECT filename,mime,content FROM inventory_documents WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND (movement_id IS NOT NULL OR actor_id=$4)',[s.tenantId,s.siteId,identifier(req.params.documentId),s.identity.userId]);if(!r.rowCount)fail(404,'NOT_FOUND','Belge bulunamadı.');const x=r.rows[0];return {filename:x.filename,mime:x.mime,contentBase64:x.content.toString('base64')}}));
}
module.exports={routes,ids,attach};
