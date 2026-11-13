'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({page,origin,admin,schema,ta,operator})=>{
 const out=path.resolve(__dirname,'../artifacts/existing-usernames');fs.mkdirSync(out,{recursive:true});const errors=[],shots=[];page.on('pageerror',e=>errors.push(e.message));
 const users=(await admin.query(`SELECT * FROM ${schema}.users ORDER BY id`)).rows;
 const history=(await admin.query(`SELECT * FROM ${schema}.production_events ORDER BY id`)).rows;
 const memberships=(await admin.query(`SELECT * FROM ${schema}.site_memberships ORDER BY user_id,site_id,role`)).rows;
 const url=origin+'/auth/team?tenantId='+ta+'#team';await page.goto(url);
 for(const width of [1366,393,320]){
  await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Test Operatörü · Kullanıcı adı tanımla',exact:true}).click();
  assert(await page.getByRole('dialog').isVisible());await page.getByRole('dialog').locator('[name=username]').fill('operator.01');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const file='dialog-'+width+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});shots.push(file);
  await page.getByRole('button',{name:'Vazgeç',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
 }
 assert.equal((await admin.query(`SELECT COUNT(*)::int n FROM ${schema}.managed_usernames`)).rows[0].n,0,'Cancel does not bind an alias');
 await page.getByRole('button',{name:'Test Operatörü · Kullanıcı adı tanımla',exact:true}).click();await page.getByRole('dialog').locator('[name=username]').fill('Operator.01');
 await Promise.all([page.waitForURL('**saved=1#team'),page.getByRole('button',{name:'Kullanıcı adını kaydet',exact:true}).click()]);
 const row=page.locator('.team-person').filter({hasText:'Test Operatörü'});assert.match(await row.locator('.team-identity').innerText(),/operator\.01/);
 assert.equal(await row.getByRole('button',{name:/Kullanıcı adı tanımla/}).count(),0);
 for(const width of [1366,393]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const file='saved-'+width+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});shots.push(file);}
 assert.deepEqual((await admin.query(`SELECT * FROM ${schema}.users ORDER BY id`)).rows,users);
 assert.deepEqual((await admin.query(`SELECT * FROM ${schema}.production_events ORDER BY id`)).rows,history);
 assert.deepEqual((await admin.query(`SELECT * FROM ${schema}.site_memberships ORDER BY user_id,site_id,role`)).rows,memberships);
 const alias=(await admin.query(`SELECT user_id,existing_identity FROM ${schema}.managed_usernames WHERE username='operator.01'`)).rows[0];assert.equal(alias.user_id,operator);assert.equal(alias.existing_identity,true);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({status:'PASS',disposableDatabase:true,viewports:[320,393,1366],historyPreserved:true,membershipsPreserved:true,identityPreserved:true,shots,errors},null,2));
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mevcut kullanıcıya kullanıcı adı</title><style>body{font:15px system-ui;background:#f4f7fb;color:#21354c;margin:24px}main{max-width:1200px;margin:auto}figure{margin:24px 0;background:white;padding:16px;border:1px solid #dde5ef;border-radius:12px}img{display:block;max-width:100%;height:auto;max-height:900px;object-fit:contain;object-position:left top}a{color:#265bd1}</style><main><h1>Mevcut kullanıcıya kullanıcı adı tanımlama</h1><p>Yönetici, mevcut hesabın yanındaki düğmeyle kullanıcı adını belirler. Aynı hesap, roller, şifre ve üretim geçmişi korunur. Kullanıcı adı kaydedildikten sonra listede görünür. Yeni hesap oluşturulmaz.</p><p>Gerçek uygulama ve geçici PostgreSQL üzerinde doğrulandı. Canlı hesaplarda değişiklik yapılmadı. <a href="checks.json">Test sonucu</a></p>'+shots.map(f=>'<figure><figcaption>'+f+'</figcaption><a href="'+f+'"><img src="'+f+'" alt="'+f+'"></a></figure>').join('')+'</main></html>');
 console.log('Existing username UI PASS: identity, memberships and production history preserved; 320/393/1366 px.');
};
