'use strict';
module.exports=`<script>
document.addEventListener('DOMContentLoaded',()=>{
 const company=document.querySelector('#company form'),field=company?.querySelector('input[name="name"]'),saveCompany=company?.querySelector('button');
 if(field&&saveCompany){let original=field.value.trim();const update=()=>saveCompany.hidden=field.value.trim()===original;field.addEventListener('input',update);company.addEventListener('submit',()=>{if(window.location.hostname==='127.0.0.1')queueMicrotask(()=>{original=field.value.trim();update()})});update();}
 document.querySelectorAll('#team .role-badge').forEach(x=>x.remove());
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
</script>`;
