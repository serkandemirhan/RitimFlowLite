'use strict';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles = [['tenant_admin','Firma yöneticisi'],['manager','Tesis yöneticisi'],['planner','Planlama'],['operator','Operatör'],['quality','Kalite'],['logistics','Lojistik'],['viewer','Görüntüleme']];
const labels = {info:'Hesap bilgileri',username:'Kullanıcı adını değiştir',role:'Yetkiyi değiştir',password:'Şifreyi değiştir',suspend:'Kullanıcıyı bloke et',activate:'Blokeyi kaldır',remove:'Erişimi kaldır'};
const hidden = (name,value) => `<input type="hidden" name="${name}" value="${escape(value)}">`;
const reason = '<label>İşlem gerekçesi<input name="reason" minlength="5" maxlength="500" required></label>';
const password = '<label>Yeni şifre<input type="password" name="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><label>Yeni şifre tekrar<input type="password" name="confirmation" minlength="12" maxlength="128" autocomplete="new-password" required></label>';
const username = value => `<label>Kullanıcı adı<input name="username" value="${escape(value || '')}" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}" required></label>`;
const options = (items,selected) => items.map(([value,name])=>`<option value="${escape(value)}"${value===selected?' selected':''}>${escape(name)}</option>`).join('');

function render(detail, state={}) {
 const root = `/platform?tenant=${encodeURIComponent(detail.id)}&tab=users`;
 const activeUser = detail.users.find(user => user.id === state.user);
 const account = activeUser ? detail.accounts?.[activeUser.id] : null;
 const activeRoles = activeUser ? detail.overview?.roles?.[activeUser.id] || [] : [];
 const site = `<label>Tesis<select name="siteId" required>${options(detail.sites.map(x=>[x.id,x.name]))}</select></label>`;
 const role = `<label>Yetki<select name="role">${options(roles,activeRoles[0] || 'operator')}</select></label>`;
 const form = (action,content,button,user) => `<form class="user-form" method="post" action="/platform/accounts">${hidden('action',action)}${hidden('tenantId',detail.id)}${user?hidden('userId',user.id):''}${content}${reason}<div class="form-actions"><a href="${root}">Vazgeç</a><button type="submit">${button}</button></div></form>`;
 if (state.mode === 'new') return `<section class="users-panel"><a class="back-link" href="${root}">← Kullanıcılara dön</a><h2>Yeni kullanıcı</h2><p>Firma için kullanıcı adı, yetki ve şifre belirleyin.</p>${form('create-user','<label>Ad soyad<input name="name" maxlength="120" required></label>'+username('')+site+role+password,'Kullanıcı oluştur')}</section>`;
 if (activeUser && state.action === 'info') {
  const date = value => value ? new Date(value).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}) : 'Kayıt yok';
  const sites = (account?.sites || []).map(x=>`${x.name} (${roles.find(r=>r[0]===x.role)?.[1] || x.role})`).join(', ') || (account?.firmAdmin ? 'Firma genelinde yetkili' : 'Tesis üyeliği yok');
  return `<section class="users-panel"><a class="back-link" href="${root}">← Kullanıcılara dön</a><h2>Hesap bilgileri</h2><p>${escape(activeUser.name)}</p><dl class="account-facts"><dt>Kullanıcı kimliği</dt><dd>${escape(activeUser.id)}</dd><dt>Uygulama kaydı</dt><dd>${account?.appAccount ? 'Mevcut' : 'Kontrol edilemedi'}</dd><dt>Giriş hesabı</dt><dd>${account?.authAccount ? 'Mevcut' : 'Bulunamadı'}</dd><dt>E-posta</dt><dd>${escape(account?.email || 'Kayıtlı e-posta yok')}</dd><dt>Kullanıcı adı</dt><dd>${escape(account?.username || 'Atanmamış')}</dd><dt>Yetki ve tesis</dt><dd>${escape(sites)}</dd><dt>Hesap durumu</dt><dd>${activeUser.disabled ? 'Bloke' : 'Aktif'}</dd><dt>Hesap oluşturulma</dt><dd>${escape(date(account?.createdAt))}</dd><dt>Son giriş</dt><dd>${escape(date(account?.lastSignInAt))}</dd><dt>E-posta doğrulama</dt><dd>${account?.email ? (account?.emailConfirmedAt ? 'Doğrulanmış' : 'Doğrulanmamış') : 'E-posta kullanılmıyor'}</dd><dt>Kimlik sağlayıcısı engeli</dt><dd>${account?.bannedUntil && new Date(account.bannedUntil) > new Date() ? escape(date(account.bannedUntil))+' tarihine kadar' : 'Yok'}</dd></dl><p>Şifreler görüntülenemez; işlem menüsünden yeni şifre belirleyebilirsiniz.</p></section>`;
 }
 if (activeUser && labels[state.action] && (state.action !== 'activate' || activeUser.disabled) && (state.action !== 'suspend' || !activeUser.disabled)) {
  const content = state.action === 'username' ? username(detail.overview?.usernames?.[activeUser.id]) : state.action === 'role' ? site+role : state.action === 'password' ? password : `<p>${state.action === 'remove' ? 'Bu kullanıcının firma erişimi kaldırılacak. Geçmiş kayıtları korunur.' : state.action === 'suspend' ? 'Bu kullanıcı giriş yapamaz.' : 'Bu kullanıcı tekrar giriş yapabilir.'}</p>`;
  return `<section class="users-panel"><a class="back-link" href="${root}">← Kullanıcılara dön</a><h2>${escape(labels[state.action])}</h2><p>${escape(activeUser.name)}</p>${form(state.action,content,escape(labels[state.action]),activeUser)}</section>`;
 }
 const rows = detail.users.map(user=>{
  const userRoles=(detail.overview?.roles?.[user.id] || []).map(r=>roles.find(x=>x[0]===r)?.[1] || r).join(', ') || 'Yetki yok';
  const actions=['info','username','role','password',user.disabled?'activate':'suspend','remove'];
  const info=detail.accounts?.[user.id];
  return `<tr><td><strong>${escape(user.name)}</strong></td><td>${escape(detail.overview?.usernames?.[user.id] || 'Atanmamış')}</td><td>${escape(info?.email || '—')}</td><td>${escape(userRoles)}</td><td><span class="user-status ${user.disabled?'blocked':'active'}">${user.disabled?'Bloke':'Aktif'}</span></td><td>${info?.authAccount ? 'Mevcut' : 'Bulunamadı'}</td><td class="user-actions"><details class="user-menu"><summary aria-label="${escape(user.name)} işlemleri" title="İşlemler">⋯</summary><div class="menu-items">${actions.map(action=>`<a href="${root}&user=${encodeURIComponent(user.id)}&action=${action}">${escape(labels[action])}</a>`).join('')}</div></details></td></tr>`;
 }).join('');
 return `<section class="users-panel"><div class="users-heading"><div><h2>Kullanıcılar <span class="user-count">${detail.users.length}</span></h2><p>Firma kullanıcılarını ve yetkilerini yönetin.</p></div><a class="add-user" href="${root}&mode=new">+ Yeni kullanıcı</a></div><div class="table-wrap"><table class="users-table"><thead><tr><th>Ad soyad</th><th>Kullanıcı adı</th><th>E-posta</th><th>Yetki</th><th>Durum</th><th>Giriş hesabı</th><th>İşlemler</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Henüz kullanıcı yok.</td></tr>'}</tbody></table></div></section>`;
}
module.exports = {render};
