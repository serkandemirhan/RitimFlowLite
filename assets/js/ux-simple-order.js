/* Fictional demo order entry. All writes use the existing protected commit. */
(function () {
  'use strict';
  if (API_MODE) return;
  const originalModal = renderModal;
  openWizard = function () {
    if (state.user !== 'Yönetici') return toast('Sipariş oluşturmak için Yönetici seçin.');
    wizard = {step:1,id:'SIP-'+Date.now(),customer:'',part:'',partNo:'',qty:1,due:'',created:new Date().toISOString().slice(0,10),revision:'',material:'',dimensions:'',drawing:'',route:[]};
    modal='wizard'; renderModal();
  };
  wizardNext = function (n) {
    captureWizard();
    if (n>1 && wizard.step===1 && (!wizard.customer.trim() || !wizard.part.trim() || !Number.isSafeInteger(wizard.qty) || wizard.qty<1 || !wizard.due)) return toast('Müşteri, parça, adet ve teslim tarihi gerekli.');
    wizard.step=n>1?3:1; renderModal();
  };
  wizardContent = function () {
    const w=wizard, field=(key,label,type='text',extra='')=>`<label class="formfield">${label}<input class="input" data-wiz="${key}" type="${type}" value="${esc(w[key])}" ${extra}></label>`;
    const progress=`<div class="step-progress">${[1,3].map(n=>`<span class="${n<=w.step?'on':''}"></span>`).join('')}</div>`;
    if(w.step===1) return progress+`<div class="formgrid">${field('customer','Müşteri / Firma')}${field('part','Parça / Ürün')}${field('qty','Sipariş Adedi','number','min="1" step="1"')}${field('due','İstenen Teslim Tarihi','date')}</div><details><summary>Ek bilgiler</summary><div class="formgrid">${field('id','Sipariş Numarası')}${field('partNo','Parça Numarası')}${field('material','Malzeme')}${field('dimensions','Ölçüler')}</div></details>`;
    return progress+`<div class="card pad"><h3>Sipariş Özeti</h3><p>${esc(w.customer)} · ${esc(w.part)}</p><p>${esc(w.id)} · ${w.qty} adet · ${esc(w.due)}</p><p>Operasyon rotası üretim emri oluşturulurken belirlenir.</p></div>`;
  };
  renderModal = function () {
    originalModal();
    if(modal==='wizard') {
      const heading=document.querySelector('.wizard-modal .modal-head h2');
      if(heading) heading.textContent=wizard.step===1?'1 / 2 · Sipariş Bilgileri':'2 / 2 · Siparişi Gözden Geçir';
      if(wizard.step===3){const back=document.querySelector('.wizard-modal .modal-foot .btn:not(.primary)');if(back)back.setAttribute('onclick','wizardNext(1)')}
      const button=document.querySelector('.wizard-modal .modal-foot .primary');
      if(button && wizard.step===3) button.textContent='Siparişi Kaydet';
    }
  };
  createOrder = function () {
    captureWizard(); const w=structuredClone(wizard);
    if(state.user!=='Yönetici') return toast('Sipariş oluşturmak için Yönetici gerekli.');
    if(!w.id.trim()||!w.customer.trim()||!w.part.trim()||!Number.isSafeInteger(w.qty)||w.qty<1||!w.due) return toast('Sipariş bilgilerini kontrol edin.');
    w.route=[];const {step,...record}=w; record.id=record.id.trim(); if(!record.route.length) record.routeDeferred=true;
    return commitState(draft=>{if(draft.user!=='Yönetici')return {ok:false,message:'Yönetici gerekli.'};if(draft.orders.some(o=>o.id===record.id))return {ok:false,message:'Sipariş numarası zaten mevcut.'};draft.orders.unshift(record);return {ok:true}}, {command:{kind:'orders.create',args:{order:record}},success:'Sipariş başarıyla oluşturuldu.',after:()=>{closeModal();openOrder(record.id)}});
  };
  window.RitimDemoOrder={defer(){captureWizard();wizard.route=[];wizard.step=3;renderModal()},define(id){const value=document.getElementById('demo-route-name')?.value;if(!value||!OPS.includes(value))return toast('Operasyon seçin.');return commitState(draft=>{if(draft.user!=='Yönetici')return {ok:false,message:'Yönetici gerekli.'};const o=draft.orders.find(x=>x.id===id);if(!o||!o.routeDeferred||o.route.length||draft.jobs.some(j=>j.order===id))return {ok:false,message:'Rota artık değiştirilemiyor.'};o.route=[value];delete o.routeDeferred;return {ok:true}},{command:{kind:'orders.defineRoute',args:{id,value}},success:'Rota kaydedildi.',after:()=>openOrder(id)})}};
  const previousOrderDetail=orderDetail;
  orderDetail=function(){const o=order(chosenJob),html=previousOrderDetail();if(!o?.routeDeferred)return html;return `<section class="card pad"><h3>Rota henüz belirlenmedi</h3><p>Planlamadan önce operasyonu seçin.</p><label class="formfield">İlk operasyon<select class="select" id="demo-route-name">${OPS.filter(x=>!['Kaplama','Fason','Dış işlem'].includes(x)).map(x=>`<option>${esc(x)}</option>`).join('')}</select></label><button class="btn" onclick="RitimDemoOrder.define(${jsArg(o.id)})" ${state.user==='Yönetici'?'':'disabled'}>Rotayı Kaydet</button></section>`+html};
}());
