/* UX-05: operator workflow extension on top of existing demo, localStorage only. */
(function(){
'use strict';
const html=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const field=id=>document.getElementById(id);
function amount(id){let e=field(id);if(!e||!e.value.trim()||!Number.isInteger(Number(e.value)))return NaN;return Number(e.value)}
function plan(j){return Math.max(0,Number(j.plannedQty)||Number(jo(j).qty)||0)}
function ledger(j){
 if(!j.ux05){
  const historic=(Number(j.good)||0)+(Number(j.scrap)||0);
  j.ux05={received:historic,pending:0,setup:0,rework:0,allocatable:0,handover:null,receipts:[],legacyBaseline:historic,legacyGood:Number(j.good)||0};
 }
 return j.ux05;
}
function used(j){let x=ledger(j);return (Number(j.good)||0)+(Number(j.scrap)||0)+x.pending+x.setup+x.rework}
function unprocessed(j){return Math.max(0,ledger(j).received-used(j))}
function eligibleStart(j){return ledger(j).received>used(j)}
function record(j,type,n,detail){
 eventLog(j,type,n);
 if(detail)state.events[0].detail=detail;
 save();
 render();
}
function guardJob(j){if(!j)throw Error('İş emri bulunamadı');}
function sampleReceive(id){
 const j=job(id);guardJob(j);const x=ledger(j),n=amount('ux05-receive');
 if(j.state==='complete'||j.state==='shipped')return toast('Tamamlanmış iş emrine teslim yapılamaz');
 if(!(n>0)||n+x.received>plan(j))return toast('Teslim miktarı planlanan iş emrini aşamaz');
 const ux=window.RitimUX07Ledger;if(!ux)return toast('Malzeme tahsis modülü bulunamadı');const o=jo(j),d=ux.ledger(o);const allocated=ux.sum(d.allocations.filter(a=>a.job===j.id));if(n+x.received-x.legacyBaseline>allocated)return toast('UX-06 üzerinden bu iş emrine tahsis edilen malzeme yetersiz');
 x.received+=n;x.receipts.push({qty:n,user:state.user,time:new Date().toISOString()});
 record(j,'physical_receive',n,'Fiziksel teslim demo onayı; gerçek stok rezervasyonu henüz bağlı değil');
 toast(n+' adet teslim alındı');
}
function logProduction(id){
 const j=job(id);guardJob(j);const x=ledger(j),n=amount('ux05-qty'),type=field('ux05-type')?.value;
 if(j.state!=='running'||x.handover)return toast('İş aktif ve devredilmiş olmalı');
 if(!(n>0)||n>unprocessed(j))return toast('Henüz işlenmeyen miktarı aşamazsınız');
 if(type==='good'&&state.user!=='Yönetici')return toast('Doğrudan sağlam kaydı sadece yetkili öz kontrol kullanıcıları için');
 if(type==='good')j.good+=n;
 else if(type==='pending')x.pending+=n;
 else if(type==='scrap')j.scrap+=n;
 else if(type==='setup')x.setup+=n;
 else return;
 record(j,'ux05_'+type,n,type==='setup'||type==='scrap'?'Firenin nedeni demo ortamında ayrıntılandırılmalıdır':'');
 toast(n+' adet kaydedildi');
}
function inspect(id){
 const j=job(id);guardJob(j);const x=ledger(j);
 if(state.user!=='Yönetici')return toast('Kontrol sonuçları yetkili kullanıcı tarafından onaylanmalıdır');
 const good=amount('ux05-ig'),scrap=amount('ux05-is'),rework=amount('ux05-ir');
 if([good,scrap,rework].some(n=>!Number.isInteger(n)||n<0)||good+scrap+rework<1||good+scrap+rework>x.pending)return toast('Kontrol toplamı kontrol bekleyen miktarı aşamaz');
 x.pending-=good+scrap+rework;j.good+=good;j.scrap+=scrap;x.rework+=rework;
 record(j,'inspection',good+scrap+rework,`Sağlam ${good}, hurda ${scrap}, rework ${rework}`);
 toast('Kontrol sonuçları onaylandı');
}
function reworkInspect(id){
 const j=job(id);guardJob(j);const x=ledger(j);
 if(state.user!=='Yönetici')return toast('Rework sonucu yetkili tarafından onaylanmalıdır');
 const good=amount('ux05-rg'),scrap=amount('ux05-rs');
 if([good,scrap].some(n=>!Number.isInteger(n)||n<0)||good+scrap<1||good+scrap>x.rework)return toast('Rework bakiyesini aşan işlem');
 x.rework-=good+scrap;j.good+=good;j.scrap+=scrap;
 record(j,'rework_result',good+scrap,`Yeniden kontrol: sağlam ${good}, hurda ${scrap}`);
 toast('Rework sonucu kaydedildi');
}
function pause(id){
 const j=job(id),reason=field('ux05-pause-reason')?.value||'Diğer';
 if(j.state!=='running')return toast('Yalnızca çalışan iş duraklatılabilir');
 j.state='paused';record(j,'pause',0,reason);toast('Duruş nedeni kaydedildi');
}
function resume(id){
 const j=job(id);
 if(j.state!=='paused'||ledger(j).handover)return toast('Devredilmeyi bekleyen iş devam ettirilemez');
 j.state='running';record(j,'start',0,'Üretime devam');toast('Üretim devam ediyor');
}
function start(id){
 const j=job(id),x=ledger(j);
 if(x.handover)return toast('Önce vardiya devralma gerekli');
 if(!eligibleStart(j))return toast('Önce üretilecek parçaları fiziksel teslim al');
 j.state='running';record(j,'start',0,'Teslim alınan miktar doğrulandı');toast('İş başladı');
}
function handover(id){
 const j=job(id),x=ledger(j),note=field('ux05-handover-note')?.value?.trim();
 if(!note)return toast('Devir notu yazılmalı');
 if(!['running','paused'].includes(j.state))return toast('Önce işi başlat');
 x.handover={from:state.user,note,time:new Date().toISOString()};
 j.state='paused';record(j,'shift_handover',0,note);toast('Yeni operatör devri bekleniyor');
}
function takeOver(id){
 const j=job(id),x=ledger(j);
 if(!x.handover)return;
 if(state.user===x.handover.from)return toast('Devri farklı bir operatör almalı');
 const old=x.handover.from;x.handover=null;
 record(j,'shift_takeover',0,`${old} → ${state.user}`);toast('Devir alındı; iş duraklatılmış durumda');
}
function close(id){
 const j=job(id),x=ledger(j);
 if(j.state==='complete'||j.state==='shipped')return toast('İş zaten kapalı');
 if(x.pending||x.rework||unprocessed(j)||x.received<plan(j))return toast('Açık kontrol/rework/işlenmemiş veya işe alınmamış miktar var; iş emri kapatılamaz');
 j.state='complete';record(j,'finish',0,'Kontrol edilmiş miktarlar ile üretim kapatıldı');toast('Üretim kapatıldı');
}
const name={physical_receive:'Fiziksel parça teslimi',ux05_pending:'Kontrol bekleyen',ux05_good:'Yetkili öz kontrol · sağlam',ux05_scrap:'Üretim hurdası',ux05_setup:'Ayar firesi',inspection:'Kontrol onayı',rework_result:'Rework kontrolü',shift_handover:'Vardiya devri',shift_takeover:'İşi devralma'};
const oldEventsMarkup=eventsMarkup;
eventsMarkup=function(items){
 return oldEventsMarkup(items.map(e=>name[e.type]?{...e,type:e.type}:e)).replace(/<b>(physical_receive|ux05_pending|ux05_good|ux05_scrap|ux05_setup|inspection|rework_result|shift_handover|shift_takeover)<\/b>/g,(_,key)=>'<b>'+name[key]+'</b>');
};
operatorJob=function(j){
 const o=jo(j),x=ledger(j),total=plan(j),remaining=unprocessed(j),receivedOpen=Math.max(0,total-x.received);
 const finished=j.good+j.scrap+x.pending+x.setup+x.rework;
 return `<div class="ux05-wrap">
 <div class="card ux05-hero">
  <div class="ux05-top"><div><div class="eyebrow">${html(j.id)} · ${html(o.customer)}</div><h2>${html(o.part)}</h2><div class="tiny">${html(o.route?.[j.op]||'İmalat')} · ${html(j.machine)} · Rev ${html(o.revision)}</div></div><button class="btn sm" onclick="showDrawing('${html(o.id)}')">${I('image',16)} Çizim</button></div>
  <div class="ux05-progress"><strong>${j.good} <small>/ ${total} sağlam</small></strong>${badge(j.state)}</div>
  ${prog(j.good,total)}
  <div class="ux05-metrics">
   ${[['Fiziksel alınan',x.received],['Sağlam',j.good],['Kontrol bekleyen',x.pending],['Üretim hurdası',j.scrap],['Ayar firesi',x.setup],['Rework bekleyen',x.rework],['Henüz işlenmeyen',remaining],['İşe alınmamış',receivedOpen]].map(([t,n])=>`<div><span>${t}</span><strong>${n}</strong></div>`).join('')}
  </div>
  <div class="ux05-balance">${x.received} işe alınan = ${finished} sonuçlanan/bekleyen + ${remaining} henüz işlenmeyen</div>
 </div>
 ${x.handover?`<div class="card pad ux05-handover"><strong>Vardiya devri bekleniyor</strong><p>${html(x.handover.note)}</p><p class="tiny">Devreden: ${html(x.handover.from)}</p><button class="btn primary full" onclick="RitimUX05.takeOver('${html(j.id)}')">İşi Devral</button></div>`:''}
 <div class="card pad ux05-block"><h3>1 · Fiziksel Malzeme Teslimi</h3><p class="tiny">UX-06 iş emri tahsisi doğrulanır. İlk malzeme girişini Malzeme / Fason ekranından yapın.</p>
 <div class="ux05-inline"><input id="ux05-receive" class="input" type="number" min="1" step="1" inputmode="numeric" value="${receivedOpen>0?Math.min(10,receivedOpen):0}" aria-label="Teslim miktarı"><button class="btn primary" ${!receivedOpen||['complete','shipped'].includes(j.state)?'disabled':''} onclick="RitimUX05.receive('${html(j.id)}')">Teslim Aldım</button></div>
 </div>
 <div class="card pad ux05-block"><h3>2 · Üretim Kaydı</h3>
 <div class="ux05-inline"><select id="ux05-type" class="select" aria-label="Üretim sonucu">
 <option value="pending">Kontrol Bekleyen</option><option value="good" ${state.user==='Yönetici'?'':'disabled'}>Sağlam · Yetkili Öz Kontrol</option><option value="scrap">Üretim Hurdası</option><option value="setup">Ayar Firesi</option></select>
 <input id="ux05-qty" class="input ux05-number" type="number" min="1" step="1" inputmode="numeric" value="1" aria-label="Adet"></div>
 <button class="btn primary full" ${j.state!=='running'||!!x.handover||remaining===0?'disabled':''} onclick="RitimUX05.production('${html(j.id)}')">Üretim Sonucunu Kaydet</button>
 <div class="ux05-inline ux05-buttons">${j.state==='running'?`<select id="ux05-pause-reason" class="select"><option>Makine arızası</option><option>Takım değişimi</option><option>Malzeme bekleme</option><option>Mola</option><option>Diğer</option></select><button class="btn softamber" onclick="RitimUX05.pause('${html(j.id)}')">Duraklat</button>`:j.state==='paused'&&!x.handover?`<button class="btn good full" onclick="RitimUX05.resume('${html(j.id)}')">Üretime Devam Et</button>`:j.state==='waiting'?`<button class="btn good full" onclick="RitimUX05.start('${html(j.id)}')">İşe Başla</button>`:''}</div>
 </div>
 <div class="card pad ux05-block"><h3>3 · Kalite Kontrol</h3><p class="tiny">Yalnızca yetkili kullanıcı kontrol sonucunu onaylar. Diğerleri açık miktarı izler.</p>
 <div class="ux05-three"><label>Sağlam<input id="ux05-ig" type="number" min="0" value="0"></label><label>Hurda<input id="ux05-is" type="number" min="0" value="0"></label><label>Rework<input id="ux05-ir" type="number" min="0" value="0"></label></div>
 <button class="btn full" ${!x.pending||state.user!=='Yönetici'?'disabled':''} onclick="RitimUX05.inspect('${html(j.id)}')">Kontrol Sonucunu Onayla (${x.pending} bekliyor)</button>
 <div class="ux05-three"><label>Rework → Sağlam<input id="ux05-rg" type="number" min="0" value="0"></label><label>Rework → Hurda<input id="ux05-rs" type="number" min="0" value="0"></label></div>
 <button class="btn full" ${!x.rework||state.user!=='Yönetici'?'disabled':''} onclick="RitimUX05.rework('${html(j.id)}')">Rework Kontrolünü Onayla</button>
 </div>
 <div class="card pad ux05-block"><h3>4 · Vardiya Devri / Sonuçlandırma</h3><textarea id="ux05-handover-note" class="textarea" rows="2" placeholder="Sonraki operatöre takım, parça ve işlem notları…"></textarea>
 <div class="ux05-inline ux05-buttons"><button class="btn" ${x.handover||!['running','paused'].includes(j.state)?'disabled':''} onclick="RitimUX05.handover('${html(j.id)}')">Vardiya Devret</button><button class="btn" ${j.state==='complete'||j.state==='shipped'?'disabled':''} onclick="RitimUX05.close('${html(j.id)}')">İş Emrini Kapat</button></div>
 <p class="tiny">Açık kontrol, rework, henüz işlenmeyen veya işe alınmamış miktar varsa doğrudan kapatma engellenir. Makine değişimi ve plan revizyonu yöneticinin ayrı işlemidir.</p>
 </div></div>`;
};
const oldRecord=recordQty;recordQty=function(id){toast('Operatör panelindeki yeni kontrollü kaydı kullanın')};
const oldStatus=setStatus;setStatus=function(id,s){if(s==='running')start(id);else if(s==='paused')pause(id)};
const oldFinish=finishJob;finishJob=function(){close(chosenJob);if(job(chosenJob)?.state==='complete')closeModal()};
window.RitimUX05={receive:sampleReceive,production:logProduction,inspect,rework:reworkInspect,pause,resume,start,handover,takeOver,close};
})();
