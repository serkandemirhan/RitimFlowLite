'use strict';
const crypto=require('node:crypto');
const {authenticate}=require('./identity');
const {listMemberships}=require('./authorization');
const {read,change}=require('./workspace-administration');
const {HttpError}=require('./auth');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles={operator:'Operatör',planner:'Planlamacı',quality:'Kalite',logistics:'Lojistik',viewer:'Yalnız görüntüleme',manager:'Tesis yöneticisi',none:'Bu tesiste erişim yok'};
function page(body){return `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ritim Flow · Firma ve ekip</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:#19334f;font:15px/1.5 system-ui}main{max-width:1040px;margin:auto;padding:28px 20px}header{display:flex;justify-content:space-between;gap:16px;align-items:center}h1{font-size:28px;margin:12px 0}h2{font-size:20px;margin:0 0 12px}h3{font-size:16px}p,small{color:#576d82}a{color:#245bca}section{background:white;border:1px solid #dce5ef;border-radius:16px;padding:24px;margin:20px 0}.row{display:flex;align-items:end;gap:12px;flex-wrap:wrap}label{display:grid;gap:6px;flex:1;min-width:150px}input,select,button{font:inherit;border:1px solid #cad8e8;border-radius:9px;padding:11px 13px;max-width:100%;min-height:44px}button{background:#245dea;color:white;border:0;cursor:pointer}form+form{border-top:1px solid #e5ecf4;margin-top:18px;padding-top:18px}.notice{padding:14px 18px;background:#e8f6ee;border:1px solid #c4e7d2;border-radius:10px}.muted{background:#f5f8fc;padding:12px;border-radius:8px}summary{cursor:pointer;padding:12px 0}details form{margin-top:10px}.person{border-top:1px solid #e5ecf4;padding:16px 0}.person strong{display:block}.pill{font-size:12px;border-radius:20px;background:#eaf0ff;color:#305ba4;padding:4px 10px}nav{display:flex;gap:20px;margin:14px 0} @media(max-width:600px){main{padding:16px 12px}section{padding:18px}h1{font-size:24px}.row{align-items:stretch}.row button{width:100%}header{align-items:start}label{min-width:100%}}
</style><main><header><div><small>ÇALIŞMA ALANI YÖNETİMİ</small><h1>Firma ve ekip</h1></div><a href="/?mode=api">Uygulamaya dön</a></header>${body}</main></html>`;}
function render(w,s,userId,saved){
 const hidden=(action,extra={})=>Object.entries({tenantId:s.tenantId,siteId:s.siteId,action,version:w.version,key:crypto.randomUUID(),...extra}).map(([k,v])=>`<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
 const form=(action,body,extra={})=>`<form method="post" action="/auth/team" class="row">${hidden(action,extra)}${body}</form>`;
 const field=(name,label,value)=>`<label>${label}<input name="${name}" value="${esc(value)}" required maxlength="120"></label>`;
 return page(`${saved?'<p role="status" class="notice">✓ Değişiklik kaydedildi.</p>':''}<nav aria-label="Bölümler"><a href="#company">Firma</a><a href="#sites">Tesisler · ${w.sites.length}</a><a href="#team">Ekip · ${w.members.length}</a></nav>
 <section id="company"><h2>Firma bilgileri</h2>${form('company',field('name','Firma adı',w.name)+'<button>Kaydet</button>')}<p>Bu ayarlar yalnızca kendi firmanız için geçerlidir.</p></section>
 <section id="sites"><h2>Tesisler</h2><p>Her tesisin siparişleri, makineleri ve üretim kayıtları ayrı tutulur.</p>${w.sites.map(x=>form('site',field('code','Tesis kodu',x.code)+field('name','Tesis adı',x.name)+'<button>Kaydet</button>',{id:x.id})).join('')}
 <details><summary>＋ Yeni tesis ekle</summary>${form('site',field('code','Tesis kodu','')+field('name','Tesis adı','')+'<button>Tesis oluştur</button>',{id:crypto.randomUUID(),create:'true'})}</details></section>
 <section id="team"><h2>Ekip ve erişimler</h2><p>Firma yöneticileri tüm tesislere erişir. Diğer kullanıcıların her tesisteki rolünü ayrı belirleyebilirsiniz.</p>${w.members.map(u=>`<article class="person"><strong>${esc(u.name)} ${u.id===userId?'<small>· Siz</small>':''}</strong>${u.admin?'<span class="pill">Firma yöneticisi · Tüm tesisler</span>':u.disabled?'<span class="pill">Hesap devre dışı</span>':w.sites.map(site=>{const current=u.assignments.filter(a=>a.siteId===site.id).map(a=>a.role);return form('member',`<label>${esc(site.name)}<select name="role">${current.length>1?'<option value="" selected disabled>Birden fazla rol · Değiştirmek için seçin</option>':''}${Object.entries(roles).map(([key,label])=>`<option value="${key}" ${current.length<=1&&(current[0]||'none')===key?'selected':''}>${label}</option>`).join('')}</select></label><button>Erişimi güncelle</button>`,{userId:u.id,siteId:site.id});}).join('')}</article>`).join('')}
 <p class="muted">Yeni kullanıcı daveti henüz kullanıma açık değil. Supabase kullanıcı yönetimi ve e-posta gönderim bağlantısı tamamlandıktan sonra buradan davet gönderebileceksiniz.</p></section>`);
}
function routes(app,{pool,verifier,tokenFor,origin}){
 app.register(async app=>{
 app.setErrorHandler((e,req,reply)=>{if(e.statusCode===401)return reply.redirect('/auth/login');const status=e instanceof HttpError?e.statusCode:e.code==='23505'?409:500;return reply.code(status).type('text/html').send(page(`<section><h2>Değişiklik kaydedilemedi</h2><p role="alert">${esc(e instanceof HttpError?e.message:e.code==='23505'?'Bu tesis kodu zaten kullanılıyor.':'İşlem tamamlanamadı. Lütfen tekrar deneyin.')}</p><a href="/auth/team">Güncel bilgileri aç</a></section>`));});
 const identity=req=>authenticate({headers:{authorization:'Bearer '+tokenFor(req)}},pool,verifier);
 app.get('/auth/team',async(req,reply)=>{const user=await identity(req),memberships=(await listMemberships(pool,user)).filter(m=>m.roles.includes('tenant_admin'));
 const s=memberships.find(m=>m.tenantId===req.query.tenantId)||memberships[0];if(!s)throw new HttpError(403,'FORBIDDEN','Bu ekran yalnızca firma yöneticileri içindir.');
 const workspace=await read(pool,{...s,identity:user});return reply.type('text/html').send(render(workspace,s,user.userId,req.query.saved==='1'));
 });
 app.post('/auth/team',async(req,reply)=>{origin(req);req.auth=await identity(req);const b=req.body||{};req.params={tenantId:b.tenantId,siteId:b.siteId};req.headers['idempotency-key']=b.key;
 await change(req,b.action,{...b,version:Number(b.version),create:b.create==='true'});return reply.code(303).redirect('/auth/team?tenantId='+encodeURIComponent(b.tenantId)+'&saved=1');
 });
 });
}
module.exports={routes,render,page};
