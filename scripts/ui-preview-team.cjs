'use strict';
// Loopback-only preview. No identity provider, mail service or real membership writes.
module.exports=function(){
 const workspace={name:'Ritim Test',version:1,sites:[{id:'test',name:'Kontrollü ortam',code:'TEST'}],members:[{id:'test',name:'Test Yöneticisi',admin:true,assignments:[]},{id:'operator-demo',name:'Test Operatörü',assignments:[{siteId:'test',role:'operator'}]}]};
 const people=[['Ayşe Yılmaz','manager'],['Mehmet Kaya','planner'],['Elif Demir','planner'],['Ahmet Çelik','operator'],['Zeynep Aydın','operator'],['Emre Şahin','operator'],['Selin Arslan','quality'],['Burak Koç','quality'],['Deniz Yıldız','logistics'],['Ece Aksoy','viewer']];
 workspace.members.push(...people.map(([name,role],i)=>({id:'demo-member-'+(i+1),name,assignments:[{siteId:'test',role}]})));
 return require('../backend/src/workspace-admin-page').render(workspace,{tenantId:'test',siteId:'test'},'test',false,[],true).replace('</main>',`<p class="notice">Yerel demo · Değişiklikler yalnızca bu tarayıcı oturumunda saklanır. E-posta gönderilmez.</p></main><script>
 const key='ritim-ui-preview-team',saved=sessionStorage.getItem(key);
 const companyName=sessionStorage.getItem('ritim-ui-preview-company');if(companyName)document.querySelector('#company input[name="name"]').value=companyName;
 if(saved){const team=document.querySelector('#team'),seed=[...team.querySelectorAll('.person')];team.innerHTML=saved;for(const person of seed){const id=person.querySelector('input[name="userId"]')?.value;if(id?.startsWith('demo-member-')&&![...team.querySelectorAll('input[name="userId"]')].some(x=>x.value===id))team.querySelector('.invite-panel').before(person)}}
 const teamLink=document.querySelector('main>nav a[href="#team"]');if(teamLink)teamLink.textContent='Ekip · '+document.querySelectorAll('#team .person').length;
 document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>{
 event.preventDefault();const data=Object.fromEntries(new FormData(form));
 if(data.action==='invite'){
  const article=document.createElement('article');article.className='person';
  const name=document.createElement('strong');name.textContent=data.name+' · '+data.email;
  const select=document.createElement('select');select.setAttribute('aria-label','Rol');
  for(const [value,label] of [['operator','Operatör'],['planner','Planlamacı'],['quality','Kalite'],['logistics','Lojistik'],['viewer','Yalnız görüntüleme'],['manager','Tesis yöneticisi'],['none','Erişim yok']]){const o=new Option(label,value);o.selected=value===data.role;select.append(o)}
  article.append(name,select);document.querySelector('#team .invite-panel').before(article);form.reset();
 }else if(data.action==='company'){sessionStorage.setItem('ritim-ui-preview-company',data.name)}else if(data.action==='member'){const select=form.querySelector('select');for(const o of select.options)o.toggleAttribute('selected',o.selected)}
 sessionStorage.setItem(key,document.querySelector('#team').innerHTML);
 alert('Yerel demo kaydedildi. Gerçek kullanıcı erişimi değiştirilmedi.');
 }));
 document.querySelector('#team').addEventListener('change',event=>{if(event.target.tagName==='SELECT'&&!event.target.closest('form')){for(const o of event.target.options)o.toggleAttribute('selected',o.selected);sessionStorage.setItem(key,document.querySelector('#team').innerHTML)}});
 </script>`);
};
