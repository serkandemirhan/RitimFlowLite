(function(root){'use strict';
 const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icons={today:'M3 10l9-7 9 7M5 9v12h14V9M9 21v-7h6v7',jobs:'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',history:'M12 8v5l3 2M3 12a9 9 0 1 0 3-7M3 3v6h6',more:'M4 6h16M4 12h16M4 18h16',quality:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',finish:'M5 12l4 4L20 5',drawing:'M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5'};
 const icon=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(icons[k]||icons.more)+'"/></svg>';
 const tabs=[['today','Bugün'],['jobs','İşlerim'],['history','Geçmiş'],['more','Diğer']];
 let state={key:'',tab:'today',view:null,query:'',machineIds:null},installEvent=null,registration=null,applyingUpdate=false;
 function node(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html)e.innerHTML=html;return e;}
 function select(tab){if(!tabs.some(x=>x[0]===tab))return;state.tab=tab;applyTab();network();const u=new URL(location.href);u.searchParams.set('operatorTab',tab);history.replaceState(history.state,'',u);scrollTo({top:0,behavior:'instant'});}
 function applyTab(){
  for(const e of document.querySelectorAll('[data-op-pane]'))e.hidden=e.dataset.opPane!==state.tab;
  for(const b of document.querySelectorAll('[data-op-tab]')){const active=b.dataset.opTab===state.tab;b.setAttribute('aria-current',active?'page':'false');b.setAttribute('aria-pressed',String(active));}
  if(state.tab==='history'){const completed=document.querySelector('.operator-completed-list');if(completed&&!completed.open){completed.open=true;root.RitimPremiumAPI.loadOperatorHistory();}}
 }
 function openJob(id){state.tab='today';root.RitimPremiumAPI.openAssigned(id);}
 function rank(j){return ({0:1,1:0,2:2,3:3})[j.priority??0];}
 function jobState(j){return j.targetState?.state==='awaiting_quality'?'Kalite onayı bekliyor':j.targetState?.state==='needs_production'?'Eksik üretim bekliyor':({running:'Devam ediyor',paused:'Duraklatıldı',waiting:'Bekliyor',complete:'Tamamlandı',cancelled:'İptal edildi'})[j.status]||j.status;}
 function jobRow(j){const useful=j.targetState?.useful??Math.max(0,(j.producedQuantity||0)-(j.attention?.productionScrap||0)-(j.attention?.rejected||0));return '<span class="op-job-identity"><strong>'+h(j.partName||j.partNumber||j.operation.name)+'</strong><small>'+h([j.workOrderNumber,j.machine?.code,j.operation.name].filter(Boolean).join(' · '))+'</small><span class="op-job-status" data-state="'+h(j.targetState?.state||j.status)+'">'+h(jobState(j))+'</span>'+(j.priority===3?'<span class="op-preview-priority priority-3">Acil</span>':'')+'</span><b class="op-job-progress" aria-label="'+useful+' / '+j.plannedQuantity+' adet">'+useful+'/'+j.plannedQuantity+' <span aria-hidden="true">›</span></b>';}
 function previews(){
  const v=state.view;if(!v)return;const jobs=v.assignedJobs.filter(j=>!['complete','cancelled'].includes(j.status));
  const target=document.querySelector('.op-waiting-preview');if(!target)return;target.hidden=!!v.jobSelected;if(v.jobSelected)return;
  const query=(state.query||'').toLocaleLowerCase('tr-TR').trim();
  const rows=jobs.filter(j=>matchesMachine(j.machine?.id||'none')&&[j.partName,j.workOrderNumber,j.machine?.code,j.operation.name].join(' ').toLocaleLowerCase('tr-TR').includes(query)).sort((a,b)=>rank(b)-rank(a)||(a.queueRank??Infinity)-(b.queueRank??Infinity));
  target.replaceChildren();const title=node('header','','<h3>Bugünkü işlerim <span>'+rows.length+'</span></h3>');const filter=node('button','btn op-filter-button','Filtre');filter.type='button';filter.onclick=openFilters;title.append(filter);target.append(title);
  for(const j of rows){const button=node('button','op-preview-row',jobRow(j));button.type='button';button.dataset.pwaJob=j.id;button.onclick=()=>openJob(j.id);target.append(button);}
  if(!rows.length)target.append(node('p','op-empty-note',query||state.machineIds!==null?'Filtreye uygun iş bulunamadı.':'Size atanmış açık iş yok.'));
 }
 function openFilters(){document.getElementById('op-job-filters')?.showModal();}
 function matchesMachine(id){return state.machineIds===null||state.machineIds.includes(id);}
 function filterJobs(){
  if(!document.querySelector('.operator-pwa'))return false;
  state.query=document.getElementById('operator-query')?.value??state.query;const query=(state.query||'').trim().toLocaleLowerCase('tr-TR');let total=0;
  for(const group of document.querySelectorAll('.operator-job-group')){let count=0;for(const card of group.querySelectorAll('[data-operator-job]')){card.hidden=!(matchesMachine(card.dataset.operatorMachine)&&card.dataset.operatorSearch.includes(query));if(!card.hidden)count++;}group.hidden=!count;const badge=group.querySelector('h3 span');if(badge)badge.textContent=count;total+=count;}
  const empty=document.getElementById('operator-no-match');if(empty)empty.hidden=total>0;
  for(const button of document.querySelectorAll('[data-op-machine]'))button.setAttribute('aria-pressed',String(matchesMachine(button.dataset.opMachine)));
  previews();return true;
 }
 function machineTiles(tools,jobs){
  tools.querySelector('#operator-machine')?.closest('label')?.remove();
  const active=jobs.filter(j=>!['complete','cancelled'].includes(j.status)),machines=[...new Map(active.filter(j=>j.machine).map(j=>[j.machine.id,j.machine])).values()].sort((a,b)=>a.code.localeCompare(b.code,'tr',{numeric:true}));
  if(active.some(j=>!j.machine))machines.push({id:'none',code:'Atanmamış'});
  const field=node('fieldset','op-machine-picker','<legend>Makine</legend>'),actions=node('div','op-machine-selection-actions');
  for(const [label,ids]of [['Hepsini seç',null],['Hiçbirini seçme',[]]]){const b=node('button','btn',label);b.type='button';b.onclick=()=>{state.machineIds=ids===null?null:[];filterJobs();};actions.append(b);}field.append(actions);
  const grid=node('div','op-machine-grid');for(const machine of machines){const chars=Array.from(machine.code),label=chars.length>10?chars.slice(0,10).join('')+'...':machine.code;const b=node('button','op-machine-tile','<span class="op-machine-check" aria-hidden="true">✓</span><span>'+h(label)+'</span>');b.type='button';b.dataset.opMachine=machine.id;b.title=machine.code;b.setAttribute('aria-label',machine.code);b.setAttribute('aria-pressed',String(matchesMachine(machine.id)));b.onclick=()=>{const selected=new Set(state.machineIds===null?machines.map(m=>m.id):state.machineIds);if(selected.has(machine.id))selected.delete(machine.id);else selected.add(machine.id);state.machineIds=[...selected];filterJobs();};grid.append(b);}field.append(grid);tools.append(field);
 }
 function compactJobs(list,jobs){
  for(const card of list.querySelectorAll('[data-operator-job]')){const j=jobs.find(x=>x.id===card.dataset.operatorJob);if(j)card.innerHTML=jobRow(j);}
  const tools=list.querySelector('.operator-list-tools');if(tools){const query=tools.querySelector('#operator-query');if(query)query.value=state.query||'';machineTiles(tools,jobs);const d=node('dialog','operator-pause-dialog op-job-filters','<header><h2>İş filtreleri</h2><button class="btn" type="button" aria-label="Filtreleri kapat">×</button></header>');d.id='op-job-filters';d.querySelector('button').onclick=()=>d.close();d.append(tools);const apply=node('button','btn primary','Uygula');apply.type='button';apply.onclick=()=>{filterJobs();d.close();};d.append(apply);tools.addEventListener('input',filterJobs);document.getElementById('page').append(d);}
 }
 function completedJobs(container,jobs){
  const list=node('section','op-completed-jobs');list.setAttribute('aria-label','Geçmiş işler');
  const rows=jobs.filter(j=>['complete','cancelled'].includes(j.status)).sort((a,b)=>(Date.parse(b.finishedAt)||0)-(Date.parse(a.finishedAt)||0)||a.workOrderNumber.localeCompare(b.workOrderNumber,'tr'));
  for(const j of rows){const button=node('button','operator-job-choice op-history-row',jobRow({...j,targetState:null,producedQuantity:j.completedQuantity??j.targetState?.useful??j.producedQuantity,attention:null,priority:0}));button.type='button';button.dataset.completedJob=j.id;const when=node('small','op-completed-at');when.textContent=(j.status==='cancelled'?'İptal':'Tamamlanma')+': '+(j.finishedAt?new Date(j.finishedAt).toLocaleString('tr-TR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Tarih kaydı bulunmuyor');button.querySelector('.op-job-identity').append(when);button.onclick=()=>openJob(j.id);list.append(button);}
  if(!rows.length)list.append(node('p','op-empty-note','Henüz tamamlanan işiniz yok.'));container.append(list);
 }
 function blockedUpdate(){if(document.querySelector('dialog[open]'))return 'Önce açık işlemi tamamlayın veya kapatın.';if(state.view?.busy||document.getElementById('app')?.getAttribute('aria-busy')==='true')return 'İşlem sonucu bekleniyor.';if(document.getElementById('api-production-qty')?.value)return 'Girdiğiniz miktarı kaydedin veya temizleyin.';if(state.view?.pendingCount)return 'Sonucu belirsiz işlemleri önce doğrulayın.';return '';}
 function network(){
  const online=navigator.onLine!==false;
  for(const badge of document.querySelectorAll('.op-connection')){badge.dataset.online=String(online);badge.textContent=online?'● Çevrimiçi':'● Bağlantı yok';}
  const sync=document.querySelector('[data-op-sync]');if(sync)sync.textContent=online?'Cihaz çevrimiçi. Güncel işler sunucudan doğrulanır; kayıt yalnızca sunucu onayından sonra tamamlanır.':'Bağlantı yok. Miktar taslağı bu pencerede korunur. Otomatik üretim kaydı veya tekrar gönderim yapılmaz.';
  const primary=document.querySelector('.op-production-dialog .operator-submit');if(primary&&document.getElementById('api-production-kind')?.value==='pending')primary.textContent='Üretimi kaydet';
  const offline=document.querySelector('.op-dialog-network');if(offline){offline.hidden=online;offline.textContent='Bağlantı yok. Bu miktar taslaktır; sunucuya gönderilmedi.';}if(!online){const submit=document.querySelector('.operator-submit');if(submit)submit.disabled=true;}
  const update=document.querySelector('[data-op-update]');if(update){update.hidden=!registration?.waiting;const reason=blockedUpdate();update.disabled=!!reason;update.title=reason;const notice=document.querySelector('.op-update-notice');if(notice)notice.textContent=registration?.waiting?(reason||'Yeni sürüm hazır. Geçiş yalnızca siz onayladığınızda yapılır.'):'';}
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
  const section=node('section','op-fast-actions'),production=productionDialog(panel);if(production)section.append(production);
  const secondary=panel.querySelector('.operator-secondary-actions');
  const scrap=secondary?.querySelector('button[onclick*="operator-scrap-dialog"]');if(scrap){scrap.classList.add('op-scrap-launch');section.append(scrap);}
  const grid=node('div','op-fast-grid');
  const drawing=panel.querySelector('.drawing-card .drawing-actions button');if(drawing){drawing.setAttribute('aria-label',drawing.getAttribute('aria-label')||'PDF çizimini aç');drawing.innerHTML=icon('drawing')+'<span>Teknik resim</span>';grid.append(drawing);}
  const quality=secondary?.querySelector('button[onclick*="operator-quality-dialog"]');if(quality){quality.setAttribute('aria-label','Kalite kontrolü iste');quality.innerHTML=icon('quality')+'<span>Kalite iste</span>';grid.append(quality);}
  const finish=panel.querySelector('.operator-finish-ready button,.operator-finish-reason button');if(finish){finish.hidden=false;finish.setAttribute('aria-label','İş emrini bitir');finish.innerHTML=icon('finish')+'<span>İşi bitir</span>';grid.append(finish);}
  if(grid.children.length)section.append(grid);if(section.children.length)(panel.querySelector('.operator-status,.operator-start-action')||panel.querySelector('.operator-quantity-summary')||panel.firstElementChild).after(section);
  if(secondary&&!secondary.querySelector('button'))secondary.remove();
 }
 function mount(v){
  document.body.classList.toggle('operator-pwa-active',v.page==='operator'&&!v.team&&!!v.scope);
  if(v.page!=='operator'||v.team||!v.scope)return;
  const app=document.querySelector('.api-shell'),studio=document.querySelector('.operator-studio');if(!app||!studio||app.dataset.pwaMounted)return;app.dataset.pwaMounted='true';app.classList.add('operator-pwa','operator-lifecycle');
  const key=[v.scope.tenantId,v.scope.siteId,v.scope.actorId].join(':');if(state.key!==key){const requested=new URL(location.href).searchParams.get('operatorTab');state={key,tab:tabs.some(x=>x[0]===requested)?requested:'today',view:v,query:'',machineIds:null};}else state.view=v;
  const main=app.querySelector('main'),bar=node('header','op-app-bar','<a class="op-brand" href="/?view=operator"><span class="op-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 15V9h5l3 9 3-12h5"/></svg></span><strong>Ritim <span>Flow</span></strong></a><div class="op-app-tools"><span class="op-connection" role="status"></span><button type="button" class="op-profile" aria-label="Profil ve uygulama ayarları">'+h((v.identity?.displayName||'OP').split(/\s+/).slice(0,2).map(x=>x[0]).join(''))+'</button></div>');
  const notifications=document.getElementById('operator-notifications');if(notifications)bar.querySelector('.op-app-tools').insertBefore(notifications,bar.querySelector('.op-profile'));bar.querySelector('.op-profile').onclick=()=>select('more');main.prepend(bar);
  const content=document.getElementById('page'),today=node('section','op-pane-today'),jobs=node('section','op-pane-jobs','<header class="op-section-heading"><h2>İşlerim</h2><p>Size atanmış işler · Makine, öncelik ve kuyruk sırası</p></header>'),historyPane=node('section','op-pane-history'),more=morePane(v);
  [today,jobs,historyPane,more].forEach((pane,i)=>{pane.dataset.opPane=tabs[i][0];content.append(pane);});
  const list=studio.querySelector('.operator-list-panel'),completed=list?.querySelector('.operator-completed-list');if(completed){completed.querySelector('summary')?.addEventListener('click',()=>{state.tab='history';});completed.hidden=true;historyPane.append(completed);}
  completedJobs(historyPane,v.assignedJobs);if(list){list.open=true;compactJobs(list,v.assignedJobs);jobs.append(list);const filter=node('button','btn op-filter-button','Filtre');filter.type='button';filter.onclick=openFilters;jobs.querySelector('header').append(filter);}
  const history=studio.querySelector('.operator-history');if(history){history.open=false;const label=history.querySelector('summary');if(label)label.textContent='Seçili işin kayıtları · '+(v.assignedJobs.find(j=>j.id===v.jobSelected)?.workOrderNumber||'');historyPane.append(history);}
  const transitions=v.extras?.productionHistory?.transitions||[];if(transitions.length){const timeline=node('details','op-transition-history','<summary>Başlatma ve duruş geçmişi</summary>');for(const t of transitions)timeline.append(node('article','','<strong>'+h(({start:'Başlatıldı',pause:'Duraklatıldı',resume:'Devam edildi',complete:'Tamamlandı',awaiting_quality:'Kalite onayı bekleniyor',needs_production:'Eksik üretime açıldı',completed:'Otomatik tamamlandı'})[t.action]||t.action)+'</strong><span>'+h(new Date(t.occurredAt).toLocaleString('tr-TR'))+'</span>'+(t.reason?'<p>'+h(t.reason)+'</p>':'')));historyPane.append(timeline);}
  if(!history&&!completed)historyPane.append(node('p','op-empty-note','İşlem geçmişini görmek için önce İşlerim bölümünden bir iş seçin.'));
  const grid=node('div','op-today-grid'),aside=node('aside','op-today-aside');today.append(node('p','op-day-counts'));today.append(grid);grid.append(studio,aside);
  const quality=studio.querySelector('.operator-quality-disclosure');if(quality){quality.open=true;quality.querySelector('summary').textContent='Kalite durumu';aside.append(quality);}
  aside.append(node('section','op-waiting-preview'));studio.querySelector('.operator-welcome')?.remove();const panel=studio.querySelector('.flow-production-panel');if(panel){fastActions(panel);const x=v.productionView?.targetState;if(x?.lifecycle==='awaiting_quality'){
   panel.querySelectorAll('.operator-status,.operator-start-action,.operator-pause-trigger,.op-production-launch,.op-scrap-launch,.operator-finish-ready,.operator-finish-reason,.op-fast-grid [aria-label="İş emrini bitir"]').forEach(e=>e.hidden=true);
   const notice=node('div','op-target-notice','<strong>İstenen üretim hedefi tamamlandı</strong><p>'+h(x.pending)+' adet kalite onayı bekleniyor.</p>');notice.setAttribute('role','status');panel.querySelector('.operator-quantity-summary')?.after(notice);
  }else if(x?.lifecycle==='needs_production'){
   const notice=node('div','op-target-notice','<strong>Kalite sonucu: '+h(x.missing)+' adet eksik</strong><p>İş yeniden üretime açıldı. Devam etmeden önce malzeme ve makine uygunluğunu kontrol edin.</p>');notice.setAttribute('role','status');panel.querySelector('.operator-quantity-summary')?.after(notice);
  }if(x?.bypassed)aside.prepend(node('p','op-shipped-without-quality',h(x.bypassed)+' adet kalite kontrolü yapılmadan sevk edildi. Bu miktar kalan kontrolü engellemez.'));}
  if(!v.jobSelected)grid.classList.add('op-no-selection');
  const bottom=node('nav','op-bottom-nav');bottom.setAttribute('aria-label','Operatör uygulaması');for(const [id,label]of tabs){const button=node('button','',icon(id)+'<span>'+label+'</span>');button.type='button';button.dataset.opTab=id;button.onclick=()=>select(id);bottom.append(button);}main.append(bottom);
  const queueButton=studio.querySelector('.operator-queue-button');if(queueButton)queueButton.onclick=()=>select('jobs');
  filterJobs();applyTab();network();
  // Preserve the existing job-opening command and all its assignment checks.
  if(!root.RitimPremiumAPI.openAssigned.pwaWrapped){const original=root.RitimPremiumAPI.openAssigned;const wrapped=async function(...args){state.tab='today';return original.apply(this,args);};wrapped.pwaWrapped=true;root.RitimPremiumAPI.openAssigned=wrapped;}
 }
 async function register(){if(!('serviceWorker'in navigator)||!isSecureContext||!root.RITIM_CLOUD)return;try{registration=await navigator.serviceWorker.register('/operator-sw.js',{updateViaCache:'none'});registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',network);});network();}catch{const notice=document.querySelector('.op-update-notice');if(notice)notice.textContent='Kurulum bağlantısı kurulamadı; tarayıcıdan çalışmaya devam edebilirsiniz.';}}
 root.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});root.addEventListener('appinstalled',()=>{installEvent=null;const text=document.querySelector('.op-install-help');if(text)text.textContent='Uygulama yüklendi.';});
 root.addEventListener('online',()=>{root.RitimPremiumAPI?.operatorQuantityLabel();network();});root.addEventListener('offline',network);document.addEventListener('input',network);document.addEventListener('close',network,true);
 if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applyingUpdate)location.reload();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',register,{once:true});else register();
 new MutationObserver(()=>{const dialog=document.getElementById('op-production-dialog'),alert=document.getElementById('api-alert');if(dialog?.open&&alert?.textContent.trim()&&state.view?.pendingCount){dialog.close();alert.tabIndex=-1;alert.focus({preventScroll:true});}}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 root.RitimOperatorPWA={mount,select,network,syncPriority(jobs){if(state.view){state.view.assignedJobs=jobs;for(const card of document.querySelectorAll('.operator-job-choice')){const j=jobs.find(x=>x.id===card.dataset.operatorJob);if(j)card.innerHTML=jobRow(j);}filterJobs();}},filterJobs,blockedUpdate};
})(window);
