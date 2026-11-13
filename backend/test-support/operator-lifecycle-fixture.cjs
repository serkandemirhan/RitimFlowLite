'use strict';
const {randomUUID:id}=require('node:crypto'),assert=require('node:assert/strict');
module.exports=async h=>{
 const f=await require('./operator-experience-fixture.cjs')(h),{admin,schema,ta,sa,operator,call,base,operatorToken}=h;
 const stopped=await call('POST',base+'/orders/'+f.order+'/work-orders/'+f.running.workOrderId+'/production/pause',{reason:'Diğer tezgâhta planlı iş'},id(),operatorToken);assert.equal(stopped.statusCode,200,stopped.body);
 const order=id(),po=id(),job=id(),op=id(),machine=id(),lot=id(),reservation=id();
 const c=await admin.connect();try{await c.query('SET search_path TO '+schema);
 await c.query("INSERT INTO orders(tenant_id,site_id,id,order_number,customer,part_name,ordered_qty) VALUES($1,$2,$3,'SIP-ACIL-01','Atlas Makina ve Otomasyon','Hassas bağlantı flanşı',6)",[ta,sa,order]);
 await c.query("INSERT INTO production_orders(tenant_id,site_id,order_id,id,number,quantity,planning_state) VALUES($1,$2,$3,$4,'UE-ACIL-01',6,'planned')",[ta,sa,order,po]);
 await c.query("INSERT INTO operations(tenant_id,site_id,order_id,id,sequence,name,kind,production_order_id) VALUES($1,$2,$3,$4,0,'CNC freze','internal',$5)",[ta,sa,order,op,po]);
 await c.query("INSERT INTO work_orders(tenant_id,site_id,order_id,id,operation_id,work_order_number,planned_qty,production_order_id,queue_position) VALUES($1,$2,$3,$4,$5,'IE-ACIL-01',6,$6,1024)",[ta,sa,order,job,op,po]);
 await c.query("INSERT INTO machines(tenant_id,site_id,id,code) VALUES($1,$2,$3,'FREZE-02')",[ta,sa,machine]);await c.query('INSERT INTO work_assignments(tenant_id,site_id,id,work_order_id,machine_id,user_id) VALUES($1,$2,$3,$4,$5,$6)',[ta,sa,id(),job,machine,operator]);
 await c.query("INSERT INTO lots(tenant_id,site_id,order_id,id,lot_code,kind) VALUES($1,$2,$3,$4,'HAM-ACIL-01','material')",[ta,sa,order,lot]);
 await c.query("INSERT INTO material_receipts(tenant_id,site_id,order_id,id,lot_id,supplier,document_ref,quantity_pieces,source_quantity,source_unit,conversion_factor) VALUES($1,$2,$3,$4,$5,'Tedarikçi','IRS-ACIL',6,6,'piece',1)",[ta,sa,order,id(),lot]);await c.query("INSERT INTO reservations(tenant_id,site_id,order_id,id,work_order_id,lot_id,quantity_pieces,status) VALUES($1,$2,$3,$4,$5,$6,6,'active')",[ta,sa,order,reservation,job,lot]);
 }finally{c.release()}
 const received=await call('POST',base+'/orders/'+order+'/physical-receipts',{reservationId:reservation,quantity:6},id());assert.equal(received.statusCode,201,received.body);
 const published=await call('POST',base+'/orders/'+f.order+'/drawings/publish',{revision:'A',reason:'Operatör yaşam döngüsü doğrulaması',contentBase64:require('../../tests/fixtures/technical-pdf.cjs')().toString('base64')},id());assert.equal(published.statusCode,201,published.body);
 return {...f,urgent:{orderId:order,productionOrderId:po,workOrderId:job,lotId:lot,quantity:6},normal:{...f.waiting,orderId:f.order}};
};
