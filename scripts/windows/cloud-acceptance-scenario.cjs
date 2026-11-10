'use strict';
// Live acceptance: authenticated business APIs plus rendered desktop/mobile evidence.
// Does not impersonate roles through headers or use database administrator credentials.
const assert=require('node:assert/strict');
module.exports=async function(h){
 const {state:s,post,read,shot}=h,prefix=s.prefix;
 const log=t=>console.log('STEP '+t);
 const customer=await post('customer','/master-data/customers',{name:'Eksen Ambalaj Makinaları',code:prefix+'-M'});
 const part=await post('part','/master-data/parts',{name:'Konveyör Tahrik Mili Ø25 × 140',code:prefix+'-P'});
 await shot('01-master','navigate',['master']);
 const order=await post('order','/orders',{orderNumber:prefix,customer:customer.name,customerId:customer.id,partName:part.name,partNumber:part.code,partId:part.id,orderedQuantity:10,dueDate:'2026-11-20'});s.orderId=order.id;h.save();await shot('02-order','openOrder',[order.id]);log('10 adet sipariş');
 const material=await post('material','/inventory/materials',{code:prefix+'-RAW',description:'C45 mil taslağı Ø30 × 150',baseUnit:'piece',lotTracking:true});let parent=null;
 for(const kind of ['plant','warehouse','region','container'])parent=(await post('location-'+kind,'/inventory/locations',{kind,code:prefix+'-'+kind,parentId:parent})).id;
 const stock=await post('stock','/inventory/receipts',{materialId:material.id,locationId:parent,lotCode:prefix+'-LOT',quantity:12,supplierRef:'Çelik Merkezi',documentRef:prefix+'-IRS'});
 const suppliers=[];for(const [i,name]of ['Marmara Isıl İşlem','Boğaziçi Yüzey Kaplama'].entries())suppliers.push(await post('supplier-'+i,'/outsourcing/suppliers',{code:prefix+'-F'+i,name}));
 const machines=[];for(const code of ['CNC-01','CNC-02','OLC-01'])machines.push(await post('machine-'+code,'/machine-planning/machines',{code:prefix+'-'+code}));
 const route=[{name:'CNC torna',kind:'internal'},{name:'Isıl işlem',kind:'external'},{name:'Nikel kaplama',kind:'external'},{name:'Son ölçüm ve paketleme',kind:'internal'}].map(x=>({...x,setupMinutes:5,cycleMinutes:2}));
 await h.role('planner');const pos=[];
 for(const [i,quantity]of [6,4].entries()){const po=await post('po-'+i,'/orders/'+order.id+'/production-orders',{number:prefix+'-UE'+(i+1),quantity,operations:route},h.worker);const planned=await post('plan-'+i,'/production-orders/'+po.id+'/state',{action:'plan',version:po.version,plannedDate:'2026-11-07'},h.worker);pos.push(planned);await shot('03-po-'+i,'poOpen',[po.id]);}
 s.productionIds=pos.map(p=>p.id);h.save();log('6 + 4 adet iki üretim emri, sekiz iş emri');
 const jobBase=j=>'/orders/'+order.id+'/work-orders/'+j.id;
 async function assign(po,tag){for(const j of po.workOrders.filter(j=>j.kind==='internal')){await post('assign-'+j.id,jobBase(j)+'/assignment/operator',{operatorId:h.operatorId,reason:'Saha kabul senaryosu'});await post('machine-'+j.id,jobBase(j)+'/assignment/machine',{machineId:machines[j.sequence===0?0:2].id,reason:'Saha kabul senaryosu'});}await shot('04-assignment-'+tag,'openJob',[po.workOrders[0].id,order.id]);}
 await h.role('operator');
 if(!s.unassignedProbe){const j=pos[0].workOrders[0];const r=await h.req(h.worker,jobBase(j)+'/production/start',{});s.unassignedProbe={status:r.status,code:r.data.error?.code};h.save();assert.equal(r.status,409);}
 for(const [i,po]of pos.entries())await assign(po,i);
 for(const [key,machine]of [['queue-other',machines[1]],['queue-back',machines[0]]]){if(s.steps[key])continue;const b=await read('/machine-planning');await post(key,'/machine-planning/move',{workOrderId:pos[0].workOrders[0].id,machineId:machine.id,beforeId:null,revision:b.revision,reason:'Makine kuyruğu taşıma testi'});}
 await shot('05-board','navigate',['machine-planning']);
 async function approve(j){await h.role('quality');const q=await read(jobBase(j)+'/quality',h.worker);for(const o of q.outputs.filter(o=>o.unresolved>0))await post('quality-'+o.eventId,jobBase(j)+'/quality/decisions',{eventId:o.eventId,lotId:o.lotId,outputLotId:o.outputLotId,outcome:'approved',quantity:o.unresolved,evidence:'Ölçü ve yüzey kontrolü uygun.'},h.worker);await shot('quality-'+j.id,'openQualityJob',[j.id,order.id],true);}
 async function transfer(po,j){const flow=await read('/production-orders/'+po.id+'/flow');for(const l of flow.outputs.filter(l=>l.destinationWorkOrderId===j.id)){const quantity=l.availableApproved||s.steps['reserve-'+l.lotId]?.quantity;if(!quantity)continue;const r=await post('reserve-'+l.lotId,'/orders/'+order.id+'/output-reservations',{outputLotId:l.lotId,destinationWorkOrderId:j.id,quantity});const d=await post('transfer-'+l.lotId,'/orders/'+order.id+'/output-reservations/'+r.id+'/dispatches',{quantity});await post('receive-'+l.lotId,'/orders/'+order.id+'/operation-dispatches/'+d.id+'/receipts',{quantity});}}
 async function internal(po,j,tag,scrap=false){const base=jobBase(j)+'/production';if(s.steps['complete-'+j.id])return;
 if(j.sequence===0)await post('pick-'+j.id,'/inventory/pick',{orderId:order.id,workOrderId:j.id,lotId:stock.lotId,sourceLocationId:parent,quantity:po.quantity});else await transfer(po,j);
 await h.role('operator');await post('start-'+j.id,base+'/start',{},h.worker);await shot('06-start-'+tag,'openAssigned',[j.id],true);
 if(tag==='a0'){await post('pause-'+j.id,base+'/pause',{reason:'Takım kontrolü'},h.worker);await shot('07-pause','openAssigned',[j.id],true);await post('resume-'+j.id,base+'/resume',{},h.worker);}
 if(scrap&&!s.steps['scrap-'+j.id]){const b=await read(base+'/balances',h.worker);const l=b.lots.find(x=>x.available>0);await post('scrap-'+j.id,base+'/results',{lotId:l.lotId,kind:'scrap',quantity:1},h.worker);}
 const b=await read(base+'/balances',h.worker);for(const l of b.lots.filter(x=>x.available>0))await post('result-'+j.id+'-'+l.lotId,base+'/results',{lotId:l.lotId,kind:'pending',quantity:l.available,separateQualityRequest:true},h.worker);
 const q=await read(jobBase(j)+'/quality',h.worker);const ids=q.outputs.filter(x=>x.separateQualityRequest&&!x.qualityRequested).map(x=>x.eventId);if(ids.length)await post('request-'+j.id,base+'/request-quality',{eventIds:ids},h.worker);
 await shot('08-result-'+tag,'openAssigned',[j.id],true);await approve(j);await h.role('operator');await post('complete-'+j.id,base+'/complete',{},h.worker);await shot('09-complete-'+tag,'openAssigned',[j.id],true);log('İç operasyon tamamlandı: '+tag);}
 async function external(po,j,tag){if(s.steps['supplier-complete-'+j.id])return;const base='/production-orders/'+po.id+'/work-orders/'+j.id+'/supplier';await h.role('logistics');let v=await read(base,h.worker);
 for(const src of v.sources.filter(x=>x.available>0))await post('send-'+j.id+'-'+src.id,base+'/dispatch',{supplierId:suppliers[j.sequence-1].id,sourceId:src.id,sourceType:src.type,quantity:src.available,expectedReturnDate:'2026-11-10'},h.worker);
 await shot('10-supplier-send-'+tag,'openSupplierJob',[po.id,j.id],true);v=await read(base,h.worker);for(const d of v.dispatches){if(d.outstanding>0){const parts=tag==='a1'&&d.returned===0?[2,d.outstanding-2]:[d.outstanding];for(const [i,q]of parts.entries())if(q>0)await post('return-'+d.id+'-'+i,base+'/return',{dispatchId:d.id,quantity:q},h.worker);}}
 await approve(j);await post('supplier-complete-'+j.id,base+'/complete',{},h.worker);await shot('11-supplier-return-'+tag,'openSupplierJob',[po.id,j.id]);log('Fason tamamlandı: '+tag);}
 for(const [n,po]of pos.entries()){for(const j of [...po.workOrders].sort((a,b)=>a.sequence-b.sequence)){const tag=(n===0?'a':'b')+j.sequence;if(j.kind==='internal')await internal(po,j,tag,n===0&&j.sequence===3);else await external(po,j,tag);}}
 const losses=await read('/orders/'+order.id+'/compensations');let approval=s.steps.compensation;if(!approval){const loss=losses.losses.find(x=>x.available===1);assert(loss);await h.role('quality');approval=await post('compensation','/orders/'+order.id+'/compensations',{sourceId:loss.id,sourceKind:loss.kind,quantity:1,reason:'Son ölçümde yüzey hasarlı parçanın telafisi'},h.worker);}
 await h.role('planner');const cp=await post('comp-po','/orders/'+order.id+'/production-orders',{number:prefix+'-TELAFI',quantity:1,compensationId:approval.id,operations:route},h.worker);const planned=await post('comp-plan','/production-orders/'+cp.id+'/state',{action:'plan',version:cp.version,plannedDate:'2026-11-07'},h.worker);await h.role('operator');await assign(planned,'comp');
 for(const j of [...planned.workOrders].sort((a,b)=>a.sequence-b.sequence))if(j.kind==='internal')await internal(planned,j,'c'+j.sequence);else await external(planned,j,'c'+j.sequence);
 await h.role('logistics');const ship=await read('/orders/'+order.id+'/shipping',h.worker);const shipment=await post('shipment','/orders/'+order.id+'/shipping/orders',{},h.worker);const sb='/orders/'+order.id+'/shipping/orders/'+shipment.id;
 for(const l of ship.lots.filter(x=>x.availableToShip>0)){const a=await post('ship-allocate-'+l.lotId,sb+'/allocate',{outputLotId:l.lotId,quantity:l.availableToShip},h.worker);const d=await post('ship-dispatch-'+l.lotId,sb+'/dispatch',{allocationId:a.id,quantity:l.availableToShip},h.worker);await post('ship-deliver-'+l.lotId,sb+'/deliver',{dispatchId:d.id,quantity:l.availableToShip},h.worker);}
 await shot('12-shipping','navigate',['shipping'],true);const closing=await read('/orders/'+order.id+'/closing');assert.equal(closing.netDelivered,10);await post('close','/orders/'+order.id+'/close',{reason:'10 adet teslim edildi, üretim ve fason kayıtları tamamlandı.'});await shot('13-closed','openOrder',[order.id]);s.closing=await read('/orders/'+order.id+'/closing');assert.equal(s.closing.status,'closed');h.save();return {status:'PASS',order:order.orderNumber,netDelivered:10,normalProductionOrders:2,compensationProductionOrders:1};
};
