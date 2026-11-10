'use strict';
(()=>{
 const initial=[
 {id:'KK-2026-041',part:'Tahrik mili',code:'TM-024',order:'İE-2026-0184',lot:'P-041',quantity:20,rows:[['Mil çapı','24,00 ± 0,02 mm',24.0,23.98,24.02,'mm'],['Toplam boy','120,00 ± 0,05 mm',120.02,119.95,120.05,'mm'],['Yüzey pürüzlülüğü','Ra ≤ 1,60 µm',1.21,0,1.6,'µm']]},
 {id:'KK-2026-042',part:'Bağlantı flanşı',code:'BF-012',order:'İE-2026-0187',lot:'P-042',quantity:12,rows:[['Dış çap','80,00 ± 0,05 mm',80.12,79.95,80.05,'mm'],['Delik çapı','12,00 ± 0,02 mm',12.01,11.98,12.02,'mm'],['Kalınlık','8,00 ± 0,05 mm',8.02,7.95,8.05,'mm']]},
 {id:'KK-2026-043',part:'Kılavuz burç',code:'KB-008',order:'İE-2026-0191',lot:'P-043',quantity:30,rows:[['İç çap','16,00 ± 0,02 mm',16.01,15.98,16.02,'mm'],['Dış çap','28,00 ± 0,03 mm',28.0,27.97,28.03,'mm'],['Boy','40,00 ± 0,05 mm',40.03,39.95,40.05,'mm']]}
 ];
 let batches=structuredClone(initial),selected=0,history=[];
 const $=id=>document.getElementById(id),pass=r=>r[2]>=r[3]&&r[2]<=r[4],label=s=>s==='approved'?'Onaylandı':s==='nonconforming'?'Uygunsuzluk':'Kontrol bekliyor';
 function render(){
  $('batches').replaceChildren(...batches.map((b,i)=>{const button=document.createElement('button');button.type='button';button.className='batch';button.setAttribute('aria-pressed',String(selected===i));button.innerHTML=`<strong>${b.part}</strong><small>${b.id} · ${b.quantity} adet</small><span class="pill ${b.status||''}">${label(b.status)}</span>`;button.onclick=()=>{selected=i;render();};return button;}));
  const b=batches[selected],valid=b.rows.every(pass);
  $('detail').innerHTML=`<div class="detail-top"><div><p class="eyebrow">${b.id}</p><h3>${b.part} <small>/ ${b.code}</small></h3></div><span class="pill ${b.status||''}">${label(b.status)}</span></div><div class="metadata"><span>İş emri: <b>${b.order}</b></span><span>Parti: <b>${b.lot}</b></span><span>Miktar: <b>${b.quantity} adet</b></span></div><div class="table-wrap"><table><thead><tr><th>KONTROL NOKTASI</th><th>KABUL ARALIĞI</th><th>ÖLÇÜLEN</th><th>SONUÇ</th></tr></thead><tbody>${b.rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2].toLocaleString('tr-TR',{minimumFractionDigits:2})} ${r[5]}</td><td class="${pass(r)?'pass':'fail'}">${pass(r)?'✓ Uygun':'! Limit dışı'}</td></tr>`).join('')}</tbody></table></div><p class="result-note ${valid?'':'warn'}">${valid?'✓ Örnek ölçümlerin tamamı kabul aralığında. Partiyi onaylayabilir veya gerekçeli uygunsuzluk kaydedebilirsiniz.':'! Tolerans dışında ölçüm var. Bu demo partinin onaylanmasına izin vermez; uygunsuzluk kaydedin.'}</p>`;
  $('reason').value=b.note||'';$('reason').disabled=!!b.status;
  $('decision-form').querySelector('[value=approved]').disabled=!!b.status||!valid;
  $('decision-form').querySelector('[value=nonconforming]').disabled=!!b.status;
  $('feedback').textContent=b.status?(b.status==='approved'?'Onay kaydedildi. Bu örnekte parti sonraki operasyona hazır.':'Parti incelemeye alındı. Yeniden işleme / hurda kararı bu demonun kapsamı dışındadır.'):'';
  if(!history.length){$('history').innerHTML='<div class="empty">Henüz karar verilmedi. Yukarıdan bir parti seçip ilk kontrol kararınızı kaydedin.</div>';return;}
  $('history').replaceChildren(...history.map(h=>{const el=document.createElement('article');el.className='record';const title=document.createElement('strong');title.textContent=`${h.id} · ${h.part} — ${label(h.status)}`;const note=document.createElement('p');note.textContent=h.note||'Örnek ölçümler kabul aralığında.';const time=document.createElement('small');time.textContent=h.time+' · Demo kalite sorumlusu';el.append(title,note,time);return el;}));
 }
 $('decision-form').onsubmit=e=>{e.preventDefault();const b=batches[selected];if(b.status)return;const status=e.submitter?.value;if(!['approved','nonconforming'].includes(status))return;const note=$('reason').value.trim();if(status==='approved'&&!b.rows.every(pass))return;if(status==='nonconforming'&&!note){$('feedback').textContent='Uygunsuzluğu kaydetmek için karar notu yazın.';$('reason').focus();return;}b.status=status;b.note=note;history.unshift({...b,time:new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})});render();};
 $('reset').onclick=()=>{batches=structuredClone(initial);selected=0;history=[];render();$('feedback').textContent='Demo başlangıç durumuna döndü.';};render();
})();
