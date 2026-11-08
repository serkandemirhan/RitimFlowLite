/* Only transient menus participate; inline history/details stay independent. */
(()=>{'use strict';
 const selector='.workspace-search,.api-mobile-menu,.orders-filter-popover,.orders-columns-popover,.grid-actions details,.machine-column-chooser,.list-filter-panel';
 const closeExcept=keep=>{for(const panel of document.querySelectorAll(selector))if(panel!==keep&&!panel.contains(keep))panel.open=false};
 document.addEventListener('click',event=>{const panel=event.target.closest(selector);closeExcept(panel)},true);
 document.addEventListener('toggle',event=>{if(event.target.matches?.(selector)&&event.target.open)closeExcept(event.target)},true);
 document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const open=[...document.querySelectorAll(selector)].filter(x=>x.open);if(!open.length)return;event.preventDefault();event.stopPropagation();const panel=open.at(-1);closeExcept(null);panel.querySelector('summary')?.focus()},true);
 new MutationObserver(records=>{if(records.some(r=>r.target.matches?.('dialog[open]')||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('dialog[open]')||n.querySelector('dialog[open]')))))closeExcept(null)}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
})();
