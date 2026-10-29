/* An interface only: implementations must acquire an access token from an OIDC provider. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RitimAuthProvider=factory()})(globalThis,function(){
 'use strict';
 function create(provider){if(!provider||typeof provider.getAccessToken!=='function')throw new TypeError('OIDC token provider is required');return Object.freeze({async accessToken(){const token=await provider.getAccessToken();if(typeof token!=='string'||!token.trim())throw Error('No access token');return token}})}
 return {create};
});
