'use strict';
const crypto=require('node:crypto');
// Short SSE windows fit the current 30-second serverless limit. Each refresh
// revalidates identity and share authorization in a new transaction.
function routes(api,{base,detail}){
 api.get(base+'/:shareId/events',async(req,reply)=>{
  const first=await detail(req.server.pgPool,req.auth,req.params.shareId);
  reply.hijack();const out=reply.raw;out.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','connection':'keep-alive','x-accel-buffering':'no'});
  let stopped=false,last='',timer;const stop=()=>{stopped=true;clearTimeout(timer);};out.on('close',stop);
  const emit=(event,value)=>{if(!stopped&&!out.destroyed)out.write('event: '+event+'\ndata: '+JSON.stringify(value)+'\n\n');};
  const send=v=>{const hash=crypto.createHash('sha256').update(JSON.stringify(v.order)).digest('hex');if(hash!==last){last=hash;emit('snapshot',v);}else emit('heartbeat',{updatedAt:v.updatedAt});};
  out.write('retry: 1500\n\n');send(first);const until=Date.now()+20000;
  const tick=async()=>{if(stopped)return;try{const v=await detail(req.server.pgPool,req.auth,req.params.shareId);if(stopped)return;send(v);if(Date.now()>=until){out.end();return;}timer=setTimeout(tick,2000);}catch(e){emit(e.statusCode===404||e.statusCode===401?'revoked':'error',{message:'Bağlantı yenilenmeli.'});out.end();}};timer=setTimeout(tick,2000);
 });
}
module.exports={routes};
