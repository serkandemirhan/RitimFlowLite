(function(root){'use strict';
 let grid=null,scheduler=null,generation=0,planningDate=null,planningDays=3,gridKey=null;
 const savedGrids=new Map();
 const statuses={waiting:'Başlamadı',running:'Çalışıyor',paused:'Duraklatıldı',complete:'Tamamlandı',cancelled:'İptal edildi'};
 const text=x=>String(x??'—');
 const localTime=x=>new Date(x).toLocaleString('sv-SE',{timeZone:'Europe/Istanbul'}).replace(' ','T');
 function button(label,fn){const b=document.createElement('button');b.type='button';b.className='btn btn-sm';b.textContent=label;b.onclick=fn;return b}
 function dispose(){generation++;if(grid&&gridKey){try{savedGrids.set(gridKey,{filters:grid.getHeaderFilters(),sort:grid.getSorters().map(x=>({column:x.field,dir:x.dir})),page:grid.getPage(),size:grid.getPageSize()})}catch{}}grid?.destroy();grid=null;scheduler?.dispose();scheduler=null}
 function foundation(page){const shell=document.querySelector('.api-shell');if(!shell||page==='operator')return;shell.classList.add('ritim-ui');
  shell.querySelector('.premium-sidebar')?.classList.add('navbar','navbar-vertical');
  shell.querySelectorAll('.nav-group').forEach(x=>x.classList.add('navbar-nav'));
  shell.querySelectorAll('.side-btn').forEach(x=>x.classList.add('nav-link'));
  shell.querySelector('.workspace-header')?.classList.add('page-header');
  const search=shell.querySelector('.workspace-header .api-global-search')?.closest('details');
  if(search){
   const refreshButtons=[...shell.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Yenile');
   const existing=refreshButtons[0];refreshButtons.slice(1).forEach(b=>b.remove());
   const refresh=existing||button('',()=>root.RitimPremiumAPI.refreshCurrent());
   refresh.className='btn workspace-refresh';refresh.title='Yenile';refresh.setAttribute('aria-label','Yenile');
   refresh.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12 0l2 5M4 12l2 5a7 7 0 0 0 12 0"/></svg>';
   search.after(refresh);
  }
  if(page==='overview'){
   shell.querySelectorAll('#page .workspace-search,#page .worklist-filters').forEach(form=>{form.classList.add('overview-search-toolbar');const input=form.querySelector('input');if(input){input.setAttribute('aria-label','Kayıtlarda ara');const label=input.closest('label');if(label){for(const node of [...label.childNodes])if(node.nodeType===3)node.textContent='';}}});
  }
  shell.querySelectorAll('.btn.primary').forEach(x=>x.classList.add('btn-primary'));
  shell.querySelectorAll('input.input,textarea.input').forEach(x=>x.classList.add('form-control'));
  shell.querySelectorAll('select.select').forEach(x=>x.classList.add('form-select'));
  shell.querySelectorAll('.pill').forEach(x=>x.classList.add('badge'));
  shell.querySelectorAll('.card.pad').forEach(x=>x.classList.add('card-body'));
  shell.querySelectorAll('.api-secondary-nav').forEach(x=>{x.classList.add('nav','nav-tabs');x.querySelectorAll('button').forEach(b=>b.classList.add('nav-link'))});
  shell.querySelectorAll('table.order-grid').forEach(x=>x.classList.add('table','table-vcenter','table-hover'));
  if(page==='production-create'){
   const form=shell.querySelector('.production-create'),tools=shell.querySelector('.workspace-header-tools');
   form?.querySelector(':scope>h2')?.remove();
   const back=form?.querySelector(':scope>button');if(back&&tools)tools.append(back);
   const title=form?.querySelector('form>h3'),actions=form?.querySelector('.template-actions');if(title&&actions){const bar=document.createElement('div');bar.className='compact-route-heading';title.before(bar);bar.append(title,actions)}
   const add=form?.querySelector('button[onclick="RitimPremiumAPI.poAdd()"]');if(add&&actions)actions.append(add);
   form?.querySelectorAll('form>.order-hint').forEach(x=>x.classList.add('sr-only'));
   form?.querySelectorAll('.po-operation-timing>summary').forEach(x=>{x.textContent='Süre';x.title='Tahmini süreler · isteğe bağlı'});
  }
  const primaryActions={returns:['newReturn','Yeni iade'],compensations:['newCompensation','Yeni telafi'],shipping:['clarityShippingShow','Yeni sevkiyat']};
  if(primaryActions[page]){
   const [action,label]=primaryActions[page],create=shell.querySelector('#page button[onclick*="'+action+'()"]'),tools=shell.querySelector('.workspace-header-tools');
   if(create&&tools){create.textContent=label;create.classList.add('workspace-create');tools.append(create)}
  }
  if(page==='production-orders'){
   const nav=shell.querySelector('.api-secondary-nav'),tools=shell.querySelector('.production-list-toolbar');
   if(nav&&tools){tools.classList.add('modern-navigation-tools');nav.append(tools)}
  }
  if(page==='master'){
   const toolbar=shell.querySelector('.master-toolbar'),list=shell.querySelector('.master-list'),sort=shell.querySelector('.master-sortbar'),columns=shell.querySelector('.orders-columns-popover');
   if(toolbar){toolbar.classList.add('modern-list-toolbar');if(columns)toolbar.append(columns)}
   const size=sort?.querySelector('label'),paging=shell.querySelector('.master-paging');if(size&&paging)paging.prepend(size);
   sort?.remove();list?.querySelector(':scope>.formfield')?.remove();shell.querySelector('.order-grid-options')?.remove();
   const search=shell.querySelector('#master-search');search?.setAttribute('aria-label','Ana verilerde ara');
  }
  shell.querySelectorAll('.worklist-filters,.monitor-list-tools').forEach(x=>x.classList.add('modern-list-toolbar'));
 }
 async function jobs(ctx,ticket){const monitor=ctx.page==='production-monitor';const old=document.querySelector('table[data-grid-kind="'+(monitor?'production-monitor':'jobs')+'"]');if(!old||!root.Tabulator)return;
  const section=old.closest('.order-grid-section'),host=document.createElement('div');host.className='modern-job-grid';host.setAttribute('aria-label','İş emirleri');
  const notice=document.createElement('p');notice.className='text-secondary modern-grid-status';notice.setAttribute('role','status');notice.textContent='İş emirleri yükleniyor…';section.before(notice);
  let rows;try{rows=monitor?ctx.monitorRows():await ctx.jobs()}catch(e){notice.textContent='Tablo yüklenemedi: '+e.message;return}if(ticket!==generation||!section.isConnected)return;
  section.replaceWith(host);document.querySelector('nav[aria-label="Liste sayfaları"]')?.remove();gridKey=(ctx.scopeKey||'')+location.search;const saved=savedGrids.get(gridKey);
  const fields=[['number','İş emri',200],['partName','Parça',230],['operation','Operasyon',170],['machineCode','Makine',140],['operatorName','Operatör',150],['quantity','Hedef',85],['produced','İşlenen',85],['remaining','Kalan',85],['dueDate','Termin',120],['status','Durum',135],['orderNumber','Sipariş',180],['nextAction','Sonraki işlem',210]];
  if(monitor){fields.splice(2,0,['customer','M\u00fc\u015fteri',180],['orderCreatedAt','Sipari\u015f tarihi',130]);fields.splice(fields.length-1,0,['reason','Bekleme nedeni',220])}
  grid=new Tabulator(host,{data:rows.map(r=>({...r,remaining:Math.max(0,r.quantity-r.produced)})),index:'id',layout:'fitDataStretch',renderVertical:'basic',pagination:true,paginationSize:20,paginationSizeSelector:[20,50,100],locale:'tr',langs:{tr:{pagination:{page_size:'Sayfada',first:'İlk',last:'Son',prev:'Önceki',next:'Sonraki',counter:{showing:'Gösterilen',of:'/',rows:'kayıt',pages:'sayfa'}}}},paginationCounter:'rows',placeholder:'Eşleşen iş emri yok.',columns:fields.map(([field,title,width])=>({field,title,width:monitor?({number:180,partName:200,customer:160,status:120,dueDate:110,nextAction:180}[field]||width):width,visible:!monitor||['number','partName','customer','produced','status','dueDate','nextAction'].includes(field),minWidth:80,headerFilter:field==='nextAction'?false:'input',headerFilterPlaceholder:'Filtrele',tooltip:true,sorter:['quantity','produced','remaining'].includes(field)?'number':'string',formatter:field==='nextAction'?cell=>ctx.nextAction?.(cell.getRow().getData())||'—':field==='number'?cell=>button(text(cell.getValue()),()=>(monitor?ctx.openMonitorJob:ctx.openJob)(cell.getRow().getData())):field==='status'?cell=>statuses[cell.getValue()]||text(cell.getValue()):['dueDate','orderCreatedAt'].includes(field)?cell=>cell.getValue()?new Date(cell.getValue()).toLocaleDateString('tr-TR'):'—':'plaintext'}))});
  grid.on('rowClick',(event,row)=>{if(event.target.closest('button,a,input,select,textarea,summary,[role="button"]')||getSelection()?.toString())return;(monitor?ctx.openMonitorJob:ctx.openJob)(row.getData())});
  let columnsMenu=document.querySelector('details:has([data-grid-column])');if(monitor&&!columnsMenu){columnsMenu=document.createElement('details');columnsMenu.className='modern-columns';document.querySelector('.monitor-list-tools')?.append(columnsMenu)}if(columnsMenu){columnsMenu.replaceChildren();const summary=document.createElement('summary');summary.textContent='Kolonlar';columnsMenu.append(summary);const list=document.createElement('div');for(const [field,title]of fields){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=!monitor||['number','partName','customer','produced','status','dueDate','nextAction'].includes(field);input.disabled=field==='number';input.onchange=()=>grid.getColumn(field).toggle();label.append(input,document.createTextNode(' '+title));list.append(label)}columnsMenu.append(list)}
  const update=()=>{notice.textContent=grid.getDataCount('active')+' / '+rows.length+' iş emri · Kolonlardan filtreleyin.'};grid.on('tableBuilt',async()=>{if(saved){grid.setPageSize(saved.size);grid.setSort(saved.sort);for(const f of saved.filters)grid.setHeaderFilterValue(f.field,f.value);await grid.setPage(Math.min(saved.page||1,grid.getPageMax()||1))}update()});grid.on('dataFiltered',update);
 }
 function planning(ctx){const old=document.querySelector('.planning-timeline');if(!old||!root.DayPilot?.Scheduler||!ctx.board)return;
  const wrapper=document.createElement('section');wrapper.className='card modern-planning';const toolbar=document.createElement('header');toolbar.className='card-header';
  const date=document.createElement('input');date.type='date';date.className='form-control';date.setAttribute('aria-label','Plan başlangıcı');planningDate=planningDate||ctx.board.estimatedAt?.slice(0,10)||new Date().toLocaleDateString('sv-SE');date.value=planningDate;
  const host=document.createElement('div');host.id='modern-resource-scheduler';host.setAttribute('aria-label','Makine zaman planı');const note=document.createElement('p');note.className='text-secondary modern-planning-note';note.textContent='Beyaz: çalışma zamanı · Gri: mesai dışı / mola · Sarı: kısmen çalışma zamanı · Pembe: resmî tatil · Mor iş: mesai dışı plan. Saatler İstanbul saatidir.';
  const move=delta=>{planningDate=new DayPilot.Date(date.value).addDays(delta).toString('yyyy-MM-dd');date.value=planningDate;scheduler.update({startDate:planningDate})};
  const previous=button('←',()=>move(-planningDays)),next=button('→',()=>move(planningDays));
  const range=document.createElement('select');range.className='form-select';range.setAttribute('aria-label','Görünüm süresi');range.style.width='100px';
  for(const days of [1,2,3,5]){const option=document.createElement('option');option.value=days;option.textContent=days+' gün';option.selected=days===planningDays;range.append(option)}
  const layout=()=>({days:planningDays,scale:'CellDuration',cellDuration:60,cellWidth:Math.max(24,Math.floor((host.clientWidth-(innerWidth<600?110:190))/(planningDays*24)))});
  const labels=()=>{previous.setAttribute('aria-label',planningDays+' gün geri');next.setAttribute('aria-label',planningDays+' gün ileri');previous.title=planningDays+' gün geri';next.title=planningDays+' gün ileri'};
  labels();range.onchange=()=>{planningDays=Number(range.value);labels();scheduler.update(layout())};
  toolbar.append(previous,date,next,range);date.onchange=()=>{if(date.value){planningDate=date.value;scheduler.update({startDate:planningDate})}};
  wrapper.append(toolbar,host,note);old.before(wrapper);
  // Keep unknown-duration jobs and their existing editing/assignment actions reachable.
  const unknown=[...old.querySelectorAll('.planning-unknown')];const fold=document.createElement('details');fold.className='card-body';const summary=document.createElement('summary');summary.textContent='Süresi veya ön koşulu eksik işler';fold.append(summary,...unknown);if(unknown.length)wrapper.append(fold);old.remove();
  const jobs=ctx.board.jobs.filter(ctx.visibleJob),machines=ctx.machines;
  const calendarDays=new Map();
  function workStatus(machineId,value){const common=ctx.board.workCalendar?.calendar,cal=common||machines.find(m=>m.id===machineId)?.calendar;if(!cal)return 'unknown';const time=value.toString().slice(0,19),day=time.slice(0,10),minute=Number(time.slice(11,13))*60+Number(time.slice(14,16)),key=(common?'site':machineId)+day;if(!calendarDays.has(key))calendarDays.set(key,{base:Date.parse(day+'T00:00:00+03:00'),windows:RitimCalendarModel.windows(day,cal),holidays:cal.turkeyHolidays===false?[]:RitimCalendarModel.holidays(Number(day.slice(0,4))).filter(h=>h.date===day)});const c=calendarDays.get(key),at=c.base+minute*60000;if(c.windows.some(([a,b])=>at>=a&&at<b))return 'working';return c.holidays.some(h=>minute>=h.startMinute)?'holiday':'off'}

  const events=jobs.flatMap(j=>(j.schedule?.segments||[]).map((s,i)=>({id:j.id+':'+i,jobId:j.id,moveDisabled:!ctx.canMove||!['waiting','paused'].includes(j.status)||i>0,start:localTime(s.start),end:localTime(s.end),resource:j.machineId,text:j.number,toolTip:[j.number,j.customer,j.operation,j.plannedOvertime?'Mesai dışı plan · Yönetici':'' ,j.priority?'Öncelik: '+j.priority:'',(j.produced||0)+' / '+j.quantity+' adet',s.start+' → '+s.end,...(j.blockers||[]).map(b=>b.message||b.reason||b.code)].filter(Boolean).join('\n'),backColor:j.plannedOvertime?'#ede0ff':j.schedule.late?'#fff1db':j.status==='running'?'#dcf3ea':'#e8efff',fontColor:'#18344e',barColor:j.plannedOvertime?'#8b46c4':j.schedule.late?'#d68b20':j.status==='running'?'#16816b':'#416dcc'})));
  scheduler=new DayPilot.Scheduler(host,{startDate:date.value,...layout(),snapToGrid:false,timeHeaders:[{groupBy:'Day',format:'d MMM yyyy'},{groupBy:'Cell',format:'HH'}],timeFormat:'Clock24Hours',rowHeaderWidth:innerWidth<600?110:190,eventHeight:42,useEventBoxes:'Never',eventTextWrappingEnabled:false,heightSpec:'Max',height:560,resources:machines.map(m=>({id:m.id,name:m.code})),events,xssProtection:'Enabled',eventMoveHandling:ctx.canMove?'Update':'Disabled',eventResizeHandling:'Disabled',timeRangeSelectedHandling:'Disabled',onBeforeCellRender:a=>{const values=Array.from({length:60},(_,i)=>workStatus(a.cell.resource,a.cell.start.addMinutes(i)));const count=values.filter(x=>x==='working').length;a.cell.properties.backColor=values.includes('holiday')?'#fce5e5':count===60?'#ffffff':count===0?'#e5eaf1':'#fff4d6';a.cell.properties.toolTip=values.includes('holiday')?'Resmî tatil':count===60?'Çalışma zamanı':count===0?'Mesai dışı veya mola':'Kısmen çalışma zamanı';},onEventClick:a=>ctx.openBoardJob(a.e.data.jobId),onEventMove:a=>{a.preventDefault();const j=jobs.find(x=>x.id===a.e.data.jobId);if(!ctx.canMove||!j||!['waiting','paused'].includes(j.status))return;const overtime=workStatus(a.newResource,a.newStart)!=='working';if(overtime&&!ctx.canOvertime){note.textContent='Mesai dışı planı yalnız yönetici yapabilir.';return}const before=jobs.filter(x=>x.id!==j.id&&x.machineId===a.newResource&&x.schedule?.start&&localTime(x.schedule.start)>=a.newStart.toString()).sort((a,b)=>Date.parse(a.schedule.start)-Date.parse(b.schedule.start))[0];ctx.move(j.id,a.newResource,before?.id||null,new Date(a.newStart.toString().slice(0,19)+'+03:00').toISOString(),overtime)}});scheduler.init();if(innerWidth<700)scheduler.scrollTo(date.value+'T08:00:00');
 }
 function monitorLayout(){
  const root=document.querySelector('.flow-monitor');if(!root)return;
  const head=root.querySelector('.monitor-compact-header');
  const labels=['Çalışan','Fason','Hazır','Bekleyen'];
  head?.querySelectorAll('.flow-metrics>div').forEach((metric,i)=>{const label=metric.querySelector('small,span');if(label)label.textContent=labels[i]});
  const note=root.querySelector('p.ergonomic-context');
  if(note&&head){const details=document.createElement('details');details.className='modern-monitor-help';const summary=document.createElement('summary');summary.textContent='Sayaç bilgisi';details.append(summary,note);head.append(details)}
  const input=root.querySelector('#monitor-query');if(input&&!input.value.trim())root.querySelector('[role=status].ergonomic-context')?.remove();
 }
 function mount(ctx){dispose();foundation(ctx.page);if(ctx.page==='production-monitor')monitorLayout();if(['jobs','production-monitor'].includes(ctx.page))void jobs(ctx,generation);if(ctx.page==='machine-planning')planning(ctx)}
 root.RitimModernUI={mount,dispose};
})(globalThis);
