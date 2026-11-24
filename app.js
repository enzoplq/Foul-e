/* Foulée v2 — app.js : carte, tracés, prépa, IA, Strava */
'use strict';
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const toast = (m, t = 3000) => { const e = $('#toast'); e.textContent = m; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), t); };
const R = 6371008.8, rad = (x) => x * Math.PI / 180, deg = (x) => x * 180 / Math.PI;
function hav(a, b) { const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }
function lenOf(c) { let d = 0; for (let i = 1; i < c.length; i++) d += hav(c[i - 1], c[i]); return d; }
function dest(p, d, brg) { const δ = d / R, θ = rad(brg), φ1 = rad(p[0]), λ1 = rad(p[1]); const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)); const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)); return [deg(φ2), ((deg(λ2) + 540) % 360) - 180]; }
function bearing(a, b) { const φ1 = rad(a[0]), φ2 = rad(b[0]), Δ = rad(b[1] - a[1]); return (deg(Math.atan2(Math.sin(Δ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δ))) + 360) % 360; }
const fmtT = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const km = (d, n = 2) => (d / 1000).toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n });
const nf = (x, n = 1) => (+x).toLocaleString('fr-FR', { maximumFractionDigits: n });
const parsePace = (v) => { const m = String(v).trim().match(/^(\d+)(?:[:'.,h](\d{1,2}))?/); return m ? (+m[1]) * 60 + (+(m[2] || 0)) : 330; };
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const busy = (on) => { busy.n = Math.max(0, (busy.n || 0) + (on ? 1 : -1)); $('#busy').classList.toggle('on', busy.n > 0); };
const isMobile = () => innerWidth <= 760;
const touch = () => matchMedia('(pointer:coarse)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const Store = {
  get(k, d) { try { const v = localStorage.getItem('foulee.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('foulee.' + k, JSON.stringify(v)); return true; } catch (e) { toast('Stockage plein ou indisponible'); return false; } },
  del(k) { try { localStorage.removeItem('foulee.' + k); } catch (e) { } }
};
const { D } = Coach;

/* ================= Carte ================= */
const map = L.map('map', { zoomControl: false, worldCopyJump: true }).setView([48.8566, 2.3522], 13);
L.control.zoom({ position: 'topright' }).addTo(map);
const bases = {
  '🌙 Sombre': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, attribution: '© OpenStreetMap © CARTO' }),
  '🗺️ Plan OSM': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }),
  '☀️ Clair': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, attribution: '© OpenStreetMap © CARTO' }),
  '⛰️ Relief': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap © OpenTopoMap (CC-BY-SA)' }),
  '🛰️ Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri, Maxar' })
};
bases['🌙 Sombre'].addTo(map);
L.control.layers(bases, null, { position: 'topright' }).addTo(map);
const glow = L.polyline([], { color: '#c6ff3d', weight: 16, opacity: 0.18, interactive: false }).addTo(map);
const line = L.polyline([], { color: '#c6ff3d', weight: 4.5, opacity: 1, interactive: false, lineJoin: 'round' }).addTo(map);
const gradeLayer = L.layerGroup().addTo(map), kmLayer = L.layerGroup().addTo(map), wpLayer = L.layerGroup().addTo(map), poiLayer = L.layerGroup().addTo(map);
const liveLine = L.polyline([], { color: '#3de0ff', weight: 5, opacity: 0.95 }).addTo(map);
const hoverM = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 3, fillColor: '#3de0ff', fillOpacity: 1 });
const meIcon = L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

let wps = [], segs = [], snap = true, imported = false;
let geom = [], cum = [0], total = 0, elev = null, gain = 0, loss = 0;
let home = null, homeM = null, lastWeatherAt = null, chart = null;
let queue = Promise.resolve();
const enqueue = (f) => (queue = queue.then(f).catch((e) => { console.error(e); busy.n = 0; $('#busy').classList.remove('on'); }));

/* ================= Routage (OSRM piéton) ================= */
const OSRM = 'https://routing.openstreetmap.de/routed-foot';
async function osrm(a, b) {
  const r = await fetch(`${OSRM}/route/v1/foot/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`);
  if (!r.ok) throw new Error('route');
  const j = await r.json(); if (!j.routes || !j.routes.length) throw new Error('none');
  return j.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
}
// Accroche un point au chemin piéton le plus proche (évite les raccords en ligne droite comptés en trop)
async function snapPoint(p) {
  try {
    const r = await fetch(`${OSRM}/nearest/v1/foot/${p[1]},${p[0]}?number=1`); const j = await r.json();
    const w = j.waypoints && j.waypoints[0]; if (!w) return p;
    if (w.distance > 250) return p;
    return [w.location[1], w.location[0]];
  } catch (e) { return p; }
}
async function leg(a, b, useSnap = snap) {
  if (!useSnap) return [a, b];
  try {
    const g = await osrm(a, b);
    if (g.length < 2) return [a, b];
    return g;
  } catch (e) { toast('Itinéraire introuvable ici — ligne droite utilisée'); return [a, b]; }
}
// Supprime les culs-de-sac (aller-retour sur la même rue) aux points de passage d'une boucle générée
function trimSpurs(list) {
  for (let i = 1; i < list.length; i++) {
    const A = list[i - 1], B = list[i];
    while (A.length > 2 && B.length > 2 && hav(A[A.length - 2], B[1]) < 12) { A.pop(); B.shift(); }
    B[0] = A[A.length - 1];
  }
  return list;
}

/* ================= Géométrie ================= */
function pointAt(d) {
  if (!geom.length) return null; if (d <= 0) return geom[0];
  for (let i = 1; i < cum.length; i++) if (cum[i] >= d) { const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [geom[i - 1][0] + (geom[i][0] - geom[i - 1][0]) * t, geom[i - 1][1] + (geom[i][1] - geom[i - 1][1]) * t]; }
  return geom[geom.length - 1];
}
function sliceGeom(d0, d1) { const o = [pointAt(d0)]; for (let i = 0; i < cum.length; i++) if (cum[i] > d0 && cum[i] < d1) o.push(geom[i]); o.push(pointAt(d1)); return o; }

/* ================= Rendu ================= */
function render() {
  wpLayer.clearLayers();
  wps.forEach((p, i) => {
    const s = i === 0, e = i === wps.length - 1 && i > 0, sz = s ? [30, 30] : e ? [28, 28] : [14, 14];
    const html = s ? '<div class="pin start">GO</div>' : e ? '<div class="pin end"></div>' : '<div class="pin mid"></div>';
    const m = L.marker(p, { draggable: true, icon: L.divIcon({ className: '', html, iconSize: sz, iconAnchor: [sz[0] / 2, sz[1] / 2] }), zIndexOffset: s ? 1000 : e ? 900 : 0 }).addTo(wpLayer);
    m.on('dragend', (ev) => moveWp(i, ev.target.getLatLng()));
  });
  geom = []; segs.forEach((s) => { if (s) geom.length ? geom.push(...s.slice(1)) : geom.push(...s); });
  cum = [0]; for (let i = 1; i < geom.length; i++) cum.push(cum[i - 1] + hav(geom[i - 1], geom[i]));
  total = geom.length > 1 ? cum[cum.length - 1] : 0;
  line.setLatLngs(geom); glow.setLatLngs(geom);
  kmLayer.clearLayers();
  for (let k = 1; k * 1000 < total; k++) L.marker(pointAt(k * 1000), { interactive: false, icon: L.divIcon({ className: '', html: `<div class="km">${k}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(kmLayer);
  if (total > 300) {
    const step = Math.max(400, total / 24);
    for (let d = step / 2; d < total; d += step) {
      if (Math.abs(d / 1000 - Math.round(d / 1000)) < 0.12) continue;
      const a = pointAt(d - 8), b = pointAt(d + 8);
      L.marker(pointAt(d), { interactive: false, icon: L.divIcon({ className: '', html: `<div class="arrow" style="transform:rotate(${bearing(a, b) - 90}deg)">➤</div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(kmLayer);
    }
  }
  elev = null; gain = 0; loss = 0; gradeLayer.clearLayers(); line.setStyle({ opacity: 1 });
  updateStats(); scheduleElev(); saveHash(); maybeWeather();
}
function moveWp(i, ll) {
  enqueue(async () => {
    busy(1); let p = [ll.lat, ll.lng]; if (snap) p = await snapPoint(p);
    wps[i] = p; imported = false; const jobs = [];
    if (i > 0) jobs.push(leg(wps[i - 1], wps[i]).then((s) => (segs[i - 1] = s)));
    if (i < wps.length - 1) jobs.push(leg(wps[i], wps[i + 1]).then((s) => (segs[i] = s)));
    await Promise.all(jobs); busy(0); render();
  });
}
function addPoint(p, already) {
  enqueue(async () => {
    if (snap && !already) { busy(1); p = await snapPoint(p); busy(0); }
    wps.push(p); render();
    if (wps.length > 1) { busy(1); segs.push(await leg(wps[wps.length - 2], p)); busy(0); render(); }
  });
}
function fit() {
  if (geom.length < 2) return;
  const o = isMobile() ? { paddingTopLeft: [30, 70], paddingBottomRight: [30, $('#panel').offsetHeight + 20] } : { paddingTopLeft: [450, 40], paddingBottomRight: [70, 40] };
  map.fitBounds(L.latLngBounds(geom), o);
}

/* ================= Stats ================= */
function updateStats() {
  const pace = parsePace($('#pace').value), w = +$('#weight').value || 70, dk = total / 1000;
  const t = dk * pace + (elev ? gain * 0.6 : 0), kcal = Math.round(w * dk * 1.036);
  $('#sDist').textContent = km(total); $('#sGain').textContent = elev ? Math.round(gain) : '–';
  $('#sTime').textContent = fmtT(t); $('#sKcal').textContent = kcal;
  const speed = pace ? 3600 / pace : 0;
  $('#kv').innerHTML = total ? `
  <div><b>${fmtT(t)}</b><span>Durée estimée${elev ? ' (relief inclus)' : ''}</span></div>
  <div><b>${nf(speed)} km/h</b><span>Vitesse moyenne</span></div>
  <div><b>${elev ? '+' + Math.round(gain) + ' / −' + Math.round(loss) + ' m' : '…'}</b><span>Dénivelé +/−</span></div>
  <div><b>${elev ? Math.round(Math.min(...elev.e)) + ' → ' + Math.round(Math.max(...elev.e)) + ' m' : '…'}</b><span>Altitude min → max</span></div>
  <div><b>${kcal} kcal</b><span>Dépense estimée</span></div>
  <div><b>${Math.round(total / 0.78 / 2).toLocaleString('fr-FR')}</b><span>Foulées estimées</span></div>` : '';
  let rows = '<tr><th>Km</th><th>D+</th><th>Temps km</th><th>Cumul</th></tr>', acc = 0;
  for (let k = 0; k * 1000 < total && k < 120; k++) {
    const d0 = k * 1000, d1 = Math.min(total, (k + 1) * 1000), len = (d1 - d0) / 1000; let g = 0;
    if (elev) for (let i = 1; i < elev.d.length; i++) if (elev.d[i] > d0 && elev.d[i] <= d1) { const x = elev.e[i] - elev.e[i - 1]; if (x > 0) g += x; }
    const tk = len * pace + g * 0.6; acc += tk;
    rows += `<tr><td>${len < 0.999 ? km(d1, 2) : k + 1}</td><td>${elev ? '+' + Math.round(g) + ' m' : '–'}</td><td>${fmtT(tk)}</td><td>${fmtT(acc)}</td></tr>`;
  }
  $('#splits').innerHTML = total ? rows : '';
}
$('#pace').addEventListener('input', updateStats); $('#weight').addEventListener('input', updateStats);

/* ================= Altitude ================= */
let elevT, elevKey = 0;
function scheduleElev() { clearTimeout(elevT); drawChart(); if (total < 60) return; elevT = setTimeout(fetchElev, 700); }
async function fetchElev() {
  const key = ++elevKey, n = Math.min(100, Math.max(12, Math.round(total / 40))), ds = [], pts = [];
  for (let i = 0; i < n; i++) { const d = total * i / (n - 1); ds.push(d); pts.push(pointAt(d)); }
  try {
    busy(1);
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map((p) => p[0].toFixed(5)).join(',')}&longitude=${pts.map((p) => p[1].toFixed(5)).join(',')}`);
    const j = await r.json(); if (key !== elevKey || !j.elevation) return;
    elev = { d: ds, e: j.elevation, pts }; gain = 0; loss = 0;
    for (let i = 1; i < elev.e.length; i++) { const x = elev.e[i] - elev.e[i - 1]; x > 0 ? (gain += x) : (loss -= x); }
    updateStats(); drawChart(); renderGrade();
  } catch (e) { toast('Profil altimétrique indisponible pour le moment'); } finally { busy(0); }
}
function drawChart() {
  $('#elevEmpty').style.display = elev ? 'none' : 'grid';
  if (chart) { chart.destroy(); chart = null; }
  if (!elev || !window.Chart || !$('#tab-stats').classList.contains('on')) return;
  const ctx = $('#elev').getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 170);
  g.addColorStop(0, 'rgba(198,255,61,.45)'); g.addColorStop(1, 'rgba(61,224,255,0)');
  chart = new Chart(ctx, {
    type: 'line', data: { labels: elev.d.map((d) => km(d, 1)), datasets: [{ data: elev.e, borderColor: '#c6ff3d', backgroundColor: g, fill: true, pointRadius: 0, tension: 0.35, borderWidth: 2.2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#111827', displayColors: false, callbacks: { title: (i) => i[0].label + ' km', label: (i) => Math.round(i.raw) + ' m' } } },
      scales: { x: { ticks: { color: '#8a93a6', maxTicksLimit: 6, font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: '#8a93a6', font: { size: 10 }, callback: (v) => v + ' m' }, grid: { color: 'rgba(255,255,255,.06)' } } },
      onHover: (e, els) => { if (els.length && elev) hoverM.setLatLng(elev.pts[els[0].index]).addTo(map); }
    }
  });
}
$('#elev').addEventListener('mouseleave', () => hoverM.remove());
function renderGrade() {
  gradeLayer.clearLayers(); const on = $('#grade').checked && elev;
  $('#legend').hidden = !$('#grade').checked; line.setStyle({ opacity: on ? 0 : 1 });
  if (!on) return;
  for (let i = 0; i < elev.d.length - 1; i++) {
    const g = (elev.e[i + 1] - elev.e[i]) / ((elev.d[i + 1] - elev.d[i]) || 1) * 100;
    const c = g > 8 ? '#ff3b5c' : g > 4 ? '#ff8a3d' : g > 1.5 ? '#ffd23d' : g < -4 ? '#3d8bff' : g < -1.5 ? '#3de0ff' : '#c6ff3d';
    L.polyline(sliceGeom(elev.d[i], elev.d[i + 1]), { color: c, weight: 5.5, interactive: false, lineCap: 'round' }).addTo(gradeLayer);
  }
}
$('#grade').addEventListener('change', renderGrade);

/* ================= Météo ================= */
const WMO = (c) => c === 0 ? ['☀️', 'Ciel dégagé'] : c <= 2 ? ['🌤️', 'Peu nuageux'] : c === 3 ? ['☁️', 'Couvert'] : c <= 48 ? ['🌫️', 'Brouillard'] : c <= 57 ? ['🌦️', 'Bruine'] : c <= 67 ? ['🌧️', 'Pluie'] : c <= 77 ? ['🌨️', 'Neige'] : c <= 82 ? ['🌦️', 'Averses'] : c <= 86 ? ['🌨️', 'Averses de neige'] : ['⛈️', 'Orage'];
function maybeWeather() { const p = wps[0] || home; if (p && (!lastWeatherAt || hav(lastWeatherAt, p) > 3000)) fetchWeather(p); }
async function fetchWeather(p) {
  lastWeatherAt = p;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p[0].toFixed(3)}&longitude=${p[1].toFixed(3)}&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code,relative_humidity_2m&daily=sunrise,sunset&timezone=auto&forecast_days=1`);
    const j = await r.json(), c = j.current, [ico, txt] = WMO(c.weather_code), t = c.temperature_2m;
    const hm = (s) => (s ? s.slice(11, 16) : '–');
    let tip = t < 0 ? '🧤 Gel : couvre les extrémités et attention au verglas.' : t < 8 ? '🧥 Frais : superpose les couches, gants conseillés.' : t <= 16 ? '👌 Conditions idéales pour courir !' : t <= 24 ? '💧 Agréable — pense à t’hydrater.' : '🔥 Chaud : cours tôt ou tard, hydrate-toi bien.';
    if (c.wind_speed_10m > 30) tip += ' 💨 Vent fort, pars face au vent.';
    if (c.weather_code >= 95) tip = '⚠️ Orage : évite les zones dégagées et reporte si possible.';
    $('#weather').innerHTML = `<div class="ico">${ico}</div><div class="t">${Math.round(t)}°C <span class="meta">ressenti ${Math.round(c.apparent_temperature)}°</span></div><div class="meta">${txt} · 💨 ${Math.round(c.wind_speed_10m)} km/h · 💧 ${c.relative_humidity_2m}%<br>🌅 ${hm(j.daily.sunrise[0])} · 🌇 ${hm(j.daily.sunset[0])}</div><div class="tip">${tip}</div>`;
  } catch (e) { }
}

