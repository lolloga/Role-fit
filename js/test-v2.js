// RoleFit — interfaccia del test a capitoli (versione 2).
//
// Questo file disegna le schermate e raccoglie le risposte; tutta la logica
// (percorso, punteggi, ruoli) sta in v2-engine.js. Lo stato vive in
// localStorage a ogni risposta: ricaricare la pagina riparte dal punto
// esatto. Tutto il testo che arriva da fuori (nome, scene scritte dall'AI)
// entra nella pagina solo come testo, mai come HTML.

import {
  AXES, createState, nextStep, answer as registra, undo, progress, contextOf,
  sceneContent, validAiScene, computeProfile, buildPayload, buildAnswers,
  syntheticHistory, PERSONALIZED_SCENES,
} from './v2-engine.js';
import {
  AXIS_COLORS, CARDS, CARD_QUESTION, MOMENTI, MONDI, MONDO_NON_SO, BACKGROUND, SCENES, DILEMMAS,
} from './v2-items.js';

const STORE = 'rf_v2_state';
const stage = document.getElementById('v2-stage');
const backBtn = document.getElementById('v2-back');
const starsWrap = document.getElementById('v2-stars-wrap');

const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const SCENE_BY_ID = Object.fromEntries(SCENES.map((s) => [s.id, s]));
const DIL_BY_ID = Object.fromEntries(DILEMMAS.map((d) => [d.id, d]));
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

// Come si descrive in breve chi brilla su una dimensione (schermata finale).
const AXIS_SHORT = {
  Analisi: 'ragioni volentieri su dati e logica',
  Relazione: 'funzioni attraverso le persone',
  Creatività: 'ti viene naturale inventare',
  Curiosità: 'cerchi sempre qualcosa di nuovo da capire',
  Leadership: 'ti viene naturale indicare la strada',
  Metodo: 'metti ordine dove serve',
  Concretezza: 'ti piace vedere risultati che si toccano',
};

// ─── STATO ──────────────────────────────────────────────────────
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && s.v === 2 && Array.isArray(s.ordineCarte) && s.answers && Array.isArray(s.trail)) return s;
  } catch { /* stato illeggibile: si riparte */ }
  return null;
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage pieno o bloccato */ }
}

const restored = load();
let state = restored || createState();
if (!restored) save();

// ─── PICCOLI AIUTI ──────────────────────────────────────────────
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  children.flat().forEach((c) => { if (c != null) el.append(c); });
  return el;
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, wait(ms).then(() => { throw new Error('timeout'); })]);
function vibrate() { try { navigator.vibrate?.(8); } catch { /* non supportato */ } }
function fmt(min) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }

