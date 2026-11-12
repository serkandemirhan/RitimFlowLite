'use strict';
const crypto=require('node:crypto'),assert=require('node:assert/strict');
module.exports=async({admin,schema,call,base,ta:tenant,sa:site,operator,operatorToken,finalControlScenario=false})=>{const id=()=>crypto.randomUUID(),order=id(),seed=await admin.connect();try{await seed.query('SET search_path TO '+schema);if(finalControlScenario)await seed.query('INSERT INTO site_shipping_rules(tenant_id,site_id,allow_uninspected) VALUES($1,$2,true)',[tenant,site]);const post=async(p,b)=>{const production=/\/production\/(start|results|pause|complete)$/.test(p);const r=await call('POST',base+p,b,id(),production?operatorToken:undefined);assert([200,201].includes(r.statusCode),r.body);return r.json()};
  await seed.query("INSERT INTO orders(tenant_id,site_id,id,order_number,customer,part_name,ordered_qty,itemized) VALUES($1,$2,$3,'FIVE-PRODUCTS','Workshop Customer','5 ürün',49,true)",[tenant,site,order]);
  const lines=[];for(const [index,amount]of [10,20,8,6,5].entries()){const item=id();lines.push(item);await seed.query('INSERT INTO order_items(tenant_id,site_id,order_id,id,line_number,part_number,part_name,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[tenant,site,order,item,index+1,'P'+(index+1),'Ürün '+(index+1),amount]);}
  async function output(item,amount,{approved=true,final=true,finish=false}={}){
   const po=id(),op=id(),job=id(),machine=id(),lot=id(),reservation=id();
   await seed.query("INSERT INTO production_orders(tenant_id,site_id,order_id,id,number,quantity,planning_state,order_item_id) VALUES($1,$2,$3,$4,$5,$6,'planned',$7)",[tenant,site,order,po,'PO-'+po,amount,item]);
   await seed.query("INSERT INTO operations(tenant_id,site_id,order_id,id,sequence,name,kind,production_order_id) VALUES($1,$2,$3,$4,0,'Turning','internal',$5)",[tenant,site,order,op,po]);
   if(!final)await seed.query("INSERT INTO operations(tenant_id,site_id,order_id,id,sequence,name,kind,production_order_id) VALUES($1,$2,$3,$4,1,'Final finish','internal',$5)",[tenant,site,order,id(),po]);
   await seed.query('INSERT INTO work_orders(tenant_id,site_id,order_id,id,operation_id,work_order_number,planned_qty,production_order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[tenant,site,order,job,op,'JOB-'+job,amount,po]);
   await seed.query('INSERT INTO machines(tenant_id,site_id,id,code) VALUES($1,$2,$3,$4)',[tenant,site,machine,'M-'+machine]);await seed.query('INSERT INTO work_assignments(tenant_id,site_id,id,work_order_id,machine_id,user_id) VALUES($1,$2,$3,$4,$5,$6)',[tenant,site,id(),job,machine,operator]);
   await seed.query("INSERT INTO lots(tenant_id,site_id,order_id,id,lot_code,kind) VALUES($1,$2,$3,$4,$5,'material')",[tenant,site,order,lot,'L-'+lot]);await seed.query("INSERT INTO material_receipts(tenant_id,site_id,order_id,id,lot_id,supplier,document_ref,quantity_pieces,source_quantity,source_unit,conversion_factor) VALUES($1,$2,$3,$4,$5,'Supplier',$7,$6::bigint,$6::numeric,'piece',1)",[tenant,site,order,id(),lot,amount,'DOC-'+lot]);
   await seed.query("INSERT INTO reservations(tenant_id,site_id,order_id,id,work_order_id,lot_id,quantity_pieces,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active')",[tenant,site,order,reservation,job,lot,amount]);
   await post('/orders/'+order+'/physical-receipts',{reservationId:reservation,quantity:amount});const root='/orders/'+order+'/work-orders/'+job;
   await post(root+'/production/start',{});const result=await post(root+'/production/results',{lotId:lot,kind:'pending',quantity:amount});
   if(approved){await post(root+'/quality/decisions',{eventId:result.eventId,lotId:lot,outcome:'approved',quantity:amount,evidence:'Physical inspection'});await post(root+'/production/complete',{});}else if(finish)await post(root+'/production/complete',{});else await post(root+'/production/pause',{reason:'Awaiting quality'});
   return {...result,productionOrderId:po,workOrderId:job};
  }
  const a1=await output(lines[0],4),a2=await output(lines[0],6);await output(lines[1],20);const pending=await output(lines[2],8,{approved:false,finish:finalControlScenario});await output(lines[3],6,{final:false});

return {order,lines,pending};}finally{seed.release();}};
