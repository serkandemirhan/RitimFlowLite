(function(root){'use strict';
 const h=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 function mount(v){
  if(v.page!=='operator')return;const job=v.assignedJobs?.find(j=>j.id===v.jobSelected),panel=document.querySelector('.operator-focus .flow-production-panel');
  document.querySelector('.operator-studio')?.classList.add('operator-lifecycle');
  if(!job||!panel||panel.dataset.lifecycleMounted)return;panel.dataset.lifecycleMounted='true';
  const heading=panel.querySelector('.operator-focus-heading');if(!heading)return;
  const customer=job.customer||v.detail?.customer,order=job.orderNumber||v.detail?.orderNumber;
  const known=v.jobs?.find(j=>j.id===job.id),po=job.productionOrderNumber||known?.productionOrderNumber;
  heading.querySelector('.operator-identifiers')?.remove();
  if(customer)heading.querySelector('h2').insertAdjacentHTML('afterend','<p class="operator-customer"><span>Müşteri</span><strong>'+h(customer)+'</strong></p>');
  const records=document.createElement('dl');records.className='operator-records';
  records.innerHTML=[['Sipariş',order],['Üretim emri',po||'Bağımsız iş emri'],['İş emri',job.workOrderNumber]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+h(value||'—')+'</dd></div>').join('');
  heading.append(records);
  if(job.handoverNote){const note=document.createElement('aside');note.className='operator-handover-note';note.innerHTML='<strong>Devralınan iş</strong><span>'+h(job.handoverNote)+'</span>';heading.after(note);}
  const status=panel.querySelector('.operator-status.clarity-waiting strong');if(status){status.textContent=(job.status==='paused'?'Duraklatıldı':'Çalışıyor')+' · '+status.textContent;}
  const p=v.productionView;if(p){const quantities=panel.querySelector('.operator-quantity-summary');if(quantities){
   const outputs=p.outputs||{},production=Number(outputs.pending||0)+Number(outputs.good||0),scrap=Number(outputs.scrap||0)+Number(outputs.setup_scrap||0),remaining=Math.max(0,job.plannedQuantity-(p.consumedQuantity||0));
   quantities.classList.add('operator-amounts');quantities.setAttribute('aria-label','İş emri miktarları');
   quantities.innerHTML=[['Hedef',job.plannedQuantity],['Üretim',production],['Hurda',scrap],['Kalan',remaining]].map(([label,value])=>'<div><span>'+label+'</span><strong>'+h(value)+'</strong></div>').join('');
  }}
  panel.querySelectorAll('.clarity-processed-summary,.operator-action-explanation,.operator-target-help,.operator-state-history').forEach(n=>n.remove());
  const totals=panel.querySelector('.operator-quantity-summary'),drawing=panel.querySelector('.drawing-card');
  if(drawing){drawing.classList.add('operator-drawing-toolbar');heading.after(drawing);}
  if(totals)(drawing||heading).after(totals);
  const feedback=document.getElementById('clarity-result'),entry=panel.querySelector('.operator-report-form,.operator-start-action');if(feedback&&entry){feedback.classList.add('operator-feedback');entry.after(feedback);}
  const overview=panel.querySelector('.operator-quality-overview');if(overview){const details=document.createElement('details');details.className='operator-quality-disclosure';details.innerHTML='<summary>Kalite durumu ve sonuçlar</summary>';overview.before(details);details.append(overview);}
  const root=document.querySelector('.operator-focus'),history=root?.querySelector('.job-history');
  if(history){const old=history.closest('.clarity-history');const wrapper=document.createElement('details');wrapper.className='operator-history';wrapper.innerHTML='<summary>İş geçmişi <span>'+Math.max(0,history.querySelectorAll('tbody tr').length-(history.querySelector('td[colspan]')?1:0))+' kayıt</span></summary>';if(old){old.replaceWith(wrapper);}else history.before(wrapper);wrapper.append(history);history.querySelector('h3')?.remove();const corrections=root.querySelector('.operator-corrections');if(corrections){if(v.extras?.productionHistory?.corrections?.some(c=>c.status==='pending'))wrapper.append(corrections);else corrections.remove();}}
 }
 function confirmProduction(view,body){
  const service=root.RitimOperatorLifecycle;if(service.confirming)return Promise.resolve(false);service.confirming=true;
  const scrap=['scrap','setup_scrap'].includes(body.kind),o=view.outputs||{},before=scrap?Number(o.scrap||0)+Number(o.setup_scrap||0):Number(o.pending||0)+Number(o.good||0),label=scrap?'Hurda':'Üretim';
  return new Promise(resolve=>{const d=document.createElement('dialog');d.id='operator-result-confirmation';d.className='operator-confirmation';d.setAttribute('aria-labelledby','operator-confirm-title');d.innerHTML='<form method="dialog"><span class="operator-confirm-eyebrow">'+(scrap?'HURDA KAYDI':'ÜRETİM KAYDI')+'</span><h2 id="operator-confirm-title">'+body.quantity+' adet eklenecek</h2><p>'+(body.kind==='setup_scrap'?'Ayar hurdası':scrap?'Üretim hurdası':'Son kaydınızdan sonraki üretim')+'</p><div class="operator-confirm-total"><span>'+label+' toplamı</span><strong>'+before+' <span aria-hidden="true">→</span> '+(before+body.quantity)+'</strong></div><p class="operator-confirm-help">Bu miktar önceki kayıtlara eklenir. İşin toplam adedini tekrar girmediğinizden emin olun.</p><footer><button class="btn" value="cancel" autofocus>Geri dön</button><button class="btn primary" value="confirm" data-confirm-production>Evet, kaydet</button></footer></form>';d.addEventListener('close',()=>{service.confirming=false;const confirmed=d.returnValue==='confirm';d.remove();resolve(confirmed)},{once:true});document.body.append(d);d.showModal();});
 }
 root.RitimOperatorLifecycle={mount,confirmProduction,confirming:false};
})(window);
