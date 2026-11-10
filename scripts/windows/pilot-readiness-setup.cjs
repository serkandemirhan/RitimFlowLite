'use strict';
module.exports=async h=>{
 const s=h.state,p=s.prefix;
 const customer=await h.post('customer','/master-data/customers',{name:'Pilot Test Musterisi',code:p+'-M'});
 const part=await h.post('part','/master-data/parts',{name:'Pilot Test Mil',code:p+'-P'});
 const order=await h.post('order','/orders',{orderNumber:p,customer:customer.name,customerId:customer.id,partName:part.name,partNumber:part.code,partId:part.id,orderedQuantity:10,dueDate:'2026-11-20'});
 s.orderId=order.id;
 const material=await h.post('material','/inventory/materials',{code:p+'-RAW',description:'Pilot Test Celik',baseUnit:'piece',lotTracking:true});
 let parent=null; for(const kind of ['plant','warehouse','region','container'])parent=(await h.post('location-'+kind,'/inventory/locations',{kind,code:p+'-'+kind,parentId:parent})).id;
 s.locationId=parent;
 s.stock=await h.post('stock','/inventory/receipts',{materialId:material.id,locationId:parent,lotCode:p+'-LOT',quantity:30,supplierRef:'Pilot Test',documentRef:p+'-IRS'});
 s.machines=[];for(const code of ['TORNA-01','FREZE-02','KONTROL-03'])s.machines.push(await h.post('machine-'+code,'/machine-planning/machines',{code:p+'-'+code}));
 const po=await h.post('po','/orders/'+order.id+'/production-orders',{number:p+'-UE',quantity:10,operations:[{name:'Pilot Torna',kind:'internal',setupMinutes:5,cycleMinutes:2},{name:'Pilot Freze',kind:'internal',setupMinutes:5,cycleMinutes:2},{name:'Pilot Son Kontrol',kind:'internal',setupMinutes:5,cycleMinutes:2}]});
 s.po=await h.post('plan','/production-orders/'+po.id+'/state',{action:'plan',version:po.version,plannedDate:'2026-11-11'});
 h.save();await h.navigate('admin','orders');await h.shot('02-order');await h.navigate('admin','machine-planning');await h.shot('03-planning');await h.navigate('admin','inventory');await h.shot('04-inventory');
 h.check('Pilot veri kurulumu','PASS','10 adet siparis, 3 ic operasyon, 3 makine, 30 adet lotlu malzeme. Tek fiziksel depo; veri modeli 4 seviye istiyor.','Authenticated API preparation + desktop rendering');
 return {orderId:s.orderId,productionOrder:s.po.id,jobs:s.po.workOrders};
};
