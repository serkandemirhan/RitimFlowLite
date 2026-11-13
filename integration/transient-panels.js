/* Only transient menus participate; inline history/details stay independent. */
(()=>{'use strict';
 const selector='.workspace-search,.api-mobile-menu,.orders-filter-popover,.orders-columns-popover,.grid-actions details,.machine-column-chooser,.list-filter-panel,.master-record-actions>details';
 const closeExcept=keep=>{for(const panel of document.querySelectorAll(selector))if(panel!==keep&&!panel.contains(keep))panel.open=false};
 document.addEventListener('click',event=>{const panel=event.target.closest(selector);closeExcept(panel)},true);
 document.addEventListener('toggle',event=>{if(event.target.matches?.(selector)&&event.target.open)closeExcept(event.target)},true);
 document.addEventListener('toggle',event=>{
  const panel=event.target;if(!panel.matches?.('.master-record-actions>details')||!panel.open)return;
  let menu=panel.querySelector('.master-more-menu');if(!menu){menu=document.createElement('div');menu.className='master-more-menu';for(const child of [...panel.children])if(child.tagName!=='SUMMARY')menu.append(child);panel.append(menu)}
  const anchor=panel.querySelector('summary').getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(anchor.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))+'px';
  menu.style.top=Math.max(8,Math.min(anchor.bottom+4,innerHeight-menu.offsetHeight-8))+'px';
 },true);
 const closeMasterMenus=()=>document.querySelectorAll('.master-record-actions>details[open]').forEach(panel=>panel.open=false);
 window.addEventListener('resize',closeMasterMenus);
 document.addEventListener('scroll',event=>{if(!event.target.closest?.('.master-more-menu'))closeMasterMenus()},true);
 document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const open=[...document.querySelectorAll(selector)].filter(x=>x.open);if(!open.length)return;event.preventDefault();event.stopPropagation();const panel=open.at(-1);closeExcept(null);panel.querySelector('summary')?.focus()},true);
 new MutationObserver(records=>{if(records.some(r=>r.target.matches?.('dialog[open]')||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('dialog[open]')||n.querySelector('dialog[open]')))))closeExcept(null)}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
})();