/* ================= Recherche ================= */
let st;
$('#q').addEventListener('input', (e) => { clearTimeout(st); const v = e.target.value.trim(); if (v.length < 3) { $('#results').innerHTML = ''; return; } st = setTimeout(() => search(v), 350); });
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = $('#results div'); f && f.click(); } });
async function search(v) {
  const c = map.getCenter(); let list = [];
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(v)}&limit=6&lat=${c.lat.toFixed(3)}&lon=${c.lng.toFixed(3)}`); const j = await r.json();
    list = j.features.map((f) => { const p = f.properties; return { name: p.name || p.street || v, sub: [p.city && p.city !== p.name ? p.city : null, p.state, p.country].filter(Boolean).join(', '), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], ext: p.extent }; });
  } catch (e) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=fr&q=${encodeURIComponent(v)}`); const j = await r.json();
      list = j.map((x) => ({ name: x.display_name.split(',')[0], sub: x.display_name.split(',').slice(1, 4).join(','), lat: +x.lat, lng: +x.lon }));
    } catch (e2) { toast('Recherche indisponible'); }
  }
  const box = $('#results'); box.innerHTML = '';
  list.forEach((x) => {
    const d = document.createElement('div'); d.innerHTML = `${esc(x.name)}<small>${esc(x.sub)}</small>`;
    d.onclick = () => { box.innerHTML = ''; $('#q').value = x.name; $('#q').blur(); if (x.ext) map.fitBounds([[x.ext[3], x.ext[0]], [x.ext[1], x.ext[2]]], { maxZoom: 16 }); else map.flyTo([x.lat, x.lng], 15); fetchWeather([x.lat, x.lng]); };
    box.appendChild(d);
  });
}
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) $('#results').innerHTML = ''; });

/* ================= Géolocalisation ================= */
function locate(silent) {
  if (!navigator.geolocation) { silent || toast('Géolocalisation non disponible'); return; }
  navigator.geolocation.getCurrentPosition((p) => {
    home = [p.coords.latitude, p.coords.longitude];
    homeM ? homeM.setLatLng(home) : (homeM = L.marker(home, { icon: meIcon, interactive: false }).addTo(map));
    if (!silent || !wps.length) map.flyTo(home, 15, { duration: 1.2 });
    if (!wps.length) fetchWeather(home);
  }, () => { silent || toast('Position indisponible — autorise la localisation'); }, { enableHighAccuracy: true, timeout: 10000 });
}
$('#locate').onclick = () => locate(false);

/* ================= Outils de tracé ================= */
map.on('click', (e) => { if (!e.originalEvent.target.closest('.leaflet-marker-icon')) addPoint([e.latlng.lat, e.latlng.lng]); });
function setMode(s) { snap = s; $('#mRoute').classList.toggle('on', s); $('#mFree').classList.toggle('on', !s); }
$('#mRoute').onclick = () => { setMode(true); toast('Le tracé suit les chemins et trottoirs'); };
$('#mFree').onclick = () => { setMode(false); toast('Ligne libre : idéal pour pistes, plages, stades'); };
$('#bUndo').onclick = () => enqueue(() => { if (!wps.length) return; wps.pop(); if (segs.length && segs.length > wps.length - 1) segs.pop(); render(); });
$('#bReverse').onclick = () => enqueue(() => { wps.reverse(); segs = segs.reverse().map((s) => s.slice().reverse()); render(); toast('Sens inversé'); });
$('#bBack').onclick = () => enqueue(() => { if (wps.length < 2) return toast('Pose au moins 2 points'); const n = segs.length; for (let i = n - 1; i >= 0; i--) { wps.push(wps[i]); segs.push(segs[i].slice().reverse()); } render(); toast('Aller-retour : ' + km(total) + ' km'); });
$('#bClose').onclick = () => { if (wps.length < 2) return toast('Pose au moins 2 points'); addPoint(wps[0].slice(), true); };
$('#bClear').onclick = () => enqueue(() => { wps = []; segs = []; imported = false; poiLayer.clearLayers(); render(); });

