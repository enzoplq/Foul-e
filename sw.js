// Foulée — service worker v2 : l'appli s'ouvre hors connexion (carte, itinéraires, IA et Strava demandent du réseau)
const CACHE = 'foulee-v2';
const SHELL = ['./', 'index.html', 'app.js', 'plan.js', 'xlsx.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE && x !== CACHE + '-tiles').map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  const shell = (u.origin === location.origin && !u.search) || u.hostname === 'cdnjs.cloudflare.com' || u.hostname.endsWith('gstatic.com') || u.hostname === 'fonts.googleapis.com';
  const tile = /basemaps\.cartocdn\.com|tile\.openstreetmap\.org|opentopomap\.org|arcgisonline\.com/.test(u.hostname);
  if (shell) { // réseau d'abord (mises à jour immédiates), cache en secours
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || caches.match('index.html'))));
  } else if (tile) { // tuiles déjà vues : disponibles hors ligne
    e.respondWith(caches.open(CACHE + '-tiles').then((c) => c.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }))));
  }
});
