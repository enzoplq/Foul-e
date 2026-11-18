// Foulée — service worker : l'appli s'ouvre même hors connexion (la carte et les itinéraires demandent du réseau)
const CACHE='foulee-v1';
const SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png',
 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET')return;
 const shell=u.origin===location.origin||u.hostname==='cdnjs.cloudflare.com'||u.hostname.endsWith('gstatic.com')||u.hostname==='fonts.googleapis.com';
 const tile=/basemaps\.cartocdn\.com|tile\.openstreetmap\.org|opentopomap\.org|arcgisonline\.com/.test(u.hostname);
 if(shell){ // réseau d'abord, cache en secours
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})));
 }else if(tile){ // tuiles de carte : cache d'abord (déjà vues = dispo hors ligne)
  e.respondWith(caches.open(CACHE+'-tiles').then(c=>c.match(e.request).then(m=>m||fetch(e.request).then(r=>{if(r.ok||r.type==='opaque')c.put(e.request,r.clone());return r}))));
 }
});
