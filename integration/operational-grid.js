(function(root){'use strict';
 function render(kind,columns,rows,{h,sort}){return `<section class="order-grid-section operational-grid"><div class="order-grid-options"><details class="orders-columns-popover"><summary>Kolonlar</summary><div>${columns.slice(1).map(c=>`<label><input type="checkbox" data-grid-column="${c.key}" checked> ${h(c.label)}</label>`).join('')}</div></details></div><div class="order-grid-scroll"><table class="order-grid" data-grid-kind="${kind}"><thead><tr>${columns.map(c=>`<th data-column="${c.key}" aria-sort="${sort?.key===c.key?(sort.desc?'descending':'ascending'):'none'}"><button class="grid-sort" onclick="RitimPremiumAPI.listSort('${kind}','${c.key}')">${h(c.label)} <span aria-hidden="true">${sort?.key===c.key?(sort.desc?'↓':'↑'):'↕'}</span></button><span class="grid-resize" aria-hidden="true"></span></th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${columns.map(c=>`<td data-column="${c.key}">${c.cell(r)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${columns.length}">Eşleşen kayıt yok.</td></tr>`}</tbody></table></div></section>`}
 let resizeObserver;
 const clipped=wrap=>[wrap,...wrap.querySelectorAll('*')].some(n=>n.scrollHeight>n.clientHeight+1||n.scrollWidth>n.clientWidth+1);
 const hiddenByKind={'production-monitor':['orderNumber','orderCreatedAt','machineCode'],'jobs':['orderNumber','operatorName'],'production-orders':[]};
 function enhance(table){
  if(!table)return;
  resizeObserver?.disconnect();const updates=[];
  document.querySelector('#grid-text-tooltip')?.remove();
  table.classList.add('ergonomic-grid');
  const weights={number:19,orderNumber:17,label:19,name:25,part:25,partName:25,customer:20,detail:35,summary:30,operation:18,machineCode:17,status:20,action:16,quantity:8,produced:10,remaining:10,unresolved:9,dueDate:13,due:13,orderCreatedAt:13};
  if(table.dataset.gridKind==='master')Object.assign(weights,{name:35,code:20,created_at:15,action:30});
  const heads=[...table.querySelectorAll('thead th')],total=heads.filter(th=>!th.hidden).reduce((n,th)=>n+(weights[th.dataset.column]||14),0);
  for(const th of heads){
   if(!th.style.width)th.style.width=((weights[th.dataset.column]||14)/total*100)+'%';
   if(th.dataset.column==='action'){const button=th.querySelector('.grid-sort');if(button){const label=document.createElement('span');label.textContent=button.childNodes[0].textContent;button.replaceWith(label)}th.removeAttribute('aria-sort')}
  }
  for(const td of table.querySelectorAll('tbody td[data-column]')){
   if(td.dataset.column==='action'||td.querySelector('.grid-cell-content'))continue;
   const wrap=document.createElement('div');wrap.className='grid-cell-content';
   while(td.firstChild)wrap.append(td.firstChild);td.append(wrap);
   const full=wrap.innerText.trim();if(!full)continue;
   const show=()=>{document.querySelector('#grid-text-tooltip')?.remove();if(!clipped(wrap))return;const tip=document.createElement('div');tip.id='grid-text-tooltip';tip.className='grid-text-tooltip';tip.setAttribute('role','tooltip');tip.textContent=full;document.body.append(tip);wrap.setAttribute('aria-describedby',tip.id);const r=wrap.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(r.left,innerWidth-tip.offsetWidth-8))+'px';tip.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-tip.offsetHeight-8))+'px'};
   const hide=()=>{document.querySelector('#grid-text-tooltip')?.remove();wrap.removeAttribute('aria-describedby')};
   wrap.addEventListener('mouseenter',show);wrap.addEventListener('mouseleave',hide);wrap.addEventListener('focusin',show);wrap.addEventListener('focusout',hide);wrap.addEventListener('keydown',e=>{if(e.key==='Escape')hide()});
   (()=>{if(!wrap.isConnected)return;
    if(!wrap.querySelector('button,a,input'))wrap.tabIndex=0;
    const more=document.createElement('button');more.type='button';more.className='grid-text-more';more.textContent='…';more.setAttribute('aria-label','Tam metni göster: '+full);more.onclick=()=>{hide();document.querySelector('#grid-text-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='grid-text-dialog';dialog.className='grid-text-dialog';dialog.setAttribute('aria-label','Tam metin');const text=document.createElement('p');text.textContent=full;const close=document.createElement('button');close.className='btn';close.textContent='Kapat';close.onclick=()=>dialog.close();dialog.append(text,close);dialog.addEventListener('close',()=>{dialog.remove();more.focus()});document.body.append(dialog);dialog.showModal()};td.append(more);const update=()=>{more.hidden=td.hidden||!clipped(wrap)};updates.push(update);update();
   })();
  }
  resizeObserver=new ResizeObserver(()=>updates.forEach(fn=>fn()));resizeObserver.observe(table);table.querySelectorAll('.grid-cell-content').forEach(w=>resizeObserver.observe(w));
 }
 root.RitimOperationalGrid={render,enhance,hiddenByKind};
})(globalThis);
