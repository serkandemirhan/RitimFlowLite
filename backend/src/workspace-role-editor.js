'use strict';
const script=`
document.addEventListener('DOMContentLoaded',()=>{
 const collapse=document.querySelector('.nav-collapse');
 collapse?.addEventListener('click',()=>{const c=document.body.classList.toggle('admin-collapsed');collapse.closest('.api-shell').classList.toggle('sidebar-collapsed',c);collapse.setAttribute('aria-expanded',String(!c));collapse.setAttribute('aria-label',c?'Menüyü genişlet':'Menüyü daralt');});
 const tabs=[...document.querySelectorAll('main>nav a')],sections=[...document.querySelectorAll('.settings-grid>section')];
 const showSection=()=>{const selected=['#company','#sites','#team'].includes(location.hash)?location.hash:'#team';sections.forEach(s=>s.hidden='#'+s.id!==selected);tabs.forEach(a=>{if(a.hash===selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});};
 window.addEventListener('hashchange',showSection);showSection();
 const people=[...document.querySelectorAll('.team-person')],query=document.getElementById('team-query'),status=document.getElementById('team-status');
 const filter=()=>{let count=0;for(const person of people){person.hidden=!(person.dataset.search.includes((query?.value||'').trim().toLocaleLowerCase('tr-TR'))&&(!status||status.value==='all'||person.dataset.state===status.value));if(!person.hidden)count++;}const total=document.getElementById('team-count');if(total)total.textContent=count+' / '+people.length+' kullanıcı';const empty=document.getElementById('team-empty');if(empty)empty.hidden=count>0;};
 query?.addEventListener('input',filter);status?.addEventListener('change',filter);filter();
 for(const form of document.querySelectorAll('.team-actions form'))form.addEventListener('submit',event=>{const action=form.querySelector('[name="action"]')?.value;if(!['suspend','activate'].includes(action))return;const name=form.closest('.person').querySelector('strong').textContent.trim();if(!confirm(action==='suspend'?name+' dondurulsun mu? Açık oturumları dahil sistem erişimi engellenecek.':name+' yeniden etkinleştirilsin mi?'))event.preventDefault();});
 const create=document.querySelector('.managed-create'),open=document.getElementById('open-create-user');
 if(create&&open){
  create.hidden=true;const form=create.querySelector('form'),password=form.querySelector('[name="password"]'),confirmation=form.querySelector('[name="confirmation"]');
  const validate=()=>confirmation.setCustomValidity(password.value===confirmation.value?'':'Şifreler aynı olmalı.');password.addEventListener('input',validate);confirmation.addEventListener('input',validate);
  open.onclick=()=>{const dialog=document.createElement('dialog');dialog.className='role-editor user-create-editor';dialog.setAttribute('aria-labelledby','create-user-title');const title=document.createElement('h2');title.id='create-user-title';title.textContent='Kullanıcı ekle';const cancel=document.createElement('button');cancel.type='button';cancel.className='role-cancel';cancel.textContent='Vazgeç';cancel.onclick=()=>dialog.close();form.querySelector('footer').prepend(cancel);dialog.append(title,form);document.body.append(dialog);dialog.onclose=()=>{form.reset();confirmation.setCustomValidity('');form.querySelector('button[type="submit"]').disabled=false;cancel.remove();create.append(form);dialog.remove();};dialog.showModal();};
  form.addEventListener('submit',()=>form.querySelector('button[type="submit"]').disabled=true);
 }
 for(const details of document.querySelectorAll('.username-assign')){
  const form=details.querySelector('form'),name=details.dataset.name,button=document.createElement('button');button.type='button';button.className='role-badge';button.textContent='Kullanıcı adı tanımla';button.setAttribute('aria-label',name+' · Kullanıcı adı tanımla');details.hidden=true;details.before(button);
  button.onclick=()=>{const dialog=document.createElement('dialog');dialog.className='role-editor username-editor';const title=document.createElement('h2');title.id='username-dialog-title';title.textContent='Kullanıcı adı tanımla';dialog.setAttribute('aria-labelledby',title.id);const hint=document.createElement('p');hint.textContent=name;const cancel=document.createElement('button');cancel.type='button';cancel.className='role-cancel';cancel.textContent='Vazgeç';cancel.onclick=()=>dialog.close();form.querySelector('footer').prepend(cancel);dialog.append(title,hint,form);document.body.append(dialog);dialog.onclose=()=>{form.reset();form.querySelector('button[type=submit]').disabled=false;cancel.remove();details.append(form);dialog.remove();};dialog.showModal();form.querySelector('[name=username]').focus();};
  form.addEventListener('submit',()=>{form.querySelector('button[type=submit]').disabled=true;});
 }
 for(const details of document.querySelectorAll('.password-change')){
  const form=details.querySelector('form'),name=details.dataset.name;
  const button=document.createElement('button');button.type='button';button.className='role-badge';button.textContent='Şifre değiştir';button.setAttribute('aria-label',name+' · Şifre değiştir');details.hidden=true;details.before(button);
  button.addEventListener('click',()=>{const dialog=document.createElement('dialog');dialog.className='role-editor password-editor';const heading=document.createElement('h2');heading.textContent='Şifre değiştir';heading.id='password-dialog-title';dialog.setAttribute('aria-labelledby',heading.id);const hint=document.createElement('p');hint.textContent=name;const cancel=document.createElement('button');cancel.type='button';cancel.className='role-cancel';cancel.textContent='Vazgeç';cancel.onclick=()=>dialog.close();const footer=form.querySelector('footer');footer.prepend(cancel);dialog.append(heading,hint,form);document.body.append(dialog);dialog.onclose=()=>{form.reset();form.querySelector('[name="confirmation"]').setCustomValidity('');cancel.remove();details.append(form);dialog.remove();};dialog.showModal();});
  const password=form.querySelector('[name="password"]'),confirmation=form.querySelector('[name="confirmation"]');
  const validate=()=>confirmation.setCustomValidity(password.value===confirmation.value?'':'Şifreler aynı olmalı.');password.addEventListener('input',validate);confirmation.addEventListener('input',validate);
  form.addEventListener('submit',()=>{form.querySelector('button[type="submit"]').disabled=true;});
 }
 const company=document.querySelector('#company form'),field=company?.querySelector('input[name="name"]'),saveCompany=company?.querySelector('button');
 if(field&&saveCompany){let original=field.value.trim();const update=()=>saveCompany.hidden=field.value.trim()===original;field.addEventListener('input',update);company.addEventListener('submit',()=>{if(window.location.hostname==='127.0.0.1')queueMicrotask(()=>{original=field.value.trim();update()})});update();}
 for(const form of document.querySelectorAll('#team form')){
  if(form.querySelector('input[name="action"]')?.value!=='member')continue;
  const select=form.querySelector('select'),person=form.closest('.person'),name=person.querySelector('strong').textContent.trim(),site=select.closest('label').firstChild.textContent.trim();
  form.hidden=true;const badge=document.createElement('button');badge.type='button';badge.className='role-badge';const refresh=()=>{badge.textContent=select.selectedOptions[0]?.textContent||'Rol seç';badge.title=name+' · '+site+' · Rolü değiştir'};refresh();form.before(badge);
  badge.onclick=()=>{const dialog=document.createElement('dialog');dialog.className='role-editor';const heading=document.createElement('h2');heading.textContent=name;const hint=document.createElement('p');hint.textContent=site+' · Rol seçin';const choices=document.createElement('div');choices.className='role-choices';let draft=select.value;
   for(const option of select.options){if(option.disabled)continue;const button=document.createElement('button');button.type='button';button.textContent=option.textContent;button.className='role-choice';button.setAttribute('aria-pressed',String(option.value===draft));button.onclick=()=>{draft=option.value;for(const b of choices.children)b.setAttribute('aria-pressed','false');button.setAttribute('aria-pressed','true')};choices.append(button)}
   const footer=document.createElement('footer'),cancel=document.createElement('button'),save=document.createElement('button');cancel.type=save.type='button';cancel.textContent='Vazgeç';save.textContent='Kaydet';cancel.className='role-cancel';cancel.onclick=()=>dialog.close();save.onclick=()=>{if(draft===select.value){dialog.close();return}const label=[...select.options].find(o=>o.value===draft).textContent;if(!confirm(name+' için '+select.selectedOptions[0].textContent+' → '+label+' değişikliğini kaydetmek istiyor musunuz?'))return;select.value=draft;dialog.close();form.requestSubmit();refresh()};footer.append(cancel,save);dialog.append(heading,hint,choices,footer);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  };
 }
});
`;
module.exports={html:'<script>'+script+'</script>',scriptSource:"'sha256-"+require('node:crypto').createHash('sha256').update(script).digest('base64')+"'"};
