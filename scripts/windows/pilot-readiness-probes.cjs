'use strict';
const assert=require('node:assert/strict');
module.exports=async h=>{
 const s=h.state,j=s.po.workOrders[0],base='/orders/'+s.orderId+'/work-orders/'+j.id;
 async function probe(name,fn){try{const detail=await fn();h.check(name,'PASS',detail)}catch(e){h.check(name,'FAIL',e.message)}}
 await probe('Firma izolasyonu',async()=>{for(const [t,z]of [['9b886fbe-f3f6-42fa-adde-1ac912c7c0e6','de331d45-614c-467c-8cab-5c9e57099789'],['af2f6ce8-7fae-4f05-b059-952f9709453c','2e0dad87-32c0-4025-b44e-eec696972382']]){const r=await h.raw(h.pages.admin,'/api/v1/sites/'+t+'/'+z+'/orders');assert.equal(r.status,403);}return 'Pilot yöneticisi MKY-Tech ve Hasmaksan siparişlerine erişemedi: 403.'});
 await probe('Uretim miktari ve kalite talebi',async()=>{const b=await h.read(base+'/production/balances','operatorDesktop');assert.equal(b.consumedQuantity,5);assert.equal(b.remainingUsableInput,5);return '10 teslim - 5 işlenen = 5 kalan. Kalite talebi üretimi çoğaltmadı.'});
 await probe('Kalite 3 onay 1 ret 1 tamir',async()=>{const q=await h.read(base+'/quality','qualityDesktop'),o=q.outputs[0];assert.equal(o.approved,3);assert.equal(o.rejected,1);assert.equal(o.rework,1);assert.equal(o.unresolved,0);s.qualityOutput=o;h.save();return 'Arayüzde üç ayrı kayıt sonrasında 3/1/1 ve 0 kararsız; tek kayıt özelliği canlıda yok.'});
 await probe('Operator kalite karari veremez',async()=>{const q=(await h.read(base+'/quality')).outputs[0];const r=await h.raw(h.pages.operatorDesktop,base+'/quality/decisions',{eventId:q.eventId,lotId:q.lotId,outputLotId:q.outputLotId,outcome:'approved',quantity:1,evidence:'Yetki negatif testi'});assert.equal(r.status,403);return '403; üretim operatörü kalite kararını değiştiremedi.'});
 await probe('Onaysiz miktar sonraki ise aktarilamaz',async()=>{const q=(await h.read(base+'/quality')).outputs[0];const r=await h.raw(h.pages.admin,'/orders/'+s.orderId+'/output-reservations',{outputLotId:q.outputLotId,destinationWorkOrderId:s.po.workOrders[1].id,quantity:4});assert.equal(r.status,409);return '3 onaylı varken 4 adet ayırma reddedildi: 409.'});
 await probe('Fazla uretim engeli',async()=>{const b=await h.read(base+'/production/balances');const r=await h.raw(h.pages.operatorDesktop,base+'/production/results',{lotId:b.lots[0].lotId,kind:'pending',quantity:6,separateQualityRequest:true});assert.equal(r.status,409);assert.equal((await h.read(base+'/production/balances')).consumedQuantity,5);return '5 kullanılabilirken 6 adet üretim reddedildi; tüketim 5 kaldı.'});
 await probe('Is bitirme engeli',async()=>{const r=await h.raw(h.pages.operatorDesktop,base+'/production/complete',{});assert.equal(r.status,409);return '5 adet henüz işlenmemiş iş tamamlanamadı: 409.'});
 h.check('Tek kayitta karma kalite karari','BLOCKED','Canlı ekran tek karar seçtiriyor. Yerel geliştirme canlıya yayınlanmamış.','Desktop UI inspection');
 h.check('Siparis ve uretim toplu durdurma iptal','BLOCKED','Canlı şema 046; yerel son şema 055. Yeni kontrol akışlarının canlı sürüm kabulü yapılamadı.','Version comparison');
 h.check('Gercek telefon A32','BLOCKED','ADB/CDP bağlantısı var ancak fiziksel ekran boş; dokunma hedefi kararlı hale gelmedi. Kullanıcıdan Chrome’u öne alması istendi.','Physical screenshot + CDP');
 h.check('Gercek telefon S22','BLOCKED','ADB cihazı görüyor; Chrome CDP bağlantısı kapanıyor. Kullanıcıdan Chrome’u açması istendi.','Device connection');
 return s.checks;
};
