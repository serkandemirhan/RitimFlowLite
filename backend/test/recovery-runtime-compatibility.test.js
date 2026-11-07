'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
test('nested recovery dispatch works without CommonJS require(ESM) support',()=>{
 const script=`
 const app=require('fastify')();
 app.post('/command',async req=>({key:req.headers['idempotency-key'],quantity:req.body.quantity}));
 app.post('/retry',async(req,reply)=>{
  const result=await app.inject({method:'POST',url:'/command',headers:{'idempotency-key':'original-key'},payload:{quantity:3}});
  return reply.code(result.statusCode).send(result.json());
 });
 (async()=>{try{const r=await app.inject({method:'POST',url:'/retry'});require('node:assert/strict').deepEqual(r.json(),{key:'original-key',quantity:3});}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
 `;
 const result=spawnSync(process.execPath,['--no-experimental-require-module','-e',script],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr||String(result.error));
});