/* Shared detail/form ergonomics; operator controls retain their own interaction rules. */
(()=>{'use strict';
 const screens=new Set(['detail','job','quality','production-order','production-supplier','order-edit','po-edit','production-create','batch-create','inventory','shipping','returns','outsourcing','rework','compensations']);
 const editors=new Set(['order-edit','po-edit','production-create','batch-create']);
 const originals=new WeakMap();
 const snapshot=editor=>JSON.stringify([...editor.querySelectorAll('input,select,textarea')].filter(x=>!x.matches('[type=search],[type=password],[type=file]')).map(x=>[x.id,x.type==='checkbox'||x.type==='radio'?x.checked:x.value]));
 const remember=editor=>{if(editor&&!originals.has(editor))originals.set(editor,snapshot(editor))};
 const updateDirty=input=>{const editor=input.closest?.('.ergonomic-editor,.order-compose');if(!editor)return;if(originals.has(editor)&&snapshot(editor)===originals.get(editor))delete editor.dataset.unsaved;else editor.dataset.unsaved='true'};
 function fieldMessage(input){const v=input.validity;if(v.valueMissing)return 'Bu alanı doldurun.';if(v.rangeUnderflow)return 'En az '+input.min+' girin.';if(v.rangeOverflow)return 'En fazla '+input.max+' girin.';if(v.stepMismatch)return input.step==='1'?'Tam adet girin.':'Geçerli bir değer girin.';return 'Değeri kontrol edin.'}
 function mount({page,context={}}={}){
  const root=document.getElementById('page');if(!root||!screens.has(page))return;
  root.classList.add('ergonomic-workspace');root.dataset.ergonomicScreen=page;
  if(editors.has(page))root.classList.add('ergonomic-editor');
  if(page==='outsourcing'){const select=root.querySelector('#fason-order'),section=select?.closest('section');if(section&&!select.value&&!section.closest('.ergonomic-secondary')){const fold=document.createElement('details');fold.className='ergonomic-secondary card pad';const summary=document.createElement('summary');summary.textContent='Siparişten fason işlemi aç';section.before(fold);fold.append(summary,section)}}
  if(page==='inventory'){const supplier=root.querySelector('#inv-supplier'),documentField=root.querySelector('#inv-document');if(supplier&&documentField&&!supplier.closest('.ergonomic-secondary')){const a=supplier.closest('label'),b=documentField.closest('label');if(a&&b&&a.parentElement===b.parentElement){const fold=document.createElement('details');fold.className='ergonomic-secondary';fold.innerHTML='<summary>Tedarikçi ve belge · isteğe bağlı</summary>';a.before(fold);fold.append(a,b)}}}
  for(const form of root.querySelectorAll('.flow-queue-search,.workspace-logistics-search,.compensation-filters')){form.classList.add('ergonomic-search');const submit=form.querySelector('[type=submit]');if(submit)submit.textContent='Uygula'}
  if(['detail','job','quality','production-order','production-supplier'].includes(page)&&!root.querySelector('.detail-context-line')){
   const heading=root.querySelector('h2'),line=document.createElement('dl');line.className='detail-context-line';
   for(const [label,value]of [['Müşteri',context.customer],['Sipariş',context.orderNumber],['Teslim tarihi',context.dueDate]]){if(!value)continue;const group=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;group.append(dt,dd);line.append(group)}
   if(line.children.length&&heading){heading.after(line);heading.parentElement.classList.add('ergonomic-identity');const eyebrow=heading.parentElement.querySelector('.flow-eyebrow');if(eyebrow&&context.customer&&eyebrow.textContent.includes(context.customer))eyebrow.hidden=true;const p=heading.parentElement.querySelector(':scope>p');if(p&&context.customer&&p.textContent.includes(context.customer)){const link=[...p.querySelectorAll('button,a')].find(x=>x.textContent.trim()===context.orderNumber),target=[...line.children].find(x=>x.querySelector('dt').textContent==='Sipariş')?.querySelector('dd');if(link&&target)target.replaceChildren(link);if(!p.querySelector('button,a'))p.hidden=true}}
  }
  for(const input of root.querySelectorAll('input[type=number]')){if(!input.inputMode)input.inputMode=input.step&&input.step!=='1'?'decimal':'numeric'}
  for(const input of root.querySelectorAll('[required]')){const label=input.closest('label');if(label&&!label.querySelector('.required-marker')){const caption=document.createElement('span');caption.className='required-caption';while(label.firstChild&&label.firstChild!==input)caption.append(label.firstChild);const mark=document.createElement('span');mark.className='required-marker';mark.textContent=' *';mark.setAttribute('aria-hidden','true');caption.append(mark);label.insertBefore(caption,input)}}
  const requiredContainers=new Set([...root.querySelectorAll('.required-marker')].map(mark=>mark.closest('dialog,form')||root));
  for(const container of requiredContainers)if(!container.querySelector('.required-help')){const note=document.createElement('p');note.className='required-help';note.textContent='* Zorunlu alanlar';container.append(note)}
  for(const footer of root.querySelectorAll('.production-create-footer,.modal-foot,.order-actionbar'))footer.classList.add('ergonomic-actions');
  for(const box of root.querySelectorAll('.flow-metrics,.po-summary-facts'))box.classList.add('ergonomic-facts');
  for(const d of root.querySelectorAll('details')){const s=d.querySelector(':scope>summary');if(s&&/geçmiş|Ek bilgiler|belgeler/i.test(s.textContent))d.classList.add('ergonomic-secondary')}
  if(page==='job'){const action=root.querySelector('#p1-job-warehouse');if(action){action.textContent='Malzeme teslim et';action.classList.remove('primary')}}
  if(page==='order-edit'){const reason=root.querySelector('#edit-reason');if(reason&&context.reasonRequired){reason.required=true;reason.setAttribute('aria-describedby','edit-reason-help');if(!root.querySelector('#edit-reason-help')){const help=document.createElement('small');help.id='edit-reason-help';help.textContent='Üretime bağlı siparişte değişiklik gerekçesi zorunludur.';reason.after(help)}}}
  const error=document.getElementById('api-alert');if(error?.textContent.trim()){error.classList.add('ergonomic-error');error.setAttribute('role','alert')}
  if(root.classList.contains('ergonomic-editor'))remember(root);
 }
 document.addEventListener('invalid',e=>{const input=e.target;if(!input.closest('.ergonomic-workspace,.order-compose'))return;const parent=input.closest('label,.formfield')||input.parentElement;let msg=parent.querySelector('.ergonomic-field-error');if(!msg){msg=document.createElement('small');msg.className='ergonomic-field-error';msg.id='field-help-'+(input.id||Math.random().toString(36).slice(2));parent.append(msg)}msg.textContent=fieldMessage(input);if(input.getAttribute('aria-invalid')!=='true')input.dataset.previousDescription=input.getAttribute('aria-describedby')||'';input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',[input.dataset.previousDescription,msg.id].filter(Boolean).join(' '))},true);
 document.addEventListener('input',e=>{const input=e.target;if(input.getAttribute?.('aria-invalid')==='true'&&input.validity?.valid){input.removeAttribute('aria-invalid');const parent=input.closest('label,.formfield')||input.parentElement;parent.querySelector('.ergonomic-field-error')?.remove();if(input.dataset.previousDescription)input.setAttribute('aria-describedby',input.dataset.previousDescription);else input.removeAttribute('aria-describedby')}
  updateDirty(input);
 });
 document.addEventListener('change',e=>updateDirty(e.target));
 const dirty=()=>document.querySelector('.ergonomic-editor[data-unsaved=true],.order-compose[data-unsaved=true]');
 const abandon=()=>!dirty()||confirm('Kaydedilmemiş değişiklikler var. Çıkmak istiyor musunuz?');
 document.addEventListener('click',e=>{const button=e.target.closest('button,a');if(!button||!dirty())return;const action=button.getAttribute('onclick')||'';if(/(?:navigate|openArea|openOrder|poOpen|closeModal|editReload|returnProductionList)\(/.test(action)){if(!abandon()){e.preventDefault();e.stopImmediatePropagation()}else delete dirty().dataset.unsaved}},true);
 window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue=''}});
 document.addEventListener('cancel',e=>{if(e.target.querySelector?.('[data-unsaved=true]')&&!abandon())e.preventDefault()},true);
 function dialogs(){document.querySelectorAll('.order-compose').forEach(remember);for(const dialog of document.querySelectorAll('dialog,.modal[role=dialog]')){if(dialog.closest('.operator-studio')||/operator-|drawing|pdf/.test(dialog.id+' '+dialog.className))continue;dialog.classList.add('ergonomic-dialog');const heading=dialog.querySelector('h2,h3');if(heading&&!dialog.hasAttribute('aria-labelledby')&&!dialog.hasAttribute('aria-label')){heading.id=heading.id||'dialog-heading-'+Math.random().toString(36).slice(2);dialog.setAttribute('aria-labelledby',heading.id)}for(const button of dialog.querySelectorAll('button'))if(['×','✕'].includes(button.textContent.trim())&&!button.hasAttribute('aria-label'))button.setAttribute('aria-label','Kapat')}}
 new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('dialog,.modal')||n.querySelector('dialog,.modal')))))dialogs()}).observe(document.documentElement,{childList:true,subtree:true});
 globalThis.RitimFormErgonomics={mount};
})();