function showToast(text, ms = 3200) {
  const t = document.getElementById('v2-toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add('hidden'), ms);
}

function parseJsonText(text) {
  if (typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch { /* prova a estrarre */ }
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a === -1 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

// ─── NOME GIÀ NOTO (chi ha un profilo) ─────────────────────────
// Non deve mai rallentare l'avvio: se Supabase non risponde in fretta, il
// test chiede il nome come a chiunque.
async function fetchKnownName() {
  try {
    const mod = await withTimeout(import('./supabase.js'), 4000);
    const session = await withTimeout(mod.getSession(), 3000);
    if (!session) return null;
    const profile = await withTimeout(mod.getProfile(), 3000);
    return (profile?.nome || '').trim() || null;
  } catch {
    return null;
  }
}
const namePromise = (!state.trail.length && !state.nomeNoto)
  ? fetchKnownName().then((nome) => {
    if (nome && !state.answers.nome && !state.nomeNoto) { state.nomeNoto = nome; save(); }
    return nome;
  })
  : Promise.resolve(state.nomeNoto);

// ─── SCENE PERSONALIZZATE ──────────────────────────────────────
// Partono appena si conoscono i mondi della persona: mentre gioca il
// capitolo 1, l'AI ambienta due scene della giornata in quei mondi. Se non
// arrivano in tempo (o arrivano sbagliate) si usano le scene standard, che
// misurano esattamente le stesse cose.
let scenesInFlight = false;
async function requestScenes() {
  const pending = PERSONALIZED_SCENES.filter((s) => !state.scenes[s.id]);
  if (!pending.length || scenesInFlight || !state.answers.mondi) return;
  const ctx = contextOf(state);
  scenesInFlight = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fase: 'scene',
        messages: [{
          role: 'user',
          content: JSON.stringify({
            momento: ctx.momentoTesto,
            mondi: ctx.mondi.filter((m) => m !== MONDO_NON_SO),
            scene: pending,
          }),
        }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return;
    const data = await res.json();
    const list = parseJsonText(data?.content?.[0]?.text)?.scene;
    if (!Array.isArray(list)) return;
    for (const def of pending) {
      if (state.scenes[def.id]) continue; // nel frattempo già mostrata in versione standard
      const ai = list.find((x) => x && x.id === def.id);
      if (validAiScene(ai, SCENE_BY_ID[def.id])) {
        state.scenes[def.id] = {
          titolo: ai.titolo,
          testo: ai.testo,
          domanda: ai.domanda,
          opzioni: ai.opzioni.map((o) => ({ testo: o.testo, asse: o.asse })),
        };
      }
    }
    save();
  } catch (e) {
    console.warn('Scene personalizzate non disponibili, uso quelle standard:', e?.name || e);
  } finally {
    clearTimeout(timer);
    scenesInFlight = false;
  }
}

// Una scena personalizzata si "congela" la prima volta che compare: se
// l'AI risponde dopo, la scena già vista (e magari già scelta) non cambia
// sotto gli occhi di chi la sta leggendo.
function lockScene(id) {
  if (SCENE_BY_ID[id]?.personalizzata && !state.scenes[id]) {
    state.scenes[id] = { standard: true };
    save();
  }
}

// ─── COSTELLAZIONE ─────────────────────────────────────────────
// Durante il test: 7 stelle senza nome che si accendono man mano che
// arrivano segnali (più segnali = più luce) e si spostano verso il loro
// valore. I nomi compaiono solo alla fine, per non suggerire risposte.
const stars = (() => {
  const canvas = document.getElementById('v2-stars');
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0;
  let H = 0;
  let reveal = false;
  let revealAt = 0;
  let t = 0;
  const cur = {};
  const tgt = {};
  const lum = {};
  const tgtLum = {};
  const pulse = {};
  AXES.forEach((k) => { cur[k] = 50; tgt[k] = 50; lum[k] = 0.15; tgtLum[k] = 0.15; pulse[k] = -1e9; });

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduce) draw(performance.now());
  }

  function update(profile, before) {
    AXES.forEach((k) => {
      tgt[k] = profile.assi[k];
      tgtLum[k] = 0.18 + 0.82 * Math.min(1, profile.stats[k].W / 6);
      if (before && profile.stats[k].W > (before[k]?.W ?? 0) + 0.01) pulse[k] = performance.now();
    });
    if (reduce) { AXES.forEach((k) => { cur[k] = tgt[k]; lum[k] = tgtLum[k]; }); draw(performance.now()); }
  }

  function setReveal(on) {
    if (reveal === on) return;
    reveal = on;
    revealAt = performance.now();
  }

  function fillTextIn(text, x, y) {
    const half = ctx.measureText(text).width / 2;
    ctx.fillText(text, clamp(x, half + 4, W - half - 4), y);
  }

  function draw(now) {
    if (!W || !H) return;
    t += 1;
    ctx.clearRect(0, 0, W, H);
    AXES.forEach((k) => {
      cur[k] += (tgt[k] - cur[k]) * (reduce ? 1 : 0.07);
      lum[k] += (tgtLum[k] - lum[k]) * (reduce ? 1 : 0.07);
    });
    const CX = W / 2;
    const CY = H / 2;
    const R = Math.min(W * 0.42, H * (reveal ? 0.36 : 0.42));
    const pos = AXES.map((k, i) => {
      const a = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
      const r = R * (0.16 + 0.84 * (cur[k] / 100));
      return { k, i, a, x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r };
    });

    // nucleo
    const core = 4 + Math.sin(t * 0.04) * (reduce ? 0 : 0.6);
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, core * 6);
    g.addColorStop(0, 'rgba(93,202,165,0.45)');
    g.addColorStop(1, 'rgba(93,202,165,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(CX, CY, core * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F0FFF4';
    ctx.beginPath(); ctx.arc(CX, CY, core * 0.7, 0, Math.PI * 2); ctx.fill();

    // forma del profilo
    const lumMedia = AXES.reduce((s, k) => s + lum[k], 0) / AXES.length;
    ctx.strokeStyle = `rgba(93,202,165,${0.08 + 0.22 * lumMedia})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    pos.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = `rgba(93,202,165,${0.02 + 0.05 * lumMedia})`;
    ctx.fill();

    pos.forEach((p) => {
      const color = AXIS_COLORS[p.k];
      const l = lum[p.k];
      ctx.strokeStyle = `rgba(93,202,165,${0.05 + 0.08 * l})`;
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(p.x, p.y); ctx.stroke();

      const twinkle = reduce ? 0 : Math.sin(t * 0.05 + p.i * 1.7) * 0.12;
      const halo = 7 + l * 9 + twinkle * 4;
      const hg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
      hg.addColorStop(0, color + Math.round(clamp(l + twinkle, 0.1, 1) * 200).toString(16).padStart(2, '0'));
      hg.addColorStop(1, color + '00');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(p.x, p.y, halo, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = clamp(0.35 + l * 0.65, 0, 1);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 + l * 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      // anello che si espande quando la stella riceve un segnale
      const age = now - pulse[p.k];
      if (!reduce && age >= 0 && age < 700) {
        const q = age / 700;
        ctx.strokeStyle = color + Math.round((1 - q) * 160).toString(16).padStart(2, '0');
        ctx.beginPath(); ctx.arc(p.x, p.y, 6 + q * 18, 0, Math.PI * 2); ctx.stroke();
      }

      if (reveal) {
        const fade = clamp((now - revealAt - 500) / 900, 0, 1);
        const small = W < 420;
        const d = small ? 22 : 28;
        const lx = p.x + Math.cos(p.a) * d;
        const ly = p.y + Math.sin(p.a) * d;
        ctx.globalAlpha = fade;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `600 ${small ? 11 : 13}px ${getComputedStyle(document.body).fontFamily}`;
        ctx.fillStyle = 'rgba(240,255,244,0.85)';
        fillTextIn(p.k, lx, ly);
        ctx.font = `${small ? 10 : 11}px ui-monospace, monospace`;
        ctx.fillStyle = 'rgba(240,255,244,0.45)';
        fillTextIn(String(Math.round(tgt[p.k])), lx, ly + (small ? 13 : 15));
        ctx.globalAlpha = 1;
      }
    });
  }

  function loop(now) { draw(now); if (!reduce) requestAnimationFrame(loop); }
  // Il riquadro cambia altezza (anche in animazione, alla schermata finale):
  // il disegno va ridimensionato a ogni cambio, altrimenti si deforma.
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(starsWrap);
  else window.addEventListener('resize', resize);
  resize();
  if (!reduce) requestAnimationFrame(loop);
  return { update, setReveal, resize };
})();

// ─── CORNICE: orologio, capitolo, cielo, avanzamento ───────────
const CAP_LABEL = {
  prologo: 'Prologo',
  carte: 'Cosa ti accende',
  giornata: 'La tua giornata',
  dilemmi: 'Scelte difficili',
  epilogo: 'Ultime cose',
  risultato: 'Il tuo risultato',
};

function clockFor(step) {
  switch (step.tipo) {
    case 'intro': return '07:30';
    case 'nome': return '07:40';
    case 'momento': return '07:45';
    case 'mondi': return '07:50';
    case 'capitolo': return { 1: '08:00', 2: '08:58', 3: '20:30' }[step.numero];
    case 'card': return fmt(8 * 60 + 2 + step.indice * 2);
    case 'scene': return SCENE_BY_ID[step.id].ora;
    case 'dilemma': return fmt(20 * 60 + 45 + step.indice * 10);
    case 'background': return '22:15';
    case 'aspirazione': return '22:25';
    case 'racconto': return '22:35';
    default: return '23:00';
  }
}

function faseFor(ora) {
  const [hh, mm] = ora.split(':').map(Number);
  const x = hh + mm / 60;
  return x < 8.5 ? 'alba' : x < 12.5 ? 'mattino' : x < 16.5 ? 'pomeriggio' : x < 19.5 ? 'tramonto' : 'notte';
}

function updateChrome(step) {
  const ora = clockFor(step);
  document.getElementById('v2-ora').textContent = ora;
  document.getElementById('v2-cap').textContent = CAP_LABEL[step.capitolo] || '';
  const fase = faseFor(ora);
  document.querySelectorAll('.v2-layer').forEach((l) => l.classList.toggle('on', l.dataset.fase === fase));
  document.getElementById('v2-progress-fill').style.width = (step.tipo === 'reveal' ? 100 : Math.round(progress(state) * 100)) + '%';
  backBtn.classList.toggle('hidden', !state.trail.length || step.tipo === 'intro');
  const big = step.tipo === 'reveal';
  starsWrap.classList.toggle('is-big', big);
  stars.setReveal(big);
}

// ─── CICLO PRINCIPALE ──────────────────────────────────────────
let currentKey = null;
let shownAt = 0;
let keyHandler = null;

document.addEventListener('keydown', (e) => {
  if (keyHandler && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) keyHandler(e);
});

function render() {
  const step = nextStep(state);
  if (step.tipo === 'dilemma' && state.dilCorrente !== step.id) { state.dilCorrente = step.id; save(); }
  if (step.tipo === 'scene') lockScene(step.id);
  currentKey = step.key;
  shownAt = performance.now();
  keyHandler = null;
  updateChrome(step);
  const screen = SCREENS[step.tipo](step);
  screen.classList.add('v2-screen');
  screen.tabIndex = -1;
  // "Indietro" sta in fondo alla schermata, dopo il contenuto: fisso in
  // basso finiva sopra le opzioni delle schermate più lunghe.
  stage.replaceChildren(screen, backBtn);
  window.scrollTo({ top: 0 });
}

// Registra la risposta del passo corrente e passa al successivo. Il
// controllo sulla chiave scarta i tocchi arrivati tardi su una schermata
// già superata (doppio tocco, animazioni).
function respond(key, value) {
  if (key !== currentKey) return;
  const before = computeProfile(state).stats;
  registra(state, key, { ...value, ms: Math.round(performance.now() - shownAt) });
  save();
  if (key === 'mondi') requestScenes();
  stars.update(computeProfile(state), before);
  render();
}

backBtn.addEventListener('click', () => {
  if (!undo(state)) return;
  save();
  stars.update(computeProfile(state));
  render();
});

document.getElementById('v2-exit').addEventListener('click', () => {
  if (window.confirm('Vuoi uscire? Il test resta salvato su questo dispositivo: lo riprendi dalla home quando vuoi.')) {
    window.location.href = 'index.html';
  }
});

// ─── SCHERMATE ─────────────────────────────────────────────────
function mainButton(label, onClick, { disabled = false } = {}) {
  return h('button', { type: 'button', class: 'btn btn--primary v2-main-btn', disabled, onclick: onClick }, label);
}

function screenIntro() {
  const wrap = h('div');
  const nome = state.nomeNoto;
  wrap.append(
    h('p', { class: 'v2-eyebrow', text: 'RoleFit · il test a capitoli' }),
    h('h1', { class: 'v2-title' }, nome ? `Ciao ${nome}. ` : '', 'Una giornata di lavoro, ', h('em', { text: 'in 7 minuti.' })),
    h('p', { class: 'v2-text', text: 'Niente domande difficili: scegli d\'istinto tra alcune attività, vivi una giornata dalle 9 alle 18 e risolvi qualche dilemma. Da come la vivi capiamo come funzioni e dove rendi di più.' }),
    h('ul', { class: 'v2-meta-list' },
      h('li', {}, h('span', { text: '◈' }), '3 capitoli, una cosa per volta'),
      h('li', {}, h('span', { text: '◷' }), 'Circa 7 minuti'),
      h('li', {}, h('span', { text: '↺' }), 'Se esci, riprendi da dove eri')),
  );
  let starting = false;
  wrap.append(h('div', { class: 'v2-actions' }, mainButton('Iniziamo', async () => {
    if (starting) return;
    starting = true;
    await Promise.race([namePromise, wait(1500)]);
    respond('intro', { seen: true });
  })));
  return wrap;
}

function screenNome(step) {
  const input = h('input', { class: 'v2-input', type: 'text', maxlength: '40', placeholder: 'Il tuo nome', autocomplete: 'given-name', 'aria-label': 'Il tuo nome' });
  const go = () => { const v = input.value.trim(); if (v) respond(step.key, { v }); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  setTimeout(() => input.focus(), 60);
  return h('div', {},
    h('p', { class: 'v2-eyebrow', text: 'Prologo' }),
    h('h2', { class: 'v2-title', text: 'Come ti chiamiamo?' }),
    h('p', { class: 'v2-text', text: 'Solo il nome: lo useremo per parlarti, niente di più.' }),
    input,
    h('div', { class: 'v2-actions' },
      mainButton('Continua', go),
      h('button', { type: 'button', class: 'v2-link', onclick: () => respond(step.key, { v: '' }) }, 'Preferisco non dirlo')),
  );
}

function optionList(options, onPick, { badge = (o, i) => LETTERS[i], from = null } = {}) {
  const list = h('div', { class: 'v2-options' });
  let done = false;
  options.forEach((o, i) => {
    const b = h('button', { type: 'button', class: 'v2-opt' },
      h('span', { class: 'v2-opt-badge', text: badge(o, i) }),
      h('span', { class: 'v2-opt-body' }, from ? h('span', { class: 'v2-opt-from', text: from(o) }) : null, h('span', { text: o.testo })));
    b.addEventListener('click', () => {
      if (done) return;
      done = true;
      b.classList.add('is-on');
      list.querySelectorAll('.v2-opt').forEach((x) => { if (x !== b) x.classList.add('is-dim'); });
      vibrate();
      setTimeout(() => onPick(o, i), 260);
    });
    list.append(b);
  });
  return list;
}

function screenMomento(step) {
  return h('div', {},
    h('p', { class: 'v2-eyebrow', text: 'Prologo' }),
    h('h2', { class: 'v2-title', text: 'In che momento sei?' }),
    h('p', { class: 'v2-text', text: 'Della tua vita professionale, oggi.' }),
    optionList(MOMENTI, (o) => respond(step.key, { v: o.id })),
  );
}

function screenMondi(step) {
  const scelti = [];
  const btn = mainButton('Continua', () => respond(step.key, { v: [...scelti] }), { disabled: true });
  const chips = h('div', { class: 'v2-chips' });
  const all = [...MONDI, MONDO_NON_SO];
  const refresh = () => {
    chips.querySelectorAll('.v2-chip').forEach((c) => {
      const v = c.dataset.v;
      const on = scelti.includes(v);
      c.classList.toggle('is-on', on);
      c.disabled = !on && (scelti.length >= 2 || scelti.includes(MONDO_NON_SO) || (v === MONDO_NON_SO && scelti.length > 0));
    });
    btn.disabled = scelti.length === 0;
  };
  all.forEach((m) => {
    const c = h('button', { type: 'button', class: 'v2-chip', 'data-v': m, text: m });
    c.addEventListener('click', () => {
      const i = scelti.indexOf(m);
      if (i >= 0) scelti.splice(i, 1); else scelti.push(m);
      refresh();
    });
    chips.append(c);
  });
  return h('div', {},
    h('p', { class: 'v2-eyebrow', text: 'Prologo' }),
    h('h2', { class: 'v2-title', text: 'Quali mondi ti incuriosiscono?' }),
    h('p', { class: 'v2-text', text: 'Scegline uno o due: ambienteremo lì parte della tua giornata. Non serve esserci già dentro.' }),
    chips,
    h('div', { class: 'v2-actions' }, btn),
  );
}

function screenCapitolo(step) {
  const ctx = contextOf(state);
  const testi = {
    1: {
      titolo: 'Cosa ti accende',
      testo: `Ti mostriamo ${state.ordineCarte.length} attività, una alla volta. Rispondi d'istinto: ti piacerebbe passarci una giornata? Non c'è una risposta giusta, e più sei sincero più il risultato ti somiglia.`,
      bottone: 'Inizia',
    },
    2: {
      titolo: 'La tua giornata',
      testo: `${ctx.nome ? `${ctx.nome}, sono` : 'Sono'} le 8:58 e la giornata sta per cominciare: sette momenti, dalle 9 alle 18. Fai quello che faresti davvero, non quello che sembra più giusto.`,
      bottone: 'Entra nella giornata',
    },
    3: {
      titolo: 'Scelte difficili',
      testo: 'La giornata è finita. Ora qualche scelta secca tra due cose che vorresti entrambe: tieni quella che senti più tua.',
      bottone: 'Avanti',
    },
  }[step.numero];
  return h('div', {},
    h('p', { class: 'v2-eyebrow', text: `Capitolo ${step.numero} di 3` }),
    h('h2', { class: 'v2-title', text: testi.titolo }),
    h('p', { class: 'v2-text', text: testi.testo }),
    step.numero === 1 ? h('p', { class: 'v2-note', text: 'Sul telefono puoi anche trascinare le carte: a destra è sì, a sinistra è no.' }) : null,
    h('div', { class: 'v2-actions' }, mainButton(testi.bottone, () => respond(step.key, { seen: true }))),
  );
}

// ─── CAPITOLO 1: CARTE ─────────────────────────────────────────
function screenCard(step) {
  const card = CARD_BY_ID[step.id];
  const rimaste = step.totale - step.indice - 1;
  const deck = h('div', { class: 'v2-deck' });
  if (rimaste >= 2) deck.append(h('div', { class: 'v2-ghost g2' }));
  if (rimaste >= 1) deck.append(h('div', { class: 'v2-ghost g1' }));
  const stampSi = h('span', { class: 'v2-stamp si', text: 'SÌ' });
  const stampNo = h('span', { class: 'v2-stamp no', text: 'NO' });
  const stampForse = h('span', { class: 'v2-stamp forse', text: 'FORSE' });
  const c = h('div', { class: 'v2-card', role: 'group', 'aria-label': card.testo },
    stampSi, stampNo, stampForse,
    h('div', { class: 'v2-card-icon', text: card.icona }),
    h('p', { class: 'v2-card-text', text: card.testo }));
  deck.append(c);

  let done = false;
  const commit = (v) => {
    if (done) return;
    done = true;
    c.classList.remove('is-dragging');
    c.style.transform = '';
    c.classList.add('fly-' + v);
    vibrate();
    setTimeout(() => respond(step.key, { v }), 230);
  };

  // Trascinamento: a destra sì, a sinistra no, in alto forse.
  let dragging = false;
  let pid = null;
  let sx = 0;
  let sy = 0;
  let dx = 0;
  let dy = 0;
  c.addEventListener('pointerdown', (e) => {
    if (done) return;
    dragging = true; pid = e.pointerId; sx = e.clientX; sy = e.clientY; dx = 0; dy = 0;
    try { c.setPointerCapture(pid); } catch { /* non supportato */ }
    c.classList.add('is-dragging');
  });
  c.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pid) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    c.style.transform = `translate(${dx}px, ${Math.min(dy, 0) * 0.6}px) rotate(${dx / 18}deg)`;
    stampSi.style.opacity = clamp(dx / 90, 0, 1);
    stampNo.style.opacity = clamp(-dx / 90, 0, 1);
    stampForse.style.opacity = Math.abs(dx) < 40 ? clamp(-dy / 90, 0, 1) : 0;
  });
  const end = (e) => {
    if (!dragging || (e && e.pointerId !== pid)) return;
    dragging = false;
    if (dx > 90) return commit('si');
    if (dx < -90) return commit('no');
    if (dy < -90 && Math.abs(dx) < 60) return commit('forse');
    c.classList.remove('is-dragging');
    c.style.transform = '';
    [stampSi, stampNo, stampForse].forEach((s) => { s.style.opacity = 0; });
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);

  keyHandler = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); commit('si'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); commit('no'); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); commit('forse'); }
  };

  const btn = (v, icon, label) => h('button', { type: 'button', class: `v2-swipe-btn ${v}`, 'aria-label': label, onclick: () => commit(v) },
    h('span', { text: icon }), h('span', { text: label }));

  return h('div', {},
    h('p', { class: 'v2-eyebrow', text: `Carta ${step.indice + 1} di ${step.totale}` }),
    h('p', { class: 'v2-question', text: CARD_QUESTION }),
    deck,
    h('div', { class: 'v2-swipe-btns' }, btn('no', '✕', 'No'), btn('forse', '?', 'Forse'), btn('si', '✓', 'Sì')),
    h('p', { class: 'v2-counter', text: rimaste ? `${rimaste} ${rimaste === 1 ? 'carta' : 'carte'} ancora` : 'Ultima carta' }),
  );
}

// ─── CAPITOLO 2: LA GIORNATA ───────────────────────────────────
function sceneHead(sc) {
  return [
    h('div', { class: 'v2-scene-head' }, h('span', { class: 'v2-scene-ora', text: sc.ora }), h('span', { class: 'v2-scene-titolo', text: sc.titolo })),
    h('p', { class: 'v2-text', text: sc.testo }),
  ];
}

function screenScene(step) {
  const sc = sceneContent(state, step.id);
  const wrap = h('div', {}, h('p', { class: 'v2-eyebrow', text: `Scena ${step.indice + 1} di ${step.totale}` }), ...sceneHead(sc));

  if (sc.tipo === 'pick') {
    wrap.append(h('p', { class: 'v2-question', text: sc.domanda }), optionList(sc.opzioni, (o) => respond(step.key, { pick: o.id })));
    return wrap;
  }

  if (sc.tipo === 'rank') {
    const order = [];
    const list = h('div', { class: 'v2-options' });
    const btn = mainButton('Avanti', () => respond(step.key, { order: [...order] }), { disabled: true });
    const refresh = () => {
      list.querySelectorAll('.v2-opt').forEach((b) => {
        const pos = order.indexOf(b.dataset.id);
        b.classList.toggle('is-on', pos >= 0);
        b.querySelector('.v2-opt-badge').textContent = pos >= 0 ? String(pos + 1) : '';
      });
      btn.disabled = order.length < sc.scegli;
    };
    sc.opzioni.forEach((o) => {
      const b = h('button', { type: 'button', class: 'v2-opt', 'data-id': o.id },
        h('span', { class: 'v2-opt-badge' }),
        h('span', { class: 'v2-opt-body' }, h('span', { class: 'v2-opt-from', text: o.mittente }), h('span', { text: o.testo })));
      b.addEventListener('click', () => {
        const i = order.indexOf(o.id);
        if (i >= 0) order.splice(i, 1);
        else if (order.length < sc.scegli) { order.push(o.id); vibrate(); }
        refresh();
      });
      list.append(b);
    });
    wrap.append(h('p', { class: 'v2-question', text: sc.domanda }), list, h('div', { class: 'v2-actions' }, btn));
    return wrap;
  }

  if (sc.tipo === 'twostep') {
    const body = h('div');
    const fase1 = () => {
      body.replaceChildren(
        h('p', { class: 'v2-question', text: sc.domanda }),
        optionList(sc.opzioni, (o) => fase2(o)),
      );
    };
    const fase2 = (primo) => {
      body.replaceChildren(
        h('span', { class: 'v2-pill' }, `1ª mossa: ${primo.testo}`),
        h('p', { class: 'v2-question', text: sc.domanda2 }),
        optionList(sc.opzioni.filter((o) => o.id !== primo.id), (o) => respond(step.key, { first: primo.id, second: o.id }), {
          badge: (o, i) => LETTERS[i],
        }),
        h('button', { type: 'button', class: 'v2-link', onclick: fase1 }, 'Cambia la prima mossa'),
      );
      body.classList.remove('v2-screen');
      void body.offsetWidth;
      body.classList.add('v2-screen');
    };
    fase1();
    wrap.append(body);
    return wrap;
  }

  if (sc.tipo === 'budget') {
    const tokens = Object.fromEntries(sc.opzioni.map((o) => [o.id, 0]));
    const used = () => Object.values(tokens).reduce((a, b) => a + b, 0);
    const dots = h('div', { class: 'v2-tokens', 'aria-live': 'polite' });
    const rows = h('div', { class: 'v2-budget' });
    const btn = mainButton('Avanti', () => respond(step.key, { tokens: { ...tokens } }), { disabled: true });
    const refresh = () => {
      const u = used();
      dots.replaceChildren(
        ...Array.from({ length: sc.gettoni }, (_, i) => h('span', { class: 'v2-token' + (i < sc.gettoni - u ? '' : ' used') })),
        h('span', { class: 'v2-tokens-label', text: u < sc.gettoni ? `${sc.gettoni - u} da assegnare` : 'Tutti assegnati' }),
      );
      rows.querySelectorAll('.v2-budget-row').forEach((r) => {
        const id = r.dataset.id;
        r.querySelector('output').textContent = String(tokens[id]);
        r.classList.toggle('has', tokens[id] > 0);
        r.querySelector('[data-op="-"]').disabled = tokens[id] === 0;
        r.querySelector('[data-op="+"]').disabled = tokens[id] >= sc.max || u >= sc.gettoni;
      });
      btn.disabled = u !== sc.gettoni;
    };
    sc.opzioni.forEach((o) => {
      const row = h('div', { class: 'v2-budget-row', 'data-id': o.id },
        h('span', { class: 'v2-budget-label', text: o.testo }),
        h('span', { class: 'v2-stepper' },
          h('button', { type: 'button', 'data-op': '-', 'aria-label': `Togli un gettone da ${o.testo}`, onclick: () => { if (tokens[o.id] > 0) { tokens[o.id]--; refresh(); } } }, '−'),
          h('output', {}, '0'),
          h('button', { type: 'button', 'data-op': '+', 'aria-label': `Aggiungi un gettone a ${o.testo}`, onclick: () => { if (tokens[o.id] < sc.max && used() < sc.gettoni) { tokens[o.id]++; vibrate(); refresh(); } } }, '+')));
      rows.append(row);
    });
    refresh();
    wrap.append(h('p', { class: 'v2-question', text: sc.domanda }), dots, rows,
      h('p', { class: 'v2-note', text: `Al massimo ${sc.max} gettoni sulla stessa voce.` }),
      h('div', { class: 'v2-actions' }, btn));
    return wrap;
  }

  if (sc.tipo === 'energia') {
    const body = h('div');
    const fase1 = () => {
      const scelte = [];
      const list = h('div', { class: 'v2-options' });
      const btn = mainButton('Avanti', () => fase2([...scelte]), { disabled: true });
      sc.opzioni.forEach((o) => {
        const b = h('button', { type: 'button', class: 'v2-opt', 'data-id': o.id },
          h('span', { class: 'v2-opt-badge' }), h('span', { class: 'v2-opt-body' }, h('span', { text: o.testo })));
        b.addEventListener('click', () => {
          const i = scelte.indexOf(o.id);
          if (i >= 0) scelte.splice(i, 1);
          else if (scelte.length < sc.max) { scelte.push(o.id); vibrate(); }
          list.querySelectorAll('.v2-opt').forEach((x) => {
            const on = scelte.includes(x.dataset.id);
            x.classList.toggle('is-on', on);
            x.querySelector('.v2-opt-badge').textContent = on ? '✓' : '';
          });
          btn.disabled = scelte.length === 0;
        });
        list.append(b);
      });
      body.replaceChildren(h('p', { class: 'v2-question', text: sc.domanda }), list, h('div', { class: 'v2-actions' }, btn));
    };
    const fase2 = (energia) => {
      body.replaceChildren(
        h('p', { class: 'v2-question', text: sc.domanda2 }),
        optionList(sc.opzioni2, (o) => respond(step.key, { energia, drain: o.id })),
        h('button', { type: 'button', class: 'v2-link', onclick: fase1 }, 'Torna ai momenti di energia'),
      );
    };
    fase1();
    wrap.append(body);
    return wrap;
  }
  return wrap;
}

// ─── CAPITOLO 3: DILEMMI ───────────────────────────────────────
function screenDilemma(step) {
  const d = DIL_BY_ID[step.id];
  let done = false;
  const box = h('div', { class: 'v2-dilemma' });
  const pick = (v, el) => {
    if (done) return;
    done = true;
    el.classList.add('is-on');
    box.querySelectorAll('.v2-dil-opt').forEach((x) => { if (x !== el) x.classList.add('is-dim'); });
    vibrate();
    setTimeout(() => respond(step.key, { pick: v }), 280);
  };
  const a = h('button', { type: 'button', class: 'v2-dil-opt', text: d.a.testo });
  const b = h('button', { type: 'button', class: 'v2-dil-opt', text: d.b.testo });
  a.addEventListener('click', () => pick('a', a));
  b.addEventListener('click', () => pick('b', b));
  box.append(a, h('p', { class: 'v2-oppure', text: 'oppure' }), b);
  keyHandler = (e) => {
    if (e.key === 'ArrowUp' || e.key === '1') pick('a', a);
    else if (e.key === 'ArrowDown' || e.key === '2') pick('b', b);
  };
  return h('div', {},
    h('p', { class: 'v2-eyebrow', text: `Scelta ${step.indice + 1}` }),
    h('p', { class: 'v2-question', text: 'Quale tieni?' }),
    box);
}

// ─── EPILOGO ───────────────────────────────────────────────────
function screenBackground(step) {
  return h('div', {},
    h('p', { class: 'v2-eyebrow', text: 'Ultime cose' }),
    h('h2', { class: 'v2-title', text: 'Da dove parti?' }),
    h('p', { class: 'v2-text', text: 'Il tuo percorso di studi: ci serve per rendere concreti i consigli su come arrivare ai ruoli.' }),
    optionList(BACKGROUND.map((testo) => ({ testo })), (o) => respond(step.key, { v: o.testo })),
  );
}

function screenAspirazione(step) {
  const input = h('input', { class: 'v2-input', type: 'text', maxlength: '80', placeholder: 'Es. Product Manager, architetto, chef…', 'aria-label': 'Il ruolo che hai in mente' });
  const go = () => { const v = input.value.trim(); if (v) respond(step.key, { v }); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', {},
    h('p', { class: 'v2-eyebrow', text: 'Ultime cose' }),
    h('h2', { class: 'v2-title', text: 'Hai già in mente un ruolo?' }),
    h('p', { class: 'v2-text', text: 'Un lavoro che sogni o a cui stai pensando: nel report ti diremo quanto è vicino a te.' }),
    input,
    h('div', { class: 'v2-actions' },
      mainButton('Continua', go),
      h('button', { type: 'button', class: 'v2-link', onclick: () => respond(step.key, { v: '' }) }, 'No, sorprendimi')),
  );
}

function screenRacconto(step) {
  const area = h('textarea', { class: 'v2-textarea', maxlength: '1200', placeholder: 'Anche solo due righe…', 'aria-label': 'Il tuo racconto' });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let mic = null;
  if (SR) {
    let rec = null;
    mic = h('button', { type: 'button', class: 'v2-mic' }, '🎙 Dettalo a voce');
    mic.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      try {
        rec = new SR();
        rec.lang = 'it-IT';
        rec.continuous = true;
        rec.interimResults = false;
        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) area.value = (area.value ? area.value.trimEnd() + ' ' : '') + e.results[i][0].transcript.trim();
          }
        };
        rec.onend = () => { rec = null; mic.classList.remove('is-on'); mic.textContent = '🎙 Dettalo a voce'; };
        rec.start();
        mic.classList.add('is-on');
        mic.textContent = 'Sto ascoltando… tocca per fermare';
      } catch {
        rec = null;
        mic.remove();
      }
    });
  }
  return h('div', {},
    h('p', { class: 'v2-eyebrow', text: 'Ultime cose' }),
    h('h2', { class: 'v2-title', text: 'Un\'ultima cosa, se ti va' }),
    h('p', { class: 'v2-text', text: 'Ripensa a un momento in cui il tempo è volato mentre facevi qualcosa, al lavoro o fuori. Raccontalo in due righe: renderà il tuo report più tuo.' }),
    area,
    mic,
    h('p', { class: 'v2-note', text: 'Resta privato: le aziende non lo vedono mai.' }),
    h('div', { class: 'v2-actions' },
      mainButton('Vedi il risultato', () => respond(step.key, { v: area.value.trim() })),
      h('button', { type: 'button', class: 'v2-link', onclick: () => respond(step.key, { v: '' }) }, 'Salta')),
  );
}

// ─── RISULTATO ─────────────────────────────────────────────────
// Il profilo e il primo ruolo si vedono subito: sono calcolati qui, senza
// chiamare nessuno. L'email serve dopo, per salvare il report completo.
function handoff(payload) {
  localStorage.setItem('rf_history', JSON.stringify(syntheticHistory(payload)));
  localStorage.setItem('rf_activities', JSON.stringify({ _v2: payload }));
  localStorage.setItem('rf_answers', JSON.stringify(buildAnswers(state)));
  localStorage.setItem('rf_aspiration', payload.contesto.aspirazione || '');
  localStorage.removeItem('rf_report_saved');
}

function screenReveal() {
  const payload = buildPayload(state);
  const r = payload.risultato;
  const ctx = payload.contesto;
  try { handoff(payload); } catch (e) { console.error('Passaggio al report non riuscito:', e); }

  const top = [...AXES].sort((a, b) => r.assi[b] - r.assi[a]).slice(0, 2);
  const ruolo = r.ruoli[0];
  const wrap = h('div', {},
    h('p', { class: 'v2-eyebrow', text: 'Il tuo risultato' }),
    h('h2', { class: 'v2-title' }, ctx.nome ? `${ctx.nome}, ecco la tua ` : 'Ecco la tua ', h('em', { text: 'costellazione.' })),
    h('p', { class: 'v2-reveal-text' },
      'Brilli soprattutto in ', h('strong', { text: top[0] }), ' e ', h('strong', { text: top[1] }),
      `: ${AXIS_SHORT[top[0]]} e ${AXIS_SHORT[top[1]]}.`),
  );
  if (r.qualita?.nota) wrap.append(h('p', { class: 'v2-quality', text: r.qualita.nota }));
  if (ruolo) {
    wrap.append(h('div', { class: 'v2-role-card' },
      h('p', { class: 'v2-role-label', text: 'Il ruolo più vicino a te' }),
      h('div', { class: 'v2-role-top' }, h('span', { class: 'v2-role-name', text: ruolo.nome }), h('span', { class: 'v2-role-pct', text: `${ruolo.match}%` })),
      h('p', { class: 'v2-role-desc', text: ruolo.desc })));
  }
  wrap.append(
    h('p', { class: 'v2-teaser', text: 'Nel report completo trovi gli altri due ruoli, quello che non ti aspetti, il perché di ogni scelta con le tue risposte come prova, e come arrivarci.' }),
    h('div', { class: 'v2-actions' },
      mainButton('Leggi il report completo →', () => {
        try { localStorage.removeItem(STORE); } catch { /* niente */ }
        window.location.href = 'report.html';
      }),
      h('button', {
        type: 'button',
        class: 'v2-link',
        onclick: () => {
          if (!window.confirm('Vuoi rifare il test da capo? Le risposte di adesso andranno perse.')) return;
          localStorage.removeItem(STORE);
          window.location.reload();
        },
      }, 'Rifai da capo')),
  );
  return wrap;
}

const SCREENS = {
  intro: screenIntro,
  nome: screenNome,
  momento: screenMomento,
  mondi: screenMondi,
  capitolo: screenCapitolo,
  card: screenCard,
  scene: screenScene,
  dilemma: screenDilemma,
  background: screenBackground,
  aspirazione: screenAspirazione,
  racconto: screenRacconto,
  reveal: screenReveal,
};

// ─── AVVIO ─────────────────────────────────────────────────────
stars.update(computeProfile(state));
render();
if (restored && state.trail.length) showToast('Bentornato: riprendiamo da dove eri.');
if (state.answers.mondi) requestScenes();
