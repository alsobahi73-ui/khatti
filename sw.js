/* قشرة التطبيق فقط؛ لا تُخزن استجابات API أو مواقع GPS أو مستندات العملاء. */
const CACHE_NAME='khatti-shell-v3';
const ASSETS=['./','./index.html','./register.html','./support.html','./manifest.json','./assets/style.css','./assets/style-v2.css','./assets/style-legacy.css','./assets/data.js','./assets/core.js','./assets/demo.js','./assets/app.js','./assets/locations.js','./assets/icon.png','./passenger/search.html'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('khatti-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
 if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 const relative=url.pathname.slice(scope.pathname.length);
 if(relative.startsWith('v1/')||relative.startsWith('api/'))return;
 // شبكة أولًا لتجنب إبقاء نسخة قديمة بعد إصلاح أمني؛ fallback فقط لملف سبق تخزينه.
 if(!ASSETS.some(asset=>new URL(asset,self.registration.scope).pathname===url.pathname))return;
 event.respondWith(fetch(request).then(response=>{
   if(response.ok&&response.type==='basic'){const copy=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)))}
   return response;
 }).catch(()=>caches.match(request).then(cached=>cached||Response.error())));
});
