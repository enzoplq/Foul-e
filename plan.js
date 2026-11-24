/* Foulée — plan.js : coach d'entraînement intégré
 *  Coach.build(profil)            -> programme complet (règles d'entraînement éprouvées)
 *  Coach.toWorkbook(plan)         -> modèle Excel pour XLSXLite.write
 *  Coach.fromSheets(feuilles,opt) -> import d'un programme Excel/CSV existant
 *  Coach.fromAI(json, squelette)  -> programme à partir d'une réponse de l'IA
 */
(function (root) {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const D = {
    parse: (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); },
    fmt: (t) => new Date(t).toISOString().slice(0, 10),
    add: (s, n) => D.fmt(D.parse(s) + n * 864e5),
    dow: (s) => (new Date(D.parse(s)).getUTCDay() + 6) % 7, // 0 = lundi
    monday: (s) => D.add(s, -D.dow(s)),
    diff: (a, b) => Math.round((D.parse(b) - D.parse(a)) / 864e5),
    today: () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; },
    toDate: (s) => new Date(D.parse(s)),
    fr: (s, long) => { const d = new Date(D.parse(s)); return d.toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  };
  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const DAYS_S = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const TYPES = {
    ef: { label: 'Endurance', fill: 'E7F7E7', hex: '#7ee07e' },
    recup: { label: 'Récupération', fill: 'F0F9E8', hex: '#a3e635' },
    long: { label: 'Sortie longue', fill: 'DBEAFE', hex: '#60a5fa' },
    vma: { label: 'VMA', fill: 'FDE2E4', hex: '#ff5c7a' },
    seuil: { label: 'Seuil', fill: 'FFEDD5', hex: '#fb923c' },
    specifique: { label: 'Allure spécifique', fill: 'FEF3C7', hex: '#facc15' },
    cotes: { label: 'Côtes', fill: 'F3E8FF', hex: '#c084fc' },
    fartlek: { label: 'Fartlek', fill: 'FCE7F3', hex: '#f472b6' },
    test: { label: 'Test', fill: 'E0F2FE', hex: '#38bdf8' },
    course: { label: 'Course', fill: 'D9F99D', hex: '#c6ff3d' },
    renfo: { label: 'Renforcement', fill: 'F3F4F6', hex: '#94a3b8' },
    cross: { label: 'Activité croisée', fill: 'CFFAFE', hex: '#22d3ee' },
    repos: { label: 'Repos', fill: 'FFFFFF', hex: '#475569' }
  };
  const LEVELS = ['debutant', 'inter', 'confirme', 'expert'];
  const LEVEL_LABEL = ['Débutant', 'Intermédiaire', 'Confirmé', 'Expert'];
  const GOALS = {
    '5k': { km: 5, label: '5 km', peak: [25, 35, 50, 65], long: [10, 12, 14, 16], taper: 1 },
    '10k': { km: 10, label: '10 km', peak: [30, 40, 55, 75], long: [13, 15, 17, 19], taper: 1 },
    semi: { km: 21.0975, label: 'Semi-marathon', peak: [35, 45, 60, 80], long: [18, 20, 22, 24], taper: 2 },
    marathon: { km: 42.195, label: 'Marathon', peak: [45, 60, 75, 95], long: [28, 30, 32, 34], taper: 3 },
    trail: { km: 30, label: 'Trail', peak: [35, 50, 65, 85], long: [20, 25, 30, 35], taper: 2 },
    custom: { km: 15, label: 'Course', peak: [30, 42, 58, 75], long: [15, 18, 20, 22], taper: 2 },
    forme: { km: 0, label: 'Remise en forme', peak: [15, 25, 35, 45], long: [8, 10, 12, 14], taper: 0 }
  };
  // Fraction de VMA tenable selon la durée d'effort (minutes)
  const PCT_T = [[3, 1.03], [6, 1.0], [10, 0.97], [15, 0.945], [20, 0.93], [30, 0.905], [40, 0.885], [50, 0.87], [60, 0.86], [75, 0.84], [90, 0.825], [120, 0.8], [150, 0.78], [180, 0.76], [210, 0.745], [240, 0.73], [300, 0.7], [420, 0.66], [600, 0.62]];
  function pctFor(min) {
    if (min <= PCT_T[0][0]) return PCT_T[0][1];
    for (let i = 1; i < PCT_T.length; i++) if (min <= PCT_T[i][0]) { const [a, pa] = PCT_T[i - 1], [b, pb] = PCT_T[i]; return pa + (pb - pa) * (min - a) / (b - a); }
    return PCT_T[PCT_T.length - 1][1];
  }
  const predict = (vma, km) => { let t = km / (vma * 0.85) * 60; for (let i = 0; i < 12; i++) t = km / (vma * pctFor(t)) * 60; return Math.round(t * 60); };
  const vmaFromRace = (km, sec) => (km / (sec / 3600)) / pctFor(sec / 60);
  const fmtPace = (s) => { s = Math.round(s); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  const fmtTime = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}h${pad(m)}'${pad(x)}` : `${m}'${pad(x)}`; };
  const parseTime = (v) => {
    if (v == null || v === '') return null; if (typeof v === 'number') return v;
    const s = String(v).trim().toLowerCase().replace(/\s/g, '');
    let m = s.match(/^(\d+)h(\d{1,2})?(?:[m':](\d{1,2}))?/); if (m) return (+m[1]) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
    m = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/); if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    m = s.match(/^(\d+)[:'m](\d{1,2})(?:"|s)?$/); if (m) return (+m[1]) * 60 + (+m[2]);
    m = s.match(/^(\d+)(?:min|')?$/); if (m) return (+m[1]) * 60;
    return null;
  };
  const r05 = (x) => Math.max(0, Math.round(x * 2) / 2);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const uid = () => Math.random().toString(36).slice(2, 10);

  function normalize(p) {
    const o = Object.assign({
      goal: 'semi', level: 'inter', sessions: 4, days: [1, 3, 5, 6], longDay: 6, weeklyKm: null, longestRun: null, weeks: 12,
      terrain: 'plat', strength: true, cross: false, sex: '', age: null, weight: null, hrMax: null, hrRest: null,
      targetTime: null, vma: null, refKm: null, refTime: null, raceDate: '', startDate: '', goalKm: null, goalDplus: 0,
      injuries: '', notes: '', raceName: '', priority: 'chrono', today: null
    }, p || {});
    ['sessions', 'longDay', 'weeklyKm', 'longestRun', 'weeks', 'age', 'weight', 'hrMax', 'hrRest', 'vma', 'refKm', 'goalKm', 'goalDplus'].forEach((k) => {
      if (o[k] === '' || o[k] == null) o[k] = null; else o[k] = +o[k]; if (o[k] != null && !isFinite(o[k])) o[k] = null;
    });
    o.targetTime = parseTime(o.targetTime); o.refTime = parseTime(o.refTime);
    if (!GOALS[o.goal]) o.goal = 'custom';
    o.li = Math.max(0, LEVELS.indexOf(o.level)); o.level = LEVELS[o.li];
    o.days = [...new Set((o.days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (o.days.length < 2) o.days = [1, 3, 6];
    o.sessions = clamp(o.sessions || 3, 2, 7); o.sessions = Math.min(o.sessions, o.days.length);
    if (o.longDay == null || !o.days.includes(o.longDay)) o.longDay = o.days.includes(6) ? 6 : o.days.includes(5) ? 5 : o.days[o.days.length - 1];
    o.weeks = clamp(Math.round(o.weeks || 12), 2, 52);
    o.weeklyKm = o.weeklyKm == null ? [10, 20, 30, 45][o.li] : Math.max(0, o.weeklyKm);
    o.longestRun = o.longestRun == null ? [6, 10, 14, 18][o.li] : Math.max(0, o.longestRun);
    o.today = o.today || D.today();
    return o;
  }

  function goalKmOf(p) { return p.goal === 'custom' || p.goal === 'trail' ? (p.goalKm || GOALS[p.goal].km) : GOALS[p.goal].km; }
  function goalDef(p) {
    const g = Object.assign({}, GOALS[p.goal]); const km = goalKmOf(p); g.km = km;
    if (p.goal === 'custom' || p.goal === 'trail') {
      const ref = km <= 7 ? '5k' : km <= 15 ? '10k' : km <= 30 ? 'semi' : 'marathon';
      const R = GOALS[ref]; const f = p.goal === 'trail' ? 1.1 : 1;
      g.peak = R.peak.map((x) => Math.round(x * f)); g.taper = R.taper; g.ref = ref;
      g.long = p.goal === 'trail' ? [0, 1, 2, 3].map((i) => Math.round(Math.min(km * (0.55 + i * 0.07), 40))) : R.long;
      if (km > 50) { g.peak = g.peak.map((x) => Math.round(x * 1.15)); g.taper = 2; }
      g.label = p.goal === 'trail' ? `Trail ${Math.round(km)} km${p.goalDplus ? ` · ${p.goalDplus} m D+` : ''}` : `Course de ${km} km`;
    } else g.ref = p.goal;
    if (p.raceName) g.label = p.raceName;
    return g;
  }

  function hrZones(p) {
    const max = p.hrMax || (p.age ? Math.round(208 - 0.7 * p.age) : null); if (!max) return null;
    const rest = p.hrRest;
    const Z = rest ? [[0.5, 0.6], [0.6, 0.72], [0.72, 0.82], [0.82, 0.9], [0.9, 1]] : [[0.6, 0.7], [0.7, 0.8], [0.8, 0.87], [0.87, 0.93], [0.93, 1]];
    const bpm = (f) => Math.round(rest ? rest + (max - rest) * f : max * f);
    const names = ['Récupération', 'Endurance fondamentale', 'Tempo / allure marathon', 'Seuil', 'VMA'];
    return { max, rest, method: rest ? 'Karvonen (FC de réserve)' : '% FC max', zones: Z.map((z, i) => ({ z: 'Z' + (i + 1), name: names[i], lo: bpm(z[0]), hi: bpm(z[1]) })) };
  }

  /* ---------- Séances ---------- */
  function workouts(ctx) {
    const { pc, li } = ctx;
    const efR = `${fmtPace(pc(0.72))}–${fmtPace(pc(0.65))}/km`;
    const WU = { txt: `Échauffement 20 min en endurance (${efR}) + 3 accélérations progressives`, km: 1200 / pc(0.68) + 0.3, min: 22 };
    const CD = { txt: 'Retour au calme 10 min très souple', km: 600 / pc(0.62), min: 10 };
    const jog = (sec) => sec / pc(0.6);
    const mk = (type, title, details, km, min, pace, zone, rpe) => ({ type, title, details, km: r05(km), min: Math.round(min), pace, zone, rpe });
    const reps = (type, title, n, distM, pct, recSec, zone, rpe, extra) => {
      const workKm = n * distM / 1000, recKm = (n - 1) * jog(recSec);
      const p = ctx.paceOverride && pct === 'rp' ? ctx.rp : pc(pct);
      const km = WU.km + workKm + recKm + CD.km, min = WU.min + workKm * p / 60 + (n - 1) * recSec / 60 + CD.min;
      const rec = recSec >= 60 ? `${Math.floor(recSec / 60)}'${recSec % 60 ? pad(recSec % 60) : ''}` : `${recSec}"`;
      return mk(type, title, `${WU.txt}. Puis ${n} × ${distM >= 1000 ? (distM / 1000).toString().replace('.', ',') + ' km' : distM + ' m'} à ${fmtPace(p)}/km, récupération ${rec} en trottinant.${extra ? ' ' + extra : ''} ${CD.txt}.`, km, min, `${fmtPace(p)}/km`, zone, rpe);
    };
    const timed = (type, title, n, secW, pct, secR, zone, rpe, intro) => {
      const p = pc(pct); const workKm = n * secW / p, recKm = (n - 1) * jog(secR);
      const km = WU.km + workKm + recKm + CD.km, min = WU.min + (n * secW + (n - 1) * secR) / 60 + CD.min;
      const f = (s) => s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ' ' + (s % 60) + ' s' : ''}` : `${s} s`;
      return mk(type, title, `${WU.txt}. ${intro || ''}${n} × ${f(secW)} à ${fmtPace(p)}/km, récupération ${f(secR)} en trottinant. ${CD.txt}.`, km, min, `${fmtPace(p)}/km`, zone, rpe);
    };
    const rpKm = ctx.rp;
    const spec = (k) => {
      const ref = ctx.ref; const p = rpKm;
      const blocks = (n, distM, recSec, extra) => {
        const workKm = n * distM / 1000, recKm = (n - 1) * jog(recSec);
        return mk('specifique', `Allure ${ctx.raceShort} — ${n} × ${distM >= 1000 ? (distM / 1000).toString().replace('.', ',') + ' km' : distM + ' m'}`,
          `${WU.txt}. Puis ${n} × ${distM >= 1000 ? (distM / 1000).toString().replace('.', ',') + ' km' : distM + ' m'} à ton allure objectif (${fmtPace(p)}/km), récupération ${Math.round(recSec / 60)} min en trottinant. Cherche la régularité, pas la vitesse.${extra ? ' ' + extra : ''} ${CD.txt}.`,
          WU.km + workKm + recKm + CD.km, WU.min + workKm * p / 60 + (n - 1) * recSec / 60 + CD.min, `${fmtPace(p)}/km`, 'Z3–Z4', 7);
      };
      if (ctx.goal === 'trail') {
        const n = 5 + Math.round(k * 3) + li;
        return mk('cotes', `Côtes longues — ${n} × 3 min`, `${WU.txt}. Puis ${n} × 3 min en côte (6–10 %) à effort « seuil » (souffle court mais contrôlé), descente technique en trottinant pour récupérer. Travaille la relance en haut de côte. ${CD.txt}.`, WU.km + n * 0.9 * 2 + CD.km, WU.min + n * 6 + CD.min, 'effort seuil', 'Z4', 7);
      }
      if (ref === '5k') { const n = [4, 5, 6, 6][li] + Math.round(k * 2); return blocks(n, li ? 800 : 600, 120); }
      if (ref === '10k') return k < 0.5 ? blocks([4, 5, 6, 6][li] + Math.round(k * 2), 1000, 90) : blocks([2, 3, 3, 4][li], 2000, 120);
      if (ref === 'semi') return k < 0.34 ? blocks(3, li ? 2000 : 1500, 120) : k < 0.67 ? blocks(3, li ? 3000 : 2000, 150) : blocks(2, li ? 5000 : 3000, 180);
      return k < 0.34 ? blocks(2, li ? 4000 : 3000, 180) : k < 0.67 ? blocks(3, li ? 5000 : 3000, 180) : blocks(2, li > 1 ? 8000 : 6000, 180);
    };
    const W = {
      vma_courte: (k) => { const n = [6, 8, 10, 12][li] + Math.round(k * 2); const p = pc(1.02);
        return mk('vma', `VMA courte — 2 × ${n} × 30/30`, `${WU.txt}. Puis 2 séries de ${n} × (30 s vite à ${fmtPace(p)}/km – 30 s de trot), 3 min de récupération entre les séries. ${CD.txt}.`,
          WU.km + 2 * n * 30 / p + 2 * n * jog(30) + jog(180) + CD.km, WU.min + 2 * n + 3 + CD.min, `${fmtPace(p)}/km`, 'Z5', 8); },
      vma_longue: (k) => li === 0 ? reps('vma', `VMA longue — ${6 + Math.round(k * 2)} × 400 m`, 6 + Math.round(k * 2), 400, 0.96, 90, 'Z5', 8)
        : li === 1 ? (k < 0.5 ? reps('vma', `VMA longue — ${6 + Math.round(k * 4)} × 500 m`, 6 + Math.round(k * 4), 500, 0.96, 90, 'Z5', 8) : reps('vma', `VMA longue — 5 × 800 m`, 5, 800, 0.95, 120, 'Z5', 8))
          : reps('vma', `VMA longue — ${5 + Math.round(k * 2) + (li - 2)} × 1000 m`, 5 + Math.round(k * 2) + (li - 2), 1000, 0.95, li === 3 ? 105 : 120, 'Z5', 9),
      seuil: (k) => { const cfg = [[3, 6 + Math.round(k * 2)], [3, 8 + Math.round(k * 2)], [k < 0.5 ? 2 : 3, 12], [k < 0.5 ? 2 : 3, 15]][li];
        return timed('seuil', `Seuil — ${cfg[0]} × ${cfg[1]} min`, cfg[0], cfg[1] * 60, 0.87, 120, 'Z4', 7, 'Puis '); },
      seuil_court: (k) => timed('seuil', `Seuil court — ${4 + Math.round(k)} × ${[4, 5, 6, 6][li]} min`, 4 + Math.round(k), [4, 5, 6, 6][li] * 60, 0.86, 90, 'Z4', 6, 'Puis '),
      fartlek: (k) => { const n = 6 + Math.round(k * 4); const p = pc(0.9);
        return mk('fartlek', `Fartlek — ${n} × 1 min vite / 1 min lent`, `Footing de 15 min en endurance, puis ${n} × (1 min à ~${fmtPace(p)}/km – 1 min lent), puis 10 min souple. Séance ludique : varie les terrains.`,
          15 * 60 / pc(0.68) + n * 60 / p + n * jog(60) + 600 / pc(0.65), 25 + 2 * n, `${fmtPace(p)}/km`, 'Z2→Z4', 6); },
      cotes: (k) => { const n = [6, 8, 10, 12][li] + Math.round(k * 2);
        return mk('cotes', `Côtes — ${n} × 45 s`, `${WU.txt}. Puis ${n} × 45 s en côte (5–8 %) avec une foulée dynamique et des bras actifs, récupération en redescendant au trot. ${CD.txt}.`,
          WU.km + n * 0.35 * 2 + CD.km, WU.min + n * 2 + CD.min, 'effort soutenu', 'Z4–Z5', 7); },
      specifique: spec,
      rappel: () => { const ref = ctx.goal === 'trail' ? 'trail' : ctx.ref; const p = rpKm;
        if (ref === 'trail') return mk('cotes', 'Rappel — 6 côtes courtes', `Footing 30 min avec 6 × 30 s en côte, sans forcer. On garde du peps sans se fatiguer.`, 30 * 60 / pc(0.68) + 1, 36, 'facile + côtes', 'Z2/Z4', 5);
        const cfg = { '5k': [4, 600], '10k': [4, 1000], semi: [2, 2000], marathon: [2, 3000] }[ref] || [3, 1000];
        const km = WU.km + cfg[0] * cfg[1] / 1000 + (cfg[0] - 1) * jog(120) + CD.km;
        return mk('specifique', `Rappel d'allure — ${cfg[0]} × ${cfg[1] >= 1000 ? cfg[1] / 1000 + ' km' : cfg[1] + ' m'}`, `${WU.txt}. Puis ${cfg[0]} × ${cfg[1] >= 1000 ? cfg[1] / 1000 + ' km' : cfg[1] + ' m'} à allure objectif (${fmtPace(p)}/km), récupération 2 min. Volume réduit : tu dois finir avec l'envie d'en faire plus. ${CD.txt}.`, km, WU.min + cfg[0] * cfg[1] / 1000 * p / 60 + (cfg[0] - 1) * 2 + CD.min, `${fmtPace(p)}/km`, 'Z3–Z4', 6); },
      test: () => mk('test', 'Test VMA (demi-Cooper)', `${WU.txt}. Puis cours 6 minutes le plus loin possible sur terrain plat (idéalement une piste). VMA (km/h) = distance en mètres ÷ 100. Exemple : 1 450 m → VMA 14,5. Mets ensuite ta VMA à jour dans ton profil pour recalculer toutes les allures. ${CD.txt}.`, WU.km + ctx.vma / 10 + CD.km, WU.min + 6 + CD.min, 'à fond', 'Z5', 10)
    };
    return { W, mk, efR, WU, CD };
  }

  /* ---------- Placement des jours ---------- */
  const circ = (a, b) => { const d = Math.abs(a - b) % 7; return Math.min(d, 7 - d); };
  function placeDays(avail, n, longDay) {
    const chosen = [longDay]; const cand = avail.filter((d) => d !== longDay);
    while (chosen.length < n && cand.length) {
      let best = -1, bs = -1;
      cand.forEach((d, i) => { const s = Math.min(...chosen.map((c) => circ(c, d))); if (s > bs) { bs = s; best = i; } });
      chosen.push(cand.splice(best, 1)[0]);
    }
    return chosen.sort((a, b) => a - b);
  }
  function pickQuality(runDays, longDay, q) {
    const out = []; const cand = runDays.filter((d) => d !== longDay);
    for (let j = 0; j < q && cand.length; j++) {
      let best = -1, bs = -1;
      cand.forEach((d, i) => {
        const others = [longDay, ...out];
        let s = Math.min(...others.map((o) => circ(o, d)));
        if (d === (longDay + 6) % 7) s -= 0.5; // éviter la veille de la sortie longue
        if (s > bs) { bs = s; best = i; }
      });
      out.push(cand.splice(best, 1)[0]);
    }
    return out;
  }

  /* ---------- Construction du programme ---------- */
  function build(profile) {
    const p = normalize(profile); const g = goalDef(p); const li = p.li; const warnings = [];
    const gkm = g.km; const effortKm = gkm + (p.goal === 'trail' ? (p.goalDplus || 0) / 100 : 0);
    // VMA
    let vma, vmaSource;
    if (p.vma && p.vma > 6 && p.vma < 30) { vma = p.vma; vmaSource = 'saisie'; }
    else if (p.refKm && p.refTime) { vma = vmaFromRace(p.refKm, p.refTime); vmaSource = `course de référence (${p.refKm} km en ${fmtTime(p.refTime)})`; }
    else if (p.targetTime && effortKm) { vma = vmaFromRace(effortKm, p.targetTime) * 1.02; vmaSource = 'déduite de ton objectif'; }
    else { vma = [11.5, 13.5, 15.5, 17.5][li]; vmaSource = 'estimée selon ton niveau'; }
    vma = Math.round(vma * 10) / 10;
    const pc = (pct) => 3600 / (vma * pct);
    const predicted = effortKm ? predict(vma, effortKm) : null;
    let target = p.targetTime || null;
    if (target && predicted) {
      if (target < predicted * 0.88) warnings.push(`Ton objectif (${fmtTime(target)}) est très ambitieux par rapport à ton niveau estimé (${fmtTime(predicted)}). Envisage un objectif intermédiaire.`);
      else if (target < predicted * 0.95) warnings.push(`Objectif ambitieux : ton niveau actuel laisse prévoir environ ${fmtTime(predicted)}. La prépa doit te faire progresser d'environ ${Math.round((1 - target / predicted) * 100)} %.`);
    }
    if (!target && predicted) target = p.priority === 'finir' ? Math.round(predicted * 1.05) : predicted;
    const rp = target && gkm ? target / gkm : pc(0.85);
    // Dates
    let W = p.weeks, start, raceDate = p.raceDate || '';
    const thisMonday = D.monday(p.today);
    if (raceDate) {
      const maxW = Math.floor(D.diff(thisMonday, D.monday(raceDate)) / 7) + 1;
      if (maxW < 1) { warnings.push('La date de course est déjà passée : la prépa démarre cette semaine.'); raceDate = ''; }
      else if (W > maxW) { warnings.push(`Il reste ${maxW} semaine${maxW > 1 ? 's' : ''} avant la course : la durée a été ajustée.`); W = maxW; }
    }
    if (raceDate) start = D.add(D.monday(raceDate), -(W - 1) * 7);
    else { start = p.startDate ? D.monday(p.startDate) : (D.dow(p.today) === 0 ? p.today : D.add(thisMonday, 7)); raceDate = p.goal === 'forme' ? '' : D.add(start, (W - 1) * 7 + 6); }
    const raceDow = raceDate ? D.dow(raceDate) : 6;
    const minWeeks = { '5k': [6, 4, 4, 4], '10k': [8, 6, 5, 4], semi: [10, 8, 6, 6], marathon: [16, 12, 10, 10] }[g.ref] || [6, 6, 6, 6];
    if (p.goal !== 'forme' && W < minWeeks[li]) warnings.push(`${W} semaines, c'est court pour cet objectif à ton niveau (idéalement ${minWeeks[li]} semaines ou plus). Le programme reste prudent.`);
    if (p.injuries) warnings.push('Tu as signalé des blessures ou contraintes : la progression est volontairement plus douce. En cas de douleur, arrête et consulte un professionnel de santé.');
    // Volumes
    const injury = !!(p.injuries && p.injuries.trim());
    const taper = p.goal === 'forme' ? 0 : Math.min(g.taper, W >= 10 ? g.taper : 1, W - 1);
    const buildW = W - taper;
    let peak = g.peak[li]; peak = Math.min(peak, p.sessions * [9, 11, 13, 15][li] * 1.25);
    if (p.weeklyKm > peak) peak = Math.min(p.weeklyKm * 1.05, g.peak[3] * 1.2);
    let v = clamp(p.weeklyKm || peak * 0.6, p.sessions * 4, peak);
    if (p.weeklyKm < peak * 0.4 && p.goal !== 'forme') warnings.push(`Ton volume actuel (${p.weeklyKm} km/sem.) est bas pour cet objectif : la progression est limitée à ${Math.round((injury ? 0.05 : [0.07, 0.08, 0.09, 0.1][li]) * 100)} % par semaine pour éviter les blessures.`);
    const inc = injury ? 0.05 : [0.07, 0.08, 0.09, 0.1][li];
    const cycle = injury || li === 0 ? 3 : 4;
    const vols = [];
    for (let i = 0; i < buildW; i++) {
      const rec = (i + 1) % cycle === 0 && i < buildW - 1;
      if (i > 0 && !rec) v = Math.min(peak, v * (1 + inc));
      vols.push({ v: rec ? v * 0.75 : v, rec });
    }
    const top = Math.max(...vols.map((x) => x.v), v);
    const tf = { 1: [0.5], 2: [0.7, 0.45], 3: [0.8, 0.65, 0.42] }[taper] || [];
    tf.forEach((f) => vols.push({ v: top * f, rec: false, taper: true }));
    // Phases
    const nF = Math.max(1, Math.round(buildW * 0.35)), nS = buildW >= 3 ? Math.max(1, Math.round(buildW * 0.3)) : 0, nD = Math.max(0, buildW - nF - nS);
    const phaseOf = (i) => {
      if (p.goal === 'forme') return i < Math.ceil(W / 3) ? 'Découverte' : i < Math.ceil(2 * W / 3) ? 'Progression' : 'Consolidation';
      if (i === W - 1) return 'Course';
      if (i >= buildW) return 'Affûtage';
      if (i < nF) return 'Fondation'; if (i < nF + nD) return 'Développement'; return 'Spécifique';
    };
    const FOCUS = {
      Fondation: 'Construire l’endurance de base et prendre de bonnes habitudes de régularité.',
      'Développement': 'Développer la VMA et le seuil tout en augmentant le volume.',
      'Spécifique': 'Travailler l’allure de course et l’endurance spécifique.',
      'Affûtage': 'Réduire le volume, garder un peu de vitesse : arriver frais le jour J.',
      Course: 'Semaine de course : repos, sommeil, hydratation, confiance.',
      'Découverte': 'Reprendre en douceur et installer la régularité.',
      Progression: 'Allonger progressivement les sorties et varier les allures.',
      Consolidation: 'Stabiliser les acquis et prendre du plaisir.'
    };
    const ctx = { pc, li, vma, rp, ref: g.ref, goal: p.goal, raceShort: { '5k': '5 km', '10k': '10 km', semi: 'semi', marathon: 'marathon' }[g.ref] || 'course' };
    const { W: WO, mk, efR } = workouts(ctx);
    const needTest = vmaSource.startsWith('estimée') && li >= 1 && p.goal !== 'forme';
    const longCap = g.long[li];
    // Progression de la sortie longue : de la plus longue sortie récente jusqu'au plafond de l'objectif
    const startLong = clamp(p.longestRun || 6, 4, longCap);
    const nbNonRec = vols.slice(0, buildW).filter((x) => !x.rec).length;
    const maxStep = injury ? 1.5 : [2, 2, 3, 3][li];
    const step = clamp((longCap - startLong) / Math.max(1, nbNonRec - 1), 0, maxStep);
    const longPlan = []; let lp = startLong, firstNR = true;
    for (let i = 0; i < W; i++) {
      const vv = vols[i] ? vols[i].v : v; let L;
      if (i < buildW && !(vols[i] && vols[i].rec)) { if (!firstNR) lp = Math.min(longCap, lp + step); firstNR = false; L = lp; }
      else if (i < buildW) L = lp * 0.75;
      else L = lp * (i === W - 2 ? 0.6 : 0.75);
      longPlan.push(r05(Math.min(L, vv * (li === 0 ? 0.5 : 0.45), longCap)));
    }
    const walkRun = (i) => p.goal === 'forme' && li === 0 && i < Math.ceil(W / 3);
    const weeks = []; const phaseCount = {}; const phaseIdx = {};
    for (let i = 0; i < W; i++) { const ph = phaseOf(i); phaseCount[ph] = (phaseCount[ph] || 0) + 1; }
    for (let i = 0; i < W; i++) {
      const ph = phaseOf(i); const wk = { n: i + 1, start: D.add(start, i * 7), phase: ph, focus: FOCUS[ph] || '', rec: !!(vols[i] && vols[i].rec), sessions: [] };
      if (wk.rec) wk.focus = 'Semaine allégée pour assimiler la charge des semaines précédentes.';
      phaseIdx[ph] = (phaseIdx[ph] || 0) + 1; const k = phaseCount[ph] > 1 ? (phaseIdx[ph] - 1) / (phaseCount[ph] - 1) : 0.5;
      const wTarget = vols[i] ? vols[i].v : v;
      const add = (dow, s) => { wk.sessions.push(Object.assign({ id: uid(), date: D.add(wk.start, dow), dow, done: false, actualKm: null, actualMin: null, feel: null, note: '' }, s)); };
      if (ph === 'Course') {
        const cand = p.days.filter((d) => d < raceDow);
        const nT = Math.min(p.sessions - 1, 3, cand.length);
        const tdays = []; const pool = cand.slice();
        const act = pool.reduce((b, d) => Math.abs(d - (raceDow - 3)) < Math.abs(b - (raceDow - 3)) ? d : b, pool[0]);
        if (nT > 0 && act != null) { tdays.push(act); pool.splice(pool.indexOf(act), 1); }
        while (tdays.length < nT && pool.length) { const d = pool.pop(); tdays.push(d); }
        tdays.sort((a, b) => a - b).forEach((d) => {
          if (d === act) add(d, mk('specifique', 'Activation — footing + 4 × 1 min', `Footing 25 min en endurance (${efR}) puis 4 × 1 min à allure course (${fmtPace(rp)}/km), 1 min de récupération. Juste de quoi réveiller les jambes.`, 30 * 60 / pc(0.68) + 4 * 60 / rp + 0.5, 36, `${fmtPace(rp)}/km`, 'Z2/Z4', 4));
          else add(d, mk('ef', 'Footing très souple', `20–30 min très souple (${efR}). Si tu es fatigué, remplace par du repos.`, 25 * 60 / pc(0.66), 25, efR, 'Z1–Z2', 3));
        });
        add(raceDow, mk('course', `🏁 Jour J — ${g.label}`, `Échauffement ${gkm >= 30 ? '5–10 min de marche active et quelques foulées' : '10–15 min léger + 3 accélérations'}. Pars prudemment à ${fmtPace(rp)}/km${target ? ` (objectif ${fmtTime(target)})` : ''}, garde une allure régulière et accélère sur le dernier quart si tu te sens bien. ${gkm >= 21 ? 'Bois à chaque ravitaillement et prends un gel toutes les 40–45 min. ' : ''}Profite !`, gkm || 10, target ? target / 60 : gkm * rp / 60, `${fmtPace(rp)}/km`, 'Course', 9));
        if (raceDate) wk.sessions[wk.sessions.length - 1].date = raceDate;
        weeks.push(wk); continue;
      }
      const runDays = placeDays(p.days, p.sessions, p.longDay);
      let q = p.sessions >= 4 ? (li === 0 ? 1 : 2) : 1;
      if (wk.rec || ph === 'Affûtage') q = Math.min(q, 1);
      if (li === 0 && i < 2 && p.sessions <= 3) q = 0;
      if (p.goal === 'forme' && li === 0 && i < 2) q = 0;
      if (needTest && i === 0) q = Math.max(q, 1);
      const qDays = pickQuality(runDays, p.longDay, q);
      let kinds;
      if (p.goal === 'forme') kinds = [i % 2 ? 'cotes' : 'fartlek', li >= 2 ? 'seuil_court' : 'fartlek'];
      else if (ph === 'Fondation') kinds = [p.goal === 'trail' || p.terrain === 'montagne' ? 'cotes' : (i % 2 ? 'cotes' : 'vma_courte'), li >= 2 ? 'seuil_court' : 'fartlek'];
      else if (ph === 'Développement') kinds = [p.goal === 'trail' && i % 2 ? 'cotes' : 'vma_longue', 'seuil'];
      else if (ph === 'Spécifique') kinds = ['specifique', i % 2 ? 'vma_longue' : 'seuil'];
      else kinds = ['rappel'];
      if (needTest && i === 0) kinds[0] = 'test';
      // Sortie longue
      const L = Math.max(3, longPlan[i]);
      const qs = qDays.map((d, j) => ({ d, s: WO[kinds[j] || kinds[0]](k) }));
      const longSession = (() => {
        const min = L * pc(0.69) / 60;
        if (walkRun(i)) { const reps = 6 + i * 2; return mk('long', `Course/marche — ${reps} × (3 min course + 1 min marche)`, `Alterne ${reps} fois 3 min de course très facile (${efR} ou plus lent) et 1 min de marche rapide. Objectif : finir en ayant encore de l'énergie.`, reps * (180 / pc(0.66) + 60 / 900), reps * 4, efR, 'Z1–Z2', 4); }
        if (p.goal === 'trail') return mk('long', `Sortie longue trail — ${L} km`, `${L} km (≈ ${Math.round(min * 1.15 / 5) * 5} min) sur terrain vallonné, en endurance. Marche active dans les côtes raides, travaille les descentes. Emporte de l'eau et de quoi manger.`, L, min * 1.15, efR, 'Z2', 5);
        if (wk.rec) return mk('long', `Sortie longue souple — ${L} km`, `${L} km tranquille en endurance (${efR}). Semaine allégée : aucune pression sur l'allure.`, L, min, efR, 'Z2', 4);
        if (ph === 'Spécifique' && g.ref !== '5k' && p.goal !== 'forme') {
          const sp = r05(Math.min(L * (g.ref === 'marathon' ? 0.5 : 0.4), g.ref === 'marathon' ? 16 : 10));
          return mk('long', `Sortie longue — ${L} km dont ${sp} km allure ${ctx.raceShort}`, `${r05(L - sp)} km en endurance (${efR}) puis ${sp} km à allure objectif (${fmtPace(rp)}/km) en fin de sortie, en 1 ou 2 blocs. Teste ta stratégie de ravitaillement.`, L, (L - sp) * pc(0.69) / 60 + sp * rp / 60, `${efR} puis ${fmtPace(rp)}/km`, 'Z2→Z3', 7);
        }
        if (ph === 'Développement' && p.goal !== 'forme') {
          const pr = r05(Math.min(3, L * 0.2));
          return mk('long', `Sortie longue progressive — ${L} km`, `${L} km en endurance (${efR}), les ${pr} derniers km un peu plus vite (${fmtPace(pc(0.8))}/km). Hydrate-toi toutes les 20–30 min.`, L, min, efR, 'Z2→Z3', 6);
        }
        return mk('long', `Sortie longue — ${L} km`, `${L} km (≈ ${Math.round(min / 5) * 5} min) en endurance fondamentale (${efR}). Allure conversationnelle : tu dois pouvoir parler. Hydrate-toi toutes les 20–30 min.`, L, min, efR, 'Z2', 5);
      })();
      const easyDays = runDays.filter((d) => d !== p.longDay && !qDays.includes(d));
      const qKm = qs.reduce((a, x) => a + x.s.km, 0);
      const minE = [4, 5, 6, 7][li], maxE = Math.max(minE, Math.min([8, 10, 13, 15][li], L * 0.8));
      const eKm = easyDays.length ? r05(clamp((wTarget - L - qKm) / easyDays.length, walkRun(i) ? 3 : minE, maxE)) : 0;
      add(p.longDay, longSession);
      qs.forEach((x) => add(x.d, x.s));
      const dayAfterLong = (p.longDay + 1) % 7;
      let stridesGiven = false;
      easyDays.forEach((d) => {
        const min = eKm * pc(0.69) / 60;
        if (walkRun(i)) { const reps = 5 + i * 2; add(d, mk('ef', `Course/marche — ${reps} × (2 min + 1 min)`, `Alterne ${reps} fois 2 min de course très facile et 1 min de marche rapide. Tu dois pouvoir parler en courant.`, reps * (120 / pc(0.66) + 0.1), reps * 3, efR, 'Z1–Z2', 3)); return; }
        if (d === dayAfterLong && p.sessions >= 5) add(d, mk('recup', `Footing récupération — ${r05(eKm * 0.8)} km`, `${r05(eKm * 0.8)} km très lents (${fmtPace(pc(0.64))}–${fmtPace(pc(0.6))}/km) pour récupérer de la sortie longue.`, eKm * 0.8, eKm * 0.8 * pc(0.62) / 60, `${fmtPace(pc(0.62))}/km`, 'Z1', 2));
        else if (!stridesGiven && !wk.rec && ph !== 'Affûtage') { stridesGiven = true; add(d, mk('ef', `Footing + lignes droites — ${eKm} km`, `${eKm} km en endurance (${efR}), puis 6 lignes droites de 80–100 m en accélérant progressivement (récupération en marchant).`, eKm + 0.6, min + 6, efR, 'Z2', 4)); }
        else add(d, mk('ef', `Footing endurance — ${eKm} km`, `${eKm} km (≈ ${Math.round(min / 5) * 5} min) en endurance fondamentale (${efR}). Tu dois pouvoir tenir une conversation.`, eKm, min, efR, 'Z2', 3));
      });
      const free = [0, 1, 2, 3, 4, 5, 6].filter((d) => !runDays.includes(d));
      if (p.strength && ph !== 'Affûtage') {
        const rd = free.find((d) => d !== (p.longDay + 6) % 7) ?? runDays.find((d) => !qDays.includes(d) && d !== p.longDay) ?? runDays[0];
        add(rd, mk('renfo', 'Renforcement musculaire — 25 min', 'Gainage (planche, latéral) 3 × 30–45 s, squats 3 × 15, fentes 3 × 10 par jambe, montées sur pointes 3 × 20, pont fessier 3 × 15. Prévention des blessures et économie de course.', 0, 25, '—', '—', 4));
      }
      if (p.cross && (ph === 'Fondation' || ph === 'Développement' || ph === 'Progression' || ph === 'Découverte')) {
        const cd = free.find((d) => !wk.sessions.some((s) => s.dow === d));
        if (cd != null) add(cd, mk('cross', 'Activité croisée (optionnel)', 'Vélo, natation ou elliptique 40–60 min à allure facile. Développe le cardio sans impact.', 0, 50, 'facile', 'Z2', 3));
      }
      wk.sessions.sort((a, b) => a.dow - b.dow || (a.type === 'renfo') - (b.type === 'renfo'));
      weeks.push(wk);
    }
    weeks.forEach((w) => { w.km = Math.round(w.sessions.reduce((a, s) => a + (s.km || 0), 0) * 10) / 10; });
    const paces = [
      ['recup', 'Récupération', 0.6, 0.65, 'Z1', 'Footings de récupération'],
      ['ef', 'Endurance fondamentale', 0.65, 0.72, 'Z2', '70–80 % de ton volume'],
      ['marathon', 'Allure marathon', 0.78, 0.82, 'Z3', 'Fins de sorties longues'],
      ['seuil', 'Seuil', 0.85, 0.88, 'Z4', 'Blocs de 6 à 20 min'],
      ['10k', 'Allure 10 km', 0.89, 0.92, 'Z4–Z5', 'Répétitions de 1 à 2 km'],
      ['vma', 'VMA', 0.95, 1.03, 'Z5', 'Fractionné court (200 m à 1 km)']
    ].map(([key, label, lo, hi, zone, use]) => ({ key, label, pct: `${Math.round(lo * 100)}–${Math.round(hi * 100)} % VMA`, pace: `${fmtPace(pc(hi))} – ${fmtPace(pc(lo))}`, zone, use }));
    if (gkm) paces.splice(2, 0, { key: 'objectif', label: `Allure objectif (${ctx.raceShort})`, pct: `${Math.round(3600 / rp / vma * 100)} % VMA`, pace: fmtPace(rp), zone: 'Course', use: target ? `Objectif ${fmtTime(target)}` : '' });
    const tips = [
      'Respecte les allures d’endurance : c’est là que se construit 80 % de ta progression.',
      'Dors au moins 7–8 h, surtout après les séances intenses et la sortie longue.',
      'En cas de douleur qui persiste plus de 2–3 jours, remplace la séance par du repos ou du vélo et consulte.',
      'Une séance manquée n’est pas grave : ne la rattrape pas, reprends simplement le programme.',
      'Teste ton équipement, tes chaussures et ta nutrition de course pendant les sorties longues.'
    ];
    if (p.goal === 'trail') tips.push('Entraîne-toi en côte et en descente, et teste ton sac et tes bâtons si tu en utilises.');
    return {
      version: 2, id: uid(), source: 'coach', created: new Date().toISOString(),
      title: p.goal === 'forme' ? `Remise en forme — ${W} semaines` : `Prépa ${g.label} — ${W} semaines`,
      goal: { key: p.goal, label: g.label, km: gkm, dplus: p.goalDplus || 0, raceDate, target, predicted },
      profile: Object.assign({}, profile),
      summary: { vma, vmaSource, levelLabel: LEVEL_LABEL[li], paces, hr: hrZones(p), warnings, tips, notes: '' },
      start, weeks
    };
  }

  /* ---------- Export Excel ---------- */
  function toWorkbook(plan) {
    const H = { font: { b: true, color: 'FFFFFF' }, fill: '0B1220', align: { v: 'center', h: 'center', wrap: true }, border: '334155' };
    const cellB = (fill, extra) => Object.assign({ fill, border: 'E5E7EB', align: { v: 'top', wrap: true } }, extra || {});
    const progRows = [['Semaine', 'Date', 'Jour', 'Phase', 'Type', 'Séance', 'Détails', 'Distance (km)', 'Durée (min)', 'Allure cible', 'Zone FC', 'Fait', 'Km réalisés', 'Ressenti (1-10)', 'Notes'].map((h) => ({ v: h, s: H }))];
    const all = [];
    plan.weeks.forEach((w) => w.sessions.forEach((s) => all.push({ w, s })));
    all.forEach(({ w, s }) => {
      const t = TYPES[s.type] || TYPES.ef; const f = t.fill;
      const band = w.n % 2 ? 'F8FAFC' : 'EEF2F7';
      progRows.push([
        { v: w.n, s: cellB(band, { font: { b: true }, align: { h: 'center', v: 'top' } }) },
        { v: D.toDate(s.date), s: cellB(band, { numFmt: 'dd/mm/yyyy', align: { h: 'center', v: 'top' } }) },
        { v: DAYS[D.dow(s.date)], s: cellB(band) },
        { v: w.phase || '', s: cellB(band, { font: { i: true, color: '475569' } }) },
        { v: t.label, s: cellB(f, { font: { b: true } }) },
        { v: s.title, s: cellB(f, { font: { b: s.type === 'course' } }) },
        { v: s.details || '', s: cellB('FFFFFF', { font: { sz: 10 } }) },
        { v: s.km || null, s: cellB('FFFFFF', { numFmt: '0.0', align: { h: 'center', v: 'top' } }) },
        { v: s.min || null, s: cellB('FFFFFF', { numFmt: '0', align: { h: 'center', v: 'top' } }) },
        { v: s.pace || '', s: cellB('FFFFFF', { align: { h: 'center', v: 'top', wrap: true } }) },
        { v: s.zone || '', s: cellB('FFFFFF', { align: { h: 'center', v: 'top' } }) },
        { v: s.done ? 'Oui' : '', s: cellB('F0FDF4', { align: { h: 'center', v: 'top' }, font: { b: true, color: '15803D' } }) },
        { v: s.actualKm != null ? s.actualKm : null, s: cellB('F0FDF4', { numFmt: '0.0', align: { h: 'center', v: 'top' } }) },
        { v: s.feel != null ? s.feel : null, s: cellB('F0FDF4', { align: { h: 'center', v: 'top' } }) },
        { v: s.note || '', s: cellB('F0FDF4') }
      ]);
    });
    const nP = progRows.length;
    const prog = {
      name: 'Programme', tabColor: 'C6FF3D', freeze: { r: 1, c: 0 }, autoFilter: `A1:O${nP}`,
      columns: [8, 11, 10, 13, 15, 34, 62, 10, 9, 15, 9, 7, 10, 10, 26].map((w) => ({ width: w })), rows: progRows, rowHeights: { 1: 30 },
      validations: [{ type: 'list', sqref: `L2:L${Math.max(nP, 2) + 200}`, list: ['Oui', 'Non', 'Partiel'] }, { type: 'whole', sqref: `N2:N${Math.max(nP, 2) + 200}`, min: 1, max: 10 }]
    };
    // Calendrier
    const calRows = [['Semaine', 'Du', 'Phase', ...DAYS, 'Km prévus'].map((h) => ({ v: h, s: H }))];
    plan.weeks.forEach((w) => {
      const cells = DAYS.map((_, d) => {
        const ss = w.sessions.filter((s) => D.dow(s.date) === d);
        if (!ss.length) return { v: 'Repos', s: cellB('FFFFFF', { font: { color: '94A3B8', i: true }, align: { h: 'center', v: 'center' } }) };
        const main = ss.find((s) => s.type !== 'renfo' && s.type !== 'cross') || ss[0];
        return { v: ss.map((s) => s.title + (s.km || /min/.test(s.title) || !s.min ? '' : ` (${s.min} min)`)).join('\n'), s: cellB((TYPES[main.type] || TYPES.ef).fill, { font: { sz: 10, b: main.type === 'course' }, align: { v: 'center', wrap: true } }) };
      });
      calRows.push([{ v: `S${w.n}`, s: cellB('F8FAFC', { font: { b: true }, align: { h: 'center', v: 'center' } }) }, { v: D.toDate(w.start), s: cellB('F8FAFC', { numFmt: 'dd/mm', align: { h: 'center', v: 'center' } }) }, { v: w.phase, s: cellB('F8FAFC', { font: { i: true }, align: { v: 'center', wrap: true } }) }, ...cells, { v: w.km, s: cellB('F8FAFC', { numFmt: '0', font: { b: true }, align: { h: 'center', v: 'center' } }) }]);
    });
    const calH = {}; plan.weeks.forEach((w, i) => { calH[i + 2] = 48; }); calH[1] = 26;
    const cal = { name: 'Calendrier', tabColor: '3DE0FF', freeze: { r: 1, c: 3 }, columns: [8, 8, 14, 22, 22, 22, 22, 22, 22, 22, 10].map((w) => ({ width: w })), rows: calRows, rowHeights: calH };
    // Suivi
    const sRows = [['Semaine', 'Phase', 'Km prévus', 'Km réalisés', '% réalisé', 'Séances prévues', 'Séances faites'].map((h) => ({ v: h, s: H }))];
    plan.weeks.forEach((w, i) => {
      const r = i + 2; const planned = w.sessions.filter((s) => s.type !== 'renfo' && s.type !== 'cross').length;
      const doneKm = w.sessions.reduce((a, s) => a + (s.actualKm || 0), 0), doneN = w.sessions.filter((s) => s.done).length;
      sRows.push([
        { v: w.n, s: cellB('F8FAFC', { font: { b: true }, align: { h: 'center' } }) },
        { v: w.phase, s: cellB('F8FAFC') },
        { v: w.km, s: cellB('FFFFFF', { numFmt: '0.0', align: { h: 'center' } }) },
        { f: `SUMIF(Programme!A:A,A${r},Programme!M:M)`, v: doneKm, s: cellB('F0FDF4', { numFmt: '0.0', align: { h: 'center' } }) },
        { f: `IF(C${r}>0,D${r}/C${r},0)`, v: w.km ? doneKm / w.km : 0, s: cellB('F0FDF4', { numFmt: '0%', align: { h: 'center' } }) },
        { v: planned, s: cellB('FFFFFF', { align: { h: 'center' } }) },
        { f: `COUNTIFS(Programme!A:A,A${r},Programme!L:L,"Oui")`, v: doneN, s: cellB('F0FDF4', { align: { h: 'center' } }) }
      ]);
    });
    const last = sRows.length; const TS = { font: { b: true }, fill: 'E2E8F0', border: 'CBD5E1', align: { h: 'center' } };
    const totKm = plan.weeks.reduce((a, w) => a + w.km, 0);
    const totDone = plan.weeks.reduce((a, w) => a + w.sessions.reduce((b, s) => b + (s.actualKm || 0), 0), 0);
    const totPlanned = plan.weeks.reduce((a, w) => a + w.sessions.filter((s) => s.type !== 'renfo' && s.type !== 'cross').length, 0);
    const totDoneN = plan.weeks.reduce((a, w) => a + w.sessions.filter((s) => s.done).length, 0);
    sRows.push([{ v: 'Total', s: TS }, { v: '', s: TS }, { f: `SUM(C2:C${last})`, v: Math.round(totKm * 10) / 10, s: Object.assign({ numFmt: '0' }, TS) }, { f: `SUM(D2:D${last})`, v: totDone, s: Object.assign({ numFmt: '0' }, TS) }, { f: `IF(C${last + 1}>0,D${last + 1}/C${last + 1},0)`, v: totKm ? totDone / totKm : 0, s: Object.assign({ numFmt: '0%' }, TS) }, { f: `SUM(F2:F${last})`, v: totPlanned, s: TS }, { f: `SUM(G2:G${last})`, v: totDoneN, s: TS }]);
    const suivi = { name: 'Suivi', tabColor: 'FB923C', freeze: { r: 1, c: 0 }, columns: [10, 16, 12, 13, 11, 16, 15].map((w) => ({ width: w })), rows: sRows, rowHeights: { 1: 28 } };
    // Résumé
    const S = plan.summary || {}; const G = plan.goal || {};
    const T = { font: { b: true, sz: 20, color: '0B1220' } }, ST = { font: { b: true, sz: 12, color: 'FFFFFF' }, fill: '0B1220' }, K = { font: { b: true, color: '475569' } }, V = { align: { wrap: true, v: 'top' } };
    const R = [];
    R.push([{ v: plan.title || 'Programme d’entraînement', s: T }]);
    R.push([{ v: `Créé avec Foulée le ${new Date(plan.created || Date.now()).toLocaleDateString('fr-FR')} · ${plan.source === 'ia' ? 'généré par l’IA' : plan.source === 'import' ? 'importé' : 'coach intégré'}`, s: { font: { i: true, color: '64748B' } } }]);
    R.push([]);
    R.push([{ v: 'Objectif', s: ST }, { v: '', s: ST }, { v: '', s: ST }, { v: '', s: ST }]);
    const kv = (k, v) => R.push([{ v: k, s: K }, { v: v == null ? '' : v, s: V }]);
    kv('Course', G.label || '');
    if (G.raceDate) kv('Date', D.fr(G.raceDate, true));
    if (G.target) kv('Temps visé', fmtTime(G.target));
    if (G.predicted) kv('Niveau actuel estimé', fmtTime(G.predicted));
    kv('Début de la prépa', plan.start ? D.fr(plan.start, true) : '');
    kv('Durée', `${plan.weeks.length} semaines · ${Math.round(plan.weeks.reduce((a, w) => a + w.km, 0))} km au total`);
    if (S.vma) kv('VMA', `${String(S.vma).replace('.', ',')} km/h (${S.vmaSource || ''})`);
    if (S.levelLabel) kv('Niveau', S.levelLabel);
    if (S.paces && S.paces.length) {
      R.push([]); R.push(['Allures d’entraînement', '', '', ''].map((v) => ({ v, s: ST })));
      R.push(['Allure', 'Min/km', '% VMA', 'Zone · Usage'].map((v) => ({ v, s: { font: { b: true }, fill: 'E2E8F0', border: 'CBD5E1' } })));
      S.paces.forEach((p) => R.push([{ v: p.label, s: { border: 'E5E7EB', font: { b: true } } }, { v: p.pace, s: { border: 'E5E7EB', align: { h: 'center' } } }, { v: p.pct, s: { border: 'E5E7EB', align: { h: 'center' } } }, { v: `${p.zone}${p.use ? ' · ' + p.use : ''}`, s: { border: 'E5E7EB', align: { wrap: true } } }]));
    }
    if (S.hr) {
      R.push([]); R.push([`Zones cardiaques — FC max ${S.hr.max}${S.hr.rest ? ` · repos ${S.hr.rest}` : ''}`, '', '', ''].map((v) => ({ v, s: ST })));
      S.hr.zones.forEach((z) => R.push([{ v: `${z.z} · ${z.name}`, s: { border: 'E5E7EB', font: { b: true } } }, { v: `${z.lo}–${z.hi} bpm`, s: { border: 'E5E7EB', align: { h: 'center' } } }, { v: S.hr.method, s: { border: 'E5E7EB', font: { sz: 9, color: '64748B' } } }, { v: '', s: { border: 'E5E7EB' } }]));
    }
    const list = (title, arr) => { if (!arr || !arr.length) return; R.push([]); R.push([title, '', '', ''].map((v) => ({ v, s: ST }))); arr.forEach((t) => R.push([{ v: '•', s: { align: { h: 'right', v: 'top' } } }, { v: t, s: V }])); };
    list('Points d’attention', S.warnings);
    if (S.notes) list('Le mot du coach', [S.notes]);
    list('Conseils', S.tips);
    R.push([]); R.push([{ v: 'Code couleur', s: K }]);
    Object.entries(TYPES).filter(([k]) => k !== 'repos').forEach(([, t]) => R.push([{ v: '', s: { fill: t.fill, border: 'E5E7EB' } }, { v: t.label }]));
    const merges = []; R.forEach((row, i) => { if (row.length === 2 && row[0] && row[0].s === K) merges.push(`B${i + 1}:D${i + 1}`); else if (row.length === 2 && row[0] && row[0].v === '•') merges.push(`B${i + 1}:D${i + 1}`); else if (row.length === 4 && row[0] && row[0].s === ST) merges.push(`A${i + 1}:D${i + 1}`); });
    merges.push('A1:D1', 'A2:D2');
    const rh = { 1: 32 }; R.forEach((row, i) => { if (row[0] && row[0].v === '•' && String(row[1].v).length > 70) rh[i + 1] = 15 * Math.ceil(String(row[1].v).length / 70); });
    const resume = { name: 'Résumé', tabColor: '0B1220', hideGrid: true, portrait: true, columns: [{ width: 26 }, { width: 22 }, { width: 22 }, { width: 44 }], rows: R, merges, rowHeights: rh };
    return { title: plan.title, sheets: [resume, prog, cal, suivi] };
  }

  /* ---------- Import Excel / CSV ---------- */
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const DAY_RE = [/^lun|^mon/, /^mar|^tue/, /^mer|^wed/, /^jeu|^thu/, /^ven|^fri/, /^sam|^sat/, /^dim|^sun/];
  const dayIndex = (v) => { const t = norm(v); if (!t) return null; for (let i = 0; i < 7; i++) if (DAY_RE[i].test(t)) return i; return null; };
  function inferType(text) {
    const t = norm(text);
    if (!t) return 'ef';
    if (/^repos|^off$|^rest|jour de repos/.test(t)) return 'repos';
    if (/jour j|competition|course officielle|^course\b|race day|🏁|marathon de|semi de|10 ?km de/.test(t)) return 'course';
    if (/test|cooper|vameval/.test(t)) return 'test';
    if (/renfo|gainage|muscu|ppg|pilates|yoga|etirement/.test(t)) return 'renfo';
    if (/velo|natation|nage|elliptique|cross ?training|rameur|bike|swim/.test(t)) return 'cross';
    if (/cote|hill|denivel/.test(t)) return 'cotes';
    if (/fartlek/.test(t)) return 'fartlek';
    if (/vma|30\/30|30-30|fractionn|interval|\d+ ?x ?\d{3} ?m|piste/.test(t)) return 'vma';
    if (/seuil|tempo|threshold/.test(t)) return 'seuil';
    if (/allure (spe|course|objectif|semi|marathon|10|5)|\bas\b|\bam\b|specifique|race pace/.test(t)) return 'specifique';
    if (/sortie longue|\bsl\b|long run|longue/.test(t)) return 'long';
    if (/recup|recovery|decrassage/.test(t)) return 'recup';
    return 'ef';
  }
  function parseKm(v) {
    if (v == null || v === '') return null; if (typeof v === 'number') return v > 0 && v < 400 ? v : null;
    const m = String(v).replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(?:km|k\b)/i) || String(v).replace(',', '.').match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    return m ? +m[1] : null;
  }
  function parseMin(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) { const y = v.getUTCFullYear(); if (y <= 1900) return v.getUTCHours() * 60 + v.getUTCMinutes(); return null; }
    if (typeof v === 'number') return v < 1 ? Math.round(v * 1440) : v < 600 ? v : null;
    const s = String(v).toLowerCase();
    let m = s.match(/(\d+)\s*h\s*(\d{1,2})?/); if (m) return (+m[1]) * 60 + (+(m[2] || 0));
    m = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/); if (m) return m[3] ? (+m[1]) * 60 + (+m[2]) : (+m[1] <= 4 ? (+m[1]) * 60 + (+m[2]) : +m[1]);
    m = s.match(/(\d+)\s*(?:min|mn|')/); if (m) return +m[1];
    m = s.match(/^\s*(\d+)\s*$/); if (m) return +m[1];
    return null;
  }
  const MONTHS = ['janv', 'fevr', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'];
  function parseDate(v, refYear) {
    if (v == null || v === '') return null;
    if (v instanceof Date) { if (v.getUTCFullYear() < 1950) return null; return D.fmt(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())); }
    if (typeof v === 'number') { if (v > 30000 && v < 80000) return D.fmt(Math.round((v - 25569) * 864e5)); return null; }
    const s = norm(v);
    let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/);
    if (m) { let y = m[3] ? +m[3] : refYear; if (y < 100) y += 2000; if (+m[2] >= 1 && +m[2] <= 12 && +m[1] <= 31) return `${y}-${pad(m[2])}-${pad(m[1])}`; }
    m = s.match(/(\d{1,2})\s*(?:er)?\s+([a-z]+)\.?(?:\s+(\d{4}))?/);
    if (m) { const mi = MONTHS.findIndex((x) => m[2].startsWith(x.slice(0, 3))); if (mi >= 0) return `${m[3] || refYear}-${pad(mi + 1)}-${pad(m[1])}`; }
    return null;
  }
  const HEAD = [
    ['akm', /(km|distance).*(realis|reel|fait)|(realis|reel).*(km|distance)/],
    ['feel', /ressenti|rpe|sensation/],
    ['done', /^fait|realise|^done|valid|statut|✓|✔/],
    ['date', /date/],
    ['week', /^s$|^sem|semaine|week|^wk/],
    ['day', /^jour$|^day$|^j$|^jour\b(?!.*date)/],
    ['phase', /phase|bloc|cycle|periode/],
    ['type', /^type|categorie|nature/],
    ['title', /seance|entrainement|workout|session|intitule|exercice|activite|^programme$/],
    ['details', /detail|description|consigne|contenu|commentaire|deroule|explication/],
    ['km', /dist|km|kilom/],
    ['min', /duree|temps|time|^min|minutes/],
    ['pace', /allure|pace|vitesse|rythme/],
    ['zone', /zone|fc|cardio|bpm|intensite/],
    ['note', /note|remarque|obs/]
  ];
  function mapHeader(row) {
    const map = {}; let hits = 0;
    (row || []).forEach((cell, ci) => {
      const t = norm(cell); if (!t || t.length > 40) return;
      for (const [k, re] of HEAD) if (map[k] == null && re.test(t)) { map[k] = ci; hits++; break; }
    });
    const useful = ['title', 'type', 'details', 'km', 'day', 'date'].some((k) => map[k] != null);
    return hits >= 2 && useful ? map : null;
  }
  function gridHeader(row) {
    const map = {}; let n = 0;
    (row || []).forEach((cell, ci) => { const d = dayIndex(cell); if (d != null && String(cell).length <= 12 && map[d] == null) { map[d] = ci; n++; } });
    return n >= 4 ? map : null;
  }
  const weekNum = (v) => { if (v == null || v === '') return null; if (typeof v === 'number') return v >= 1 && v <= 80 ? Math.round(v) : null; const m = String(v).match(/(\d{1,2})/); return m ? +m[1] : null; };
  function splitTitle(text) {
    const t = String(text).trim().replace(/\s+\n/g, '\n'); const first = t.split(/\n|\.\s|:\s/)[0].trim();
    return { title: first.length > 70 ? first.slice(0, 67) + '…' : first, details: t.length > first.length ? t : '' };
  }
  function sheetSessions(rows, refYear) {
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const g = gridHeader(rows[r]);
      if (g) {
        const out = []; let wk = 0;
        for (let i = r + 1; i < rows.length; i++) {
          const row = rows[i] || []; if (!row.some((c) => c != null && String(c).trim() !== '')) continue;
          wk++; let monday = null;
          row.forEach((c, ci) => { if (Object.values(g).includes(ci)) return; const d = parseDate(c, refYear); if (d && !monday) monday = D.monday(d); });
          const label = row.find((c, ci) => !Object.values(g).includes(ci) && c != null && String(c).trim() !== '');
          const wn = weekNum(label) || wk;
          for (let d = 0; d < 7; d++) {
            const v = row[g[d]]; if (v == null) continue; const text = String(v).trim(); if (!text || /^-+$/.test(text)) continue;
            String(text).split(/\n(?=[A-ZÉÈ+])/).filter(Boolean).forEach((part) => {
              const type = inferType(part); if (type === 'repos') return;
              const { title, details } = splitTitle(part);
              out.push({ week: wn, dow: d, date: monday ? D.add(monday, d) : null, type, title, details, km: parseKm(part), min: parseMin(part) });
            });
          }
        }
        return { mode: 'calendrier', sessions: out };
      }
      const map = mapHeader(rows[r]);
      if (map) {
        const out = []; let lastWeek = null, lastDow = -1, autoWeek = 1;
        for (let i = r + 1; i < rows.length; i++) {
          const row = rows[i] || []; const get = (k) => map[k] != null ? row[map[k]] : null;
          if (!row.some((c) => c != null && String(c).trim() !== '')) continue;
          const titleRaw = get('title'), typeRaw = get('type'), det = get('details');
          const txt = [titleRaw, typeRaw, det].filter((x) => x != null && String(x).trim() !== '').map(String);
          if (!txt.length && parseKm(get('km')) == null) continue;
          let type = typeRaw ? inferType(typeRaw) : inferType(txt.join(' '));
          if (typeRaw && type === 'ef' && txt.length) type = inferType(txt.join(' '));
          if (type === 'repos') continue;
          const date = parseDate(get('date'), refYear);
          let dow = date ? D.dow(date) : dayIndex(get('day'));
          let week = weekNum(get('week'));
          if (week == null) { if (lastWeek != null && dow != null && dow <= lastDow && !date) autoWeek++; week = lastWeek != null && get('week') == null ? autoWeek : autoWeek; }
          else autoWeek = week;
          lastWeek = week; if (dow != null) lastDow = dow;
          const title = String(titleRaw || typeRaw || txt[0] || 'Séance').trim();
          const doneV = norm(get('done'));
          out.push({
            week, dow, date, type, title: title.length > 80 ? title.slice(0, 77) + '…' : title,
            details: det != null ? String(det) : (title.length > 80 ? title : ''), km: parseKm(get('km')) ?? parseKm(txt.join(' ')), min: parseMin(get('min')) ?? parseMin(det),
            pace: get('pace') != null ? String(get('pace')) : '', zone: get('zone') != null ? String(get('zone')) : '', phase: get('phase') != null ? String(get('phase')) : '',
            done: /^(oui|yes|x|ok|fait|done|true|1|✓|✔)/.test(doneV), actualKm: parseKm(get('akm')), feel: get('feel') != null && isFinite(+get('feel')) ? +get('feel') : null, note: get('note') != null ? String(get('note')) : ''
          });
        }
        return { mode: 'tableau', sessions: out };
      }
    }
    return { mode: null, sessions: [] };
  }
  function fromSheets(sheets, opt) {
    opt = opt || {}; const refYear = +(opt.year || new Date().getFullYear());
    let best = null;
    sheets.forEach((sh) => {
      const r = sheetSessions(sh.rows || [], refYear); if (!r.sessions.length) return;
      const score = r.sessions.length + (r.mode === 'tableau' ? r.sessions.length * 0.5 : 0) + (/prog|plan|seance|entrain/i.test(norm(sh.name)) ? 5 : 0);
      if (!best || score > best.score) best = Object.assign({ score, sheet: sh.name }, r);
    });
    if (!best) return { plan: null, error: 'Aucune séance reconnue. Le fichier doit contenir une ligne d’en-têtes (ex. Semaine, Jour, Séance, Distance) ou un calendrier avec les jours de la semaine en colonnes.' };
    const ss = best.sessions; const needsStart = ss.some((s) => !s.date);
    let start = opt.startMonday ? D.monday(opt.startMonday) : null;
    const dated = ss.filter((s) => s.date);
    if (!start && dated.length) { const f = dated.reduce((a, s) => (s.date < a.date ? s : a)); start = D.add(D.monday(f.date), -((f.week || 1) - 1) * 7); }
    if (!start) start = D.dow(D.today()) === 0 ? D.today() : D.add(D.monday(D.today()), 7);
    const minWeek = Math.min(...ss.map((s) => s.week || 1));
    const byWeek = {};
    ss.forEach((s) => {
      if (!s.date) {
        const w = (s.week || 1) - minWeek; const base = D.add(start, w * 7);
        if (s.dow == null) { const list = byWeek[w] = byWeek[w] || []; s.dow = [1, 3, 5, 6, 2, 4, 0][list.length % 7]; list.push(s); }
        s.date = D.add(base, s.dow);
      }
    });
    const weeksMap = {};
    ss.forEach((s) => { const m = D.monday(s.date); (weeksMap[m] = weeksMap[m] || []).push(s); });
    const mondays = Object.keys(weeksMap).sort();
    const first = mondays[0]; const lastM = mondays[mondays.length - 1];
    const weeks = [];
    for (let m = first, n = 1; m <= lastM; m = D.add(m, 7), n++) {
      const list = (weeksMap[m] || []).sort((a, b) => a.date.localeCompare(b.date));
      weeks.push({
        n, start: m, phase: (list.find((s) => s.phase) || {}).phase || '', focus: '',
        sessions: list.map((s) => ({ id: uid(), date: s.date, dow: D.dow(s.date), type: s.type, title: s.title, details: s.details || '', km: s.km != null ? Math.round(s.km * 10) / 10 : null, min: s.min != null ? Math.round(s.min) : null, pace: s.pace || '', zone: s.zone || '', rpe: null, done: !!s.done, actualKm: s.actualKm ?? null, actualMin: null, feel: s.feel ?? null, note: s.note || '' }))
      });
    }
    weeks.forEach((w) => { w.km = Math.round(w.sessions.reduce((a, s) => a + (s.km || 0), 0) * 10) / 10; });
    const race = ss.filter((s) => s.type === 'course').sort((a, b) => b.date.localeCompare(a.date))[0];
    const plan = {
      version: 2, id: uid(), source: 'import', created: new Date().toISOString(), title: opt.title || 'Ma prépa importée',
      goal: { key: 'custom', label: race ? race.title : (opt.title || 'Prépa importée'), km: race && race.km || null, raceDate: race ? race.date : '', target: null },
      profile: {}, summary: { warnings: [], tips: [], notes: '', paces: [], importInfo: { sheet: best.sheet, mode: best.mode, count: ss.length } }, start: first, weeks
    };
    return { plan, info: { sheet: best.sheet, mode: best.mode, count: ss.length, needsStart, weeks: weeks.length } };
  }

  /* ---------- IA ---------- */
  function skeletonForAI(base) {
    return base.weeks.map((w) => `S${w.n} (${w.start}, ${w.phase}${w.rec ? ', allégée' : ''}) ~${Math.round(w.km)} km : ` + w.sessions.map((s) => `${DAYS_S[s.dow]} ${s.type}${s.km ? ' ' + s.km + 'km' : ''}`).join(', ')).join('\n');
  }
  function fromAI(json, base) {
    const weeksIn = Array.isArray(json.weeks) ? json.weeks : [];
    const weeks = base.weeks.map((bw, i) => {
      const aw = weeksIn.find((w) => +w.n === bw.n) || weeksIn[i];
      if (!aw || !Array.isArray(aw.sessions) || !aw.sessions.length) return JSON.parse(JSON.stringify(bw));
      const sessions = aw.sessions.map((s) => {
        let d = s.d != null ? +s.d : dayIndex(s.day); if (!(d >= 0 && d <= 6)) d = 6;
        const type = TYPES[s.type] ? s.type : inferType(`${s.type || ''} ${s.title || ''}`);
        return { id: uid(), date: D.add(bw.start, d), dow: d, type: type === 'repos' ? 'ef' : type, title: String(s.title || TYPES[type]?.label || 'Séance').slice(0, 90), details: String(s.details || ''), km: s.km != null && isFinite(+s.km) ? Math.round(+s.km * 10) / 10 : null, min: s.min != null && isFinite(+s.min) ? Math.round(+s.min) : null, pace: String(s.pace || ''), zone: String(s.zone || ''), rpe: s.rpe != null ? +s.rpe : null, done: false, actualKm: null, actualMin: null, feel: null, note: '' };
      }).filter((s) => s.title).sort((a, b) => a.dow - b.dow);
      return { n: bw.n, start: bw.start, phase: aw.phase || bw.phase, focus: aw.focus || bw.focus, rec: bw.rec, sessions };
    });
    const lastW = weeks[weeks.length - 1]; const baseRace = base.weeks[base.weeks.length - 1].sessions.find((s) => s.type === 'course');
    if (baseRace && !lastW.sessions.some((s) => s.type === 'course')) { lastW.sessions = lastW.sessions.filter((s) => s.date < baseRace.date); lastW.sessions.push(JSON.parse(JSON.stringify(baseRace))); }
    weeks.forEach((w) => { w.km = Math.round(w.sessions.reduce((a, s) => a + (s.km || 0), 0) * 10) / 10; });
    const plan = JSON.parse(JSON.stringify(base)); plan.id = uid(); plan.source = 'ia'; plan.weeks = weeks;
    if (json.summary) { if (json.summary.notes) plan.summary.notes = String(json.summary.notes); if (Array.isArray(json.summary.warnings)) plan.summary.warnings = [...new Set([...plan.summary.warnings, ...json.summary.warnings.map(String)])]; if (Array.isArray(json.summary.tips) && json.summary.tips.length) plan.summary.tips = json.summary.tips.map(String); }
    if (json.title) plan.title = String(json.title).slice(0, 90);
    return plan;
  }
  function compactForAI(plan, fromIdx) {
    return plan.weeks.slice(fromIdx).map((w) => `S${w.n} (${w.start}, ${w.phase || ''}) :\n` + w.sessions.map((s) => `  ${DAYS_S[D.dow(s.date)]} | ${s.type} | ${s.km != null ? s.km + ' km' : ''}${s.min ? ' ' + s.min + ' min' : ''} | ${s.title}${s.done ? ' | FAIT' : ''}`).join('\n')).join('\n');
  }

  const api = { build, toWorkbook, fromSheets, fromAI, compactForAI, skeletonForAI, normalize, predict, vmaFromRace, pctFor, fmtPace, fmtTime, parseTime, inferType, D, DAYS, DAYS_S, TYPES, GOALS, LEVELS, LEVEL_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Coach = api;
})(typeof window !== 'undefined' ? window : globalThis);
