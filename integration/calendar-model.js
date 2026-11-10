/* Shared pure calendar calculations. Public copy: integration/calendar-model.js. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RitimCalendarModel=factory()})(globalThis,function(){
 'use strict';
 // Official sources, verified 2026-11-10:
 // https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=158 (2026)
 // https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=159 (2027)
 // https://vakithesaplama.diyanet.gov.tr/2429_kanun.php (half days start 13:00)
 const religious={2026:[['03-19',3,'Ramazan Bayramı'],['05-26',4,'Kurban Bayramı']],2027:[['03-08',3,'Ramazan Bayramı'],['05-15',4,'Kurban Bayramı']]};
 function holidays(year){const fixed=[['01-01','Yılbaşı'],['04-23','Ulusal Egemenlik ve Çocuk Bayramı'],['05-01','Emek ve Dayanışma Günü'],['05-19','Atatürk’ü Anma, Gençlik ve Spor Bayramı'],['07-15','Demokrasi ve Millî Birlik Günü'],['08-30','Zafer Bayramı'],['10-28','Cumhuriyet Bayramı arifesi',780],['10-29','Cumhuriyet Bayramı']].map(([date,name,startMinute=0])=>({date:year+'-'+date,name,startMinute,endMinute:1440}));for(const [date,length,name]of religious[year]||[]){const start=Date.parse(year+'-'+date+'T12:00:00Z');for(let i=0;i<=length;i++)fixed.push({date:new Date(start+i*86400000).toISOString().slice(0,10),name:i?name+' · '+i+'. gün':name+' arifesi',startMinute:i?0:780,endMinute:1440})}return fixed.sort((a,b)=>a.date.localeCompare(b.date))}
 function windows(day,calendar){
  const base=Date.parse(day+'T00:00:00+03:00'),dayEnd=base+86400000;let result=[];
  const shifts=calendar.shifts||[{...calendar,breaks:[{startMinute:calendar.breakStartMinute,endMinute:calendar.breakEndMinute}]}];
  for(const offset of [-1,0]){const at=base+offset*86400000,dow=new Date(at+3*3600000).getUTCDay()||7;
   for(const s of shifts){if(!s.weekdays.includes(dow))continue;const end=s.endMinute<=s.startMinute?s.endMinute+1440:s.endMinute;let start=s.startMinute;
    const breaks=s.breaks.filter(b=>b.startMinute!==b.endMinute).map(b=>({a:b.startMinute<s.startMinute?b.startMinute+1440:b.startMinute,z:b.endMinute<=s.startMinute?b.endMinute+1440:b.endMinute})).sort((a,b)=>a.a-b.a);
    for(const b of [...breaks,{a:end,z:end}]){const a=Math.max(base,at+start*60000),z=Math.min(dayEnd,at+b.a*60000);if(z>a)result.push([a,z]);start=b.z}
   }
  }
  if(calendar.turkeyHolidays!==false)for(const h of holidays(Number(day.slice(0,4))).filter(h=>h.date===day)){const a=base+h.startMinute*60000,z=base+h.endMinute*60000;result=result.flatMap(([x,y])=>y<=a||x>=z?[[x,y]]:[[x,Math.min(y,a)],[Math.max(x,z),y]].filter(([x,y])=>y>x))}
  const exception=calendar.exceptions?.find(e=>e.date===day);if(exception)result=exception.windows.map(w=>[base+w.startMinute*60000,base+w.endMinute*60000]);
  return result.sort((a,b)=>a[0]-b[0]);
 }
 function status(day,minute,calendar){const at=Date.parse(day+'T00:00:00+03:00')+minute*60000;if(windows(day,calendar).some(([a,b])=>at>=a&&at<b))return 'working';if(calendar.turkeyHolidays!==false&&holidays(Number(day.slice(0,4))).some(h=>h.date===day&&minute>=h.startMinute))return 'holiday';return 'off'}
 return {windows,holidays,status,verifiedYears:[2026,2027]};
});
