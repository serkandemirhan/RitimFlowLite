'use strict';
const {esc}=require('./invitation-presentation');
function renderInvitations(invitations,w,roles,form,enabled){
 if(!invitations.length)return '';
 const pending=i=>i.status==='pending'&&new Date(i.expires_at).getTime()>Date.now();
 const active=invitations.filter(pending),history=invitations.filter(i=>!pending(i));
 const rows=list=>`<ul class="invitation-list">${list.map(i=>{const state=i.status==='accepted'?'accepted':pending(i)?(['failed','unknown'].includes(i.delivery)?'failed':'pending'):'closed';const label=i.status==='accepted'?'Katıldı':i.status==='cancelled'?'İptal edildi':!pending(i)?'Süresi doldu':({ready:'Gönderim bekliyor',sending:'Gönderiliyor',sent:'Kabul bekliyor',failed:'Gönderilemedi',unknown:'Gönderim belirsiz'}[i.delivery]||'Bekliyor');return `<li><div class="invite-person"><strong>${esc(i.display_name)}</strong><span>${esc(i.email)}</span></div><div class="invite-access">${esc(w.sites.find(s=>s.id===i.site_id)?.name||'')}<small>${esc(roles[i.role])}</small></div><span class="invite-status ${state}"><span aria-hidden="true">${state==='accepted'?'✓':state==='failed'?'!':state==='pending'?'◷':'−'}</span> ${label}</span><div class="invite-actions">${pending(i)?(enabled?form('resend-invite','<button>Yeniden gönder</button>',{id:i.id}):'')+form('cancel-invite','<button>İptal et</button>',{id:i.id}):''}</div></li>`}).join('')}</ul>`;
 return `<div class="invite-history"><h3>Davetler <span class="pill">${active.length} bekleyen</span></h3>${active.length?rows(active):'<p class="invite-empty">Bekleyen davet yok.</p>'}${history.length?`<details><summary>Geçmiş davetler · ${history.length}</summary>${rows(history)}</details>`:''}</div>`;
}
module.exports={renderInvitations};
