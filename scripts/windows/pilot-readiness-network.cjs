'use strict';
const assert=require('node:assert/strict');
module.exports=async h=>{
 const p=h.pages.operatorDesktop,j=h.state.queueEvidence.jobs[0],base=j.base;
 await h.navigate('operatorDesktop','operator');await p.evaluate(id=>RitimPremiumAPI.openAssigned(id),j.id);await h.idle(p);
 await p.getByRole('button',{name:'İşi başlat',exact:true}).click();await p.locator('#api-production-qty').waitFor();
 await p.locator('#api-production-qty').fill('1');
 await p.context().setOffline(true);
 try{await p.getByRole('button',{name:'Üretim gir',exact:true}).click();await p.getByText(/Bağlantı yok/).first().waitFor({timeout:10000});await h.shot('19-offline-production','operatorDesktop');}
 finally{await p.context().setOffline(false);}
 assert.equal((await h.read(base+'/production/balances','operatorDesktop')).consumedQuantity,0);
 h.check('Baglanti yokken uretim','PASS','Masaüstü tarayıcısı çevrimdışı yapıldı; üretim yazılmadı ve kullanıcıya bağlantı uyarısı verildi. Fiziksel Wi-Fi kesme testi değildir.','Desktop browser offline simulation + API');
 let intercepted=false;
 await p.route('**/production/results',async route=>{intercepted=true;await route.fetch();await route.abort('failed')},{times:1});
 await p.getByRole('button',{name:'Üretim gir',exact:true}).click();
 await p.getByRole('button',{name:/Aynı işlemle tekrar dene/}).waitFor({timeout:20000});
 assert(intercepted);assert.equal((await h.read(base+'/production/balances')).consumedQuantity,1);
 await h.shot('20-response-lost','operatorDesktop');
 await p.getByRole('button',{name:/Aynı işlemle tekrar dene/}).click();
 await p.getByRole('button',{name:/Aynı işlemle tekrar dene/}).waitFor({state:'hidden',timeout:20000});
 assert.equal((await h.read(base+'/production/balances')).consumedQuantity,1);
 await h.shot('21-retry-once','operatorDesktop');
 h.check('Sunucu kaydetti yanit kayboldu tekrar dene','PASS','Gerçek sunucuya 1 adet kaydedildi, tarayıcıya yanıt yapay olarak kesildi. Aynı işlemle tekrar dene sonrasında toplam yine 1.','Desktop UI + intercepted response + API');
 return 'network scenarios complete';
};
