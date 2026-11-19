/* Navigation state contains no customer data and is not persisted. */
(()=>{'use strict';
let active='orders';
const $=id=>document.getElementById(id);
function menu(open){const mobile=matchMedia('(max-width:850px)').matches;document.body.classList.toggle('menu-open',open);$('portal-menu-toggle').setAttribute('aria-expanded',String(mobile?open:!document.body.classList.contains('menu-collapsed')));if(!open&&$('portal-sidebar').contains(document.activeElement))$('portal-menu-toggle').focus();$('portal-sidebar').inert=mobile&&!open;if(open&&mobile)$('portal-menu-close').focus();}
function show(view){active=['orders','requests','settings'].includes(view)?view:'orders';for(const id of ['orders','requests','settings'])$('portal-'+id+'-view').hidden=id!==active;for(const b of document.querySelectorAll('[data-portal-view]')){if(b.dataset.portalView===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}$('portal-page-title').textContent={orders:'Siparişler',requests:'Talepler',settings:'Ayarlar'}[active];menu(false);window.dispatchEvent(new CustomEvent('portal-view-change',{detail:active}));}
function go(view){if(location.hash==='#'+view)show(view);else location.hash=view;}
for(const b of document.querySelectorAll('[data-portal-view]')){b.setAttribute('aria-label',b.title);b.onclick=()=>go(b.dataset.portalView);}
$('portal-menu-toggle').onclick=()=>{if(matchMedia('(max-width:850px)').matches)menu(!document.body.classList.contains('menu-open'));else{const collapsed=document.body.classList.toggle('menu-collapsed');$('portal-menu-toggle').setAttribute('aria-expanded',String(!collapsed));}};
$('portal-menu-close').onclick=()=>menu(false);$('portal-menu-backdrop').onclick=()=>menu(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('menu-open')){menu(false);$('portal-menu-toggle').focus();}if(e.key==='Tab'&&document.body.classList.contains('menu-open')){const items=[...$('portal-sidebar').querySelectorAll('a,button')].filter(x=>x.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
matchMedia('(max-width:850px)').addEventListener('change',()=>menu(false));
addEventListener('hashchange',()=>show(location.hash.slice(1)));
window.RitimCustomerNavigation={go,current:()=>active,reset:()=>{menu(false);go('orders');},account:name=>{$('portal-account-name').textContent=name||'Müşteri hesabı';}};
show(location.hash.slice(1));
})();
