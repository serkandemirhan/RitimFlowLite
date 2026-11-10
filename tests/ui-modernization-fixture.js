// Controlled in-memory API used only by the loopback UI acceptance harness.
(()=>{
 if(window.DayPilot){const Native=DayPilot.Scheduler;DayPilot.Scheduler=class extends Native{constructor(...args){super(...args);window.uiTestScheduler=this}}}
 const day='2026-11-09',machines=Array.from({length:5},(_,i)=>({id:'m'+i,code:['CNC Torna 01','CNC Freze 02','Taşlama 03','Son Kontrol','Paketleme'][i],calendar:{weekdays:[1,2,3,4,5],startMinute:480,endMinute:1080,breakStartMinute:720,breakEndMinute:780},capacity:{scheduledMinutes:180,availableMinutes:540,utilization:33,unknownJobs:0,days:[0,1,2].map(d=>({date:'2026-11-'+(9+d).toString().padStart(2,'0'),scheduledMinutes:180,availableMinutes:540,windows:[]}))}}));
 const jobs=Array.from({length:45},(_,i)=>({id:'j'+i,orderId:'o'+i,productionOrderId:'p'+i,number:'IE-2026-'+String(i+1).padStart(4,'0'),workOrderNumber:'IE-2026-'+String(i+1).padStart(4,'0'),orderNumber:'SP-'+(i+1),partName:['Konveyör tahrik mili Ø25 × 140','Hidrolik piston gövdesi','Hassas yatak burcu'][i%3],customer:'Anadolu Makina',operation:'CNC işleme',machineId:'m'+i%5,machineCode:machines[i%5].code,operatorName:'Test Operatörü',status:i<2?'running':'waiting',kind:'internal',quantity:25,produced:i<2?5:0,remaining:25,dueDate:'2026-11-12',priority:i%4,blockers:[],attention:{ready:true,reason:'Başlamaya hazır'},timing:{version:1,setupMinutes:0,cycleMinutes:2.4},schedule:{position:Math.floor(i/5),start:`${day}T${String(8+Math.floor(i/5)).padStart(2,'0')}:00:00+03:00`,end:`${day}T${String(9+Math.floor(i/5)).padStart(2,'0')}:00:00+03:00`,segments:[{start:`${day}T${String(8+Math.floor(i/5)).padStart(2,'0')}:00:00+03:00`,end:`${day}T${String(9+Math.floor(i/5)).padStart(2,'0')}:00:00+03:00`}],late:i%11===0}}));
 const board={horizon:{dates:['2026-11-09','2026-11-10','2026-11-11']},revision:'fixture-1',generatedAt:day+'T08:00:00+03:00',estimatedAt:day+'T08:00:00+03:00',machines,jobs};try{const saved=JSON.parse(sessionStorage.getItem('ritim-ui-preview-board'));if(saved?.jobs?.length===jobs.length){const originals=new Map(jobs.map(j=>[j.id,j]));jobs.splice(0,jobs.length,...saved.jobs.map(j=>Object.assign(originals.get(j.id),j)));board.revision=saved.revision}}catch{}window.uiFixture={jobs,board};
 const savedBoard=JSON.parse(sessionStorage.getItem('ritim-ui-preview-board')||'null');
 if(savedBoard?.machines)machines.splice(0,machines.length,...savedBoard.machines);
 const legacy=machines[0].calendar;board.workCalendar=savedBoard?.workCalendar||{version:0,calendar:legacy.shifts?legacy:{shifts:[{name:'Gündüz',weekdays:legacy.weekdays,startMinute:legacy.startMinute,endMinute:legacy.endMinute,breaks:[{startMinute:legacy.breakStartMinute,endMinute:legacy.breakEndMinute}]}],turkeyHolidays:true,exceptions:[]}};
 for(const m of machines){m.calendar=board.workCalendar.calendar;m.calendar_version=board.workCalendar.version}
 const api={workCalendar:async()=>structuredClone(board.workCalendar),session:async()=>({identity:{id:'test',displayName:'Test Yöneticisi'},memberships:[{tenantId:'test',siteId:'test',tenantName:'Ritim Test',siteName:'Kontrollü ortam'}]}),selectScope:async()=>({roles:['tenant_admin'],capabilities:['members.manage','orders.write','orders.read','planning.write','production.write','quality.write','stock.write','shipment.write','master.write']}),workspacePreferences:async()=>({views:JSON.parse(sessionStorage.getItem('ritim-ui-preview-preferences')||'[]')}),jobWorklist:async(f={})=>({items:jobs.filter(j=>(!f.q||j.number.includes(f.q))&&(!f.machineId||j.machineId===f.machineId)),query:f.q||'',status:f.status||'active',machines,operators:[],total:45,nextAfter:null}),machinePlanning:async()=>structuredClone(board),productionMonitor:async()=>({jobs}),orders:async()=>({orders:[]}),orderChoices:async()=>({items:[],total:0,nextAfter:null}),productionOrders:async()=>({items:[],nextAfter:null}),workCenter:async()=>({today:day,category:'quality',counts:{quality:0},categories:[],items:[],priorities:[]})};
 const orders=jobs.map(j=>({id:j.orderId,orderNumber:j.orderNumber,customer:j.customer,partName:j.partName,partNumber:'DEMO-'+j.id,orderedQuantity:j.quantity,status:'open',createdAt:day+'T08:00:00+03:00',dueDate:j.dueDate,route:[{id:'op-'+j.id,sequence:0,name:j.operation,kind:j.kind}]}));
 try{const saved=JSON.parse(sessionStorage.getItem('ritim-ui-preview-orders')||'[]');for(const o of saved)if(!orders.some(x=>x.id===o.id))orders.push(o)}catch{}
 const productionOrders=jobs.map(j=>({id:j.productionOrderId,orderId:j.orderId,number:'UE-2026-'+j.number.slice(-4),orderNumber:j.orderNumber,customer:j.customer,partName:j.partName,quantity:j.quantity,status:j.status==='running'?'running':'planned',planningState:'planned',plannedDate:day,version:1,runningCount:j.status==='running'?1:0,waitingCount:j.status==='waiting'?1:0,route:[{id:'op-'+j.id,sequence:0,name:j.operation,kind:j.kind,setup_minutes:0,cycle_minutes:2.4}],workOrders:[{...j,name:j.operation,sequence:0,operationId:'op-'+j.id}]}));
 const qualityOutputs=JSON.parse(sessionStorage.getItem('ritim-ui-preview-quality')||'null')||Object.fromEntries(jobs.filter(j=>Number(j.id.slice(1))%3===0).map(j=>[j.id,[{eventId:'event-'+j.id,lotId:'input-'+j.id,outputLotId:'output-'+j.id,quantity:5,approved:0,rejected:0,rework:0,reworkPending:0,unresolved:5}]]));
 const inventory={materials:[{id:'mat-demo',code:'HAM-001',description:'Çelik çubuk',baseUnit:'piece',lotTracking:true}],locations:[{id:'warehouse-demo',kind:'warehouse',code:'Ana depo',parentId:null},{id:'shelf-demo',kind:'container',code:'Raf A1',parentId:'warehouse-demo'}],balances:[{materialId:'mat-demo',materialCode:'HAM-001',materialDescription:'Çelik çubuk',lotId:'lot-demo',lotCode:'LOT-DEMO-001',locationId:'shelf-demo',quantity:100}],movements:[{id:'movement-demo',kind:'receipt',materialId:'mat-demo',materialCode:'HAM-001',lotId:'lot-demo',lotCode:'LOT-DEMO-001',sourceLocationId:null,destinationLocationId:'shelf-demo',quantity:100,documentRef:'DEMO-KABUL-001',occurredAt:day+'T08:00:00+03:00'}]};
 const savedInventory=JSON.parse(sessionStorage.getItem('ritim-ui-preview-inventory')||'null');if(savedInventory)Object.assign(inventory,savedInventory);
 const documentStore=async(id,value)=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ritim-preview-documents',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',value?'readwrite':'readonly'),store=tx.objectStore('files'),r=value?store.put(value,id):store.get(id);tx.oncomplete=()=>resolve(value||r.result);tx.onerror=()=>reject(tx.error)})}finally{db.close()}};
 // Five read-only demo stages: awaiting dispatch, at supplier, partial return,
 // returned awaiting inspection, and completed/released (visible in history).
 const outsourcingDemo=[0,0,10,25,25].map((returned,i)=>{
  const order=orders[i],id='FASON-DEMO-'+(i+1),quantity=25,approved=i===4?25:0,released=approved;
  const returns=returned?[{id:'return-fason-'+i,lotId:'input-j'+i,quantity:returned,approved,rejected:0,pending:returned-approved,history:approved?[{id:'inspection-fason-'+i,outcome:'approved',quantity:approved,evidence:'Demo giriş kontrolü uygun',createdAt:day+'T09:00:00+03:00'}]:[],released,availableApproved:approved-released,downstreamReleaseSupported:true}]:[];
  return {id,orderId:order.id,orderNumber:order.orderNumber,createdAt:day+'T08:00:00+03:00',complete:i===4,view:{supported:true,operation:{id:'external-demo-'+i,name:'Kaplama'},jobs:[{id,supplierId:i%2?'supplier-heat':'supplier-demo',operationId:'external-demo-'+i}],lots:[{lotId:'output-j'+i,availableApproved:i===0?quantity:0}],dispatches:i===0?[]:[{id:'dispatch-fason-'+i,jobId:id,outputLotId:'output-j'+i,quantity,returned,outstanding:quantity-returned,expectedReturnDate:'2026-11-12',returns}],downstreamReleaseSupported:true}};
 });
 const demoSuppliers=JSON.parse(sessionStorage.getItem('ritim-preview-suppliers')||'null')||[{id:'supplier-demo',code:'FASON-01',name:'Demo Kaplama'},{id:'supplier-heat',code:'FASON-02',name:'Demo Isıl İşlem'}];
 const demoQualityHistory=JSON.parse(sessionStorage.getItem('ritim-preview-quality-history')||'null')||[];
 Object.assign(api,{
  search:async q=>{const query=q.trim().toLocaleLowerCase('tr');const items=[...orders.map(o=>({kind:'order',id:o.id,label:o.orderNumber,detail:[o.customer,o.partName].join(' · ')})),...jobs.map(j=>({kind:'work_order',id:j.id,orderId:j.orderId,label:j.number,detail:[j.orderNumber,j.partName,j.operation].join(' · ')})),...inventory.materials.map(m=>({kind:'material',id:m.id,label:m.code,detail:m.description}))].filter(x=>[x.label,x.detail].join(' ').toLocaleLowerCase('tr').includes(query));return {results:items.slice(0,100),truncated:items.length>100}},
  qualityHistoryList:async(f={})=>{const items=demoQualityHistory.filter(x=>!f.q||[x.orderNumber,x.workOrderNumber,x.partName,x.evidence].join(' ').toLocaleLowerCase('tr').includes(f.q.toLocaleLowerCase('tr')));return structuredClone({items,total:items.length,nextAfter:null})},
  productionMonitor:async()=>({jobs:[...jobs,...outsourcingDemo.filter(x=>!x.complete).map((x,i)=>({...jobs[i],id:'fason-job-'+i,kind:'external',operation:'Kaplama',status:'waiting',supplierOutstanding:x.view.dispatches.reduce((n,d)=>n+d.outstanding,0),qualityPending:x.view.dispatches.flatMap(d=>d.returns).reduce((n,r)=>n+r.pending,0),reason:['Gönderim bekliyor','Tedarikçide bekliyor','Kısmi dönüş alındı','Döndü · giriş kontrolü bekliyor'][i]}))]}),
  productionSupplier:async(po,id)=>{const i=Number(id.replace('fason-job-','')),x=outsourcingDemo[i];if(!x)throw Error('Demo fason işi bulunamadı');return structuredClone({workOrderId:id,status:'waiting',suppliers:demoSuppliers,sources:i===0?[{id:'output-j'+i,type:'output',label:'Onaylı kaplama girdisi',available:25}]:[],dispatches:x.view.dispatches.map(d=>({...d,supplierId:x.view.jobs[0].supplierId,qualityPending:d.returns.reduce((n,r)=>n+r.pending,0)}))})},
  addInventoryDocument:async(body,key)=>{const mime=body.contentBase64.startsWith('JVBERi0')?'application/pdf':body.contentBase64.startsWith('iVBORw0KGgo')?'image/png':body.contentBase64.startsWith('/9j/')?'image/jpeg':null;if(!mime)throw Error('PDF, JPEG veya PNG ekleyin.');return documentStore(key,{...body,id:key,mime})},
  inventoryDocument:async id=>{const d=await documentStore(id);if(!d)throw Error('Belge bulunamadı');return d},
  traceLot:async id=>{const j=jobs.find(j=>id==='output-'+j.id||id==='input-'+j.id);if(!j)throw Error('Lot bulunamadı.');const output={id:'output-'+j.id,input_lot_id:'input-'+j.id,order_id:j.orderId,work_order_id:j.id,production_event_id:'event-'+j.id,output_kind:'production'};return {input:id.startsWith('input-')?{id,lot_code:'GIRDI-'+j.number,order_id:j.orderId}:null,output:id.startsWith('output-')?output:null,inventory:null,relations:{production:[output],receipts:[],picks:[],quality:(qualityOutputs[j.id]||[]).flatMap(o=>['approved','rejected','rework'].filter(k=>o[k]>0).map(k=>({id:'decision-'+j.id+'-'+k,order_id:j.orderId,work_order_id:j.id,outcome:k,quantity_pieces:o[k]}))),rework:[],outsourcing:[],shipping:[],returns:[]},omitted:[],truncated:false,scope:'recorded_direct_relations'}},
  inventoryRead:async(kind,f={})=>{if(!Object.hasOwn(inventory,kind))throw Error('Geçersiz depo sorgusu');const rows=inventory[kind].filter(x=>(!f.q||Object.values(x).join(' ').toLocaleLowerCase('tr').includes(f.q.toLocaleLowerCase('tr')))&&(!f.kind||x.kind===f.kind));return structuredClone({[kind]:rows,total:rows.length,nextAfter:null})},
  workCenter:async(f={})=>{
   const categories=[{id:'quality',label:'Kalite bekleyen işler'},{id:'late',label:'Termini geçenler'},{id:'today',label:'Bugün teslim edilecekler'},{id:'planning',label:'İş emri bekleyenler'},{id:'supplier',label:'Fason dönüşü gecikenler'},{id:'returns',label:'Açık iade işlemleri'},{id:'compensation',label:'Üretime alınacak telafiler'}];
   const all=jobs.map(j=>{const i=Number(j.id.slice(1));return {...j,id:i%3===2?j.productionOrderId:j.id,label:j.number,detail:[j.customer,j.partName,j.operation].join(' · '),kind:i%3===0?'quality':i%3===1?'order':'production-order',category:['quality','late','planning'][i%3],reason:['Kalite kararı bekliyor','Termin geçti','Planlama bekliyor'][i%3],action:['Kontrolü aç','Siparişi aç','Üretim emrini aç'][i%3],dueDate:i%3===1?'2026-11-06':j.dueDate}}).filter(x=>x.category!=='quality'||qualityOutputs[x.id]?.some(o=>o.unresolved>0));
   const category=f.category||'quality',query=f.q||'',items=all.filter(x=>x.category===category&&[x.label,x.detail].join(' ').toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));
   return {today:day,category,query,categories,counts:Object.fromEntries(categories.map(c=>[c.id,all.filter(x=>x.category===c.id).length])),items,total:items.length,nextAfter:null,priorities:all.slice(0,5)};
  },
  routeTemplates:async()=>({items:[{id:'demo-route',name:'Demo imalat rotası',operations:[{name:'CNC işleme',kind:'internal'},{name:'Torna',kind:'internal'},{name:'Kaplama',kind:'external'},{name:'Son kontrol',kind:'internal'},{name:'Paketleme',kind:'internal'}]}],nextAfter:null}),
  availability:async()=>({supported:true,plannedQuantity:0,availableQuantity:25}),
  productionNumberPreview:async()=>({number:'UE-DEMO-0046'}),
  logisticsQueue:async(kind,after,q='',status='active')=>{
   if(kind!=='outsourcing')return {items:[],nextAfter:null};
   const items=outsourcingDemo.filter(x=>x.complete&&(status==='all'||!x.complete)&&[x.orderNumber,x.id].join(' ').toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))).map(({view,complete,...item})=>item);
   return structuredClone({items,total:items.length,nextAfter:null});
  },
  outsourcingSuppliers:async()=>({suppliers:structuredClone(demoSuppliers)}),
  outsourcingRead:async id=>structuredClone(outsourcingDemo.find(x=>x.orderId===id)?.view||{supported:false,jobs:[],lots:[],dispatches:[]}),
  rmaRead:async()=>({deliveries:[],returns:[]}),
  reworkDecisions:async()=>({decisions:[],total:0,nextAfter:null}),
  compensationOptions:async()=>({losses:[],approvals:[]}),
  orderClosing:async id=>({orderId:id,status:'open',orderedQuantity:orders.find(o=>o.id===id)?.orderedQuantity||0,netDelivered:0,canClose:false,reasons:['Teslimat tamamlanmadı.']}),
  shippingRead:async()=>({lots:[],returnedLots:[],events:[],shippingOrders:[],totals:{availableToShip:0,awaitingDispatch:0,inTransit:0,netDelivered:0}}),
  compensationRecords:async()=>({items:[],total:0,nextAfter:null,totals:{quantity:0,allocated:0,remaining:0}}),
  workflowRead:async()=>({workflow:JSON.parse(sessionStorage.getItem('ritim-ui-preview-workflow')||'null')}),
  workflowSave:async body=>{const current=JSON.parse(sessionStorage.getItem('ritim-ui-preview-workflow')||'null');const result={id:body.id,revision:(current?.revision||0)+1,status:body.status,state:body.state};sessionStorage.setItem('ritim-ui-preview-workflow',JSON.stringify(body.status==='completed'?null:result));return result},
  masterSearch:async(kind,q='')=>({items:(kind==='customers'?[{id:'customer-demo',name:'Anadolu Makina',code:'DEMO-M'}]:[...new Set(jobs.map(j=>j.partName))].map((name,i)=>({id:'part-demo-'+i,name,code:'DEMO-P'+i}))).filter(x=>x.name.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))),nextAfter:null}),

  productionOrders:async orderId=>{const items=productionOrders.filter(p=>!orderId||p.orderId===orderId);return {items,total:items.length,nextAfter:null}},
  productionOrder:async id=>{const p=structuredClone(productionOrders.find(p=>p.id===id)),i=outsourcingDemo.findIndex(x=>x.orderId===p?.orderId);if(i>=0)p.workOrders.push({...jobs[i],id:'fason-job-'+i,name:'Kaplama',kind:'external',sequence:1,attention:{qualityPending:outsourcingDemo[i].view.dispatches.flatMap(d=>d.returns).reduce((n,r)=>n+r.pending,0)}});return p},
  productionOrderFlow:async()=>({outputs:[],dispatches:[]}),
  orderWorkspace:async(f={})=>{const filters={q:'',status:'open',sort:'number',direction:'asc',allocation:'all',...f};let items=orders.map(o=>({...o,allocated:o.orderedQuantity,unallocated:0,unplanned:0,netDelivered:0})).filter(o=>(!filters.q||[o.orderNumber,o.customer,o.partName].join(' ').toLowerCase().includes(filters.q.toLowerCase()))&&(filters.status==='all'||o.status===filters.status));const total=items.length,page=Number(f.page)||1;return {items:items.slice((page-1)*20,page*20),total,page,pages:Math.max(1,Math.ceil(total/20)),filters}},
  orders:async()=>({orders}),orderChoices:async()=>({items:orders,total:orders.length,nextAfter:null}),
  order:async id=>structuredClone(orders.find(o=>o.id===id)),
  workOrders:async id=>({workOrders:jobs.filter(j=>j.orderId===id).map(j=>({...j,operationId:'op-'+j.id,sequence:0,plannedQuantity:j.quantity,recordedProduction:j.produced,recordedScrap:0}))}),
  production:async(o,id)=>{const j=jobs.find(j=>j.id===id);return {inputQuantity:j.quantity,consumedQuantity:j.produced,remainingUsableInput:j.quantity-j.produced,attention:{...j.attention,reason:j.status==='running'?'İş devam ediyor':j.status==='paused'?'İş duraklatıldı':j.attention.reason},lots:[]}},
  quality:async(o,id)=>structuredClone({outputs:qualityOutputs[id]||[]}),
  readOperation:async (kind,orderId,jobId)=>{if(kind==='assignment')return {assignments:jobs.filter(j=>j.id===jobId).map(j=>({id:'assignment-'+j.id,operatorId:'operator-demo',machineId:j.machineId,releasedAt:null})),operators:[{id:'operator-demo',displayName:'Test Operatörü'}],machines};if(kind==='drawing')return {required:false};if(kind==='productionHistory')return {events:[]};if(kind==='qualityHistory')return {decisions:[]};if(kind==='material')return {supported:false};if(kind==='downstream')return {supported:false};throw Error('Preview read not supported: '+kind)},
  workDocuments:async()=>({items:[]})
 });
 const masterData=JSON.parse(sessionStorage.getItem('ritim-ui-preview-master')||'null')||{
  customers:[{id:'customer-demo',name:'Anadolu Makina',code:'DEMO-M',version:1}],
  parts:[...new Set(jobs.map(j=>j.partName))].map((name,i)=>({id:'part-demo-'+i,name,code:'DEMO-P'+i,version:1})),
  'scrap-reasons':[{id:'scrap-demo',name:'Ölçü hatası',code:'OLCU',version:1}],
  operations:[['CNC işleme','internal'],['Torna','internal'],['Kaplama','external'],['Son kontrol','internal'],['Paketleme','internal']].map(([name,kind],i)=>({id:'operation-demo-'+i,name,kind,code:'OP-'+i,version:1}))
 };
 api.masterSearch=async(kind,q='')=>({items:(masterData[kind]||[]).filter(x=>!x.deleted&&[x.name,x.code].join(' ').toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'))),nextAfter:null});
 api.masterRecord=async(kind,id)=>structuredClone(masterData[kind].find(x=>x.id===id));
 api.masterPage=async(kind,f={})=>{const {items}=await api.masterSearch(kind,f.q||'');items.sort((a,b)=>String(a[f.sort||'name']||'').localeCompare(String(b[f.sort||'name']||''),'tr')*(f.direction==='desc'?-1:1));const size=Number(f.size)||20,pages=Math.max(1,Math.ceil(items.length/size)),page=Math.min(Number(f.page)||1,pages);return {items:items.slice((page-1)*size,page*size),total:items.length,page,pages,size,sort:f.sort||'name',direction:f.direction||'asc'}};
 window.RitimAuthProvider={createBff:()=>({config:async()=>({enabled:true})})};window.RitimApiAdapter={create:()=>api};window.RitimServerPendingCommands={create:()=>{const pending=[];return {
 load:async()=>{},list:()=>pending,clearMemory:()=>{pending.length=0},
 begin:async row=>{const item={...row,id:crypto.randomUUID()};pending.push(item);return item},
 execute:async (row,send,options={})=>{try{
  if(row.kind==='outsourcing'&&row.body.command==='supplier'){const p=row.body.payload;if(!p.code.trim()||!p.name.trim())throw Error('Tedarikçi kodu ve adı gerekli.');if(demoSuppliers.some(x=>x.code===p.code))throw Error('Bu tedarikçi kodu zaten kullanılıyor.');const result={id:crypto.randomUUID(),code:p.code.trim(),name:p.name.trim()};demoSuppliers.push(result);sessionStorage.setItem('ritim-preview-suppliers',JSON.stringify(demoSuppliers));return result}
  if(row.kind==='production'&&row.body.action==='pause'){const job=jobs.find(j=>j.id===row.body.workOrderId);if(!job||job.status!=='running'||!row.body.payload.reason)throw Error('Çalışan iş ve duraklatma nedeni gerekli.');job.status='paused';sessionStorage.setItem('ritim-ui-preview-board',JSON.stringify(board));return {workOrderId:job.id,status:job.status}}
  if(row.kind==='machineCreate'){
   const code=row.body.payload.code.trim();if(!code||board.machines.some(m=>m.code===code))throw Error('Makine kodu boş veya zaten kayıtlı.');
   const machine={id:crypto.randomUUID(),code,calendar:board.workCalendar.calendar,calendar_version:board.workCalendar.version};board.machines.push(machine);sessionStorage.setItem('ritim-ui-preview-board',JSON.stringify(board));return machine;
  }
  if(row.kind==='siteCalendar'){
   const response=await fetch('/__preview/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({board,kind:'siteCalendar',payload:row.body.payload})});const result=await response.json();if(!response.ok)throw Error(result.error);jobs.splice(0,jobs.length,...result.jobs);Object.assign(board,result,{jobs});sessionStorage.setItem('ritim-ui-preview-board',JSON.stringify(board));return result.workCalendar;
  }
  if(row.kind==='inventory'&&row.body.command==='receipt'){
   const p=row.body.payload;if(!p.lotCode?.trim()||!Number.isSafeInteger(p.quantity)||p.quantity<1)throw Error('Lot kodu ve geçerli adet gerekli.');if((p.documentIds||[]).length>5)throw Error('En fazla 5 belge ekleyin.');
   const documents=await Promise.all((p.documentIds||[]).map(async id=>{const d=await api.inventoryDocument(id);return {id,filename:d.filename}}));
   const lotId=crypto.randomUUID(),movementId=crypto.randomUUID(),material=inventory.materials.find(x=>x.id===p.materialId);
   const next=structuredClone(inventory);next.balances.push({lotId,lotCode:p.lotCode,materialId:p.materialId,materialCode:material.code,locationId:p.locationId,quantity:p.quantity,orderId:p.orderId||null});next.movements.unshift({id:movementId,lotId,lotCode:p.lotCode,materialCode:material.code,kind:'receipt',destinationLocationId:p.locationId,quantity:p.quantity,documentRef:p.documentRef,orderId:p.orderId||null,documents,occurredAt:new Date().toISOString()});sessionStorage.setItem('ritim-ui-preview-inventory',JSON.stringify(next));Object.assign(inventory,next);return {lotId,movementId};
  }
  if(row.kind==='quality'){
   const p=row.body.payload,output=qualityOutputs[row.target]?.find(x=>x.eventId===p.eventId);
   if(!output||!Number.isSafeInteger(p.quantity)||p.quantity<=0||p.quantity>output.unresolved||!['approved','rejected','rework'].includes(p.outcome)||!p.evidence?.trim())throw Error('Geçersiz kalite kararı');
   output.unresolved-=p.quantity;output[p.outcome]+=p.quantity;if(p.outcome==='rework')output.reworkPending+=p.quantity;
   const job=jobs.find(j=>j.id===row.target);demoQualityHistory.unshift({id:row.id,orderId:job.orderId,workOrderId:job.id,orderNumber:job.orderNumber,workOrderNumber:job.number,partName:job.partName,outcome:p.outcome,quantity:p.quantity,evidence:p.evidence,decidedAt:new Date().toISOString()});sessionStorage.setItem('ritim-preview-quality-history',JSON.stringify(demoQualityHistory));
   sessionStorage.setItem('ritim-ui-preview-quality',JSON.stringify(qualityOutputs));return structuredClone(output);
  }
  if(row.kind==='masterData'){
   const {entity,action,payload}=row.body,list=masterData[entity];if(!list)throw Error('Unknown master type');
   const old=list.find(x=>x.id===row.target);if(action!=='create'&&(!old||old.version!==payload.version))throw Error('Record version changed');
   if(entity==='operations'&&action!=='delete'&&!['internal','external'].includes(payload.kind))throw Error('Operation type required');
   const result=action==='create'?{...payload,id:crypto.randomUUID(),version:1,createdAt:new Date().toISOString()}:{...old,...payload,version:old.version+1,...action==='delete'?{deleted:true}:{}};
   if(action==='create')list.push(result);else Object.assign(old,result);
   sessionStorage.setItem('ritim-ui-preview-master',JSON.stringify(masterData));await options.beforeClear?.(result);return result;
  }
  if(row.kind==='createOrder'){const order={...row.body,id:crypto.randomUUID(),status:'open',createdAt:new Date().toISOString(),route:[]};orders.push(order);sessionStorage.setItem('ritim-ui-preview-orders',JSON.stringify(orders));await options.beforeClear?.(order);return order}
  if(row.kind==='defineRoute'){const order=orders.find(x=>x.id===row.target);order.route=row.body.operations.map((o,i)=>({...o,id:crypto.randomUUID(),sequence:i}));sessionStorage.setItem('ritim-ui-preview-orders',JSON.stringify(orders));const result={operations:order.route};await options.beforeClear?.(result);return result}

  if(row.kind==='workspacePreference'){
   const views=JSON.parse(sessionStorage.getItem('ritim-ui-preview-preferences')||'[]'),old=views.find(x=>x.view===row.target),payload=row.body.payload;
   if((old?.version||0)!==payload.version)throw Error('Preference version changed');
   const result={view:row.target,version:(old?.version||0)+1,settings:payload.settings};
   sessionStorage.setItem('ritim-ui-preview-preferences',JSON.stringify([...views.filter(x=>x.view!==row.target),result]));return result;
  }
  if(row.kind!=='machinePlanning')throw Error('Preview command not supported: '+row.kind);
  const response=await fetch('/__preview/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({board,payload:row.body.payload})});
  const result=await response.json();if(!response.ok)throw Error(result.error);
  jobs.splice(0,jobs.length,...result.jobs);Object.assign(board,result,{jobs});
  sessionStorage.setItem('ritim-ui-preview-board',JSON.stringify(board));return structuredClone(board);
 }finally{const index=pending.indexOf(row);if(index>=0)pending.splice(index,1)}}
}}};
})();
