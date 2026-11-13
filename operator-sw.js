'use strict';
// Build replaces both markers. Only public, versioned static files enter CacheStorage.
const VERSION='__BUILD_VERSION__',CACHE='ritim-operator-static-'+VERSION;
const STATIC=__PWA_ASSETS__;
const OFFLINE='/operator-offline.html';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll([OFFLINE,'/workspace-offline.html','/workspace.webmanifest','/operator.webmanifest','/assets/pwa/operator-192.png']))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('ritim-operator-static-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_OPERATOR_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // Auth, APIs, PDF data and all user-specific responses always go to the network.
 if(STATIC.includes(url.pathname)){
  event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(request);if(response.ok&&response.type==='basic'&&!response.redirected)await cache.put(url.pathname,response.clone());return response;}catch(error){const cached=await cache.match(url.pathname);if(cached)return cached;throw error;}})());return;
 }
 if(request.mode==='navigate'&&url.pathname==='/')event.respondWith(fetch(request).catch(()=>caches.match(url.searchParams.get('view')==='operator'?OFFLINE:'/workspace-offline.html')));
});
