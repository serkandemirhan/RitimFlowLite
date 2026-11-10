'use strict';
// Replays an existing successful command; does not create another machine.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async function(h){
 const s=h.state,original=s.steps['machine-CNC-01'];assert(original?.id);
 const before=await h.read('/machine-planning');
 s.recoveryRuntimeProbeId ||= crypto.randomUUID();h.save();const id=s.recoveryRuntimeProbeId;
 const registration=await h.req(h.admin,'/recovery',{id,key:s.prefix+'-machine-CNC-01',command:{kind:'machineCreate',target:'',body:{payload:{code:original.code}}}});
 assert.equal(registration.status,201,JSON.stringify(registration.data));
 const result=await h.req(h.admin,'/recovery/'+id+'/retry',{});
 assert.equal(result.status,201,JSON.stringify(result.data));assert.equal(result.data.id,original.id);
 const ack=await h.req(h.admin,'/recovery/'+id+'/acknowledge',{});assert.equal(ack.status,200);
 const after=await h.read('/machine-planning');assert.equal(after.machines.length,before.machines.length);
 const old=await h.req(h.admin,'/recovery/b7a1c85b-1151-4785-b007-a374746ae1da/retry',{});
 const pending=await h.read('/recovery');
 const evidence={time:new Date().toISOString(),replayStatus:result.status,sameMachine:result.data.id===original.id,machinesBefore:before.machines.length,machinesAfter:after.machines.length,obsoleteMove:{status:old.status,code:old.data.error?.code,recoveryStatus:old.data.recoveryStatus},pending:pending.commands.length};
 s.recoveryRuntimeVerification=evidence;h.save();return evidence;
};
