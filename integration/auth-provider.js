/* An interface only: implementations must acquire an access token from an OIDC provider. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RitimAuthProvider=factory()})(globalThis,function(){
 'use strict';
 function create(provider){if(!provider||typeof provider.getAccessToken!=='function')throw new TypeError('OIDC token provider is required');return Object.freeze({async accessToken(){const token=await provider.getAccessToken();if(typeof token!=='string'||!token.trim())throw Error('No access token');return token}})}
 function createBff({fetcher=globalThis.fetch,navigate=url=>{location.href=url}}={}){return Object.freeze({login(){navigate('/auth/login')},async logout(){const r=await fetcher('/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Oturum kapatılamadı');const x=await r.json();if(x.logoutUrl)navigate(x.logoutUrl)},async config(){const r=await fetcher('/auth/config',{cache:'no-store'});if(!r.ok)throw Error('Kimlik sağlayıcı yapılandırmasına ulaşılamıyor');return r.json()}})}
 return {create,createBff};
});
