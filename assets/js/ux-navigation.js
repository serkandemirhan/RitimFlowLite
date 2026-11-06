/* Navigation only: existing screens and commands remain the source of truth. */
(function () {
  'use strict';
  const areas = [['home','Genel Bakış'],['orders','Siparişler'],['planning','Planlama'],['production','Üretim'],['quality','Kalite'],['warehouse','Depo'],['logistics','Lojistik']];
  let activeArea = 'home', orderSection = 'orders';
  const oldShell = shell, oldRender = render;
  const links = {
    planning: [['Planlama Panosu',"RitimUXPlanning.open()"],['İş Emirleri',"go('jobs')"]],
    production: [['İşlerim',"go('myjobs')"],['Aktif Üretim',"go('production')"],['Operasyon Transferleri',"RitimUXTransfers.open()"],['Atamalar · İş emri seç',"go('jobs')"]],
    quality: [['Kontroller',"go('quality')"],['Rework',"RitimNavigation.quality('Rework İş Emirleri')"],['Kalite Geçmişi',"RitimNavigation.quality('Tamamlanan Kontroller')"]],
    warehouse: [['Mal Kabul',"RitimNavigation.movement('material')"],['Stok Sorgula',"RitimStockUI.open()"],['İşe Teslim',"RitimNavigation.movement('allocate')"]],
    logistics: [['Sevkiyat',"go('shipping')"],['Fason',"RitimNavigation.movement('external')"],['Fason Dönüşü',"RitimNavigation.movement('return')"]],
    administration: [['Tanılama / Denetim',"go('audit')"],['Tüm Ekranlar',"go('more')"],['Veri Güvenliği / Yedek',"openDataSafety()"]]
  };
  const label = id => areas.find(x => x[0] === id)?.[1] || 'Yönetim / Ayarlar';
  function buttons(cls) { return areas.map(([id,name]) => `<button type="button" class="${cls}${activeArea===id?' active':''}" ${activeArea===id?'aria-current="page"':''} onclick="RitimNavigation.open('${id}')">${name}</button>`).join(''); }
  shell = function () {
    const mapped = {home:'home',orders:'orders',orderDetail:'orders',jobs:'planning',planning:'planning',detail:'planning',myjobs:'production',production:'production',transfers:'production',quality:'quality',shipping:'logistics',audit:'administration',more:'administration'};
    if (mapped[view]) activeArea = mapped[view];
    if (view === 'stock' && !['warehouse','logistics','orders'].includes(activeArea)) activeArea='warehouse';
    let html = oldShell();
    const sidebar = `<aside class="sidebar"><div class="brand"><span class="mark">R</span><span>Ritim Flow<small>MANUFACTURING</small></span></div><nav aria-label="Ana gezinme">${buttons('side-btn')}</nav><div class="sidebar-note"><button class="side-btn" onclick="RitimNavigation.open('administration')">Yönetim / Ayarlar</button><button class="side-btn" onclick="document.querySelector('.user-select')?.focus()">Profil / Tesis</button><button class="btn sm" onclick="openDataSafety()">Veri Güvenliği / Ayrı Demo</button></div></aside>`;
    html = html.replace(/<aside class="sidebar">[\s\S]*?<\/aside>/, sidebar);
    html = html.replace(/<nav class="bottomnav"[\s\S]*?<\/nav>/, `<nav class="bottomnav ritim-main-mobile" aria-label="Mobil ana gezinme">${buttons('')}<button type="button" ${activeArea==='administration'?'class="active" aria-current="page"':''} onclick="RitimNavigation.open('administration')">Yönetim</button></nav>`);
    return html;
  };
  render = function () {
    if (view !== 'workspace') {const result=oldRender();if(activeArea==='orders'){if(view==='orders'||view==='orderDetail')orderSection='orders';document.getElementById('page')?.insertAdjacentHTML('afterbegin',`<nav class="api-secondary-nav" aria-label="Sipariş işlemleri">${[['orders','Tüm Siparişler'],['returns','İadeler'],['compensations','Telafiler']].map(([key,name])=>`<button class="btn${orderSection===key?' active':''}" ${orderSection===key?'aria-current="page"':''} onclick="RitimNavigation.orderSection('${key}')">${name}</button>`).join('')}</nav>`)}return result;}
    el('app').innerHTML = shell();
    document.querySelector('.header h1').textContent = label(activeArea);
    const items = links[activeArea] || [];
    el('page').innerHTML = `<section class="card pad"><h2>${label(activeArea)}</h2><div class="ritim-workspace-links">${items.map(([name,action])=>`<button class="btn" onclick="${action}">${name}</button>`).join('')}${activeArea==='warehouse'?'<button class="btn" disabled>Stok Taşı</button><button class="btn" disabled>Hurda</button>':''}</div>${activeArea==='warehouse'?'<p class="tiny">Depo konumları arası taşıma ve depo hurdası yerel demoda desteklenmez. API modunda Depo ekranını kullanın.</p>':''}</section>`;
  };
  window.RitimNavigation = {
    open(area) { activeArea=area; if(area==='home'||area==='orders') go(area); else { view='workspace'; render(); window.scrollTo(0,0); } },
    area() { return activeArea; },
    orderSection(section){activeArea='orders';orderSection=section;if(section==='orders')go('orders');else RitimStockUI.open('',section)},
    movement(tab) { if(tab==='customerReturn'){activeArea='orders';orderSection='returns'}RitimUX06.openContext(state.orders[0]?.id || '', tab); },
    quality(heading) { go('quality'); const target=[...document.querySelectorAll('#page h2,#page h3')].find(node=>node.textContent.trim().startsWith(heading)); target?.scrollIntoView({block:'start'}); }
  };
}());
