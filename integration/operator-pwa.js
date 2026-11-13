(function(root){'use strict';
 const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icons={today:'M3 10l9-7 9 7M5 9v12h14V9M9 21v-7h6v7',jobs:'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',history:'M12 8v5l3 2M3 12a9 9 0 1 0 3-7M3 3v6h6',more:'M4 6h16M4 12h16M4 18h16',drawing:'M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5'};
 const icon=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(icons[k]||icons.more)+'"/></svg>';
 const tabs=[['today','Bugün'],['jobs','İşlerim'],['history','Geçmiş'],['more','Diğer']];
 let state={key:'',tab:'today',view:null},installEvent=null,registration=null,applyingUpdate=false;
 function node(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html)e.innerHTML=html;return e;}
 function select(tab){if(!tabs.some(x=>x[0]===tab))return;state.tab=tab;applyTab();network();const u=new URL(location.href);u.searchParams.set('operatorTab',tab);history.replaceState(history.state,'',u);scrollTo({top:0,behavior:'instant'});}
 function applyTab(){
  for(const e of document.querySelectorAll('[data-op-pane]'))e.hidden=e.dataset.opPane!==state.tab;
  for(const b of document.querySelectorAll('[data-op-tab]')){const active=b.dataset.opTab===state.tab;b.setAttribute('aria-current',active?'page':'false');b.setAttribute('aria-pressed',String(active));}
  if(state.tab==='history'){const records=document.querySelector('.op-pane-history .operator-history');if(records)records.open=true;const completed=document.querySelector('.operator-completed-list');if(completed&&!completed.open){completed.open=true;root.RitimPremiumAPI.loadOperatorHistory();}}
 }
 function openJob(id){state.tab='today';root.RitimPremiumAPI.openAssigned(id);}
 function rank(j){return ({0:1,1:0,2:2,3:3})[j.priority??0];}
 function previews(){
  const v=state.view;if(!v)return;const jobs=v.assignedJobs.filter(j=>!['complete','cancelled'].includes(j.status));
  const rows=jobs.filter(j=>j.id!==v.jobSelected).sort((a,b)=>rank(b)-rank(a)||(a.queueRank??Infinity)-(b.queueRank??Infinity));
  const target=document.querySelector('.op-waiting-preview');if(!target)return;
  target.replaceChildren();const title=node('header','','<h3>'+(v.jobSelected?'Diğer işlerim':'Çalışacağınız işi seçin')+' <span>'+rows.length+'</span></h3>');const all=node('button','op-text-button','Tümü ›');all.type='button';all.onclick=()=>select('jobs');title.append(all);target.append(title);
  for(const j of rows.slice(0,5)){const b=node('button','op-preview-row','<span><strong>'+h(j.partName||j.partNumber||j.operation.name)+'</strong><small>'+h(j.machine?.code||'Makine atanmamış')+' · '+h(j.operation.name)+'</small></span><span><b>'+h(j.remainingQuantity??j.plannedQuantity)+' adet</b><small class="op-preview-priority priority-'+(j.priority??0)+'">'+h(['Normal','Düşük','Yüksek','Acil'][j.priority??0])+'</small></span>');b.type='button';b.dataset.pwaJob=j.id;b.onclick=()=>openJob(j.id);target.append(b);}
  if(!rows.length)target.append(node('p','op-empty-note','Başka açık işiniz yok. Yeni atamalar bildirimlerde görünür.'));
  const total=document.querySelector('.op-day-counts');if(total)total.textContent=jobs.filter(j=>j.status==='running').length+' çalışıyor · '+jobs.filter(j=>j.status==='paused').length+' duraklatıldı · '+jobs.filter(j=>j.status==='waiting').length+' bekliyor';
 }
 function blockedUpdate(){if(document.querySelector('dialog[open]'))return 'Önce açık işlemi tamamlayın veya kapatın.';if(state.view?.busy||document.getElementById('app')?.getAttribute('aria-busy')==='true')return 'İşlem sonucu bekleniyor.';if(document.getElementById('api-production-qty')?.value)return 'Girdiğiniz miktarı kaydedin veya temizleyin.';if(state.view?.pendingCount)return 'Sonucu belirsiz işlemleri önce doğrulayın.';return '';}
 function network(){
  const online=navigator.onLine!==false;
  for(const badge of document.querySelectorAll('.op-connection')){badge.dataset.online=String(online);badge.textContent=online?'● Çevrimiçi':'● Bağlantı yok';}
  const sync=document.querySelector('[data-op-sync]');if(sync)sync.textContent=online?'Cihaz çevrimiçi. Güncel işler sunucudan doğrulanır; kayıt yalnızca sunucu onayından sonra tamamlanır.':'Bağlantı yok. Miktar taslağı bu pencerede korunur. Otomatik üretim kaydı veya tekrar gönderim yapılmaz.';
  const primary=document.querySelector('.op-production-dialog .operator-submit');if(primary&&document.getElementById('api-production-kind')?.value==='pending')primary.textContent='Üretimi kaydet';
  const offline=document.querySelector('.op-dialog-network');if(offline){offline.hidden=online;offline.textContent='Bağlantı yok. Bu miktar taslaktır; sunucuya gönderilmedi.';}if(!online){const submit=document.querySelector('.operator-submit');if(submit)submit.disabled=true;}
  const update=document.querySelector('[data-op-update]');if(update){update.hidden=!registration?.waiting;const reason=blockedUpdate();update.disabled=!!reason;update.title=reason;const notice=document.querySelector('.op-update-notice');if(notice)notice.textContent=registration.waiting?(reason||'Yeni sürüm hazır. Geçiş yalnızca siz onayladığınızda yapılır.'):'';}
 }
 function morePane(v){
  const section=node('section','op-pane-more','<header class="op-section-heading"><h2>Diğer</h2><p>'+h(v.identity?.displayName||'Operatör')+'</p></header><div class="op-settings-card"><h3>Uygulama</h3><button type="button" class="btn" data-op-install>Uygulamayı yükle</button><p class="op-install-help"></p><button type="button" class="btn" data-op-update hidden>Yeni sürüme geç</button><p role="status" class="op-update-notice"></p></div><div class="op-settings-card"><h3>Bağlantı ve kayıtlar</h3><p data-op-sync></p><button type="button" class="btn" data-op-refresh>İş listesini yenile</button></div><div class="op-settings-card"><h3>Hesap ve iş yeri</h3><a class="btn" href="/auth/account">Şifremi değiştir</a><button type="button" class="btn" data-op-site>İş yeri değiştir</button><button type="button" class="btn" data-op-notifications>İş bildirimleri</button><button type="button" class="btn" data-op-logout>Çıkış yap</button></div>');
  section.querySelector('[data-op-refresh]').onclick=()=>root.RitimPremiumAPI.refreshAssigned();section.querySelector('[data-op-site]').onclick=()=>root.RitimPremiumAPI.changeSite();section.querySelector('[data-op-logout]').onclick=()=>root.RitimPremiumAPI.logout();section.querySelector('[data-op-notifications]').onclick=()=>root.RitimPremiumAPI.showNotifications();
  section.querySelector('[data-op-install]').onclick=install;
  section.querySelector('[data-op-update]').onclick=()=>{const message=blockedUpdate();if(message){section.querySelector('.op-update-notice').textContent=message;return;}if(registration?.waiting){applyingUpdate=true;registration.waiting.postMessage({type:'ACTIVATE_OPERATOR_UPDATE'});}};
  return section;
 }
 async function install(){
  const help=document.querySelector('.op-install-help');if(!help)return;
  if(matchMedia('(display-mode: standalone)').matches||navigator.standalone){help.textContent='Uygulama zaten bağımsız pencerede açık.';return;}
  if(installEvent){const e=installEvent;installEvent=null;await e.prompt();const choice=await e.userChoice;help.textContent=choice.outcome==='accepted'?'Kurulum tarayıcı tarafından başlatıldı.':'Kurulum iptal edildi; mevcut ekranda çalışmaya devam edebilirsiniz.';return;}
  help.textContent=/iPad|iPhone|iPod/.test(navigator.userAgent)?'Safari’de Paylaş düğmesine, ardından Ana Ekrana Ekle seçeneğine dokunun.':'Tarayıcınızın menüsünden “Uygulamayı yükle” veya “Ana ekrana ekle” seçeneğini kullanın.';
 }
 function productionDialog(panel){
  const form=panel.querySelector('.operator-report-form');if(!form||form.hidden)return null;
  const d=node('dialog','op-production-dialog operator-pause-dialog','<header><h2 id="op-production-title">Üretim kaydet</h2><button type="button" class="btn" aria-label="Üretim girişini kapat">×</button></header><p>Son kaydınızdan sonraki yeni üretim adedini girin. Toplamı tekrar yazmayın.</p>');d.insertAdjacentHTML('beforeend','<p class="op-dialog-network" role="status" hidden></p>');d.id='op-production-dialog';d.setAttribute('aria-labelledby','op-production-title');
  const totals=state.view?.productionView?.outputs||{};d.insertAdjacentHTML('beforeend','<p class="op-production-before">Şu ana kadar kaydedilen üretim: <strong>'+h(Number(totals.pending||0)+Number(totals.good||0))+' adet</strong></p>');const close=d.querySelector('button');close.onclick=()=>d.close();d.append(form);
  const source=panel.querySelector('.p1-input-lot');if(source)d.append(source);
  const submit=form.querySelector('.operator-submit');if(submit)submit.innerHTML='Üretimi kaydet';
  panel.append(d);const button=node('button','btn primary op-production-launch','+ Üretim kaydet');button.type='button';button.disabled=!!state.view?.pendingCount;button.dataset.opProduction='';button.onclick=()=>{d.showModal();form.querySelector('#api-production-qty')?.focus();};return button;
 }
 function fastActions(panel){
  const section=node('section','op-fast-actions','<h3>Hızlı işlemler</h3>'),production=productionDialog(panel);if(production)section.append(production);
  const secondary=panel.querySelector('.operator-secondary-actions');
  const scrap=secondary?.querySelector('button[onclick*="operator-scrap-dialog"]');if(scrap){scrap.classList.add('op-scrap-launch');section.append(scrap);}
  const grid=node('div','op-fast-grid');
  const drawing=panel.querySelector('.drawing-card .drawing-actions button');if(drawing){drawing.setAttribute('aria-label',drawing.getAttribute('aria-label')||'PDF çizimini aç');drawing.innerHTML=icon('drawing')+'<span>Teknik resim</span>';grid.append(drawing);}
  const quality=secondary?.querySelector('button[onclick*="operator-quality-dialog"]');if(quality){quality.setAttribute('aria-label','Kalite kontrolü iste');quality.innerHTML='<span aria-hidden="true">✓</span><span>Kalite iste</span>';grid.append(quality);}
  const finish=panel.querySelector('.operator-finish-ready button,.operator-finish-reason button');if(finish){finish.hidden=false;finish.setAttribute('aria-label','İş emrini bitir');grid.append(finish);}
  if(grid.children.length)section.append(grid);if(section.children.length>1)(panel.querySelector('.operator-status,.operator-start-action')||panel.querySelector('.operator-quantity-summary')||panel.firstElementChild).after(section);
  if(secondary&&!secondary.querySelector('button'))secondary.remove();
 }
 function mount(v){
  document.body.classList.toggle('operator-pwa-active',v.page==='operator'&&!v.team&&!!v.scope);
  if(v.page!=='operator'||v.team||!v.scope)return;
  const app=document.querySelector('.api-shell'),studio=document.querySelector('.operator-studio');if(!app||!studio||app.dataset.pwaMounted)return;app.dataset.pwaMounted='true';app.classList.add('operator-pwa','operator-lifecycle');
  const key=[v.scope.tenantId,v.scope.siteId,v.scope.actorId].join(':');if(state.key!==key){const requested=new URL(location.href).searchParams.get('operatorTab');state={key,tab:tabs.some(x=>x[0]===requested)?requested:'today',view:v};}else state.view=v;
  const main=app.querySelector('main'),bar=node('header','op-app-bar','<a class="op-brand" href="/?view=operator"><span class="op-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 15V9h5l3 9 3-12h5"/></svg></span><strong>Ritim <span>Flow</span></strong></a><div class="op-app-tools"><span class="op-connection" role="status"></span><button type="button" class="op-profile" aria-label="Profil ve uygulama ayarları">'+h((v.identity?.displayName||'OP').split(/\s+/).slice(0,2).map(x=>x[0]).join(''))+'</button></div>');
  const notifications=document.getElementById('operator-notifications');if(notifications)bar.querySelector('.op-app-tools').insertBefore(notifications,bar.querySelector('.op-profile'));bar.querySelector('.op-profile').onclick=()=>select('more');main.prepend(bar);
  const content=document.getElementById('page'),today=node('section','op-pane-today'),jobs=node('section','op-pane-jobs','<header class="op-section-heading"><h2>İşlerim</h2><p>Size atanmış işler · Makine, öncelik ve kuyruk sırası</p></header>'),historyPane=node('section','op-pane-history','<header class="op-section-heading"><h2>Geçmiş</h2><p>Seçili işin kayıtları ve tamamlanan işleriniz</p></header>'),more=morePane(v);
  [today,jobs,historyPane,more].forEach((pane,i)=>{pane.dataset.opPane=tabs[i][0];content.append(pane);});
  const list=studio.querySelector('.operator-list-panel'),completed=list?.querySelector('.operator-completed-list');if(completed){completed.querySelector('summary')?.addEventListener('click',()=>{state.tab='history';});historyPane.append(completed);}
  if(list){list.open=true;jobs.append(list);}
  const history=studio.querySelector('.operator-history');if(history)historyPane.append(history);
  const transitions=v.extras?.productionHistory?.transitions||[];if(transitions.length){const timeline=node('details','op-transition-history','<summary>Başlatma ve duruş geçmişi</summary>');for(const t of transitions)timeline.append(node('article','','<strong>'+h(({start:'Başlatıldı',pause:'Duraklatıldı',resume:'Devam edildi',complete:'Tamamlandı'})[t.action]||t.action)+'</strong><span>'+h(new Date(t.occurredAt).toLocaleString('tr-TR'))+'</span>'+(t.reason?'<p>'+h(t.reason)+'</p>':'')));historyPane.append(timeline);}
  if(!history&&!completed)historyPane.append(node('p','op-empty-note','İşlem geçmişini görmek için önce İşlerim bölümünden bir iş seçin.'));
  const grid=node('div','op-today-grid'),aside=node('aside','op-today-aside');today.append(node('p','op-day-counts'));today.append(grid);grid.append(studio,aside);
  const quality=studio.querySelector('.operator-quality-disclosure');if(quality){quality.open=true;quality.querySelector('summary').textContent='Kalite durumu';aside.append(quality);}
  aside.append(node('section','op-waiting-preview'));const panel=studio.querySelector('.flow-production-panel');if(panel)fastActions(panel);
  const bottom=node('nav','op-bottom-nav');bottom.setAttribute('aria-label','Operatör uygulaması');for(const [id,label]of tabs){const button=node('button','',icon(id)+'<span>'+label+'</span>');button.type='button';button.dataset.opTab=id;button.onclick=()=>select(id);bottom.append(button);}main.append(bottom);
  const queueButton=studio.querySelector('.operator-queue-button');if(queueButton)queueButton.onclick=()=>select('jobs');
  previews();applyTab();network();
  // Preserve the existing job-opening command and all its assignment checks.
  if(!root.RitimPremiumAPI.openAssigned.pwaWrapped){const original=root.RitimPremiumAPI.openAssigned;const wrapped=async function(...args){state.tab='today';return original.apply(this,args);};wrapped.pwaWrapped=true;root.RitimPremiumAPI.openAssigned=wrapped;}
 }
 async function register(){if(!('serviceWorker'in navigator)||!isSecureContext||!root.RITIM_CLOUD)return;try{registration=await navigator.serviceWorker.register('/operator-sw.js',{updateViaCache:'none'});registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',network);});network();}catch{const notice=document.querySelector('.op-update-notice');if(notice)notice.textContent='Kurulum bağlantısı kurulamadı; tarayıcıdan çalışmaya devam edebilirsiniz.';}}
 root.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});root.addEventListener('appinstalled',()=>{installEvent=null;const text=document.querySelector('.op-install-help');if(text)text.textContent='Uygulama yüklendi.';});
 root.addEventListener('online',()=>{root.RitimPremiumAPI?.operatorQuantityLabel();network();});root.addEventListener('offline',network);document.addEventListener('input',network);document.addEventListener('close',network,true);
 if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applyingUpdate)location.reload();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',register,{once:true});else register();
 new MutationObserver(()=>{const dialog=document.getElementById('op-production-dialog'),alert=document.getElementById('api-alert');if(dialog?.open&&alert?.textContent.trim()&&state.view?.pendingCount){dialog.close();alert.tabIndex=-1;alert.focus({preventScroll:true});}}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 root.RitimOperatorPWA={mount,select,network,syncPriority(jobs){if(state.view){state.view.assignedJobs=jobs;previews();}},blockedUpdate};
})(window);
