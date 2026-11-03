/* Remove obsolete plaintext API drafts; never parse, replay, or transfer their bodies. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RitimLegacyRecovery=factory()})(globalThis,function(){
 'use strict';
 const JOURNAL='ritim:api-dev:pending-commands:v1',WORKFLOW='ritim:api-dev:order-workflow:v1';
 function isLegacy(key){return key===JOURNAL||key===WORKFLOW||key?.startsWith(WORKFLOW+':')}
 function cleanup(storages){let removed=0;try{for(const storage of storages){const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(isLegacy(key))keys.push(key)}for(const key of keys){storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('remove failed');removed++}for(let i=0;i<storage.length;i++)if(isLegacy(storage.key(i)))throw Error('legacy key remains')}return {removed}}catch{const e=Error('Eski güvensiz taslaklar temizlenemedi; API erişimi kapalı. Tarayıcı depolama iznini kontrol edin.');e.code='LEGACY_CLEANUP_FAILED';throw e}}
 function cleanupBrowser(){try{return cleanup([globalThis.sessionStorage,globalThis.localStorage])}catch(e){if(e.code)throw e;const x=Error('Tarayıcı depolamasına erişilemiyor; API erişimi kapalı.');x.code='LEGACY_CLEANUP_FAILED';throw x}}
 return {cleanup,cleanupBrowser};
});