/* ================= Fontaines & WC ================= */
$('#bWater').onclick = async () => {
  if (total < 50) return toast('Trace d’abord un parcours');
  const b = L.latLngBounds(geom).pad(0.05), bb = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  const q = `[out:json][timeout:25];(node["amenity"="drinking_water"](${bb});node["amenity"="toilets"](${bb});node["amenity"="fountain"]["drinking_water"="yes"](${bb}););out;`;
  toast('Recherche des fontaines et toilettes…'); busy(1);
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q)); const j = await r.json();
    poiLayer.clearLayers(); let n = 0;
    j.elements.forEach((e) => {
      const p = [e.lat, e.lon]; let best = 1e9; for (let i = 0; i < geom.length; i++) { const d = hav(p, geom[i]); if (d < best) best = d; if (best < 150) break; }
      if (best > 200) return; n++; const wc = e.tags.amenity === 'toilets';
      L.marker(p, { icon: L.divIcon({ className: '', html: `<div class="poi">${wc ? '🚻' : '💧'}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] }) }).bindPopup(`<b>${wc ? 'Toilettes' : 'Point d’eau potable'}</b>${e.tags.name ? '<br>' + esc(e.tags.name) : ''}${e.tags.fee === 'yes' ? '<br>Payant' : ''}`).addTo(poiLayer);
    });
    toast(n ? `${n} point${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''} à moins de 200 m du parcours` : 'Aucun point d’eau ou WC référencé à proximité');
  } catch (e) { toast('Service Overpass momentanément indisponible'); } finally { busy(0); }
};

/* ================= Générateur de boucles (précis à ±3 %) ================= */
let loopDir = 'rand';
const setLoop = (v) => { $('#loopKm').value = v; $('#loopVal').textContent = (+v).toLocaleString('fr-FR') + ' km'; $$('#presets button').forEach((b) => b.classList.toggle('on', +b.dataset.km === +v)); };
$('#loopKm').oninput = (e) => setLoop(e.target.value);
$$('#presets button').forEach((b) => (b.onclick = () => setLoop(b.dataset.km)));
$$('#dirs button').forEach((b) => (b.onclick = () => { loopDir = b.dataset.dir; $$('#dirs button').forEach((x) => x.classList.toggle('on', x === b)); }));
function generateLoop(targetKm) {
  return enqueue(async () => {
    const target = targetKm * 1000;
    const c = map.getCenter();
    let start = wps[0] ? wps[0].slice() : home ? home.slice() : [c.lat, c.lng];
    $('#bGen').textContent = '⏳ Calcul de la boucle…'; $('#bGen').disabled = true; busy(1);
    try {
      start = await snapPoint(start);
      const nPts = target > 15000 ? 4 : 3;
      const brg = loopDir === 'rand' ? Math.random() * 360 : +loopDir + (Math.random() * 40 - 20);
      const jit = Array.from({ length: nPts }, () => Math.random() * 24 - 12), sq = 0.85 + Math.random() * 0.3;
      let r = target / (2 * Math.PI) * 0.75, best = null;
      for (let it = 0; it < 7; it++) {
        const ctr = dest(start, r, brg), back = (brg + 180) % 360;
        const pts = Array.from({ length: nPts }, (_, k) => dest(ctr, r * (k === Math.floor(nPts / 2) ? sq : 1), back + (k + 1) * 360 / (nPts + 1) + jit[k]));
        const seq = [start, ...pts, start];
        const s = await Promise.all(seq.slice(1).map((p, i) => leg(seq[i], p, true)));
        trimSpurs(s);
        for (let k = 1; k < seq.length - 1; k++) seq[k] = s[k - 1][s[k - 1].length - 1];
        const d = s.reduce((a, x) => a + lenOf(x), 0);
        // On préfère une boucle un peu plus longue que trop courte : score pénalisant le manque de distance
        const score = (x) => { const e = (x - target) / target; return e < 0 ? -e * 2.5 : e; };
        if (!best || score(d) < score(best.d)) best = { seq, s, d };
        const e = (d - target) / target; if (e >= -0.01 && e <= 0.03) break;
        r *= Math.pow((target * 1.01) / d, 0.9);
      }
      wps = best.seq; segs = best.s; imported = false; setMode(true); render(); fit();
      const err = (total - target) / target * 100;
      toast(`Boucle de ${km(total)} km (objectif ${nf(targetKm)} km${Math.abs(err) > 3 ? `, écart ${err > 0 ? '+' : ''}${nf(err, 0)} %` : ''}) 🎉`, 4000);
    } catch (e) { toast('Impossible de générer une boucle ici'); }
    finally { busy(0); $('#bGen').disabled = false; $('#bGen').textContent = '✨ Générer une autre boucle'; }
  });
}
$('#bGen').onclick = () => generateLoop(+$('#loopKm').value);

/* ================= Mode course (GPS) ================= */
let live = null, wake = null, meM = null;
function speak(t) { try { const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; u.rate = 1.02; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { } }
const spoken = (s) => { s = Math.round(s); const m = Math.floor(s / 60), x = s % 60; return `${m} minute${m > 1 ? 's' : ''}${x ? ' ' + x : ''}`; };
$('#bLive').onclick = () => (live ? stopLive() : startLive());
function startLive() {
  if (!navigator.geolocation) return toast('GPS non disponible sur cet appareil');
  live = { pts: [], dist: 0, t0: Date.now(), lastKm: 0, lastSplit: Date.now(), off: false, lastAcc: 0 };
  liveLine.setLatLngs([]);
  live.watch = navigator.geolocation.watchPosition(onPos, (e) => toast('GPS : ' + e.message), { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  live.tick = setInterval(tick, 1000);
  $('#bLive').textContent = '■ Arrêter la course'; $('#bLive').classList.add('stop');
  try { navigator.wakeLock && navigator.wakeLock.request('screen').then((w) => (wake = w)).catch(() => { }); } catch (e) { }
  if ($('#voice').checked) speak('Course démarrée. Bonne course !');
}
function onPos(p) {
  if (!live) return;
  const acc = p.coords.accuracy, now = p.timestamp || Date.now();
  const last = live.pts[live.pts.length - 1];
  if (acc > 35 && !(acc <= 60 && (!last || now - last[2] > 20000))) return;
  const ll = [p.coords.latitude, p.coords.longitude, now, p.coords.altitude != null ? Math.round(p.coords.altitude * 10) / 10 : null];
  meM ? meM.setLatLng(ll.slice(0, 2)) : (meM = L.marker(ll.slice(0, 2), { icon: meIcon, interactive: false, zIndexOffset: 2000 }).addTo(map));
  if (last) {
    const d = hav(last, ll), dt = (now - last[2]) / 1000;
    if (d < Math.max(3, acc * 0.3)) return;
    if (dt > 0 && d / dt > 8.5) return; // saut GPS (> 30 km/h)
    live.dist += d;
  }
  live.pts.push(ll); liveLine.setLatLngs(live.pts.map((x) => [x[0], x[1]])); map.panTo(ll.slice(0, 2));
  const k = Math.floor(live.dist / 1000);
  if (k > live.lastKm) {
    const sp = (now - live.lastSplit) / 1000; live.lastSplit = now; live.lastKm = k;
    if ($('#voice').checked) speak(`Kilomètre ${k}. Dernier kilomètre en ${spoken(sp)}. Allure moyenne : ${spoken((now - live.t0) / 1000 / (live.dist / 1000))} au kilomètre.`);
  }
  if (geom.length > 1) {
    let best = 1e9, bi = 0; for (let i = 0; i < geom.length; i++) { const d = hav(ll, geom[i]); if (d < best) { best = d; bi = i; } }
    $('#lRem').textContent = km(total - cum[bi]);
    const off = best > 50; $('#lWarn').textContent = off ? `⚠️ Hors parcours (${Math.round(best)} m)` : '';
    if (off && !live.off && $('#voice').checked) speak('Attention, tu t’écartes du parcours.'); live.off = off;
    if (bi >= geom.length - 2 && live.dist > total * 0.8 && !live.done) { live.done = true; $('#voice').checked && speak('Arrivée ! Bravo, parcours terminé.'); }
  }
}
function tick() {
  const s = (Date.now() - live.t0) / 1000, h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60);
  $('#lTime').textContent = [h, m, x].map((v) => String(v).padStart(2, '0')).join(':');
  $('#lDist').textContent = km(live.dist); $('#lPace').textContent = live.dist > 50 ? fmtT(s / (live.dist / 1000)) : '–';
}
function stopLive() {
  navigator.geolocation.clearWatch(live.watch); clearInterval(live.tick);
  try { wake && wake.release(); } catch (e) { }
  const s = (Date.now() - live.t0) / 1000;
  if ($('#voice').checked) speak(`Course terminée. ${km(live.dist)} kilomètres en ${spoken(s)}.`);
  if (live.pts.length >= 2) {
    const run = { id: Date.now(), date: D.today(), start: live.t0, dur: Math.round(s), dist: Math.round(live.dist), name: `Course du ${new Date().toLocaleDateString('fr-FR')}`, pts: live.pts.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6), p[2], p[3]]) };
    const runs = Store.get('runs', []); runs.unshift(run); Store.set('runs', runs.slice(0, 30));
    const marked = markPlanDone(run.date, run.dist / 1000, run.dur / 60, 'gps');
    toast(`Course enregistrée : ${km(live.dist)} km en ${fmtT(s)} 💪${marked ? ' · séance cochée dans ta prépa' : ''}`, 4500);
  } else toast('Course arrêtée (pas assez de points GPS)');
  live = null; $('#bLive').textContent = '▶ Démarrer la course'; $('#bLive').classList.remove('stop');
  renderRuns();
}
function renderRuns() {
  const runs = Store.get('runs', []), box = $('#runs');
  box.innerHTML = runs.length ? '' : '<p class="hint">Aucune course enregistrée.</p>';
  runs.forEach((r) => {
    const d = document.createElement('div'); d.className = 'route';
    d.innerHTML = `${thumb(r.pts)}<div class="info"><b>${esc(r.name)}</b><small>${km(r.dist)} km · ${fmtT(r.dur)} · ${r.dist > 50 ? fmtT(r.dur / (r.dist / 1000)) + '/km' : ''}</small></div><button data-a="gpx">GPX</button><button data-a="strava" style="background:var(--strava);color:#fff">Strava</button><button data-a="del" class="danger">✕</button>`;
    d.querySelector('[data-a=gpx]').onclick = () => saveFile(new Blob([runGPX(r)], { type: 'application/gpx+xml' }), `course-${r.date}.gpx`);
    d.querySelector('[data-a=strava]').onclick = () => Strava.sendRun(r);
    d.querySelector('[data-a=del]').onclick = () => { Store.set('runs', Store.get('runs', []).filter((x) => x.id !== r.id)); renderRuns(); };
    box.appendChild(d);
  });
}

/* ================= Fichiers ================= */
async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (touch() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const xesc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
function eleAt(d) { if (!elev) return null; for (let i = 1; i < elev.d.length; i++) if (elev.d[i] >= d) { const t = (d - elev.d[i - 1]) / ((elev.d[i] - elev.d[i - 1]) || 1); return elev.e[i - 1] + (elev.e[i] - elev.e[i - 1]) * t; } return elev.e[elev.e.length - 1]; }
function routeGPX(name) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Foulée" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${xesc(name)}</name></metadata>\n<trk><name>${xesc(name)}</name><type>running</type><trkseg>\n` +
    geom.map((p, i) => { const e = eleAt(cum[i]); return `<trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}">${e != null ? `<ele>${e.toFixed(1)}</ele>` : ''}</trkpt>`; }).join('\n') + '\n</trkseg></trk>\n</gpx>';
}
function runGPX(r) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Foulée" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${xesc(r.name)}</name><time>${new Date(r.start).toISOString()}</time></metadata>\n<trk><name>${xesc(r.name)}</name><type>running</type><trkseg>\n` +
    r.pts.map((p) => `<trkpt lat="${(+p[0]).toFixed(6)}" lon="${(+p[1]).toFixed(6)}">${p[3] != null ? `<ele>${p[3]}</ele>` : ''}<time>${new Date(p[2]).toISOString()}</time></trkpt>`).join('\n') + '\n</trkseg></trk>\n</gpx>';
}
const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60);
$$('[data-exp]').forEach((b) => (b.onclick = () => {
  if (geom.length < 2) return toast('Rien à exporter pour l’instant');
  const name = $('#rName').value.trim() || `Parcours ${km(total, 1)} km`, f = b.dataset.exp;
  if (f === 'gpx') saveFile(new Blob([routeGPX(name)], { type: 'application/gpx+xml' }), slug(name) + '.gpx');
  if (f === 'kml') saveFile(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xesc(name)}</name><Placemark><name>${xesc(name)}</name><LineString><tessellate>1</tessellate><coordinates>${geom.map((p) => p[1].toFixed(6) + ',' + p[0].toFixed(6) + ',0').join(' ')}</coordinates></LineString></Placemark></Document></kml>`], { type: 'application/vnd.google-earth.kml+xml' }), slug(name) + '.kml');
  if (f === 'geojson') saveFile(new Blob([JSON.stringify({ type: 'Feature', properties: { name, distance_m: Math.round(total), gain_m: Math.round(gain) }, geometry: { type: 'LineString', coordinates: geom.map((p) => [+p[1].toFixed(6), +p[0].toFixed(6)]) } })], { type: 'application/geo+json' }), slug(name) + '.geojson');
}));
$('#bToStrava').onclick = () => {
  if (geom.length < 2) return toast('Trace d’abord un parcours');
  const name = $('#rName').value.trim() || `Foulée ${km(total, 1)} km`;
  openModal('Envoyer vers Strava', `<div class="note">Strava ne permet pas aux applis tierces de créer un itinéraire directement : on passe par un fichier GPX, que Strava transforme en itinéraire (gratuit).</div>
   <div class="step">1 · Télécharge le fichier</div><button class="btn w" id="sgGpx">⬇︎ ${esc(slug(name))}.gpx (${km(total)} km)</button>
   <div class="step">2 · Importe-le dans Strava</div><p class="hint" style="margin-top:4px">Sur le site strava.com (dans Safari, version ordinateur si besoin) : <b>Tableau de bord → Mes itinéraires → Créer un itinéraire</b>, puis le bouton d'import (flèche vers le haut) et choisis le fichier. Enregistre : l'itinéraire apparaît dans l'appli Strava et se synchronise avec ta montre.</p>
   <a class="btn w" style="display:block;text-decoration:none" href="https://www.strava.com/athlete/routes" target="_blank" rel="noopener">Ouvrir Mes itinéraires sur Strava ↗</a>`, '');
  $('#sgGpx').onclick = () => saveFile(new Blob([routeGPX(name)], { type: 'application/gpx+xml' }), slug(name) + '.gpx');
};
function parseTrack(name, txt) {
  const c = []; let times = [];
  if (/\.(geo)?json$/i.test(name)) {
    const walk = (g) => { if (!g) return; if (g.type === 'FeatureCollection') g.features.forEach((x) => walk(x.geometry)); else if (g.type === 'Feature') walk(g.geometry); else if (g.type === 'LineString') c.push(...g.coordinates.map((x) => [x[1], x[0]])); else if (g.type === 'MultiLineString') g.coordinates.forEach((l) => c.push(...l.map((x) => [x[1], x[0]]))); };
    walk(JSON.parse(txt));
  } else {
    const x = new DOMParser().parseFromString(txt, 'application/xml'), pts = x.querySelectorAll('trkpt,rtept');
    if (pts.length) pts.forEach((p) => { c.push([+p.getAttribute('lat'), +p.getAttribute('lon')]); const t = p.querySelector('time'); if (t) times.push(Date.parse(t.textContent)); });
    else x.querySelectorAll('coordinates').forEach((n) => n.textContent.trim().split(/\s+/).forEach((t) => { const [lo, la] = t.split(',').map(Number); if (!isNaN(la) && !isNaN(lo)) c.push([la, lo]); }));
  }
  return { c, times: times.length === c.length ? times : [] };
}
function loadTrack(c, name) {
  enqueue(() => { wps = [c[0], c[c.length - 1]]; segs = [c]; imported = true; render(); fit(); if (name) $('#rName').value = name; toast(`Parcours importé : ${km(total)} km`); });
}
$('#file').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return; e.target.value = '';
  let r; try { r = parseTrack(f.name, await f.text()); } catch (err) { r = { c: [] }; }
  if (r.c.length < 2) return toast('Aucun tracé trouvé dans ce fichier');
  loadTrack(r.c, f.name.replace(/\.\w+$/, ''));
  if (r.times.length > 1) { // activité horodatée (ex. export Strava) -> proposer de cocher la séance
    const dist = lenOf(r.c) / 1000, dur = (r.times[r.times.length - 1] - r.times[0]) / 60000, date = new Date(r.times[0]);
    const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (markPlanDone(ds, dist, dur, 'gpx')) toast(`Activité du ${date.toLocaleDateString('fr-FR')} (${nf(dist, 2)} km) cochée dans ta prépa ✅`, 4500);
  }
};

/* ================= Lien de partage ================= */
function saveHash() {
  try {
    if (!wps.length || imported) { history.replaceState(null, '', location.pathname + location.search); return; }
    history.replaceState(null, '', '#r=' + wps.map((p) => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join(';') + '&m=' + (snap ? 'r' : 'f'));
  } catch (e) { }
}
function fromHash() {
  const m = location.hash.match(/r=([^&]+)/); if (!m) return false;
  const p = decodeURIComponent(m[1]).split(';').map((s) => s.split(',').map(Number)).filter((x) => x.length === 2 && !x.some(isNaN));
  if (!p.length) return false; setMode(!/m=f/.test(location.hash));
  enqueue(async () => { wps = p; busy(1); segs = await Promise.all(p.slice(1).map((b, i) => leg(p[i], b))); busy(0); render(); fit(); });
  return true;
}
async function copyText(t, msg) {
  try { await navigator.clipboard.writeText(t); toast(msg || 'Copié'); }
  catch (e) { const x = document.createElement('textarea'); x.value = t; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); toast(msg || 'Copié'); } catch (_) { toast('Copie impossible'); } x.remove(); }
}
$('#bShare').onclick = () => { if (!wps.length) return toast('Trace d’abord un parcours'); copyText(location.href, 'Lien copié 🔗 — il recrée exactement ce parcours'); };

/* ================= Parcours enregistrés ================= */
function thumb(c) {
  if (!c || c.length < 2) return '<svg width="52" height="52"></svg>';
  const step = Math.max(1, Math.floor(c.length / 120)), s = c.filter((_, i) => i % step === 0);
  let a = 1e9, b = -1e9, x = 1e9, y = -1e9; s.forEach((p) => { a = Math.min(a, p[0]); b = Math.max(b, p[0]); x = Math.min(x, p[1]); y = Math.max(y, p[1]); });
  const k = Math.cos(rad((a + b) / 2)), w = (y - x) * k || 1e-6, h = (b - a) || 1e-6, sc = 40 / Math.max(w, h);
  const pts = s.map((p) => [(6 + ((p[1] - x) * k * sc) + (40 - w * sc) / 2).toFixed(1), (6 + ((b - p[0]) * sc) + (40 - h * sc) / 2).toFixed(1)].join(',')).join(' ');
  return `<svg width="52" height="52" viewBox="0 0 52 52"><polyline points="${pts}" fill="none" stroke="#c6ff3d" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function renderList() {
  const a = Store.get('routes', []);
  $('#list').innerHTML = a.length ? '' : '<p class="hint">Aucun parcours enregistré pour l’instant.</p>';
  a.forEach((r) => {
    const d = document.createElement('div'); d.className = 'route';
    const all = []; r.segs.forEach((s) => (all.length ? all.push(...s.slice(1)) : all.push(...s)));
    d.innerHTML = `${thumb(all)}<div class="info"><b>${esc(r.name)}</b><small>${km(r.dist)} km${r.gain ? ' · D+ ' + Math.round(r.gain) + ' m' : ''} · ${new Date(r.date).toLocaleDateString('fr-FR')}</small></div><button data-a="open">Ouvrir</button><button data-a="del" class="danger">✕</button>`;
    d.querySelector('[data-a=open]').onclick = () => enqueue(() => { wps = r.wps; segs = r.segs; imported = !!r.imported; setMode(r.snap !== false); $('#rName').value = r.name; render(); fit(); toast('Parcours chargé'); });
    d.querySelector('[data-a=del]').onclick = () => { Store.set('routes', Store.get('routes', []).filter((x) => x.id !== r.id)); renderList(); };
    $('#list').appendChild(d);
  });
}
$('#bSave').onclick = () => {
  if (total < 10) return toast('Trace d’abord un parcours');
  const name = $('#rName').value.trim() || `Parcours ${km(total, 1)} km`, r5 = (p) => [+p[0].toFixed(5), +p[1].toFixed(5)];
  const a = Store.get('routes', []); a.unshift({ id: Date.now(), name, date: Date.now(), dist: total, gain: elev ? gain : 0, snap, imported, wps: wps.map(r5), segs: segs.map((s) => s.map(r5)) });
  if (Store.set('routes', a)) { renderList(); toast('Parcours enregistré 💾'); }
};

/* ================= Modale ================= */
function openModal(title, html, foot) {
  $('#mTitle').textContent = title; $('#mBody').innerHTML = html; $('#mFoot').innerHTML = foot || ''; $('#mFoot').style.display = foot ? '' : 'none';
  $('#modal').classList.add('on'); $('#mBody').scrollTop = 0;
}
const closeModal = () => $('#modal').classList.remove('on');
$('#mClose').onclick = closeModal;
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
function confirmBox(title, text, okLabel) {
  return new Promise((res) => {
    openModal(title, `<p style="margin-top:12px">${text}</p>`, `<button class="primary" id="cfOk">${okLabel || 'Confirmer'}</button><button class="btn w" id="cfNo">Annuler</button>`);
    $('#cfOk').onclick = () => { closeModal(); res(true); }; $('#cfNo').onclick = () => { closeModal(); res(false); };
  });
}

/* ================= PRÉPA ================= */
let plan = Store.get('plan', null);
let viewWeek = null;
const savePlan = () => Store.set('plan', plan);
const RUN_TYPES = (t) => t !== 'renfo' && t !== 'cross';
function currentWeekIdx() {
  if (!plan) return 0; const t = D.today();
  const i = plan.weeks.findIndex((w) => t >= w.start && t < D.add(w.start, 7));
  return i >= 0 ? i : t < plan.weeks[0].start ? 0 : plan.weeks.length - 1;
}
function markPlanDone(date, kmDone, minDone, source, extId) {
  if (!plan) return false;
  const all = plan.weeks.flatMap((w) => w.sessions).filter((s) => RUN_TYPES(s.type) && !s.done);
  let s = all.find((x) => x.date === date);
  if (!s) s = all.find((x) => Math.abs(D.diff(x.date, date)) === 1);
  if (!s) return false;
  s.done = true; s.actualKm = Math.round(kmDone * 100) / 100; s.actualMin = Math.round(minDone); s.source = source; if (extId) s.extId = extId;
  savePlan(); renderPlan(); return true;
}
function ring(pct) {
  const r = 26, c = 2 * Math.PI * r;
  return `<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="url(#rg)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 32 32)"/><defs><linearGradient id="rg"><stop offset="0" stop-color="#c6ff3d"/><stop offset="1" stop-color="#3de0ff"/></linearGradient></defs><text x="32" y="37" text-anchor="middle" fill="#e9eef7" font-family="Space Grotesk" font-weight="700" font-size="15">${Math.round(pct * 100)}%</text></svg>`;
}
function renderPlan() {
  const box = $('#planView'); if (!box) return;
  if (!plan) {
    box.innerHTML = `<div class="hero"><h2>Ta prépa sur mesure 🏆</h2><p>5 km, 10 km, semi, marathon, trail ou remise en forme : un programme adapté à ton niveau, tes disponibilités et ta date de course, exportable en Excel.</p></div>
    <div style="height:12px"></div><button class="primary" id="pNew">✨ Créer ma prépa</button><div style="height:8px"></div>
    <label class="btn w" style="display:block">📥 Importer ma prépa Excel (.xlsx / .csv)<input type="file" id="pImport" accept=".xlsx,.xlsm,.csv,.xls" hidden></label>
    <p class="hint">L'import reconnaît les tableaux avec une ligne d'en-têtes (Semaine, Jour, Date, Séance, Distance…) et les calendriers avec les jours en colonnes.</p>`;
    $('#pNew').onclick = openWizard; $('#pImport').onchange = importExcel; return;
  }
  const W = plan.weeks.length, cur = currentWeekIdx(); if (viewWeek == null || viewWeek >= W) viewWeek = cur;
  const all = plan.weeks.flatMap((w) => w.sessions).filter((s) => RUN_TYPES(s.type));
  const done = all.filter((s) => s.done).length, kmPlan = all.reduce((a, s) => a + (s.km || 0), 0), kmDone = all.reduce((a, s) => a + (s.done ? (s.actualKm ?? s.km ?? 0) : 0), 0);
  const race = plan.goal && plan.goal.raceDate; const jx = race ? D.diff(D.today(), race) : null;
  const w = plan.weeks[viewWeek]; const maxKm = Math.max(...plan.weeks.map((x) => x.km || 0), 1);
  const today = D.today();
  box.innerHTML = `<div class="hero"><span class="badge acc">${plan.source === 'ia' ? '✨ IA' : plan.source === 'import' ? '📥 Importée' : '🧠 Coach intégré'}</span>
   <h2 style="margin-top:8px">${esc(plan.title)}</h2><p>${race ? (jx > 0 ? `J-${jx} · ` : jx === 0 ? 'C’est aujourd’hui ! · ' : '') + D.fr(race, true) : ''}${plan.goal && plan.goal.target ? ' · objectif ' + Coach.fmtTime(plan.goal.target) : ''}</p>
   <div class="ring">${ring(all.length ? done / all.length : 0)}<div class="rt"><b>${done}/${all.length}</b><small>séances faites · ${nf(kmDone, 0)} / ${nf(kmPlan, 0)} km</small>${plan.summary && plan.summary.vma ? `<small>VMA ${nf(plan.summary.vma)} km/h</small>` : ''}</div></div>
   <div class="weekbars">${plan.weeks.map((x, i) => `<div data-w="${i}" class="${i === viewWeek ? 'cur' : i < cur ? 'past' : ''}" style="height:${Math.max(6, (x.km || 0) / maxKm * 100)}%" title="S${x.n} · ${nf(x.km || 0, 0)} km"></div>`).join('')}</div></div>
   <div class="weeknav"><button id="wPrev">‹</button><div class="wt"><b>Semaine ${w.n} / ${W}${today >= w.start && today < D.add(w.start, 7) ? ' · en cours' : today < w.start && viewWeek === 0 ? ' · à venir' : ''}</b><small>${D.fr(w.start)} → ${D.fr(D.add(w.start, 6))} · ${w.phase ? esc(w.phase) + ' · ' : ''}${nf(w.km || 0, 0)} km</small></div><button id="wNext">›</button></div>
   ${w.focus ? `<p class="focus">🎯 ${esc(w.focus)}</p>` : ''}
   <div id="sessList"></div>
   <div class="grid" style="margin-top:12px"><button id="pXlsx">📊 Excel</button><button id="pIcs">📅 Calendrier</button><button id="pInfo">📋 Allures &amp; infos</button><button id="pMenu">⋯ Gérer</button></div>
   <h3>✨ Coach IA</h3><p class="hint" style="margin-top:0">Demande un ajustement : « je suis malade cette semaine », « je ne peux pas courir le mardi », « ajoute un 10 km de préparation le 15 février »…</p>
   <textarea id="aiAsk" class="field" placeholder="Ta demande au coach…"></textarea><div style="height:8px"></div><button class="btn w" id="aiSend">Envoyer au coach IA</button><div class="prog" id="aiProg" hidden><i></i></div><div class="chat" id="aiChat"></div>`;
  const list = $('#sessList');
  if (!w.sessions.length) list.innerHTML = '<p class="hint">Semaine de repos.</p>';
  w.sessions.forEach((s) => {
    const t = Coach.TYPES[s.type] || Coach.TYPES.ef; const el = document.createElement('div');
    el.className = `sess${s.done ? ' done' : ''}${s.date === today ? ' today' : ''}`;
    el.innerHTML = `<div class="bar" style="background:${t.hex}"></div><div><div class="t1">${Coach.DAYS[D.dow(s.date)]} ${D.fr(s.date)} · ${t.label}${s.date === today ? ' · aujourd’hui' : ''}</div><div class="t2">${esc(s.title)}</div><div class="t3">${[s.km ? nf(s.km) + ' km' : '', s.min ? '≈ ' + s.min + ' min' : '', s.pace && s.pace !== '—' ? esc(s.pace) : ''].filter(Boolean).join(' · ')}${s.done && s.actualKm ? ` · ✅ ${nf(s.actualKm, 2)} km réalisés` : ''}</div></div>
     <button class="chk" title="Marquer comme fait">${s.done ? '✓' : ''}</button>
     <div class="more">${esc(s.details || '').replace(/\n/g, '<br>')}${s.zone && s.zone !== '—' ? `<br><b>Zone :</b> ${esc(s.zone)}` : ''}<div class="acts">${s.km && RUN_TYPES(s.type) ? `<button class="btn sm" data-a="route">🗺️ Tracer une boucle de ${nf(s.km)} km</button>` : ''}<button class="btn sm" data-a="note">✎ Ressenti / km réels</button></div></div>`;
    el.onclick = (e) => { if (e.target.closest('button')) return; el.classList.toggle('open'); };
    el.querySelector('.chk').onclick = () => { s.done = !s.done; if (!s.done) { s.actualKm = null; s.source = null; } savePlan(); renderPlan(); };
    const rb = el.querySelector('[data-a=route]'); if (rb) rb.onclick = () => { setLoop(Math.min(50, Math.max(1, Math.round(s.km * 2) / 2))); showTab('loop'); if (isMobile()) $('#panel').classList.add('collapsed'); generateLoop(s.km); };
    el.querySelector('[data-a=note]').onclick = () => editSession(s);
    list.appendChild(el);
  });
  $('#wPrev').onclick = () => { viewWeek = Math.max(0, viewWeek - 1); renderPlan(); };
  $('#wNext').onclick = () => { viewWeek = Math.min(W - 1, viewWeek + 1); renderPlan(); };
  $$('.weekbars div').forEach((d) => (d.onclick = () => { viewWeek = +d.dataset.w; renderPlan(); }));
  $('#pXlsx').onclick = exportExcel; $('#pIcs').onclick = exportICS; $('#pInfo').onclick = showPlanInfo; $('#pMenu').onclick = planMenu;
  $('#aiSend').onclick = askCoach;
  const last = Store.get('aiLast', null); if (last && last.planId === plan.id) $('#aiChat').innerHTML = `<div class="msg">${esc(last.text)}</div>`;
}
function editSession(s) {
  openModal('Ma séance', `<p class="hint">${esc(s.title)} · ${D.fr(s.date, true)}</p>
   <div class="row2"><label class="f" style="margin:0">Km réalisés<input id="esKm" class="field" inputmode="decimal" value="${s.actualKm ?? ''}"></label><label class="f" style="margin:0">Durée (min)<input id="esMin" class="field" inputmode="numeric" value="${s.actualMin ?? ''}"></label></div>
   <label class="f">Ressenti (1 = très facile, 10 = épuisant)<input id="esFeel" type="range" min="1" max="10" value="${s.feel || 5}"></label>
   <label class="f">Notes<textarea id="esNote" class="field">${esc(s.note || '')}</textarea></label>`, `<button class="primary" id="esOk">Enregistrer</button>`);
  $('#esOk').onclick = () => {
    const k = parseFloat(String($('#esKm').value).replace(',', '.')), m = parseFloat($('#esMin').value);
    s.actualKm = isFinite(k) ? k : null; s.actualMin = isFinite(m) ? m : null; s.feel = +$('#esFeel').value; s.note = $('#esNote').value.trim();
    if (s.actualKm) s.done = true; savePlan(); closeModal(); renderPlan();
  };
}
function showPlanInfo() {
  const S = plan.summary || {};
  const paces = (S.paces || []).map((p) => `<tr><td>${esc(p.label)}</td><td><b>${esc(p.pace)}</b></td><td>${esc(p.zone)}</td></tr>`).join('');
  const hr = S.hr ? S.hr.zones.map((z) => `<tr><td>${z.z} · ${esc(z.name)}</td><td><b>${z.lo}–${z.hi}</b></td><td>bpm</td></tr>`).join('') : '';
  openModal('Allures & infos', `${S.vma ? `<p style="margin-top:12px"><b>VMA ${nf(S.vma)} km/h</b> <span class="hint">(${esc(S.vmaSource || '')})</span></p>` : ''}
   ${plan.goal && plan.goal.predicted ? `<p class="hint">Niveau actuel estimé sur ${esc(plan.goal.label)} : ${Coach.fmtTime(plan.goal.predicted)}</p>` : ''}
   ${paces ? `<h3>Allures (min/km)</h3><table class="splits">${paces}</table>` : ''}${hr ? `<h3>Zones cardiaques — FC max ${S.hr.max}</h3><table class="splits">${hr}</table>` : ''}
   ${(S.warnings || []).map((w) => `<div class="note w">⚠️ ${esc(w)}</div>`).join('')}${S.notes ? `<div class="note">💬 ${esc(S.notes)}</div>` : ''}
   ${(S.tips || []).length ? `<h3>Conseils</h3>${S.tips.map((t) => `<p class="hint" style="margin:6px 0">• ${esc(t)}</p>`).join('')}` : ''}
   ${S.importInfo ? `<p class="hint">Importé depuis la feuille « ${esc(S.importInfo.sheet)} » (${S.importInfo.count} séances).</p>` : ''}`, '');
}
function planMenu() {
  openModal('Gérer ma prépa', `<div style="display:grid;gap:8px;margin-top:12px">
   <button class="btn w" id="mmRe">🔁 Recréer avec un autre profil</button>
   <label class="btn w" style="display:block">📥 Remplacer par un fichier Excel<input type="file" id="mmImp" accept=".xlsx,.xlsm,.csv,.xls" hidden></label>
   <button class="btn w" id="mmShift">📆 Décaler toute la prépa d'une semaine</button>
   <button class="btn w" id="mmStrava">🟧 Synchroniser avec Strava</button>
   <button class="btn w danger" id="mmDel">🗑️ Supprimer la prépa</button></div>`, '');
  $('#mmRe').onclick = () => { closeModal(); openWizard(); };
  $('#mmImp').onchange = (e) => { closeModal(); importExcel(e); };
  $('#mmShift').onclick = () => { plan.weeks.forEach((w) => { w.start = D.add(w.start, 7); w.sessions.forEach((s) => (s.date = D.add(s.date, 7))); }); if (plan.goal.raceDate) plan.goal.raceDate = D.add(plan.goal.raceDate, 7); plan.start = plan.weeks[0].start; savePlan(); closeModal(); renderPlan(); toast('Prépa décalée d’une semaine'); };
  $('#mmStrava').onclick = () => { closeModal(); Strava.sync(); };
  $('#mmDel').onclick = async () => { if (await confirmBox('Supprimer la prépa ?', 'Pense à l’exporter en Excel avant si tu veux la garder.', 'Supprimer')) { plan = null; Store.del('plan'); renderPlan(); } };
}
function exportExcel() {
  try {
    const bytes = XLSXLite.write(Coach.toWorkbook(plan));
    saveFile(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), slug(plan.title) + '.xlsx');
  } catch (e) { console.error(e); toast('Export Excel impossible : ' + e.message); }
}
function exportICS() {
  const e = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const fold = (l) => { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = plan.weeks.flatMap((w) => w.sessions).map((s) => ['BEGIN:VEVENT', `UID:${s.id}@foulee`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${s.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${D.add(s.date, 1).replace(/-/g, '')}`, fold(`SUMMARY:${s.type === 'course' ? '🏁' : s.type === 'renfo' ? '💪' : '🏃'} ${e(s.title)}`), fold(`DESCRIPTION:${e([s.details, s.pace && 'Allure : ' + s.pace, s.zone && 'Zone : ' + s.zone].filter(Boolean).join('\n'))}`), 'TRANSP:TRANSPARENT', 'END:VEVENT'].join('\r\n'));
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Foulee//Prepa//FR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${e(plan.title)}`, ...ev, 'END:VCALENDAR'].join('\r\n');
  saveFile(new Blob([ics], { type: 'text/calendar' }), slug(plan.title) + '.ics');
}

/* ---------- Assistant de création ---------- */
function openWizard() {
  const p = Object.assign({ goal: 'semi', level: 'inter', sessions: 4, days: [1, 3, 5, 6], longDay: 6, weeks: 12, strength: true, cross: false, terrain: 'plat', priority: 'chrono' }, Store.get('profile', {}));
  const goals = [['5k', '5 km'], ['10k', '10 km'], ['semi', 'Semi'], ['marathon', 'Marathon'], ['trail', 'Trail'], ['custom', 'Autre distance'], ['forme', 'Remise en forme']];
  const levels = [['debutant', 'Débutant'], ['inter', 'Intermédiaire'], ['confirme', 'Confirmé'], ['expert', 'Expert']];
  const opt = (arr, v) => arr.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('');
  const val = (x) => (x == null ? '' : esc(x));
  const hasKey = !!Store.get('settings', {}).aiKey;
  openModal('Créer ma prépa', `
   <div class="step">1 · Objectif</div>
   <div class="chips" id="wGoal">${goals.map(([k, l]) => `<button data-v="${k}" class="${p.goal === k ? 'on' : ''}">${l}</button>`).join('')}</div>
   <div class="row2" id="wDistBox"><label class="f" style="margin:0">Distance (km)<input id="wKm" class="field" inputmode="decimal" value="${val(p.goalKm)}"></label><label class="f" style="margin:0">Dénivelé + (m)<input id="wDplus" class="field" inputmode="numeric" value="${val(p.goalDplus)}"></label></div>
   <label class="f">Nom de la course (optionnel)<input id="wName" class="field" placeholder="ex. Semi de Paris" value="${val(p.raceName)}"></label>
   <div class="row2"><label class="f" style="margin:0">Date de la course<input id="wDate" class="field" type="date" value="${val(p.raceDate)}"></label><label class="f" style="margin:0">Temps visé (optionnel)<input id="wTarget" class="field" placeholder="1h45, 52:00…" value="${val(p.targetTimeTxt)}"></label></div>
   <label class="f">Durée de la prépa : <b id="wWeeksV">${p.weeks} semaines</b><input id="wWeeks" type="range" min="2" max="52" value="${p.weeks}"></label>
   <p class="hint" style="margin:2px 0 0">Avec une date de course, la prépa se termine ce jour-là (durée ajustée s'il reste moins de temps). Sans date, elle démarre lundi prochain.</p>
   <div class="chips" id="wPrio"><button data-v="chrono" class="${p.priority !== 'finir' ? 'on' : ''}">⏱️ Faire un chrono</button><button data-v="finir" class="${p.priority === 'finir' ? 'on' : ''}">🎯 Finir sereinement</button></div>

   <div class="step">2 · Ton niveau</div>
   <label class="f">Niveau<select id="wLevel" class="field">${opt(levels, p.level)}</select></label>
   <div class="row2"><label class="f" style="margin:0">Km par semaine actuellement<input id="wWeekly" class="field" inputmode="decimal" value="${val(p.weeklyKm)}"></label><label class="f" style="margin:0">Plus longue sortie récente (km)<input id="wLongest" class="field" inputmode="decimal" value="${val(p.longestRun)}"></label></div>
   <label class="f">VMA connue (km/h, optionnel)<input id="wVma" class="field" inputmode="decimal" placeholder="ex. 15,5" value="${val(p.vma)}"></label>
   <div class="row2"><label class="f" style="margin:0">Course récente : distance (km)<input id="wRefKm" class="field" inputmode="decimal" placeholder="ex. 10" value="${val(p.refKm)}"></label><label class="f" style="margin:0">… en (temps)<input id="wRefT" class="field" placeholder="ex. 48:30" value="${val(p.refTimeTxt)}"></label></div>

   <div class="step">3 · Tes disponibilités</div>
   <label class="f">Séances de course par semaine : <b id="wSessV">${p.sessions}</b><input id="wSess" type="range" min="2" max="7" value="${p.sessions}"></label>
   <label class="f">Jours possibles <span class="hint">(touche 2 fois un jour pour en faire le jour de sortie longue, souligné en bleu)</span></label>
   <div class="days" id="wDays">${Coach.DAYS_S.map((d, i) => `<button data-d="${i}" class="${p.days.includes(i) ? 'on' : ''}${p.longDay === i ? ' long' : ''}">${d}</button>`).join('')}</div>
   <label class="switch"><input type="checkbox" id="wStrength" ${p.strength ? 'checked' : ''}> Inclure du renforcement musculaire</label>
   <label class="switch"><input type="checkbox" id="wCross" ${p.cross ? 'checked' : ''}> Ajouter vélo / natation (activité croisée)</label>
   <label class="f">Terrain d'entraînement<select id="wTerrain" class="field">${opt([['plat', 'Plutôt plat'], ['vallonne', 'Vallonné'], ['montagne', 'Montagne']], p.terrain)}</select></label>

   <div class="step">4 · Toi (optionnel)</div>
   <div class="row3"><label class="f">Âge<input id="wAge" class="field" inputmode="numeric" value="${val(p.age)}"></label><label class="f">Sexe<select id="wSex" class="field">${opt([['', '—'], ['f', 'Femme'], ['h', 'Homme']], p.sex || '')}</select></label><label class="f">Poids (kg)<input id="wWeight" class="field" inputmode="decimal" value="${val(p.weight)}"></label></div>
   <div class="row2"><label class="f" style="margin:0">FC max (bpm)<input id="wHrMax" class="field" inputmode="numeric" value="${val(p.hrMax)}"></label><label class="f" style="margin:0">FC repos (bpm)<input id="wHrRest" class="field" inputmode="numeric" value="${val(p.hrRest)}"></label></div>
   <label class="f">Blessures, douleurs, contraintes<textarea id="wInj" class="field" placeholder="ex. tendinite d'Achille l'an dernier, genou sensible en descente…">${esc(p.injuries || '')}</textarea></label>
   <label class="f">Autres souhaits pour l'IA<textarea id="wNotes" class="field" placeholder="ex. je préfère le fractionné sur piste, vacances du 10 au 17 février, je cours avec mon chien…">${esc(p.notes || '')}</textarea></label>
   <div class="prog" id="wProg" hidden><i></i></div><p class="hint" id="wStatus"></p>`,
    `<button class="primary" id="wAI">✨ Créer avec l'IA${hasKey ? '' : ' (clé API requise)'}</button><button class="btn w" id="wCoach">🧠 Créer avec le coach intégré (gratuit, instantané)</button>`);
  let goal = p.goal, prio = p.priority || 'chrono', days = p.days.slice(), longDay = p.longDay;
  const syncGoal = () => { $('#wDistBox').style.display = goal === 'trail' || goal === 'custom' ? '' : 'none'; };
  syncGoal();
  $$('#wGoal button').forEach((b) => (b.onclick = () => { goal = b.dataset.v; $$('#wGoal button').forEach((x) => x.classList.toggle('on', x === b)); syncGoal(); }));
  $$('#wPrio button').forEach((b) => (b.onclick = () => { prio = b.dataset.v; $$('#wPrio button').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#wWeeks').oninput = (e) => ($('#wWeeksV').textContent = e.target.value + ' semaines');
  $('#wSess').oninput = (e) => ($('#wSessV').textContent = e.target.value);
  $$('#wDays button').forEach((b) => (b.onclick = () => {
    const d = +b.dataset.d;
    if (!days.includes(d)) days.push(d); else if (longDay !== d) longDay = d; else { days = days.filter((x) => x !== d); longDay = days.includes(6) ? 6 : days[days.length - 1]; }
    $$('#wDays button').forEach((x) => { const i = +x.dataset.d; x.classList.toggle('on', days.includes(i)); x.classList.toggle('long', i === longDay); });
  }));
  const num = (id) => { const v = String($(id).value).replace(',', '.').trim(); return v === '' ? null : +v; };
  const collect = () => {
    const prof = {
      goal, priority: prio, raceName: $('#wName').value.trim(), raceDate: $('#wDate').value || '', weeks: +$('#wWeeks').value,
      targetTimeTxt: $('#wTarget').value.trim(), targetTime: Coach.parseTime($('#wTarget').value), level: $('#wLevel').value,
      weeklyKm: num('#wWeekly'), longestRun: num('#wLongest'), vma: num('#wVma'), refKm: num('#wRefKm'), refTimeTxt: $('#wRefT').value.trim(), refTime: Coach.parseTime($('#wRefT').value),
      sessions: +$('#wSess').value, days: days.slice().sort((a, b) => a - b), longDay, strength: $('#wStrength').checked, cross: $('#wCross').checked, terrain: $('#wTerrain').value,
      age: num('#wAge'), sex: $('#wSex').value, weight: num('#wWeight'), hrMax: num('#wHrMax'), hrRest: num('#wHrRest'), injuries: $('#wInj').value.trim(), notes: $('#wNotes').value.trim(),
      goalKm: num('#wKm'), goalDplus: num('#wDplus') || 0
    };
    if (prof.days.length < 2) { toast('Choisis au moins 2 jours possibles'); return null; }
    if (prof.sessions > prof.days.length) { prof.sessions = prof.days.length; }
    if ((goal === 'custom' || goal === 'trail') && !prof.goalKm) { toast('Indique la distance de ta course'); return null; }
    if (prof.raceDate && prof.raceDate < D.today()) { toast('La date de course est passée'); return null; }
    Store.set('profile', prof); return prof;
  };
  const finish = async (np) => {
    if (plan && !(await confirmBox('Remplacer la prépa actuelle ?', 'Ta prépa en cours sera remplacée. Pense à l’exporter en Excel si tu veux la garder.', 'Remplacer'))) return;
    plan = np; viewWeek = null; savePlan(); closeModal(); showTab('plan'); renderPlan();
    toast(`Prépa créée : ${plan.weeks.length} semaines, ${plan.weeks.flatMap((w) => w.sessions).length} séances ✅`, 4000);
    setTimeout(() => offerExcel(), 600);
  };
  $('#wCoach').onclick = () => { const prof = collect(); if (!prof) return; try { finish(Coach.build(prof)); } catch (e) { console.error(e); toast('Erreur : ' + e.message); } };
  $('#wAI').onclick = async () => {
    const prof = collect(); if (!prof) return;
    if (!Store.get('settings', {}).aiKey) { closeModal(); showTab('settings'); $('#aiKey').focus(); return toast('Ajoute d’abord ta clé API Anthropic', 4000); }
    $('#wAI').disabled = true; $('#wCoach').disabled = true; $('#wProg').hidden = false;
    try {
      const np = await AI.createPlan(prof, (pct, msg) => { $('#wProg i').style.width = Math.round(pct * 100) + '%'; $('#wStatus').textContent = msg; });
      finish(np);
    } catch (e) { console.error(e); $('#wStatus').textContent = '❌ ' + e.message; toast(e.message, 5000); }
    finally { $('#wAI') && ($('#wAI').disabled = false); $('#wCoach') && ($('#wCoach').disabled = false); }
  };
}
function offerExcel() {
  openModal('Ta prépa est prête 🎉', `<p style="margin-top:12px">${esc(plan.title)} — ${plan.weeks.length} semaines.</p><p class="hint">Le fichier Excel contient 4 onglets : Résumé (allures, zones cardiaques, conseils), Programme (une ligne par séance avec colonnes à remplir), Calendrier (vue semaine par semaine en couleurs) et Suivi (km et séances réalisés, calculés automatiquement).</p>`,
    `<button class="primary" id="oxGo">📊 Télécharger le fichier Excel</button><button class="btn w" id="oxNo">Plus tard</button>`);
  $('#oxGo').onclick = () => { exportExcel(); closeModal(); }; $('#oxNo').onclick = closeModal;
}

/* ---------- Import Excel ---------- */
async function loadExcelJS() {
  if (window.ExcelJS) return window.ExcelJS;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'; s.onload = res; s.onerror = () => rej(new Error('Lecteur Excel indisponible hors connexion')); document.head.appendChild(s); });
  return window.ExcelJS;
}
async function readWorkbook(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return XLSXLite.readCSV(await file.text());
  if (name.endsWith('.xls')) throw new Error('Ancien format .xls : ouvre le fichier dans Excel ou Numbers et enregistre-le en .xlsx');
  const buf = await file.arrayBuffer();
  try { return await XLSXLite.read(buf); }
  catch (e) {
    if (e.message !== 'INFLATE') throw e;
    const EX = await loadExcelJS(); const wb = new EX.Workbook(); await wb.xlsx.load(buf);
    return wb.worksheets.map((ws) => {
      const rows = [];
      ws.eachRow({ includeEmpty: true }, (row, r) => {
        const arr = []; row.eachCell({ includeEmpty: true }, (cell, c) => {
          let v = cell.value; if (v && typeof v === 'object' && !(v instanceof Date)) v = v.result ?? (v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? null);
          arr[c - 1] = v;
        }); rows[r - 1] = arr;
      });
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      return { name: ws.name, rows };
    });
  }
}
async function importExcel(e) {
  const f = e.target.files[0]; if (!f) return; e.target.value = '';
  busy(1);
  try {
    const sheets = await readWorkbook(f);
    let res = Coach.fromSheets(sheets, { title: f.name.replace(/\.\w+$/, '') });
    if (!res.plan) { openModal('Import impossible', `<div class="note w">${esc(res.error)}</div><p class="hint">Envoie-moi ton fichier si besoin : je peux l’adapter au bon format.</p>`, ''); return; }
    const go = (r) => {
      const info = r.info; const p = r.plan;
      openModal('Vérifie l’import', `<div class="note">✅ ${info.count} séances reconnues sur ${info.weeks} semaines (feuille « ${esc(info.sheet)} », format ${info.mode}).</div>
       <p class="hint">Du ${D.fr(p.weeks[0].start, true)} au ${D.fr(D.add(p.weeks[p.weeks.length - 1].start, 6), true)}.</p>
       ${info.needsStart ? `<label class="f">Date du lundi de la semaine 1<input id="imStart" type="date" class="field" value="${p.weeks[0].start}"></label><p class="hint">Ton fichier n'a pas de dates : choisis quand commence la prépa.</p>` : ''}
       <h3>Aperçu</h3>${p.weeks.slice(0, 2).flatMap((w) => w.sessions).slice(0, 6).map((s) => `<p class="hint" style="margin:4px 0">• ${Coach.DAYS_S[D.dow(s.date)]} ${D.fr(s.date)} — <b style="color:var(--txt)">${esc(s.title)}</b>${s.km ? ' · ' + nf(s.km) + ' km' : ''} <span class="badge">${(Coach.TYPES[s.type] || {}).label || s.type}</span></p>`).join('')}`,
        `<button class="primary" id="imOk">Utiliser cette prépa</button>`);
      if (info.needsStart) $('#imStart').onchange = (ev) => { const r2 = Coach.fromSheets(sheets, { title: p.title, startMonday: ev.target.value }); if (r2.plan) go(r2); };
      $('#imOk').onclick = async () => {
        if (plan && !(await confirmBox('Remplacer la prépa actuelle ?', 'Ta prépa en cours sera remplacée par celle du fichier.', 'Remplacer'))) return;
        plan = p; viewWeek = null; savePlan(); closeModal(); showTab('plan'); renderPlan(); toast('Prépa importée ✅');
      };
    };
    go(res);
  } catch (err) { console.error(err); toast('Lecture impossible : ' + err.message, 5000); }
  finally { busy(0); }
}

/* ================= IA (Claude) ================= */
const AI = {
  settings: () => Store.get('settings', {}),
  async call({ system, prompt, maxTokens = 8000, onText }) {
    const s = AI.settings(); if (!s.aiKey) throw new Error('Ajoute ta clé API Anthropic dans Réglages');
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': s.aiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: s.aiModel || 'claude-sonnet-5-5', max_tokens: maxTokens, stream: true, system, messages: [{ role: 'user', content: prompt }] })
      });
    } catch (e) { throw new Error('Connexion à l’IA impossible (réseau)'); }
    if (!r.ok) {
      let msg = ''; try { const j = await r.json(); msg = j.error && j.error.message; } catch (e) { }
      if (r.status === 401) throw new Error('Clé API invalide');
      if (r.status === 404) throw new Error(`Modèle introuvable : vérifie son nom dans Réglages (${msg || ''})`);
      if (r.status === 429 || r.status === 529) throw new Error('L’IA est surchargée, réessaie dans un instant');
      if (r.status === 400 && /credit/i.test(msg)) throw new Error('Crédit API insuffisant sur ton compte Anthropic');
      throw new Error(`Erreur IA ${r.status} ${msg || ''}`);
    }
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = '', stop = null;
    for (; ;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const ev = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = ev.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
        if (!data) continue; let j; try { j = JSON.parse(data); } catch (e) { continue; }
        if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') { text += j.delta.text; onText && onText(text); }
        else if (j.type === 'message_delta' && j.delta) stop = j.delta.stop_reason;
        else if (j.type === 'error') throw new Error('Erreur IA : ' + (j.error && j.error.message));
      }
    }
    if (stop === 'max_tokens') throw new Error('Réponse de l’IA trop longue (coupée). Réessaie avec moins de semaines ou moins de détails.');
    return text;
  },
  json(text) {
    const t = text.replace(/```json|```/g, ''); const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('Réponse de l’IA illisible');
    return JSON.parse(t.slice(a, b + 1));
  },
  SYSTEM: `Tu es un entraîneur de course à pied diplômé (athlétisme, trail), francophone, rigoureux et bienveillant. Tu conçois des plans d'entraînement individualisés en respectant les principes physiologiques : progressivité (pas plus de ~10 % de volume en plus par semaine), polarisation (environ 80 % en endurance fondamentale), semaines allégées régulières, spécificité croissante vers l'objectif, affûtage avant la course, prévention des blessures. Tu adaptes tout au profil (niveau, volume actuel, disponibilités, âge, blessures, terrain, souhaits). Les allures sont exprimées en min/km et cohérentes avec la VMA fournie. Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.`,
  profileText(p, base) {
    const S = base.summary, G = base.goal;
    return [
      `Objectif : ${G.label}${G.km ? ` (${Math.round(G.km * 10) / 10} km${G.dplus ? `, ${G.dplus} m D+` : ''})` : ''}${G.raceDate ? `, course le ${G.raceDate} (${Coach.DAYS[D.dow(G.raceDate)]})` : ''}.`,
      G.target ? `Temps visé : ${Coach.fmtTime(G.target)}${p.priority === 'finir' ? ' (priorité : finir sereinement)' : ''}. Niveau actuel estimé : ${G.predicted ? Coach.fmtTime(G.predicted) : 'inconnu'}.` : '',
      `Niveau : ${S.levelLabel}. VMA ${S.vma} km/h (${S.vmaSource}). Volume actuel ${p.weeklyKm ?? '?'} km/sem, plus longue sortie récente ${p.longestRun ?? '?'} km.`,
      `Disponibilités : ${p.sessions} séances de course par semaine, jours possibles ${p.days.map((d) => Coach.DAYS[d]).join(', ')}, sortie longue le ${Coach.DAYS[p.longDay]}.`,
      `Renforcement musculaire : ${p.strength ? 'oui' : 'non'}. Activité croisée : ${p.cross ? 'oui' : 'non'}. Terrain : ${p.terrain}.`,
      [p.age && `Âge ${p.age}`, p.sex && (p.sex === 'f' ? 'femme' : 'homme'), p.weight && `${p.weight} kg`, p.hrMax && `FC max ${p.hrMax}`, p.hrRest && `FC repos ${p.hrRest}`].filter(Boolean).join(', '),
      p.injuries ? `Blessures / contraintes : ${p.injuries}` : '',
      p.notes ? `Souhaits : ${p.notes}` : '',
      `Allures de référence : ${S.paces.map((x) => `${x.label} ${x.pace}/km`).join(' ; ')}.`,
      S.hr ? `Zones FC : ${S.hr.zones.map((z) => `${z.z} ${z.lo}-${z.hi}`).join(', ')}.` : ''
    ].filter(Boolean).join('\n');
  },
  async createPlan(p, onProgress) {
    const base = Coach.build(p); const W = base.weeks.length;
    const block = W > 20 ? 5 : 6; const blocks = Math.ceil(W / block); const out = []; let meta = {};
    const ctx = AI.profileText(p, base);
    const skel = Coach.skeletonForAI(base);
    for (let b = 0; b < blocks; b++) {
      const from = b * block + 1, to = Math.min(W, from + block - 1);
      const prev = out.slice(-2).map((w) => `S${w.n} : ` + (w.sessions || []).map((s) => `${Coach.DAYS_S[s.d] || '?'} ${s.type} ${s.km ?? ''}km « ${s.title} »`).join(' | ')).join('\n');
      const prompt = `PROFIL DU COUREUR\n${ctx}\n\nTRAME DU PROGRAMME (${W} semaines, dates de début des semaines = lundis, volumes indicatifs calculés par le coach intégré — tu peux t'en écarter si c'est justifié par le profil) :\n${skel}\n\n${prev ? `SEMAINES DÉJÀ RÉDIGÉES (pour la continuité) :\n${prev}\n\n` : ''}TÂCHE : rédige en détail les semaines ${from} à ${to}${to === W && base.goal.raceDate ? ` (la dernière semaine contient la course le ${base.goal.raceDate}, type "course")` : ''}.
Règles : uniquement les jours possibles ; ${p.sessions} séances de course par semaine (moins en semaine de course) ; sortie longue le ${Coach.DAYS[p.longDay]} ; séances de renforcement éventuelles en plus (type "renfo", km 0) ; détails concrets (échauffement, corps de séance avec allures en min/km, récupérations, retour au calme) en 1 à 3 phrases ; km et min réalistes.
Format JSON exact :
{${b === 0 ? '"title":"titre court de la prépa","summary":{"notes":"le mot du coach : stratégie globale en 2-4 phrases","warnings":["points de vigilance"],"tips":["4 à 6 conseils personnalisés"]},' : ''}"weeks":[{"n":${from},"phase":"…","focus":"objectif de la semaine en une phrase","sessions":[{"d":0,"type":"ef|recup|long|vma|seuil|specifique|cotes|fartlek|test|course|renfo|cross","title":"…","details":"…","km":8,"min":48,"pace":"5:40–6:10/km","zone":"Z2"}]}]}
"d" = jour de la semaine (0 = lundi … 6 = dimanche).`;
      onProgress && onProgress(b / blocks, `L’IA rédige les semaines ${from} à ${to} sur ${W}…`);
      let txt, json, attempt = 0;
      for (; ;) {
        try {
          txt = await AI.call({ system: AI.SYSTEM, prompt, maxTokens: 9000, onText: (t) => onProgress && onProgress((b + Math.min(0.95, t.length / (block * 2600))) / blocks, `L’IA rédige les semaines ${from} à ${to} sur ${W}…`) });
          json = AI.json(txt); break;
        } catch (e) { if (++attempt >= 2 || /Clé API|Crédit|Modèle/.test(e.message)) throw e; await sleep(1500); }
      }
      if (b === 0) meta = { title: json.title, summary: json.summary };
      (json.weeks || []).forEach((w) => out.push(w));
    }
    onProgress && onProgress(1, 'Finalisation…');
    const np = Coach.fromAI(Object.assign({}, meta, { weeks: out }), base);
    np.profile = p;
    return np;
  },
  async adjust(request) {
    const from = currentWeekIdx();
    const S = plan.summary || {};
    const prompt = `PRÉPA EN COURS : ${plan.title}${plan.goal && plan.goal.raceDate ? `, course le ${plan.goal.raceDate}` : ''}. Aujourd'hui : ${D.today()} (${Coach.DAYS[D.dow(D.today())]}).
${plan.profile && plan.profile.goal ? AI.profileText(plan.profile, plan) : ''}
${S.paces && S.paces.length ? '' : ''}
PROGRAMME À PARTIR DE LA SEMAINE EN COURS :
${Coach.compactForAI(plan, from)}

DEMANDE DU COUREUR : « ${request} »

Réponds en JSON : {"message":"ta réponse au coureur (2-5 phrases, tutoiement)","weeks":[ ...uniquement les semaines à modifier, au complet... ]}
Chaque semaine modifiée : {"n":numéro,"phase":"…","focus":"…","sessions":[{"d":0-6,"type":"ef|recup|long|vma|seuil|specifique|cotes|fartlek|test|course|renfo|cross","title":"…","details":"…","km":n,"min":n,"pace":"…","zone":"…"}]}. Si aucune modification n'est nécessaire (simple question), renvoie "weeks":[]. Ne modifie pas les séances déjà marquées FAIT.`;
    const txt = await AI.call({ system: AI.SYSTEM, prompt, maxTokens: 9000, onText: (t) => { const b = $('#aiProg i'); if (b) b.style.width = Math.min(95, t.length / 60) + '%'; } });
    const json = AI.json(txt); let changed = 0;
    (json.weeks || []).forEach((aw) => {
      const w = plan.weeks.find((x) => x.n === +aw.n); if (!w || !Array.isArray(aw.sessions)) return;
      const tmp = Coach.fromAI({ weeks: [Object.assign({}, aw, { n: w.n })] }, { weeks: [Object.assign({}, w, { sessions: [] })], summary: plan.summary, goal: plan.goal });
      const keep = w.sessions.filter((s) => s.done);
      w.sessions = [...keep, ...tmp.weeks[0].sessions.filter((s) => !keep.some((k) => k.date === s.date && k.type === s.type))].sort((a, b) => a.date.localeCompare(b.date));
      if (aw.phase) w.phase = aw.phase; if (aw.focus) w.focus = aw.focus;
      w.km = Math.round(w.sessions.reduce((a, s) => a + (s.km || 0), 0) * 10) / 10; changed++;
    });
    if (changed) savePlan();
    return { message: String(json.message || (changed ? 'Programme ajusté.' : 'C’est noté.')), changed };
  }
};
async function askCoach() {
  const q = $('#aiAsk').value.trim(); if (!q) return toast('Écris ta demande au coach');
  if (!AI.settings().aiKey) { showTab('settings'); return toast('Ajoute ta clé API Anthropic pour utiliser le coach IA', 4000); }
  $('#aiSend').disabled = true; $('#aiProg').hidden = false; $('#aiSend').textContent = '⏳ Le coach réfléchit…';
  try {
    const r = await AI.adjust(q);
    Store.set('aiLast', { planId: plan.id, text: `🗨️ ${q}\n\n${r.message}${r.changed ? `\n\n✅ ${r.changed} semaine${r.changed > 1 ? 's' : ''} modifiée${r.changed > 1 ? 's' : ''}.` : ''}` });
    renderPlan();
  } catch (e) { toast(e.message, 5000); $('#aiSend').disabled = false; $('#aiProg').hidden = true; $('#aiSend').textContent = 'Envoyer au coach IA'; }
}

/* ================= Strava ================= */
const Strava = {
  cfg: () => Store.get('strava', {}),
  save: (c) => Store.set('strava', c),
  redirect: () => location.origin + location.pathname,
  connected: () => !!Strava.cfg().refresh,
  authorize() {
    const c = Strava.cfg(); if (!c.clientId) return toast('Indique ton Client ID Strava');
    const state = Math.random().toString(36).slice(2); c.state = state; Strava.save(c);
    location.href = `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(c.clientId)}&response_type=code&redirect_uri=${encodeURIComponent(Strava.redirect())}&approval_prompt=auto&scope=read,activity:read_all,activity:write&state=${state}`;
  },
  async token(params) {
    const c = Strava.cfg();
    const body = new URLSearchParams(Object.assign({ client_id: c.clientId, client_secret: c.clientSecret }, params));
    let r; try { r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', body }); } catch (e) { throw new Error('Strava refuse la connexion depuis le navigateur (réseau/CORS)'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Strava : ' + (j.message || r.status));
    Object.assign(c, { access: j.access_token, refresh: j.refresh_token, expires: j.expires_at }); if (j.athlete) c.athlete = { id: j.athlete.id, name: `${j.athlete.firstname || ''} ${j.athlete.lastname || ''}`.trim() };
    Strava.save(c); return c;
  },
  async access() {
    let c = Strava.cfg(); if (!c.refresh) throw new Error('Connecte-toi d’abord à Strava (Réglages)');
    if (!c.access || (c.expires || 0) * 1000 < Date.now() + 60000) c = await Strava.token({ grant_type: 'refresh_token', refresh_token: c.refresh });
    return c.access;
  },
  async api(path, opt = {}) {
    const tok = await Strava.access();
    const r = await fetch('https://www.strava.com/api/v3' + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + tok }, opt.headers || {}) }));
    if (r.status === 401) throw new Error('Strava : autorisation refusée, reconnecte-toi');
    if (r.status === 429) throw new Error('Strava : limite de requêtes atteinte, réessaie dans 15 min');
    if (!r.ok) throw new Error('Strava : erreur ' + r.status);
    return opt.raw ? r : r.json();
  },
  async handleCallback() {
    const q = new URLSearchParams(location.search); if (!q.get('code') && !q.get('error')) return;
    history.replaceState(null, '', location.pathname + location.hash);
    if (q.get('error')) return toast('Connexion Strava annulée');
    const c = Strava.cfg();
    if (!c.clientId || (c.state && q.get('state') !== c.state)) {
      openModal('Code Strava reçu', `<p class="hint" style="margin-top:12px">Ce navigateur n'a pas tes identifiants Strava (Safari et l'appli de l'écran d'accueil ont des données séparées). Copie ce code et colle-le dans Réglages → Strava → « Coller un code », dans l'appli où tu as saisi ton Client ID.</p><input class="field" readonly value="${esc('C:' + q.get('code'))}"><div style="height:8px"></div><button class="btn w" id="cpC">Copier le code</button>`, '');
      $('#cpC').onclick = () => copyText('C:' + q.get('code'), 'Code copié'); return;
    }
    try { busy(1); await Strava.token({ code: q.get('code'), grant_type: 'authorization_code' }); toast('Connecté à Strava ✅'); showTab('settings'); renderStrava(); Strava.offerLink(); }
    catch (e) { toast(e.message, 6000); } finally { busy(0); }
  },
  offerLink() {
    const c = Strava.cfg();
    openModal('Strava connecté ✅', `<p style="margin-top:12px">Bonjour ${esc((c.athlete && c.athlete.name) || '')} ! Foulée peut maintenant synchroniser tes activités avec ta prépa et envoyer tes courses.</p><p class="hint">Si tu utilises aussi Foulée depuis l'écran d'accueil (données séparées de Safari), copie ce code de liaison et colle-le dans Réglages → Strava de l'autre côté :</p><input class="field" readonly value="${esc('L:' + btoa(JSON.stringify({ i: c.clientId, s: c.clientSecret, r: c.refresh })))}"><div style="height:8px"></div><button class="btn w" id="cpL">Copier le code de liaison</button>`, '');
    $('#cpL').onclick = () => copyText('L:' + btoa(JSON.stringify({ i: c.clientId, s: c.clientSecret, r: c.refresh })), 'Code de liaison copié');
  },
  async paste(code) {
    code = code.trim(); const c = Strava.cfg();
    try {
      busy(1);
      if (code.startsWith('L:')) { const j = JSON.parse(atob(code.slice(2))); Object.assign(c, { clientId: j.i, clientSecret: j.s, refresh: j.r, access: null, expires: 0 }); Strava.save(c); await Strava.access(); }
      else if (code.startsWith('C:')) { if (!c.clientId || !c.clientSecret) throw new Error('Saisis d’abord ton Client ID et ton Client Secret'); await Strava.token({ code: code.slice(2), grant_type: 'authorization_code' }); }
      else throw new Error('Code non reconnu');
      toast('Connecté à Strava ✅'); renderStrava();
    } catch (e) { toast(e.message, 5000); } finally { busy(0); }
  },
  async sync() {
    if (!plan) return toast('Crée ou importe d’abord une prépa');
    if (!Strava.connected()) { showTab('settings'); return toast('Connecte-toi à Strava dans Réglages (ou importe un GPX)', 4500); }
    try {
      busy(1);
      const after = Math.floor(D.parse(plan.weeks[0].start) / 1000) - 86400;
      const acts = await Strava.api(`/athlete/activities?after=${after}&per_page=100`);
      let n = 0;
      acts.filter((a) => /Run/.test(a.sport_type || a.type)).forEach((a) => {
        const date = (a.start_date_local || '').slice(0, 10);
        const already = plan.weeks.flatMap((w) => w.sessions).some((s) => s.extId === a.id);
        if (!already && markPlanDone(date, a.distance / 1000, a.moving_time / 60, 'strava', a.id)) n++;
      });
      toast(n ? `${n} séance${n > 1 ? 's' : ''} cochée${n > 1 ? 's' : ''} grâce à Strava ✅` : 'Rien de nouveau sur Strava', 4000);
    } catch (e) { toast(e.message, 5000); } finally { busy(0); }
  },
  async sendRun(run) {
    if (!Strava.connected()) {
      saveFile(new Blob([runGPX(run)], { type: 'application/gpx+xml' }), `course-${run.date}.gpx`);
      openModal('Envoyer sur Strava', `<p style="margin-top:12px">Le fichier GPX horodaté de ta course est prêt. Téléverse-le sur Strava : <b>strava.com → + → Téléverser une activité → Fichier</b>.</p><a class="btn w" style="display:block;text-decoration:none;margin-top:10px" href="https://www.strava.com/upload/select" target="_blank" rel="noopener">Ouvrir la page d'import Strava ↗</a><p class="hint">Astuce : connecte Strava dans Réglages pour l'envoi direct.</p>`, ''); return;
    }
    try {
      busy(1); toast('Envoi vers Strava…');
      const fd = new FormData(); fd.append('file', new Blob([runGPX(run)], { type: 'application/gpx+xml' }), `foulee-${run.id}.gpx`);
      fd.append('data_type', 'gpx'); fd.append('name', run.name); fd.append('sport_type', 'Run'); fd.append('external_id', `foulee-${run.id}`);
      let up = await Strava.api('/uploads', { method: 'POST', body: fd });
      for (let i = 0; i < 12 && !up.activity_id && !up.error; i++) { await sleep(2000); up = await Strava.api('/uploads/' + (up.id_str || up.id)); }
      if (up.error) throw new Error('Strava : ' + up.error);
      toast(up.activity_id ? 'Course publiée sur Strava 🟧' : 'Envoyée — Strava la traite encore', 4000);
    } catch (e) { toast(e.message, 5000); } finally { busy(0); }
  },
  async routes() {
    try {
      busy(1); const me = await Strava.api('/athlete'); const list = await Strava.api(`/athletes/${me.id}/routes?per_page=50`);
      openModal('Mes itinéraires Strava', list.length ? list.map((r) => `<div class="route"><div class="info"><b>${esc(r.name)}</b><small>${km(r.distance)} km · D+ ${Math.round(r.elevation_gain || 0)} m</small></div><button data-id="${r.id_str || r.id}">Ouvrir</button></div>`).join('') : '<p class="hint">Aucun itinéraire enregistré sur Strava.</p>', '');
      $$('#mBody [data-id]').forEach((b) => (b.onclick = async () => {
        try { busy(1); const r = await Strava.api(`/routes/${b.dataset.id}/export_gpx`, { raw: true }); const t = await r.text(); const tr = parseTrack('r.gpx', t); if (tr.c.length < 2) throw new Error('Itinéraire vide'); closeModal(); showTab('draw'); loadTrack(tr.c, b.closest('.route').querySelector('b').textContent); }
        catch (e) { toast(e.message, 5000); } finally { busy(0); }
      }));
    } catch (e) { toast(e.message, 5000); } finally { busy(0); }
  }
};
function renderStrava() {
  const c = Strava.cfg(), box = $('#stravaBox'); const host = location.host || '(ton site)';
  if (Strava.connected()) {
    box.innerHTML = `<div class="note">✅ Connecté${c.athlete && c.athlete.name ? ' : ' + esc(c.athlete.name) : ''}</div><div class="grid"><button id="stSync">🔄 Synchroniser ma prépa</button><button id="stRoutes">🗺️ Mes itinéraires</button><button id="stLink">🔗 Code de liaison</button><button id="stOut" class="danger">Se déconnecter</button></div>`;
    $('#stSync').onclick = () => Strava.sync(); $('#stRoutes').onclick = () => Strava.routes(); $('#stLink').onclick = () => Strava.offerLink();
    $('#stOut').onclick = () => { Strava.save({ clientId: c.clientId, clientSecret: c.clientSecret }); renderStrava(); };
    return;
  }
  box.innerHTML = `<p class="hint"><b style="color:var(--txt)">Connexion directe (option avancée)</b> : coche automatiquement tes séances, envoie tes courses et importe tes itinéraires Strava. Strava exige pour cela un abonnement et la création de ta propre « application API » :</p>
   <p class="hint">1. Sur strava.com/settings/api, crée une application. Dans « Authorization Callback Domain », mets <b style="color:var(--txt)">${esc(host)}</b>.<br>2. Copie ici le Client ID et le Client Secret, puis touche « Se connecter ».</p>
   <div class="row2"><label class="f" style="margin:0">Client ID<input id="stId" class="field" inputmode="numeric" value="${esc(c.clientId || '')}"></label><label class="f" style="margin:0">Client Secret<input id="stSecret" class="field" type="password" value="${esc(c.clientSecret || '')}"></label></div>
   <div style="height:8px"></div><button class="btn w strava" id="stGo">Se connecter à Strava</button>
   <div class="row2" style="grid-template-columns:1fr auto"><input id="stCode" class="field" placeholder="Coller un code (C:… ou L:…)" style="margin:0"><button class="btn" id="stPaste">OK</button></div>`;
  const keep = () => { const n = Strava.cfg(); n.clientId = $('#stId').value.trim(); n.clientSecret = $('#stSecret').value.trim(); Strava.save(n); };
  $('#stGo').onclick = () => { keep(); if (!$('#stId').value.trim() || !$('#stSecret').value.trim()) return toast('Client ID et Client Secret requis'); Strava.authorize(); };
  $('#stPaste').onclick = () => { keep(); Strava.paste($('#stCode').value); };
}

/* ================= Réglages & sauvegarde ================= */
function loadSettings() { const s = Store.get('settings', {}); $('#aiKey').value = s.aiKey || ''; $('#aiModel').value = s.aiModel || ''; }
$('#bAiSave').onclick = () => { const s = Store.get('settings', {}); s.aiKey = $('#aiKey').value.trim(); s.aiModel = $('#aiModel').value.trim(); Store.set('settings', s); toast(s.aiKey ? 'Clé enregistrée sur cet appareil ✅' : 'Clé supprimée'); };
$('#bAiTest').onclick = async () => {
  $('#bAiSave').click(); busy(1);
  try { const t = await AI.call({ system: 'Réponds en une phrase courte, en français.', prompt: 'Dis bonjour à un coureur et confirme que tu es prêt à créer sa prépa.', maxTokens: 80 }); toast('✅ ' + t.trim().slice(0, 140), 5000); }
  catch (e) { toast('❌ ' + e.message, 6000); } finally { busy(0); }
};
$('#bBackup').onclick = () => {
  const data = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('foulee.') && k !== 'foulee.settings' && k !== 'foulee.strava') data[k] = localStorage.getItem(k); } } catch (e) { }
  saveFile(new Blob([JSON.stringify({ app: 'foulee', v: 2, date: new Date().toISOString(), data })], { type: 'application/json' }), `foulee-sauvegarde-${D.today()}.json`);
  toast('Sauvegarde créée (sans tes clés API, par sécurité)');
};
$('#restore').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return; e.target.value = '';
  try { const j = JSON.parse(await f.text()); if (j.app !== 'foulee') throw new Error(); Object.entries(j.data).forEach(([k, v]) => localStorage.setItem(k, v)); toast('Données restaurées ✅'); setTimeout(() => location.reload(), 800); }
  catch (err) { toast('Fichier de sauvegarde invalide'); }
};

/* ================= Interface ================= */
function showTab(name) {
  $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + name));
  $('#panel').classList.remove('collapsed'); $('#panel').classList.toggle('tall', name === 'plan' || name === 'settings'); $('#body').scrollTop = 0;
  const btn = $(`#tabs button[data-tab="${name}"]`); btn && btn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  if (name === 'stats') drawChart(); if (name === 'plan') renderPlan(); if (name === 'live') renderRuns(); if (name === 'settings') { loadSettings(); renderStrava(); }
}
$$('#tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
$('#grab').onclick = () => $('#panel').classList.toggle('collapsed');
const intro = $('#intro');
const closeIntro = () => { intro.classList.add('hide'); try { localStorage.setItem('foulee.intro', '2'); } catch (e) { } setTimeout(() => intro.remove(), 450); };
$('#go').onclick = closeIntro;
try { if (localStorage.getItem('foulee.intro') === '2' || location.hash.includes('r=') || location.search.includes('code=')) intro.remove(); } catch (e) { }

renderList(); render(); renderPlan(); renderRuns();
fromHash(); locate(true);
Strava.handleCallback();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
window.Foulee = { generateLoop, trimSpurs, get plan() { return plan; }, set plan(p) { plan = p; savePlan(); renderPlan(); }, get total() { return total; }, get segs() { return segs; }, showTab, markPlanDone };
