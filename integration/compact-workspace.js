/* Presentation only: move existing controls; keep their IDs, form ownership and handlers. */
(function(root){
 'use strict';
 const $=(s,within=document)=>within?.querySelector(s)||null,$$=(s,within=document)=>[...(within?.querySelectorAll(s)||[])];
 const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n};
 const button=(text,fn)=>{const b=node('button','btn',text);b.type='button';b.onclick=fn;return b};
 const titles={'production-orders':'Üretim Emirleri',jobs:'İş Emirleri',compensations:'Telafi Takibi','production-monitor':'Üretim Takibi',orders:'Siparişler',shipping:'Sevkiyat',outsourcing:'Fason',returns:'Müşteri İadeleri','quality-list':'Kalite Kontrol','quality-control':'Kalite Kontrolü',rework:'Tamir'};
 const inventoryTitles={receipt:'Mal Kabul',move:'Konumlar Arası Transfer',pick:'Üretime Malzeme Teslimi',stock:'Stok Durumu',scrap:'Hurda',history:'Hareket Geçmişi'};
 const localSearches=new Map();
 let lifecycle;
 function CompactPageHeader(ctx,shell){
  const heading=$('.workspace-header h1',shell);if(!heading)return;
  const count=ctx.page==='orders'?ctx.ordersTotal:ctx.page==='jobs'?ctx.jobsTotal:ctx.page==='production-orders'?ctx.productionTotal:ctx.page==='quality-list'?ctx.qualityControlsTotal:null;
  heading.textContent=ctx.page==='inventory'?inventoryTitles[ctx.inventoryTask]||'Malzeme ve Depo':titles[ctx.page];
  if(Number.isFinite(count))heading.append(node('span','compact-page-count',String(count)));
  $('.workspace-header',shell)?.classList.add('compact-page-header');
  $('.workspace-header-tools',shell)?.classList.add('page-action-group');
 }
 function PageTabs(shell,ctx={}){
  for(const nav of $$('.api-secondary-nav,.api-inventory-tasks',shell)){
   if(nav.classList.contains('api-inventory-tasks')&&ctx.page==='inventory'){
    const buttons=new Map();for(const b of $$(':scope>button',nav)){const key=b.dataset.inventoryTab||b.getAttribute('onclick')?.match(/inventorySelectTask\(['"]([^'"]+)['"]\)/)?.[1];if(key)buttons.set(key,b)}
    // The raw-material issue variant previously exposed only four of the six warehouse tasks.
    for(const [key,label]of Object.entries(inventoryTitles)){
     const b=buttons.get(key)||button(label,()=>root.RitimPremiumAPI.inventorySelectTask(key));b.dataset.inventoryTab=key;b.type='button';b.setAttribute('aria-pressed',String(ctx.inventoryTask===key));nav.append(b);
    }
   }
   nav.classList.add('compact-page-tabs');
   // Existing navigation handlers and current-page semantics remain authoritative.
   for(const b of $$(':scope>button',nav))if(b.getAttribute('aria-pressed')==='true'||b.getAttribute('aria-current')==='page')b.classList.add('compact-tab-active');
  }
 }
 function ContextualToolbar(bar){
  if(!bar)return null;bar.classList.add('contextual-toolbar');bar.setAttribute('aria-label','Liste araçları');
  for(const label of $$('label',bar)){
   if(label.closest('.compact-filter-content,.compact-view-content'))continue;
   const field=$('input:not([type=checkbox]),select',label);if(!field)continue;
   if(!field.getAttribute('aria-label'))field.setAttribute('aria-label',label.textContent.trim()||field.placeholder||'Arama');
   label.classList.add('compact-toolbar-field');
   for(const n of [...label.childNodes])if(n.nodeType===3)n.textContent='';
  }
  for(const input of $$('input[type=search],input:not([type])',bar))if(!input.closest('.compact-filter-content')){
   input.classList.add('compact-toolbar-search');input.setAttribute('aria-label',input.getAttribute('aria-label')||input.placeholder||'Kayıtlarda ara');
  }
  return bar;
 }
 function ExpandableFilterPanel(bar,fields=[],existing){
  const panel=existing||node('details','');panel.classList.add('compact-filter-panel');
  let summary=$(':scope>summary',panel);if(!summary){summary=node('summary','','Filtreler');panel.prepend(summary)}
  let content=$(':scope>.compact-filter-content',panel);
  if(!content){content=node('div','compact-filter-content');for(const child of [...panel.childNodes])if(child!==summary)content.append(child);panel.append(content)}
  for(const f of fields)if(f)content.append(f);
  if(!panel.isConnected||panel.parentElement!==bar)bar.append(panel);
  panel.open=false;summary.textContent='Filtreler';
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();panel.open=false;summary.focus()}});
  return panel;
 }
 function ViewPreferences(bar,items=[],existing){
  const panel=existing||node('details','');panel.classList.add('compact-view-preferences');
  let summary=$(':scope>summary',panel);if(!summary){summary=node('summary','','Görünüm');panel.prepend(summary)}
  const content=node('div','compact-view-content');
  for(const child of [...panel.childNodes])if(child!==summary)content.append(child);
  for(const item of items)if(item)content.append(item);
  summary.textContent='Görünüm';panel.append(content);bar.append(panel);panel.open=false;
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();panel.open=false;summary.focus()}});
  return panel;
 }
 function PageActionGroup(bar){
  const items=$$(':scope>.compact-columns,:scope>.compact-view-preferences,:scope>.orders-grid-help,:scope>button[onclick*="navigate"]',bar);
  if(!items.length)return;
  const anchors=items.map(item=>{const anchor=document.createComment('secondary action');item.before(anchor);return anchor});
  const menu=node('details','compact-secondary-actions'),summary=node('summary','','⋯'),content=node('div','compact-secondary-content');summary.setAttribute('aria-label','Diğer liste araçları');summary.title='Diğer liste araçları';
  menu.append(summary,content);bar.append(menu);
  const media=matchMedia('(max-width:700px)'),layout=()=>{
   menu.open=false;menu.hidden=!media.matches;
   if(media.matches)content.append(...items);else items.forEach((item,i)=>anchors[i].after(item));
  };layout();media.addEventListener('change',layout,{signal:lifecycle.signal});
  menu.addEventListener('keydown',e=>{if(e.key==='Escape'&&media.matches){menu.open=false;summary.focus()}});
 }
 function statusSelect(nav,label='Durum'){
  if(!nav)return null;
  const controls=$$('button',nav);if(!controls.length)return null;
  const select=node('select','select compact-status-filter');select.setAttribute('aria-label',label);
  let matched=false;
  for(const [i,b]of controls.entries()){const option=new Option(b.textContent.trim(),String(i));option.selected=b.getAttribute('aria-pressed')==='true'||b.classList.contains('active');matched=matched||option.selected;select.add(option)}
  if(!matched){const custom=new Option('Özel filtre','',true,true);custom.disabled=true;select.add(custom)}
  select.onchange=()=>controls[Number(select.value)]?.click();nav.before(select);nav.hidden=true;return select;
 }
 function filterChips(bar,fields,panel){
  const old=$(':scope>.active-filter-chips',bar.parentElement);old?.remove();
  const chips=node('div','active-filter-chips');chips.setAttribute('aria-label','Aktif filtreler');
  let count=0;
  for(const config of fields){
   const field=typeof config.field==='string'?document.getElementById(config.field):config.field;if(!field)continue;
   const value=field.value;if(!value||value===config.empty||config.skipValues?.includes(value))continue;count++;
   if(value===config.hideValue)continue;
   const text=config.label+': '+(field.tagName==='SELECT'?field.selectedOptions[0]?.textContent:value);
   const chip=button(text+' ×',()=>{
    if(config.clear)return config.clear();
    field.value=config.empty||'';field.dispatchEvent(new Event('input',{bubbles:true}));
    if(config.immediate)field.dispatchEvent(new Event('change',{bubbles:true}));
    else field.form?.requestSubmit();
   });chip.className='active-filter-chip';chip.setAttribute('aria-label',text+' filtresini kaldır');chips.append(chip);
  }
  if(panel){const summary=$(':scope>summary',panel);summary.textContent='Filtreler'+(count?' · '+count:'');summary.classList.toggle('has-active-filters',count>0)}
  if(chips.children.length)bar.after(chips);
  return chips;
 }
 function compactNeutralContext(area){
  for(const context of $$('.ergonomic-context',area)){
   const draft=$('.workspace-filter-draft',context);
   if(draft){context.replaceChildren(draft);context.classList.add('compact-draft-status')}
  }
 }
 function columns(bar,area){
  const menu=$('details:has([data-grid-column])',area);if(!menu)return;
  const options=menu.closest('.order-grid-options');
  menu.classList.add('compact-columns');bar.append(menu);
  const summary=$(':scope>summary',menu);if(summary)summary.textContent='Kolonlar';
  if(options&&!options.querySelector('details'))options.remove();
 }
 function help(area,items,label='Bu ekran hakkında'){
  const nodes=items.filter(Boolean);if(!nodes.length)return;
  const details=node('details','compact-page-help'),summary=node('summary','',label);details.append(summary,...nodes);area.append(details);
 }
 function sticky(area,bar){
  if(!bar)return;
  // Keep the sticky containing block as the full list, without adding a scroll container.
  const count=$$('tbody tr,.tabulator-row,.tracking-order-row,.compensation-card,.inventory-movement',area).length;
  if(count>=10)bar.classList.add('compact-sticky-toolbar');
 }
 function refreshSticky(){
  const shell=$('.standard-workspace'),area=$('#page');if(!shell||!area)return;
  const bar=$('.compact-toolbar-container,.contextual-toolbar',area);sticky(area,bar);
 }
 function orders(ctx,area){
  const bar=$('.order-workspace-filters',area);if(!bar)return;
  const panel=ExpandableFilterPanel(bar,[],$('.orders-filter-popover',bar));
  const prefs=$('.view-preferences',panel);if(prefs)ViewPreferences(bar,[],prefs);
  $$('.guided-filter-chips',area).forEach(n=>n.remove());
  ContextualToolbar(bar);
  const names={query:'Arama',status:'Durum',dueFrom:'Termin başlangıcı',dueTo:'Termin sonu',allocation:'Üretime ayrılma',number:'Sipariş no',customer:'Müşteri',part:'Parça',quantityFrom:'En az adet',quantityTo:'En çok adet'};
  filterChips(bar,Object.entries(names).map(([key,label])=>({field:'orders-'+key,label,empty:['status','allocation'].includes(key)?'all':'',hideValue:key==='status'?'open':undefined,clear:()=>root.RitimPremiumAPI.refineClearOrderFilter(key,['status','allocation'].includes(key)?'all':'')})),panel);
  $('.order-toolbar',area)?.classList.add('compact-toolbar-container');sticky(area,$('.order-toolbar',area));
 }
 function production(ctx,area){
  const bar=$('.production-list-toolbar',document);if(!bar)return;
  const section=$('.production-orders-page',area);section.prepend(bar);bar.classList.remove('modern-navigation-tools');
  const old=$('.filterbar',bar),select=statusSelect(old,'Üretim emri durumu');
  const oldPanel=old?.closest('details');if(select){bar.prepend(select);if(oldPanel){oldPanel.hidden=true;section.append(oldPanel)}}
  // This is deliberately a loaded-page search: do not invent a new server query contract.
  const search=node('input','input compact-toolbar-search');search.type='search';search.placeholder='Yüklenen emirlerde ara';search.setAttribute('aria-label','Yüklenen üretim emirlerinde ara');
  const key=(ctx.scopeKey||'')+':production:'+location.search;search.value=localSearches.get(key)||'';
  const apply=()=>{localSearches.set(key,search.value);const q=search.value.toLocaleLowerCase('tr-TR');for(const row of $$('tbody tr',section))row.hidden=!!q&&!row.textContent.toLocaleLowerCase('tr-TR').includes(q)};
  search.oninput=apply;bar.prepend(search);apply();
  bar.append(button('Temizle',()=>{search.value='';apply();search.focus()}));ContextualToolbar(bar);
  navigationToolbar(bar);
  sticky(section,bar);
 }
 function navigationToolbar(bar){
  const tabs=$('.api-secondary-nav');if(!tabs||!bar)return;
  tabs.style.flexBasis=(tabs.querySelectorAll(':scope>button').length*105)+'px';
  const row=node('div','compact-navigation-row');tabs.before(row);row.append(tabs,bar);
 }
 function jobs(ctx,area){
  const bar=$('.worklist-filters',area);if(!bar)return;
  const status=document.getElementById('workspace-status'),panel=ExpandableFilterPanel(bar,[], $('.list-filter-panel',bar));
  if(status)bar.insertBefore(status.closest('label')||status,$('button[type=submit]',bar));
  for(const id of ['workspace-machineId','workspace-operatorId']){const field=document.getElementById(id);if(field)$('.compact-filter-content',panel).append(field.closest('label')||field)}
  $$('.guided-filter-toggle',bar).forEach(n=>n.remove());
  for(const empty of $$('.guided-advanced-filters',bar))if(!empty.querySelector('input,select,button'))empty.remove();
  const prefs=$('.view-preferences',panel);if(prefs)ViewPreferences(bar,[],prefs);
  ContextualToolbar(bar);compactNeutralContext(area);
  filterChips(bar,[{field:'workspace-query',label:'Arama'},{field:'workspace-status',label:'Durum',empty:'all',hideValue:'active'},{field:'workspace-machineId',label:'Makine'},{field:'workspace-operatorId',label:'Operatör'}],panel);
  $('.compact-worklist-toolbar',area)?.classList.add('compact-toolbar-container');sticky(area,$('.compact-worklist-toolbar',area));
 }
 function compensation(ctx,area){
  const section=$('.compensation-workspace',area),card=$(':scope>.card',section),bar=$('.compensation-filters',section);if(!bar)return;
  $(':scope>.flow-eyebrow',card)?.remove();$(':scope>h2',card)?.remove();
  const select=statusSelect($(':scope>.flow-filters',card),'Telafi görünümü');if(select)bar.prepend(select);
  const fields=['compensation-source','compensation-state'].map(id=>document.getElementById(id)?.closest('label'));
  const panel=ExpandableFilterPanel(bar,fields);
  const prefs=$('.view-preferences',section);if(prefs)ViewPreferences(bar,[],prefs);
  $$('.guided-filter-toggle,.guided-filter-chips',section).forEach(n=>n.remove());
  for(const old of $$('.guided-advanced-filters',section)){for(const b of $$('button',old))$('.compact-filter-content',panel).append(b);old.remove()}
  help(section,[$(':scope>p:not(.tiny)',card),$(':scope>.order-hint',section)]);
  card.classList.add('compact-toolbar-container');ContextualToolbar(bar);
  filterChips(bar,[{field:'compensation-query',label:'Arama'},{field:'compensation-source',label:'Kayıp kaynağı',empty:'all'},{field:'compensation-state',label:'Süreç',empty:'active',skipValues:['active','all']}],panel);sticky(section,card);
 }
 function tracking(ctx,area){
  const section=$('.production-tracking',area),bar=$('.tracking-search',section);if(!bar)return;
  const options=$('.tracking-options',section),density=$('[data-setting=density]',options)?.closest('label');
  if(density){
   const select=$('[data-setting=density]',density),choices=node('div','tracking-density');
   density.replaceWith(choices);select.hidden=true;choices.append(select);
   for(const [value,label]of [['compact','Kompakt'],['normal','Standart']]){
    const row=node('label'),radio=document.createElement('input');radio.type='radio';radio.name='tracking-row-density';radio.value=value;radio.checked=select.value===value;
    radio.onchange=()=>{if(radio.checked){select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))}};
    row.append(radio,document.createTextNode(label));choices.append(row);
   }
   ViewPreferences(bar,[choices]);
  }
  if(options){options.classList.add('compact-table-tools');options.setAttribute('aria-label','Ağaç görünümü araçları')}
  ContextualToolbar(bar);filterChips(bar,[{field:$('[name=q]',bar),label:'Arama'},{field:$('[name=priority]',bar),label:'Öncelik'}]);sticky(section,bar);
 }
 function logistics(ctx,area){
  const form=$('.workspace-logistics-search',area);if(!form)return;
  const fold=form.closest('.refine-queue-search');if(fold){fold.before(form);fold.remove()}
  const section=form.closest('section'),nav=$('.flow-filters',form)||$(':scope>.flow-filters',section),select=statusSelect(nav,'Kayıt durumu');
  if(select)form.append(select);$(':scope>h2',section)?.remove();
  ContextualToolbar(form);columns(form,section);compactNeutralContext(section);
  filterChips(form,[{field:'logistics-filter',label:'Arama',clear:()=>{const field=document.getElementById('logistics-filter');field.value='';root.RitimPremiumAPI.searchLogistics()}}]);
  const summary=$('.logistics-history>summary',area);if(summary)summary.hidden=true;
  sticky(section,form);
 }
 function supplier(ctx,area){
  const section=$('.supplier-workspace',area),bars=$$('.supplier-toolbar',section);if(!bars.length)return;
  const bar=bars[0],search=$('form',bar);if(!search)return;
  const secondary=bars[1];if(secondary){
   const select=statusSelect($('.flow-filters',secondary),'Fason durumu');if(select)bar.append(select);
   const supplierLabel=$('label:has(select)',secondary),group=$('label:has(input[type=checkbox])',secondary);
   if(supplierLabel)ExpandableFilterPanel(bar,[supplierLabel]);if(group)ViewPreferences(bar,[group]);
   secondary.hidden=true;
  }
  const create=$('button[onclick*="supplierEditorToggle"]',bar);if(create){create.classList.add('workspace-create');$('.workspace-header-tools')?.append(create)}
  ContextualToolbar(bar);columns(bar,section);
  const supplierField=$('.compact-filter-content select',bar);
  filterChips(bar,[{field:$('input',search),label:'Arama',clear:()=>root.RitimPremiumAPI.supplierFilter('q','')},{field:supplierField,label:'Tedarikçi',clear:()=>root.RitimPremiumAPI.supplierFilter('supplier','')}],$('.compact-filter-panel',bar));
  sticky(section,bar);
 }
 function quality(ctx,area){
  const unified=$('.quality-controls-toolbar',area);if(unified){ContextualToolbar(unified);const section=unified.closest('section');columns(unified,section);const input=$('input',unified),select=$('select',unified);unified.append(button('Temizle',()=>root.RitimPremiumAPI.qualityControlsReset()));const chips=filterChips(unified,[{field:input,label:'Arama',clear:()=>{input.value='';root.RitimPremiumAPI.qualityControlsSearch()}},{field:select,label:'Kontrol türü',empty:'all',clear:()=>root.RitimPremiumAPI.qualityControlsType('all')}]);navigationToolbar(unified);if(chips?.isConnected)section.prepend(chips);sticky(section,unified);return}
  if(ctx.qualityHistoryMode){
   const history=$('.audit-incoming-history',area);if(history){
    const heading=$(':scope>h2,:scope>h3',history),details=node('details','compact-incoming-history'),summary=node('summary','',heading?.textContent||'Mal kabul kalite geçmişi');
    history.before(details);heading?.remove();details.append(summary,history);
   }
  }
  const form=$(ctx.qualityHistoryMode?'.quality-history-workspace>form':'.flow-queue-search',area);if(!form)return;
  ContextualToolbar(form);const section=form.closest('section');columns(form,section);compactNeutralContext(section);
  const input=$('input',form);filterChips(form,[{field:input,label:'Arama',clear:()=>{input.value='';if(ctx.qualityHistoryMode)root.RitimPremiumAPI.qualityHistorySearch();else root.RitimPremiumAPI.searchFlowQueue('quality-list',true)}}]);
  sticky(section,form);
 }
 function rework(ctx,area){
  const section=$('.operations-rework',area),bar=$('.flow-queue-search',section);if(!bar)return;
  $(':scope>h2',section)?.remove();const select=statusSelect($('.flow-filters',section),'Tamir durumu');if(select)bar.append(select);
  ContextualToolbar(bar);compactNeutralContext(section);
  filterChips(bar,[{field:$('input',bar),label:'Arama',clear:()=>root.RitimPremiumAPI.searchFlowQueue('rework',true)}]);sticky(section,bar);
 }
 function inventory(ctx,area){
  $('.stock-unit-note',area)?.remove();
  if(ctx.inventoryTask==='stock'){
   const bar=$('.stock-filter-row',area);if(!bar)return;
   const panel=ExpandableFilterPanel(bar,['stock-material-filter','stock-location-filter'].map(id=>document.getElementById(id)?.closest('label')));
   $('h2',bar.parentElement)?.remove();ContextualToolbar(bar);
   const update=()=>filterChips(bar,[{field:'inventory-balance-query',label:'Arama',immediate:true,clear:()=>{document.getElementById('inventory-balance-query').value='';root.RitimPremiumAPI.inventoryFilterBalance('');update()}},{field:'stock-material-filter',label:'Malzeme',immediate:true},{field:'stock-location-filter',label:'Konum',immediate:true}],panel);
   // Search change fires on blur before a chip receives click; replacing it then would swallow the click.
   bar.addEventListener('change',e=>{if(e.target.tagName==='SELECT')update()});bar.addEventListener('input',update);update();
  }
  if(ctx.inventoryTask==='history'){
   const bar=$('form:has(#inventory-movements-query)',area);if(bar){ContextualToolbar(bar);const details=bar.closest('details');if(details){details.open=true;$(':scope>summary',details)?.classList.add('sr-only')}
    const panel=ExpandableFilterPanel(bar,[document.getElementById('inventory-movements-kind')?.closest('label')]);
    filterChips(bar,[{field:'inventory-movements-query',label:'Arama'},{field:'inventory-movements-kind',label:'Hareket türü'}],panel);
   }
  }
 }
 function mount(ctx){
  lifecycle?.abort();lifecycle=new AbortController();
  if(!titles[ctx.page]&&ctx.page!=='inventory')return;
  const shell=$('.api-shell'),area=$('#page');if(!shell||!area)return;
  shell.classList.add('standard-workspace');CompactPageHeader(ctx,shell);PageTabs(shell,ctx);
  const layouts={orders,'production-orders':production,jobs,compensations:compensation,'production-monitor':tracking,shipping:logistics,returns:logistics,outsourcing:supplier,'quality-list':quality,rework,inventory};
  layouts[ctx.page]?.(ctx,area);
  for(const bar of $$('.contextual-toolbar',shell)){
   $('details:has([data-grid-column])',bar)?.classList.add('compact-columns');
   PageActionGroup(bar);
  }
  // A single dismiss handler per render; opening a panel never invokes a data loader.
  document.addEventListener('click',e=>{for(const panel of $$('.compact-filter-panel[open],.compact-view-preferences[open],.compact-columns[open]',shell))if(!panel.contains(e.target))panel.open=false;if(matchMedia('(max-width:700px)').matches)for(const menu of $$('.compact-secondary-actions[open]',shell))if(!menu.contains(e.target))menu.open=false},{signal:lifecycle.signal});
 }
 root.RitimCompactWorkspace={mount,refreshSticky,CompactPageHeader,PageTabs,ContextualToolbar,ExpandableFilterPanel,ActiveFilterChips:filterChips,PageActionGroup,ViewPreferences};
})(globalThis);
