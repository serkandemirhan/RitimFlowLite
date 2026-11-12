/* Shared, read-only presentation for execution status and quantity semantics. */
(function(root){'use strict';
 const text=(el,value)=>{el.textContent=value;return el};
 function quantities(target,v){
  if(!target||target.querySelector('.quantity-breakdown'))return;
  const box=document.createElement('section');box.className='quantity-breakdown';box.setAttribute('aria-label','Üretim ve kalite miktarları');
  for(const [label,key]of [['Hedef','quantity'],['İşlenen','produced'],['Onaylanan','approved'],['Kalite reddi','rejected'],['Üretim hurdası','productionScrap'],['Tamir bekleyen','repairPending'],['Kontrol bekleyen','qualityPending']]){
   if(key==='repairPending'&&target.classList.contains('operator-quantity-summary'))continue;
   const item=document.createElement('div');item.dataset.quantity=key;item.append(text(document.createElement('small'),label),text(document.createElement('strong'),v[key]??'—'));box.append(item);
  }
  const foot=document.createElement('p');foot.className='quantity-explanation';foot.textContent='İşlenen adet, onaylanan adet değildir. Kalite reddi ve üretim hurdası ayrı kayıtlardır.';box.append(foot);target.querySelector('.job-studio-totals')?.remove();if(target.classList.contains('operator-quantity-summary'))target.replaceChildren();target.append(box);
 }
 function execution(target,state){
  if(!target)return;if(state.parentHeld&&state.status==='open')state={...state,status:'held'};const history=state.history||[],latest=history[0];
  if(['open','closed'].includes(state.status)&&!latest)return;
  const box=document.createElement('section');box.className='execution-status-panel';box.dataset.state=state.status;
  box.append(text(document.createElement('h3'),({held:'İşler durduruldu',cancelled:'İptal edildi',closed:'Kapalı',open:'Durdurma kaldırıldı'})[state.status]||state.status));
  if(latest)box.append(text(document.createElement('p'),[latest.actor_name||'Kullanıcı bilgisi yok',new Date(latest.occurred_at).toLocaleString('tr-TR'),latest.payload?.reason].filter(Boolean).join(' · ')));
  if(state.status==='held')box.append(text(document.createElement('p'),'Çalışan işler duraklatıldı. Durdurma kaldırılana kadar yeni iş başlatılamaz.'));
  if(state.parentHeld&&state.productionId)box.append(text(document.createElement('p'),'Sipariş durdurulduğu için bu üretim emri de başlatılamaz.'));
  const f=state.followUp;if(f&&['held','cancelled'].includes(state.status)){
   const list=document.createElement('dl');list.className='execution-follow-up';
   for(const [label,key]of [['İşlerde kalan malzeme','remainingInput'],['Fasondaki parça','supplierOutstanding'],['Kontrol bekleyen','qualityPending'],['Tamir bekleyen','repairPending'],['Siparişin sevke ayrılan miktarı','awaitingDispatch'],['Siparişin yoldaki sevkiyatı','inTransit']]){list.append(text(document.createElement('dt'),label),text(document.createElement('dd'),(f[key]??'—')+' adet'))}box.append(list);
  }
  if(history.length>1){const details=document.createElement('details');details.append(text(document.createElement('summary'),'Durdurma ve iptal geçmişi'));for(const item of history){details.append(text(document.createElement('p'),[new Date(item.occurred_at).toLocaleString('tr-TR'),item.actor_name||'Kullanıcı bilgisi yok',({'execution.hold':'Durduruldu','execution.resume':'Durdurma kaldırıldı','execution.cancel':'İptal edildi','production_order.hold':'Beklemeye alındı','production_order.resume':'Bekleme kaldırıldı'})[item.event_type],item.payload?.reason].filter(Boolean).join(' · ')))}box.append(details)}
  target.prepend(box);
 }
 root.RitimConsistencyUI={quantities,execution};
})(globalThis);
