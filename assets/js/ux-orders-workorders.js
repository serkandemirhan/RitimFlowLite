/* UX-03 & UX-04 · Safe progressive enhancements to the existing demo */
(function(){'use strict';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function enrichDetails(){
 const stage= document.querySelector('#page .detail-grid'); if(!stage)return;
 const current=typeof window.chosenJob!=='undefined'?window.chosenJob:null;
 // Legacy global `chosenJob` is lexical in the original script; lookup using page's visible identifier.
 const title=document.querySelector('.header h1')?.textContent||'';
 const existing=document.querySelector('#page .ux-stage-overview');if(existing)return;
 if(title.includes('Sipariş Detayı')){
   const cards=[...document.querySelectorAll('#page .kv b')];
   const orderId=cards.map(x=>x.textContent.trim()).find(x=>/^DEMO-SIP-|^SIP-/.test(x));
   let data=window.ritimUXBridge?.getState?.();
   // Rendered details are enriched only if legacy helper functions are available.
   if(orderId&&!!window.ritimUXBridge?.order&&!!window.ritimUXBridge?.shipmentSummary){
      const o=window.ritimUXBridge.order(orderId);if(!o)return;const summary=window.ritimUXBridge.shipmentSummary(o);
      const section=document.createElement('section');section.className='card pad ux-stage-overview';
      section.innerHTML='<div class="ux-stage-header"><h3>Operasyon & Sevkiyat Durumu</h3><span class="tiny">Sipariş düzeyi</span></div><p class="ux-stage-caption">Net müşteri sevkiyatı ortak hareket modelinden hesaplanır. Eski örnek dağılımlar aktif stok değildir.</p><div class="ux-stage-pills">'+summary.buckets.map(b=>'<div class="ux-stage-pill '+(b.name==='Sevk Edildi'?'shipped':'')+'"><span>'+safe(b.name)+'</span><b>'+Number(b.qty)+' <small>adet</small></b></div>').join('')+'</div>';
      stage.parentElement.insertBefore(section,stage);
   }
 }else if(title.includes('İş Emri Detayı')){
  const cards=[...document.querySelectorAll('#page .kv b')];const jobId=cards.map(x=>x.textContent.trim()).find(x=>/^DEMO-IE-|^WO-/.test(x));
  if(jobId&&!!window.ritimUXBridge?.job){
   const j=window.ritimUXBridge.job(jobId);if(!j)return;
   const planned=Number(j.plannedQty||0);
   const section=document.createElement('section');section.className='card pad ux-stage-overview';
   section.innerHTML='<div class="ux-stage-header"><h3>İş Emri Özeti</h3></div><div class="ux-wo-grid"><div class="ux-wo-metric"><span>Planlanan</span><b>'+(planned||'—')+'</b></div><div class="ux-wo-metric"><span>Sağlam</span><b>'+Number(j.good||0)+'</b></div><div class="ux-wo-metric"><span>Hurda</span><b>'+Number(j.scrap||0)+'</b></div></div><div class="ux-workflow-warning"><strong>Üretim başlangıcı kontrolü</strong>Üretim için fiziksel teslim ve iş sorumluluğu doğrulanır. Kontrol bekleyen ve rework miktarı sevke hazır stok değildir.</div>';
   stage.parentElement.insertBefore(section,stage);
  }
 }
}
function findOptions(key,typed){const v=typed.toLocaleLowerCase('tr-TR');const st=window.ritimUXBridge?.getState?.();if(!st||!Array.isArray(st.orders))return[];const unique=new Set();for(const o of st.orders){const label=String(key==='customer'?o.customer:o.part||'');if(label.toLocaleLowerCase('tr-TR').includes(v))unique.add(label)}return [...unique].slice(0,7)}
function enhanceWizard(){const modal=document.querySelector('.modal-body');if(!modal)return;
 for(const key of ['customer','part']){
 const input=modal.querySelector('[data-wiz="'+key+'"]');if(!input||input.dataset.uxSearch)return;input.dataset.uxSearch='yes';input.setAttribute('autocomplete','off');
 const results=document.createElement('div');results.className='ux-suggestions';results.hidden=true;input.after(results);
 const help=document.createElement('div');help.className='ux-help';help.textContent='3 karakter yazınca kayıtlı '+(key==='customer'?'müşteriler':'ürünler')+' listelenir. Yeni kayıt yazmaya da devam edebilirsin.';results.after(help);
 const update=()=>{const typed=input.value.trim();results.replaceChildren();if(typed.length<3){results.hidden=true;return}const matches=findOptions(key,typed);for(const str of matches){const b=document.createElement('button');b.type='button';b.className='ux-suggestion';b.textContent=str;b.addEventListener('click',()=>{input.value=str;input.dispatchEvent(new Event('input',{bubbles:true}));results.hidden=true;input.focus()});results.append(b)}results.hidden=!matches.length};input.addEventListener('input',update);input.addEventListener('focus',update);update();
 }
}
function enhanceOperator(){const container=document.querySelector('#page .operator');if(!container||container.querySelector('.ux-workflow-warning'))return;const el=document.createElement('div');el.className='ux-workflow-warning';el.innerHTML='<strong>Demo işlem modeli</strong>Yerel demo: kayıtlar bu tarayıcıda saklanır. Üretim için teslim, kalite ve miktar kontrolleri uygulanır; kullanıcı seçimi gerçek kimlik doğrulama değildir.';container.prepend(el)}
function enrich(){enhanceWizard();enrichDetails();enhanceOperator()}
let running=false;const root=document.getElementById('app'),overlay=document.getElementById('overlay');if(!root)return;
const ob=new MutationObserver(()=>{if(running)return;running=true;requestAnimationFrame(()=>{running=false;enrich()})});ob.observe(root,{childList:true,subtree:true});if(overlay)ob.observe(overlay,{childList:true,subtree:true});enrich();
})();
