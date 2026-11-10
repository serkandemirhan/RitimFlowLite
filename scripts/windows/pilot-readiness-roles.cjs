'use strict';
const fs=require('fs'),path=require('path');
module.exports=async h=>{
 const accounts=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'RitimFlowLite/cloud/pilot-test-accounts.json')));
 for(const role of ['operator','quality']){
  const p=await h.pages.admin.context().browser().newPage({viewport:{width:1440,height:1000},locale:'tr-TR'});
  await p.goto('https://flow.getritim.com/auth/login');await p.locator('[name=email]').fill(accounts[role].email);await p.locator('[name=password]').fill(accounts[role].password);await p.getByRole('button',{name:'Giriş yap',exact:true}).click();await p.waitForURL(u=>u.pathname==='/');
  const session=(await h.raw(p,'/api/v1/session')).data;h.state[role+'Id']=session.identity.id;h.pages[role+'Desktop']=p;
  h.check(role+' login desktop','PASS','Ayrı rol hesabıyla giriş; yalnızca pilot test çalışma alanı.','Desktop UI login + session assertion');
 }
 h.save();return {operatorId:h.state.operatorId,qualityId:h.state.qualityId};
};
