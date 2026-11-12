(function(root){
 'use strict';
 const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function disclosure(node,label,cls='polish-details'){
  if(!node||node.parentElement?.classList.contains(cls))return null;
  const d=document.createElement('details');d.className=cls;d.innerHTML='<summary>'+h(label)+'</summary>';node.before(d);d.append(node);return d;
 }
 function unitInput(input,unit){
  if(!input)return;let wrap=input.closest('.polish-unit-input');
  if(!wrap){wrap=document.createElement('span');wrap.className='polish-unit-input';input.before(wrap);wrap.append(input);wrap.insertAdjacentHTML('beforeend','<span class="polish-unit"></span>')}
  wrap.querySelector('.polish-unit').textContent=unit==='piece'?'adet':unit||'—';
 }
 function master(v){
  if(v.masterView?.kind==='operations'){
   for(const cell of document.querySelectorAll('td[data-column="kind"]')){cell.classList.add('polish-operation-kind');}
   const templates=document.querySelector('.master-page>button[onclick*="openTemplates"]');if(templates)document.querySelector('.master-toolbar')?.append(templates);
  }
  if(v.masterView?.kind==='machines')for(const row of document.querySelectorAll('#master-records tr')){const cell=row.querySelector('td[data-column="action"]');if(cell){cell.classList.add('polish-actions');const remove=cell.querySelector('button[onclick*="true"]');disclosure(remove,'Diğer','polish-more')}}
  if(v.masterView?.kind==='locations')for(const row of document.querySelectorAll('.location-record')){
   const path=row.querySelector('.location-node-label small');if(path){row.querySelector('.location-node-label strong').title=path.textContent;disclosure(path,'Tam yol','polish-location-path')}
   const remove=row.querySelector('.location-node-actions .danger');const more=disclosure(remove,'Diğer','polish-more');if(more)more.addEventListener('click',e=>e.stopPropagation());
  }
 }
 function inventory(v){
  const data=v.inventoryView||{},materials=data.materials||[],locations=data.locations||[];
  for(const group of document.querySelectorAll('.stock-product')){
   group.classList.add('polish-stock-product');
   for(const row of group.querySelectorAll('[data-balance-search]')){
    row.firstElementChild.classList.add('polish-repeated-material');
    const path=row.querySelector('.stock-path');if(path)disclosure(path,'Tam konum','polish-location-path');
   }
   const header=group.querySelector('.stock-table-heading');if(header)header.firstElementChild.classList.add('polish-repeated-material');
  }
  const filter=document.getElementById('stock-material-filter');if(filter)for(const o of filter.options){const m=materials.find(x=>x.id===o.value),b=data.balances?.find(x=>x.materialId===o.value);if(m||b)o.textContent=[m?.code||b?.materialCode,m?.description||b?.description].filter(Boolean).join(' · ')}
  const quantity=document.getElementById('inv-receipt-quantity'),material=document.getElementById('inv-material');
  if(quantity&&material){const apply=()=>unitInput(quantity,materials.find(x=>x.id===material.value)?.baseUnit);material.addEventListener('change',apply);apply();}
  const stock=document.getElementById('raw-stock'),rawQty=document.getElementById('raw-quantity');
  if(stock&&rawQty){const apply=()=>{const [lot,location]=stock.value.split('|'),b=data.balances?.find(x=>x.lotId===lot&&x.locationId===location);unitInput(rawQty,b?.unit);};stock.addEventListener('change',apply);apply();const button=stock.closest('form')?.querySelector('button[type="submit"],button.primary');if(button){button.textContent='Teslim et';button.title='Üretime teslim edilir ve depo bakiyesinden düşülür.'}}
  const production=document.getElementById('raw-production');if(production){for(const o of production.options){const p=v.rawProductionOrders?.find(p=>p.id===o.value);if(p)o.textContent=[p.partName,p.number,p.customer].filter(Boolean).join(' · ')}production.closest('label').classList.add('polish-production-choice');}
  const owner=document.getElementById('receipt-owner');if(owner)for(const o of owner.options)if(o.value)o.textContent='Müşteri malı · '+o.textContent;
  for(const select of document.querySelectorAll('#inv-container,#inv-location,#inv-destination'))for(const o of select.options){const loc=locations.find(x=>x.id===o.value);if(loc){o.title=o.textContent;o.textContent=loc.code}}
  const nav=document.querySelector('.api-inventory-tasks');if(nav){nav.classList.add('polish-task-tabs');nav.setAttribute('aria-label','Depo işlemleri; diğer görevler için kaydırın')}
 }
 function supplier(v){
  const data=v.poSupplier,p=v.poDetail;if(!data||!p)return;
  const area=document.querySelector('.supplier-compact-page');if(!area)return;
  const job=p.workOrders.find(x=>x.id===data.workOrderId),outside=data.dispatches.reduce((n,d)=>n+d.outstanding,0),returned=data.dispatches.reduce((n,d)=>n+d.returned,0),qa=job?.attention?.qualityPending||0;
  const heading=area.querySelector('.supplier-compact-heading h2');if(heading)heading.textContent=[p.partName,job?.name,'Fason'].filter(Boolean).join(' · ');
  const vendors=[...new Set(data.dispatches.map(d=>d.supplierName||data.suppliers.find(s=>s.id===d.supplierId)?.name).filter(Boolean))];
  if(vendors.length){const line=document.createElement('p');line.className='polish-supplier-identity';line.textContent='Tedarikçi: '+vendors.join(' · ');area.querySelector('.supplier-compact-heading')?.after(line)}
  const note=area.querySelector('.dispatch-ready-note');if(note&&data.dispatches.length){const title=note.querySelector('b'),body=note.querySelector('p');if(title)title.textContent=outside?outside+' adet dışarıda · dönüş bekleniyor':qa?qa+' adet döndü · kalite kontrolü bekliyor':data.status==='complete'?'Fason operasyonu tamamlandı':returned+' adet döndü · dönüşler tamam';if(body)body.textContent=outside?'Fiziksel dönüşü Lojistik bölümünden kabul edin.':qa?'Dönen ürünler için kalite kararını kaydedin.':'Gönderim ve kalite kayıtları geçmişte korunur.';}
  for(const row of area.querySelectorAll('.production-supplier-dispatch')){const form=row.querySelector('form'),qty=form?.querySelector('input[id^="po-return-"]');if(form&&qty){const submit=form.querySelector('button[type="submit"]');if(submit)submit.textContent='Dönüşü kaydet';disclosure(form,'Dönüş kaydet','polish-return-form');for(const small of form.querySelectorAll('.guided-quantity-aid small'))small.textContent=small.textContent.replace('Fasonda kalan','Kayıt sonrası dışarıda');}}
  const quality=area.querySelector('button[onclick*="openQualityJob"]');if(quality){quality.textContent=data.status==='complete'?'Kalite sonuçlarını görüntüle':'Kalite kontrolünü aç';if(!outside&&qa>0){quality.classList.add('primary');note?.append(quality)}}
  if(data.status==='complete'){const next=p.workOrders.filter(x=>x.sequence>job.sequence).sort((a,b)=>a.sequence-b.sequence)[0];if(next){const b=document.createElement('button');b.className='btn';b.textContent='Sonraki operasyon: '+next.name;b.onclick=()=>next.kind==='external'?root.RitimPremiumAPI.openSupplierJob(p.id,next.id):root.RitimPremiumAPI.openJob(next.id,p.orderId);area.querySelector('.supplier-compact-summary')?.append(b)}}
 }
 function material(v){
  const node=document.getElementById('production-material-panel'),data=v.rawProductionView;if(!node||!data)return;
  const section=node.querySelector('section'),status=section?.querySelector('header .pill');if(!section||!status)return;
  const totals=new Map();for(const i of data.issues||[])totals.set(i.unit,(totals.get(i.unit)||0)+i.quantity-i.returned);
  const text=[...totals].map(([u,n])=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:6}).format(n)+' '+(u==='piece'?'adet':u)+' teslim').join(' · ');
  const outer=node.closest('details.clarity-material-details');if(outer){outer.querySelector('summary').textContent='Hammadde: '+status.textContent+(text?' · '+text:'');}
  else if(data.issues?.length){const summary=document.createElement('p');summary.className='polish-material-summary';summary.textContent='Hammadde: '+status.textContent+(text?' · '+text:'');section.querySelector('header').after(summary);const form=section.querySelector(':scope>form');disclosure(form,'Başlama durumunu değiştir','polish-readiness-editor')}
 }
 function operator(v){
  if(v.page!=='operator')return;const jobs=v.assignedJobs||[],j=jobs.find(x=>x.id===v.jobSelected),panel=document.querySelector('.operator-focus .flow-production-panel');if(!panel||!j||j.status!=='complete')return;
  const ready=jobs.find(x=>x.id!==j.id&&x.status!=='complete'&&x.attention?.ready===true),complete=panel.querySelector('.operator-completion');
  if(ready){const b=document.createElement('button');b.className='btn primary polish-next-job';b.textContent='Sonraki hazır işi aç';b.onclick=()=>root.RitimPremiumAPI.openAssigned(ready.id);complete?.append(b)}
  if(!jobs.some(x=>!['complete','cancelled'].includes(x.status))){const empty=document.createElement('p');empty.className='polish-empty-jobs';empty.textContent='Açık işiniz yok. Tamamlanan işleri geçmişten inceleyebilirsiniz.';document.querySelector('.operator-jobs-panel,.operator-job-list')?.prepend(empty)}
  const outputs=v.qualityView?.outputs||[],approved=outputs.reduce((n,o)=>n+(o.approved||0),0),pending=outputs.reduce((n,o)=>n+(o.unresolved||0),0),scrap=v.productionView?.attention?.productionScrap||0,repair=outputs.reduce((n,o)=>n+(o.reworkPending??o.rework??0),0),text=complete?.querySelector('p');if(text&&v.qualityView)text.textContent=approved+' onaylı'+(scrap?' · '+scrap+' hurda':'')+(repair?' · '+repair+' tamir bekliyor':'')+(pending?' · '+pending+' kalite bekliyor':'');
  if(j.purpose==='compensation'||j.compensationId||j.compensation){const title=complete?.querySelector('strong');if(title)title.textContent='Telafi işi tamamlandı';}
 }
 function shipping(v){if(v.page!=='shipping')return;const card=document.querySelector('.flow-shipping .refine-state-card.is-complete');if(card&&v.selected){const link=document.createElement('button');link.className='btn polish-order-link';link.textContent='Siparişi görüntüle';link.onclick=()=>root.RitimPremiumAPI.openOrder(v.selected);card.append(link)}}
 function quality(v){
  if(v.page!=='quality'||!v.qualityView||v.qualityView.unavailable)return;
  const outputs=v.qualityView.outputs||[],pending=outputs.reduce((n,o)=>n+(o.unresolved||0)+(o.reworkPending||0),0),approved=outputs.reduce((n,o)=>n+(o.approved||0),0),rejected=outputs.reduce((n,o)=>n+(o.rejected||0),0),panel=document.querySelector('.operations-quality');
  if(panel&&!pending&&outputs.length){const text=approved+' adet onaylandı'+(rejected?' · '+rejected+' adet reddedildi':''),card=panel.querySelector('.refine-state-card.is-complete');if(card){card.querySelector('strong').textContent=text;}else{const summary=document.createElement('p');summary.className='polish-quality-result';summary.setAttribute('role','status');summary.textContent=text;panel.querySelector('h2')?.after(summary)}panel.querySelector('.operations-context')?.remove();const counts=panel.querySelector('.quantity-breakdown'),details=disclosure(counts,'Miktar ayrıntıları','polish-quality-quantities');if(details)for(const extra of panel.querySelectorAll(':scope>.clarity-quantity-details')){extra.querySelector('summary')?.remove();details.append(...extra.childNodes);extra.remove()}for(const p of panel.querySelectorAll(':scope>p'))if(['Kontrol bekleyen üretim yok.','Tamir bekleyen yok.'].includes(p.textContent.trim())){const heading=p.previousElementSibling;if(heading?.tagName==='H3')heading.remove();p.remove()}}
 }
 function qualityDetail(v){
  if(v.page!=='quality'||!v.qualityView)return;
  const panel=document.querySelector('.operations-quality');if(!panel||panel.dataset.qualityClarity)return;panel.dataset.qualityClarity='true';
  const outputs=v.qualityView.outputs||[],sum=key=>outputs.reduce((n,o)=>n+Number(o[key]||0),0),pending=sum('unresolved'),repair=outputs.reduce((n,o)=>n+Number(o.reworkPending??o.rework??0),0),rejected=sum('rejected'),approved=sum('approved'),unavailable=v.qualityView.unavailable;
  const job=[...(v.jobs||[]),...(v.assignedJobs||[])].find(j=>j.id===v.jobSelected),heading=panel.querySelector('h2');
  if(job?.workOrderNumber){const identity=document.createElement('p');identity.className='quality-work-identity';identity.textContent='İş emri: '+job.workOrderNumber;heading?.after(identity)}
  panel.querySelector('.operations-context')?.remove();
  let card=panel.querySelector('.refine-state-card');
  if(!card){card=document.createElement('section');card.className='refine-state-card';(panel.querySelector('.detail-context-line')||heading)?.after(card)}
  panel.querySelector('.polish-quality-result')?.remove();
  const title=unavailable?'Kontrol miktarları doğrulanamadı':pending?pending+' adet kontrol bekliyor':repair?repair+' adet tamir bekliyor':outputs.length?(approved?approved+' adet onaylandı'+(rejected?' · '+rejected+' adet reddedildi':''):rejected+' adet reddedildi'):'Henüz kontrol edilecek üretim yok';
  const next=unavailable?'Üretim kayıtlarının mutabakatı doğrulanmadan yeni karar vermeyin.':pending?'Ürünleri kontrol edin; aşağıdaki “Karar ver” düğmesinden onay, ret ve tamir miktarlarını kaydedin.':repair?'Tamir işlerini açın; tamir gerektiren ürünler için iş emrini buradan takip edin.':outputs.length?'Bu işte bekleyen kalite kararı yok. Diğer ürünleri kontrol etmek için bekleyen kontrollere dönün.':'Operatör üretim bildirdiğinde kontrol edilecek miktar burada görünür.';
  card.classList.toggle('is-complete',!unavailable&&!pending&&!repair&&!!approved&&!rejected);card.classList.toggle('is-warning',!!unavailable||!!pending||!!repair||!!rejected);card.setAttribute('role','status');
  card.innerHTML='<div class="quality-state-content"><small>Güncel kalite durumu</small><strong>'+h(title)+'</strong><p>'+h(next)+'</p><div class="quality-next-actions"></div></div>';
  const actions=card.querySelector('.quality-next-actions');
  const repairButton=panel.querySelector(':scope>button[onclick*="openRepair"]');if(repairButton)actions.append(repairButton);
  const back=document.createElement('button');back.className='btn';back.textContent='Bekleyen kontrollere dön';back.onclick=()=>root.RitimPremiumAPI.qualitySection(false);actions.append(back);
  if(pending||repair){const totals=document.createElement('p');totals.className='quality-current-totals';totals.textContent=approved+' onaylı · '+rejected+' reddedilen · '+pending+' kontrol bekleyen · '+repair+' tamir bekleyen';card.append(totals)}
  const intro=[...panel.querySelectorAll(':scope>p')].find(p=>p.textContent.startsWith('Onaylanmamış'));if(intro)disclosure(intro,'Kalite süreci hakkında','flow-details');
  const recover=panel.querySelector(':scope>button[onclick*="openRecovery"]');if(recover)disclosure(recover,'Kayıplar ve telafi işlemleri','flow-details');
  // Histories describe immutable events, not the current queue state.
  if(!v.extras)return;
  const history=[...panel.querySelectorAll(':scope>details')].find(d=>d.querySelector('summary')?.textContent==='Tamamlanan kontroller ve geçmiş');if(!history)return;
  const number=n=>h(new Intl.NumberFormat('tr-TR').format(Number(n||0))),meta=r=>[r.actorName,r.occurredAt&&new Date(r.occurredAt).toLocaleString('tr-TR')].filter(Boolean).map(h).join(' · ');
  const trace=r=>'<details class="quality-record-trace"><summary>Lot ve kayıt bilgisi</summary><dl><dt>Çıktı lotu</dt><dd>'+h(r.outputLotId||(r.provenanceStatus==='historical_unreconciled'?'Tarihsel iz doğrulanamadı':'Bu kayıtta çıktı lotu yok'))+'</dd>'+((r.eventId||r.id)?'<dt>Kayıt</dt><dd>'+h(r.eventId||r.id)+'</dd>':'')+'</dl></details>';
  const productionLabels={pending:'Kontrole gönderilen üretim',good:'Doğrudan onaylı üretim',scrap:'Üretim hurdası',setup_scrap:'Ayar hurdası'},decisionLabels={approved:'Onaylandı',rejected:'Reddedildi',rework:'Tamire ayrıldı'};
  const decisions=v.extras.qualityHistory?.decisions||[],events=v.extras.productionHistory?.events||[];
  history.classList.add('quality-records');history.open=true;
  history.innerHTML='<summary>Kontrol ve üretim kayıtları</summary><section><h3>Kaydedilen kalite kararları</h3><p class="quality-section-note">Kontrol sonucunda verilen kararlar; güncel bekleyen miktarı üstte gösterilir.</p>'+(decisions.map(d=>'<article class="quality-history-record"><div class="quality-record-heading"><strong>'+h(decisionLabels[d.outcome]||d.outcome)+'</strong><b>'+number(d.quantity)+' adet</b></div>'+(d.evidence?'<p><span>Kontrol notu:</span> '+h(d.evidence)+'</p>':'')+'<small>'+meta(d)+'</small><div class="quality-record-documents"></div>'+trace(d)+'</article>').join('')||'<p>Henüz kalite kararı kaydedilmedi.</p>')+'</section><section><h3>Üretimden gelen bildirimler</h3><p class="quality-section-note">Üretimde bildirilen miktarlar. “Kontrole gönderilen” kaydı geçmişteki bildirimi gösterir; kalite sonucuyla toplanmaz.</p>'+(events.map(e=>'<article class="quality-history-record"><div class="quality-record-heading"><strong>'+h(productionLabels[e.kind]||e.kind)+'</strong><b>'+number(e.quantity)+' adet</b></div>'+(e.kind==='scrap'||e.kind==='setup_scrap'?'<p>Üretim sırasında ayrılan hurda; kalite reddinden ayrıdır.</p>':'')+'<small>'+meta(e)+'</small>'+trace(e)+'</article>').join('')||'<p>Henüz üretim bildirimi yok.</p>')+'</section>';
  const lots=document.createElement('details');lots.className='quality-record-trace';lots.innerHTML='<summary>Lot bazında kalite sonuçları</summary>'+outputs.map((o,i)=>'<article class="quality-history-record"><strong>Üretim çıktısı '+(i+1)+'</strong><p>'+number(o.approved)+' onaylı · '+number(o.rejected)+' reddedilen · '+number(o.unresolved)+' kontrol bekleyen · '+number(o.reworkPending??o.rework)+' tamir bekleyen</p>'+trace(o)+'</article>').join('');if(outputs.length)history.append(lots);
  for(const help of [...panel.querySelectorAll(':scope>details')].filter(d=>['Kalite süreci hakkında','Kayıplar ve telafi işlemleri'].includes(d.querySelector('summary')?.textContent)))panel.append(help);
  // Keep the same authorized document-opening action as the original history.
  for(const [i,d]of decisions.entries()){const holder=history.querySelectorAll('.quality-record-documents')[i];for(const doc of d.documents||[]){const button=document.createElement('button');button.className='btn sm';button.textContent=doc.filename||'Kontrol belgesi';button.onclick=()=>root.RitimPremiumAPI.documentOpen(doc.id);holder.append(button)}}
 }
 function order(v){
  if(v.page!=='detail'||!(v.orderClosing?.canClose||v.detail?.status==='closed'))return;
  const summary=document.querySelector('.flow-order-summary');if(!summary)return;
  const metrics=summary.querySelector(':scope>.guidance-delivery'),stages=summary.querySelector(':scope>.guidance-order-stages');
  const details=disclosure(metrics,'Teslimat ve süreç ayrıntıları','polish-order-checks');if(details&&stages)details.append(stages);
  if(v.orderClosing?.canClose){const jobs=v.orderSummary?.jobs||[],done=jobs.filter(j=>j.status==='complete').length,note=document.createElement('p');note.className='polish-quality-result';note.textContent='Kapatmaya hazır · '+v.orderClosing.netDelivered+'/'+v.orderClosing.orderedQuantity+' teslim'+(jobs.length?' · '+done+'/'+jobs.length+' iş tamamlandı':'');summary.querySelector('.flow-heading')?.after(note);}
 }
 function mount(v){master(v);if(v.page==='inventory')inventory(v);if(v.poSupplier)supplier(v);if(v.page==='production-order')material(v);operator(v);shipping(v);quality(v);qualityDetail(v);order(v);}
 root.RitimWorkspacePolish={mount,unitInput};
})(typeof window==='undefined'?globalThis:window);
