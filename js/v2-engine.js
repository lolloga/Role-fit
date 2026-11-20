// RoleFit — motore del test a capitoli (versione 2).
//
// Separa la MISURA dal RACCONTO. Ogni risposta ha un punteggio deciso prima
// (v2-items.js), i ruoli escono da una libreria con un profilo per ciascuno
// (v2-roles.js): le stesse risposte danno sempre gli stessi numeri e gli
// stessi ruoli. L'AI non decide nulla di misurabile: riscrive carte, scene
// e dilemmi nel mondo della persona (così ogni test è diverso) e scrive il
// report a partire da numeri e prove calcolati qui.
//
// Tutto il file è fatto di funzioni pure (niente DOM, niente rete): gira nel
// browser per il test e sul server per la rigenerazione con il CV, ed è
// testabile da Node.

import {
  AXES, AXIS_INFO, CARDS, SCENES, DILEMMAS, DILEMMI_MIN, DILEMMI_MAX,
  MOMENTI, MOMENTI_LAVORO, CARD_QUESTION, CARTE_PER_ASSE, GIORNATA,
  NOMI_CAST, RUOLI_CAST, SPUNTI, MONDO_NON_SO,
} from './v2-items.js';
import { ROLES } from './v2-roles.js';

export { AXES };
export const ENGINE_VERSION = '2.1';

// Peso di ogni tipo di risposta. Le carte valgono di più (giudizio diretto
// su un'attività).
const WEIGHTS = {
  card: 1,
  rank: 0.8,
  pick: 0.8,
  twostep: 0.8,
  budget: 0.9,
  energia: 0.9,
  drain: 0.9,
  dilemma: 0.9,
};
// I testi riscritti dall'AI pesano un po' meno di quelli scritti da noi: la
// dimensione di ogni opzione è fissa, ma le parole che la esprimono no.
const AI_FACTOR = 0.85;

const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const SCENE_BY_ID = Object.fromEntries(SCENES.map((s) => [s.id, s]));
const DIL_BY_ID = Object.fromEntries(DILEMMAS.map((d) => [d.id, d]));
const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

// ─── STATO E PERCORSO ──────────────────────────────────────────

// Stato iniziale di un test. `rand` è iniettabile per i test automatici.
// Ogni test pesca un mazzo, dei colleghi e uno spunto diversi.
export function createState({ nomeNoto = null, rand = Math.random } = {}) {
  return {
    v: 2,
    motore: ENGINE_VERSION,
    startedAt: new Date().toISOString(),
    nomeNoto: nomeNoto || null,
    seed: Math.floor(rand() * 2147483647),
    cast: pickCast(rand),
    spunto: SPUNTI[Math.floor(rand() * SPUNTI.length)],
    ordineCarte: shuffleCards(rand),
    answers: {},     // chiave del passo → risposta
    trail: [],       // chiavi risposte, in ordine (per "Indietro")
    dilemmi: [],     // id dei dilemmi già risolti, in ordine
    dilCorrente: null,
    carteAi: {},     // carte riscritte dall'AI, per id ({ standard: true } = mostrata com'era)
    scenes: {},      // scene riscritte dall'AI, per id (idem)
    dilemmiAi: {},   // dilemmi riscritti dall'AI, per id (idem)
  };
}

// I colleghi della giornata: tre nomi diversi a ogni test, più uno di
// riserva se la persona si chiama come uno di loro.
export function pickCast(rand = Math.random) {
  const nomi = shuffle(NOMI_CAST, rand);
  return { collega: nomi[0], capo: nomi[1], cliente: nomi[2], riserva: nomi[3] };
}

// Pesca CARTE_PER_ASSE carte per dimensione (il mazzo cambia a ogni test) e
// le mescola a "giri": in ogni giro compare una carta per dimensione, in
// ordine casuale e mai due carte della stessa dimensione di fila. Così le
// dimensioni si distribuiscono lungo tutto il mazzo.
export function shuffleCards(rand = Math.random) {
  const perAxis = {};
  AXES.forEach((k) => { perAxis[k] = shuffle(CARDS.filter((c) => c.asse === k).map((c) => c.id), rand).slice(0, CARTE_PER_ASSE); });
  const rounds = Math.max(...AXES.map((k) => perAxis[k].length));
  const out = [];
  let last = null;
  for (let r = 0; r < rounds; r++) {
    let order = shuffle(AXES.filter((k) => perAxis[k].length > r), rand);
    if (order.length > 1 && order[0] === last) order.push(order.shift());
    order.forEach((k) => out.push(perAxis[k][r]));
    last = order[order.length - 1];
  }
  return out;
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Il percorso del test, sempre ricalcolato dallo stato: dopo una ricarica
// della pagina si riparte esattamente dal passo giusto. Le schermate di
// introduzione ai capitoli sono passi "visti", non risposte.
export function nextStep(state) {
  const a = state.answers;
  if (!a.intro) return { key: 'intro', capitolo: 'prologo', tipo: 'intro' };
  if (!state.nomeNoto && !a.nome) return { key: 'nome', capitolo: 'prologo', tipo: 'nome' };
  if (!a.momento) return { key: 'momento', capitolo: 'prologo', tipo: 'momento' };
  if (!a.mondi) return { key: 'mondi', capitolo: 'prologo', tipo: 'mondi' };

  if (!a.cap1) return { key: 'cap1', capitolo: 'carte', tipo: 'capitolo', numero: 1 };
  for (let i = 0; i < state.ordineCarte.length; i++) {
    const id = state.ordineCarte[i];
    if (!a['card:' + id]) return { key: 'card:' + id, capitolo: 'carte', tipo: 'card', id, indice: i, totale: state.ordineCarte.length };
  }

  if (!a.cap2) return { key: 'cap2', capitolo: 'giornata', tipo: 'capitolo', numero: 2 };
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    if (!a['scene:' + s.id]) return { key: 'scene:' + s.id, capitolo: 'giornata', tipo: 'scene', id: s.id, indice: i, totale: SCENES.length };
  }

  if (!a.cap3) return { key: 'cap3', capitolo: 'dilemmi', tipo: 'capitolo', numero: 3 };
  if (dilemmaNeeded(state)) {
    const id = state.dilCorrente && !state.dilemmi.includes(state.dilCorrente) ? state.dilCorrente : pickDilemma(state);
    if (id) return { key: 'dil:' + id, capitolo: 'dilemmi', tipo: 'dilemma', id, indice: state.dilemmi.length };
  }

  if (!a.background) return { key: 'background', capitolo: 'epilogo', tipo: 'background' };
  if (!a.aspirazione) return { key: 'aspirazione', capitolo: 'epilogo', tipo: 'aspirazione' };
  if (!a.racconto) return { key: 'racconto', capitolo: 'epilogo', tipo: 'racconto' };
  return { key: 'reveal', capitolo: 'risultato', tipo: 'reveal' };
}

// Registra una risposta. I passi "visti" (introduzioni) non entrano nel
// percorso a ritroso: "Indietro" torna all'ultima vera domanda.
export function answer(state, key, value) {
  state.answers[key] = { ...value, at: Date.now() };
  const seen = key === 'intro' || /^cap\d$/.test(key);
  if (!seen) state.trail.push(key);
  if (key.startsWith('dil:')) {
    const id = key.slice(4);
    if (!state.dilemmi.includes(id)) state.dilemmi.push(id);
    state.dilCorrente = null;
  }
  return state;
}

// Annulla l'ultima risposta. Restituisce la chiave annullata (o null).
export function undo(state) {
  const key = state.trail.pop();
  if (!key) return null;
  delete state.answers[key];
  if (key.startsWith('dil:')) {
    const id = key.slice(4);
    state.dilemmi = state.dilemmi.filter((d) => d !== id);
    state.dilCorrente = id;
  }
  return key;
}

// Stima di avanzamento 0-1 (i dilemmi sono 4-6: contiamo 5).
export function progress(state) {
  const totale = 3 + state.ordineCarte.length + SCENES.length + 5 + 3;
  const fatti = state.trail.length;
  return clamp(fatti / totale, 0, 1);
}

function nomeDi(state) {
  const raw = String(state.nomeNoto || state.answers?.nome?.v || '').replace(/[{}<>]/g, '').trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null;
}

export function contextOf(state) {
  const a = state.answers;
  const momentoId = a.momento?.v || null;
  return {
    nome: nomeDi(state),
    nomeNuovo: !state.nomeNoto && !!(a.nome?.v || '').trim(),
    momento: momentoId,
    momentoTesto: MOMENTI.find((m) => m.id === momentoId)?.testo || null,
    lavora: MOMENTI_LAVORO.includes(momentoId),
    mondi: Array.isArray(a.mondi?.v) ? a.mondi.v : [],
    background: a.background?.v || null,
    aspirazione: (a.aspirazione?.v || '').trim() || null,
    racconto: (a.racconto?.v || '').trim() || null,
  };
}

// ─── TESTI SU MISURA ───────────────────────────────────────────

// I colleghi di questo test. Se la persona si chiama come uno di loro, quel
// collega prende il nome di riserva.
export function castOf(state) {
  const c = state.cast || { collega: 'Luca', capo: 'Sara', cliente: 'Marco', riserva: 'Elena' };
  const nome = (nomeDi(state) || '').toLowerCase();
  const out = {};
  for (const k of RUOLI_CAST) out[k] = nome && String(c[k]).toLowerCase() === nome ? c.riserva : c[k];
  return out;
}

function personaCtx(state) {
  return { nome: nomeDi(state), cast: castOf(state) };
}

// Sostituisce i segnaposto: {nome} con il nome della persona, {collega},
// {capo} e {cliente} con i colleghi di questo test. Se il nome non c'è, la
// frase si adatta ("{nome}, hai un minuto?" → "Hai un minuto?").
export function personalizza(text, { nome = null, cast = {} } = {}) {
  if (typeof text !== 'string') return '';
  let t = text
    .replace(/\{(collega|capo|cliente)\}/g, (_, k) => cast[k] || '')
    .replace(/\{(?!nome\})[^{}]*\}/g, '');
  if (nome) {
    t = t.replace(/\{nome\}/g, nome);
  } else {
    const iniziava = /^\s*[«"“]?\s*\{nome\}/.test(t);
    t = t
      .replace(/(^|[«"“]|[.!?]\s+)\{nome\}\s*,\s*([a-zàèéìòù])?/g, (m, pre, ch) => pre + (ch ? ch.toUpperCase() : ''))
      .replace(/\s*,\s*\{nome\}/g, '')
      .replace(/\s*\{nome\}\s*/g, ' ');
    t = t.trim();
    if (iniziava) t = t.replace(/^([«"“]?\s*)([a-zàèéìòù])/, (m, pre, ch) => pre + ch.toUpperCase());
  }
  return t
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?»;:])/g, '$1')
    .trim();
}

// Ordine casuale ma stabile per questo test: le opzioni non stanno sempre
// nella stessa posizione (chi sceglie la prima non sposta la misura), e
// ricaricando la pagina restano dove erano.
function hashStr(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function seededRand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function orderFor(state, key, list) {
  return shuffle(list, seededRand(hashStr(`${state?.seed ?? 0}:${key}`)));
}

const okText = (t, max, min = 1) => typeof t === 'string' && t.trim().length >= min && t.length <= max;

// ─── CARTE ─────────────────────────────────────────────────────

export function validAiCard(ai) {
  return !!ai && typeof ai === 'object' && !ai.standard && okText(ai.testo, 140, 8);
}

// La carta come la vede la persona: riscritta dall'AI nel suo mondo, se
// arrivata in tempo, altrimenti quella standard. Attività e dimensione non
// cambiano.
export function cardContent(state, id) {
  const c = CARD_BY_ID[id];
  if (!c) return null;
  const ai = state?.carteAi?.[id];
  const useAi = validAiCard(ai);
  const testo = useAi ? personalizza(ai.testo, personaCtx(state)).replace(/[.\s]+$/, '') : c.testo;
  return { ...c, testo, fonte: useAi ? 'ai' : 'standard' };
}

// ─── SCENE ─────────────────────────────────────────────────────

// Una scena dell'AI è accettata solo se ha esattamente le opzioni della
// scena standard, con le stesse dimensioni: la misura non cambia mai. Se
// l'AI sbaglia formato si usa la scena standard.
export function validAiScene(ai, scene) {
  if (!ai || typeof ai !== 'object' || ai.standard || !scene) return false;
  if (!okText(ai.titolo, 80) || !okText(ai.testo, 450) || !okText(ai.domanda, 160)) return false;
  if (ai.domanda2 != null && ai.domanda2 !== '' && !okText(ai.domanda2, 160)) return false;
  const lista = (aiList, std, { mittente = false } = {}) => {
    if (!Array.isArray(aiList) || aiList.length !== std.length) return false;
    const assi = new Set(std.map((o) => o.asse));
    const ok = aiList.every((o) => o && typeof o === 'object'
      && okText(o.testo, 150)
      && assi.has(o.asse)
      && (!mittente || okText(o.mittente, 60))
      && (o.eco == null || o.eco === '' || okText(o.eco, 220)));
    return ok && new Set(aiList.map((o) => o.asse)).size === std.length;
  };
  if (!lista(ai.opzioni, scene.opzioni, { mittente: scene.tipo === 'rank' })) return false;
  if (scene.opzioni2 && !lista(ai.opzioni2, scene.opzioni2)) return false;
  return true;
}

// Contenuto effettivo di una scena: la versione dell'AI (se valida) o quella
// standard, con nomi e colleghi al loro posto e le opzioni in un ordine
// mescolato per questo test. Gli id delle opzioni sono sempre quelli
// standard: un id corrisponde sempre alla stessa dimensione.
export function sceneContent(state, id) {
  const s = SCENE_BY_ID[id];
  if (!s) return null;
  const ai = state?.scenes?.[id];
  const useAi = validAiScene(ai, s);
  const ctx = personaCtx(state);
  const p = (t) => personalizza(t, ctx);
  const build = (std, aiList, key) => orderFor(state, `${id}:${key}`, std.map((o) => {
    const src = useAi ? aiList.find((x) => x.asse === o.asse) : o;
    const out = { id: o.id, asse: o.asse, testo: p(src.testo) };
    if (o.mittente != null) out.mittente = p(src.mittente);
    const eco = p(src.eco || '');
    if (eco) out.eco = eco;
    return out;
  }));
  const domanda2 = useAi && okText(ai.domanda2, 160) ? ai.domanda2 : s.domanda2;
  return {
    ...s,
    titolo: p(useAi ? ai.titolo : s.titolo),
    testo: p(useAi ? ai.testo : s.testo),
    domanda: p(useAi ? ai.domanda : s.domanda),
    domanda2: s.domanda2 ? p(domanda2) : undefined,
    opzioni: build(s.opzioni, ai?.opzioni, 'o'),
    opzioni2: s.opzioni2 ? build(s.opzioni2, ai?.opzioni2, 'o2') : undefined,
    fonte: useAi ? 'ai' : 'standard',
  };
}

// L'opzione che "porta avanti la storia" in una scena già giocata.
function sceltaGuida(scena, ans, sc) {
  if (!ans) return null;
  if (scena.tipo === 'rank') return ans.order?.[0] || null;
  if (scena.tipo === 'pick') return ans.pick || null;
  if (scena.tipo === 'twostep') return ans.first || null;
  if (scena.tipo === 'budget') {
    let best = null;
    let max = 0;
    for (const o of sc.opzioni) {
      const t = Number(ans.tokens?.[o.id]) || 0;
      if (t > max) { max = t; best = o.id; }
    }
    return best;
  }
  return null;
}

// La frase che apre una scena raccontando le conseguenze della scelta fatta
// nella scena prima: la giornata risponde a quello che la persona decide.
// Se la scena nuova chiama già la persona per nome, l'eco non lo ripete.
export function sceneOpening(state, id) {
  const i = SCENES.findIndex((s) => s.id === id);
  if (i <= 0) return null;
  const prev = SCENES[i - 1];
  const ans = state.answers?.['scene:' + prev.id];
  if (!ans) return null;
  const sc = sceneContent(state, prev.id);
  const optId = sceltaGuida(prev, ans, sc);
  const std = prev.opzioni.find((o) => o.id === optId);
  if (!std) return null;
  const ai = state.scenes?.[prev.id];
  const raw = sc.fonte === 'ai' ? ai.opzioni.find((o) => o.asse === std.asse)?.eco : std.eco;
  if (!raw) return null;
  const ctx = personaCtx(state);
  const giaNominata = ctx.nome && sceneContent(state, id).testo.includes(ctx.nome);
  return personalizza(raw, giaNominata ? { ...ctx, nome: null } : ctx) || null;
}

// ─── DILEMMI ───────────────────────────────────────────────────

export function validAiDilemma(ai) {
  return !!ai && typeof ai === 'object' && !ai.standard
    && okText(ai.a, 140, 3) && okText(ai.b, 140, 3)
    && (ai.intro == null || ai.intro === '' || okText(ai.intro, 220));
}

export function dilemmaContent(state, id) {
  const d = DIL_BY_ID[id];
  if (!d) return null;
  const ai = state?.dilemmiAi?.[id];
  const useAi = validAiDilemma(ai);
  const ctx = personaCtx(state);
  const p = (t) => personalizza(t, ctx);
  return {
    id,
    intro: useAi && ai.intro ? p(ai.intro) : null,
    a: { asse: d.a.asse, testo: p(useAi ? ai.a : d.a.testo) },
    b: { asse: d.b.asse, testo: p(useAi ? ai.b : d.b.testo) },
    fonte: useAi ? 'ai' : 'standard',
  };
}

// ─── CONGELAMENTO ──────────────────────────────────────────────
// Un contenuto si "congela" la prima volta che compare: se l'AI risponde
// dopo, quello che la persona ha già visto (e magari scelto) non cambia.
function freeze(map, id) {
  if (map[id]) return false;
  map[id] = { standard: true };
  return true;
}
export function lockCard(state, id) { state.carteAi ||= {}; return freeze(state.carteAi, id); }
export function lockScene(state, id) { state.scenes ||= {}; return freeze(state.scenes, id); }
export function lockDilemma(state, id) { state.dilemmiAi ||= {}; return freeze(state.dilemmiAi, id); }

// ─── RICHIESTE ALL'AI E RISPOSTE ───────────────────────────────
// L'AI riceve solo mondi, momento professionale, i colleghi inventati e i
// testi standard da riscrivere: mai il nome della persona (scrive {nome} e
// lo inseriamo noi) né le sue risposte libere.

function mondiScelti(state) {
  return contextOf(state).mondi.filter((m) => m !== MONDO_NON_SO);
}

// Le prime carte partono subito con il testo standard; l'AI riscrive le
// successive mentre la persona gioca.
const CARTE_SUBITO = 3;

export function richiestaCarte(state) {
  if (!state.answers?.mondi) return null;
  const carte = state.ordineCarte
    .slice(CARTE_SUBITO)
    .filter((id) => !state.carteAi?.[id] && !state.answers['card:' + id])
    .map((id) => ({ id, testo: CARD_BY_ID[id].testo, asse: CARD_BY_ID[id].asse }));
  if (!carte.length) return null;
  return { mondi: mondiScelti(state), momento: contextOf(state).momentoTesto, carte };
}

export function accettaCarte(state, data) {
  state.carteAi ||= {};
  const list = Array.isArray(data?.carte) ? data.carte : [];
  let n = 0;
  for (const x of list) {
    const id = x?.id;
    if (typeof id !== 'string' || !CARD_BY_ID[id] || !state.ordineCarte.includes(id) || state.carteAi[id]) continue;
    const v = { testo: typeof x.testo === 'string' ? x.testo.trim() : '' };
    if (!validAiCard(v)) continue;
    state.carteAi[id] = v;
    n++;
  }
  return n;
}

// La scena standard, con i colleghi già al loro posto e {nome} lasciato
// come segnaposto: è il modello che l'AI riambienta.
function sceneTemplate(state, id) {
  const s = SCENE_BY_ID[id];
  const p = (t) => personalizza(t, { nome: '{nome}', cast: castOf(state) });
  const opt = (o) => ({ asse: o.asse, ...(o.mittente ? { mittente: p(o.mittente) } : {}), testo: p(o.testo) });
  return {
    id: s.id,
    ora: s.ora,
    tipo: s.tipo,
    ...(s.scegli ? { scegli: s.scegli } : {}),
    titolo: s.titolo,
    testo: p(s.testo),
    domanda: s.domanda,
    ...(s.domanda2 ? { domanda2: s.domanda2 } : {}),
    opzioni: s.opzioni.map(opt),
    ...(s.opzioni2 ? { opzioni2: s.opzioni2.map(opt) } : {}),
  };
}

export function richiestaGiornata(state, parte) {
  if (!state.answers?.mondi) return null;
  const ids = (GIORNATA[parte] || []).filter((id) => !state.scenes?.[id]);
  if (!ids.length) return null;
  return {
    parte,
    mondi: mondiScelti(state),
    momento: contextOf(state).momentoTesto,
    spunto: state.spunto || null,
    colleghi: castOf(state),
    scene: ids.map((id) => sceneTemplate(state, id)),
  };
}

// Il nome della dimensione come lo scriviamo noi, anche se l'AI ha perso un
// accento o cambiato le maiuscole ("creativita" → "Creatività").
const senzaAccenti = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const ASSE_CANONICO = Object.fromEntries(AXES.map((k) => [senzaAccenti(k), k]));
function canonAsse(x) {
  return ASSE_CANONICO[senzaAccenti(x)] || x;
}

function pulisciOpzione(o) {
  return {
    asse: o.asse,
    testo: String(o.testo).trim(),
    ...(typeof o.mittente === 'string' ? { mittente: o.mittente.trim() } : {}),
    ...(typeof o.eco === 'string' && o.eco.trim() ? { eco: o.eco.trim() } : {}),
  };
}

export function accettaGiornata(state, data, parte) {
  state.scenes ||= {};
  const list = Array.isArray(data?.scene) ? data.scene : [];
  let n = 0;
  for (const id of GIORNATA[parte] || []) {
    if (state.scenes[id]) continue;
    const trovata = list.find((x) => x && x.id === id);
    if (!trovata) continue;
    const conAssi = (l) => (Array.isArray(l) ? l.map((o) => (o && typeof o === 'object' ? { ...o, asse: canonAsse(o.asse) } : o)) : l);
    const ai = { ...trovata, opzioni: conAssi(trovata.opzioni), opzioni2: conAssi(trovata.opzioni2) };
    if (!validAiScene(ai, SCENE_BY_ID[id])) continue;
    state.scenes[id] = {
      titolo: ai.titolo.trim(),
      testo: ai.testo.trim(),
      domanda: ai.domanda.trim(),
      ...(okText(ai.domanda2, 160) ? { domanda2: ai.domanda2.trim() } : {}),
      opzioni: ai.opzioni.map(pulisciOpzione),
      ...(Array.isArray(ai.opzioni2) ? { opzioni2: ai.opzioni2.map(pulisciOpzione) } : {}),
    };
    n++;
  }
  return n;
}

export function richiestaDilemmi(state) {
  if (!state.answers?.mondi) return null;
  const todo = DILEMMAS.filter((d) => !state.dilemmiAi?.[d.id]);
  if (!todo.length) return null;
  return {
    mondi: mondiScelti(state),
    momento: contextOf(state).momentoTesto,
    colleghi: castOf(state),
    dilemmi: todo.map((d) => ({ id: d.id, a: { testo: d.a.testo, asse: d.a.asse }, b: { testo: d.b.testo, asse: d.b.asse } })),
  };
}

export function accettaDilemmi(state, data) {
  state.dilemmiAi ||= {};
  const list = Array.isArray(data?.dilemmi) ? data.dilemmi : [];
  const testo = (v) => (typeof v === 'string' ? v : typeof v?.testo === 'string' ? v.testo : '').trim();
  let n = 0;
  for (const x of list) {
    const id = x?.id;
    if (typeof id !== 'string' || !DIL_BY_ID[id] || state.dilemmiAi[id]) continue;
    const v = { intro: testo(x.intro), a: testo(x.a), b: testo(x.b) };
    if (!validAiDilemma(v)) continue;
    state.dilemmiAi[id] = v;
    n++;
  }
  return n;
}

// ─── PROVE: da ogni risposta, segnali sulle dimensioni ─────────

// Ogni prova: { asse, e (da -1 a +1), w (peso), src (da dove viene) }.
export function collectEvidence(state) {
  const ev = [];
  const a = state.answers;

  // Carte. "Forse" vale poco più di zero. La correzione sulla media toglie
  // l'effetto di chi risponde sì (o no) a quasi tutto: conta quanto una
  // carta piace RISPETTO alle altre, non l'entusiasmo generale.
  const cardAns = CARDS.filter((c) => a['card:' + c.id]).map((c) => ({ c, v: a['card:' + c.id].v }));
  const base = (v) => (v === 'si' ? 1 : v === 'forse' ? 0.2 : -1);
  const meanBase = cardAns.length >= 8 ? sum(cardAns, (x) => base(x.v)) / cardAns.length : 0;
  for (const { c, v } of cardAns) {
    const e = clamp(base(v) - 0.5 * meanBase, -1, 1);
    const w = WEIGHTS.card * (cardContent(state, c.id).fonte === 'ai' ? AI_FACTOR : 1);
    ev.push({ asse: c.asse, e, w, src: { tipo: 'card', id: c.id, v } });
    if (c.sec) ev.push({ asse: c.sec.asse, e, w: w * c.sec.peso, src: { tipo: 'card', id: c.id, v, secondaria: true } });
  }

  for (const s of SCENES) {
    const ans = a['scene:' + s.id];
    if (!ans) continue;
    const sc = sceneContent(state, s.id);
    const opt = (id) => sc.opzioni.find((o) => o.id === id);
    const f = sc.fonte === 'ai' ? AI_FACTOR : 1;

    if (s.tipo === 'rank') {
      const valori = [1, 0.6, 0.3];
      const order = (ans.order || []).filter((id) => opt(id));
      sc.opzioni.forEach((o) => {
        const pos = order.indexOf(o.id);
        const e = pos >= 0 ? (valori[pos] ?? 0.2) : -0.25;
        ev.push({ asse: o.asse, e, w: WEIGHTS.rank * f, src: { tipo: 'rank', scena: s.id, opzione: o.id, pos } });
      });
    } else if (s.tipo === 'pick') {
      const w = WEIGHTS.pick * f;
      sc.opzioni.forEach((o) => {
        const scelta = o.id === ans.pick;
        ev.push({ asse: o.asse, e: scelta ? 1 : -0.33, w, src: { tipo: 'pick', scena: s.id, opzione: o.id, scelta } });
      });
    } else if (s.tipo === 'twostep') {
      sc.opzioni.forEach((o) => {
        const e = o.id === ans.first ? 1 : o.id === ans.second ? 0.5 : -0.4;
        const pos = o.id === ans.first ? 0 : o.id === ans.second ? 1 : -1;
        ev.push({ asse: o.asse, e, w: WEIGHTS.twostep * f, src: { tipo: 'twostep', scena: s.id, opzione: o.id, pos } });
      });
    } else if (s.tipo === 'budget') {
      const media = s.gettoni / sc.opzioni.length;
      sc.opzioni.forEach((o) => {
        const t = Number(ans.tokens?.[o.id]) || 0;
        ev.push({ asse: o.asse, e: clamp((t - media) / 2.5, -1, 1), w: WEIGHTS.budget * f, src: { tipo: 'budget', scena: s.id, opzione: o.id, t } });
      });
    } else if (s.tipo === 'energia') {
      const scelte = (ans.energia || []).filter((id) => opt(id));
      const val = scelte.length > 1 ? 0.85 : 1;
      scelte.forEach((id) => {
        ev.push({ asse: opt(id).asse, e: val, w: WEIGHTS.energia * f, src: { tipo: 'energia', scena: s.id, opzione: id } });
      });
      const drain = sc.opzioni2.find((o) => o.id === ans.drain);
      if (drain) ev.push({ asse: drain.asse, e: -1, w: WEIGHTS.drain * f, src: { tipo: 'drain', scena: s.id, opzione: drain.id } });
    }
  }

  for (const id of state.dilemmi) {
    const d = DIL_BY_ID[id];
    const ans = a['dil:' + id];
    if (!d || !ans || (ans.pick !== 'a' && ans.pick !== 'b')) continue;
    const win = d[ans.pick];
    const lose = d[ans.pick === 'a' ? 'b' : 'a'];
    const w = WEIGHTS.dilemma * (dilemmaContent(state, id).fonte === 'ai' ? AI_FACTOR : 1);
    ev.push({ asse: win.asse, e: 0.8, w, src: { tipo: 'dilemma', id, scelta: ans.pick, vince: true } });
    ev.push({ asse: lose.asse, e: -0.6, w, src: { tipo: 'dilemma', id, scelta: ans.pick, vince: false } });
  }
  return ev;
}

// ─── PROFILO: punteggi, confidenza, qualità ────────────────────

const CONF_ORDER = ['bassa', 'media', 'alta'];

export function computeProfile(state) {
  const ev = collectEvidence(state);
  const stats = {};
  for (const k of AXES) {
    const list = ev.filter((x) => x.asse === k);
    const W = sum(list, (x) => x.w);
    const m = W ? sum(list, (x) => x.w * x.e) / W : 0;
    const varW = W ? sum(list, (x) => x.w * (x.e - m) ** 2) / W : 0;
    const sd = Math.max(Math.sqrt(varW), 0.35);
    const nEff = W ? (W * W) / sum(list, (x) => x.w * x.w) : 0;
    const se = nEff ? sd / Math.sqrt(nEff) : 1;
    // Con pochi segnali il punteggio resta vicino al centro invece di
    // saltare agli estremi per una risposta sola.
    const shrink = W / (W + 1.5);
    const score = Math.round(clamp(50 + 50 * clamp(m * 1.15, -1, 1) * shrink, 3, 97));
    const conf = W >= 6 && se <= 0.2 ? 'alta' : W >= 3.5 && se <= 0.3 ? 'media' : 'bassa';
    stats[k] = { score, conf, W: round2(W), m: round2(m), se: round2(se), n: list.length };
  }

  const qualita = assessQuality(state, stats);
  const assi = {};
  const confidenza = {};
  for (const k of AXES) {
    assi[k] = stats[k].score;
    let c = stats[k].conf;
    // Risposte troppo rapide o tutte uguali: diciamo onestamente che siamo
    // meno sicuri, invece di presentare certezze che non abbiamo.
    if (qualita.livello === 'attenzione') c = CONF_ORDER[Math.max(0, CONF_ORDER.indexOf(c) - 1)];
    confidenza[k] = c;
  }
  return { assi, confidenza, stats, qualita };
}

function round2(x) { return Math.round(x * 100) / 100; }

export function assessQuality(state, stats) {
  const a = state.answers;
  const segnali = [];
  const cards = CARDS.map((c) => a['card:' + c.id]).filter(Boolean);
  const ms = cards.map((x) => x.ms).filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (ms.length >= 10) {
    const mediana = ms[Math.floor(ms.length / 2)];
    if (mediana < 700) segnali.push('veloce');
  }
  if (cards.length >= 14) {
    const conta = {};
    cards.forEach((x) => { conta[x.v] = (conta[x.v] || 0) + 1; });
    if (Math.max(...Object.values(conta)) / cards.length >= 0.86) segnali.push('uniforme');
  }
  const misurati = AXES.filter((k) => stats[k].W >= 3);
  if (misurati.length >= 5) {
    const seMedio = sum(misurati, (k) => stats[k].se) / misurati.length;
    if (seMedio > 0.3) segnali.push('incoerente');
  }
  const testi = {
    veloce: 'molte risposte sono arrivate in meno di un secondo',
    uniforme: 'quasi tutte le carte hanno avuto la stessa risposta',
    incoerente: 'alcune scelte vanno in direzioni opposte tra loro',
  };
  return {
    livello: segnali.length ? 'attenzione' : 'ok',
    segnali,
    nota: segnali.length
      ? `Prendi questo profilo come una prima bozza: ${segnali.map((s) => testi[s]).join(' e ')}.`
      : null,
  };
}

// ─── DILEMMI ADATTIVI ──────────────────────────────────────────

export function dilemmaNeeded(state) {
  const fatti = state.dilemmi.length;
  if (fatti >= DILEMMI_MAX) return false;
  if (fatti < DILEMMI_MIN) return true;
  const p = computeProfile(state);
  return AXES.some((k) => p.confidenza[k] === 'bassa');
}

// Sceglie il dilemma più utile ora: tra le dimensioni ancora incerte, e tra
// le dimensioni in testa con punteggi vicini (per capire quale viene prima,
// che è ciò che decide i ruoli). Penalizza le dimensioni già messe alla
// prova in questo capitolo, così i dilemmi non insistono sempre sulle stesse.
export function pickDilemma(state) {
  const p = computeProfile(state);
  const usati = new Set(state.dilemmi);
  const uso = {};
  state.dilemmi.forEach((id) => {
    const d = DIL_BY_ID[id];
    if (!d) return;
    uso[d.a.asse] = (uso[d.a.asse] || 0) + 1;
    uso[d.b.asse] = (uso[d.b.asse] || 0) + 1;
  });
  const incertezza = (k) => Math.min(1, p.stats[k].se / 0.3) + (p.stats[k].W < 5 ? 0.3 : 0);
  const top = [...AXES].sort((x, y) => p.assi[y] - p.assi[x]).slice(0, 4);

  let best = null;
  let bestScore = -Infinity;
  for (const d of DILEMMAS) {
    if (usati.has(d.id)) continue;
    const x = d.a.asse;
    const y = d.b.asse;
    let s = incertezza(x) + incertezza(y);
    if (top.includes(x) && top.includes(y) && Math.abs(p.assi[x] - p.assi[y]) <= 10) s += 0.6;
    s -= 0.45 * ((uso[x] || 0) + (uso[y] || 0));
    if (s > bestScore) { bestScore = s; best = d.id; }
  }
  return best;
}

// ─── RUOLI ─────────────────────────────────────────────────────

// Compatibilità persona-ruolo, 0-100. Due componenti:
// - distanza sulle dimensioni, pesando di più quelle che il ruolo chiede
//   tanto o quasi per niente (le altre gli sono indifferenti);
// - somiglianza di "forma": quali dimensioni spiccano rispetto alle altre.
// I punteggi misurati tendono verso il centro (per costruzione: segnali
// rumorosi + prudenza), quindi prima del confronto li "allarghiamo" un po',
// altrimenti i ruoli con profili medi vincerebbero sempre.
const STRETCH = 1.15;

export function matchScore(assi, confidenza, role) {
  const s = AXES.map((k) => clamp(50 + ((assi[k] ?? 50) - 50) * STRETCH, 0, 100));
  const r = role.assi;
  const cw = AXES.map((k) => (confidenza?.[k] === 'alta' ? 1 : confidenza?.[k] === 'media' ? 0.8 : 0.55));

  let num = 0;
  let den = 0;
  for (let i = 0; i < AXES.length; i++) {
    const w = (0.6 + Math.abs(r[i] - 50) / 30) * cw[i];
    num += w * Math.abs(s[i] - r[i]);
    den += w;
  }
  const livello = 100 - 1.5 * (num / den);

  const ms = sum(s) / s.length;
  const mr = sum(r) / r.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < AXES.length; i++) {
    const dx = (s[i] - ms) * cw[i];
    const dy = (r[i] - mr) * cw[i];
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const corr = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  const forma = 50 + 50 * corr;

  return clamp(Math.round(0.45 * livello + 0.55 * forma), 1, 99);
}

// Dentro una stessa famiglia (es. Data Analyst, Risk analyst, Attuario) i
// ruoli sono quasi equivalenti sulle 7 dimensioni: da sole non bastano a
// sceglierne uno. A parità quasi perfetta decidono i mondi che la persona ha
// scelto (+2) e la sua formazione (+1, non per chi vuole cambiare strada).
// Il vantaggio è piccolo apposta: non può scavalcare un ruolo davvero più
// compatibile.
const AREE_PER_MONDO = {
  'Tecnologia e digitale': ['tecnologia', 'prodotto', 'dati'],
  'Finanza, banche e assicurazioni': ['finanza', 'dati'],
  'Sanità e farmaceutico': ['salute'],
  'Industria, energia e ambiente': ['tecnica'],
  'Moda, lusso e design': ['prodotto', 'comunicazione', 'marketing'],
  'Commercio, retail e largo consumo': ['vendite', 'marketing'],
  'Media, comunicazione e marketing': ['comunicazione', 'marketing'],
  'Arte, cultura e intrattenimento': ['cultura', 'comunicazione'],
  'Turismo, ristorazione e ospitalità': ['ospitalita'],
  'Istruzione, formazione e ricerca': ['educazione', 'persone'],
  'Pubblica amministrazione e non profit': ['istituzioni', 'persone'],
  'Edilizia, immobiliare e infrastrutture': ['tecnica'],
  Difesa: ['tecnica', 'tecnologia', 'istituzioni'],
};
const AREE_PER_BACKGROUND = {
  'Umanistico, comunicazione, lingue': ['comunicazione', 'persone', 'educazione', 'cultura'],
  'Economico, gestionale, aziendale': ['finanza', 'dati', 'consulenza', 'vendite', 'marketing'],
  'Scientifico, tecnico, ingegneristico': ['tecnologia', 'tecnica', 'dati', 'educazione'],
  'Giuridico, politico, relazioni internazionali': ['istituzioni', 'persone'],
  'Artistico, creativo, design': ['prodotto', 'comunicazione', 'cultura'],
  'Sanitario, biologico, psicologico': ['salute', 'persone'],
};

export function contextBonus(role, contesto) {
  if (!contesto) return 0;
  const mondi = (contesto.mondi || []).flatMap((m) => AREE_PER_MONDO[m] || []);
  let b = mondi.includes(role.area) ? 2 : 0;
  const bg = AREE_PER_BACKGROUND[contesto.background] || [];
  if (contesto.momento !== 'cambio' && bg.includes(role.area)) b += 1;
  return b;
}

// La percentuale mostrata: nessun ruolo è "perfetto", quindi la parte alta
// della scala viene compressa (un 96 grezzo diventa 90) e il massimo è 95.
// Con risposte poco affidabili (troppo rapide o tutte uguali) le
// percentuali si avvicinano al centro: il risultato è solo indicativo.
export function calibrateMatch(raw, attenzione = false) {
  let m = raw > 80 ? 80 + (raw - 80) * 0.65 : raw;
  if (attenzione) m = 60 + (m - 60) * 0.8;
  return clamp(Math.round(m), 1, 95);
}

export function rankRoles(assi, confidenza, contesto = null, { attenzione = false } = {}) {
  return ROLES
    .map((role) => {
      const raw = matchScore(assi, confidenza, role) + contextBonus(role, contesto);
      return { role, raw, match: calibrateMatch(raw, attenzione) };
    })
    .sort((x, y) => y.raw - x.raw || x.role.nome.localeCompare(y.role.nome));
}

function roleOut(x) {
  return { id: x.role.id, nome: x.role.nome, match: x.match, area: x.role.area, desc: x.role.desc };
}

// I 3 ruoli principali: i più compatibili, ma con un piccolo sconto per chi
// è della stessa area di un ruolo già scelto, così non escono tre varianti
// dello stesso mestiere quando c'è un'alternativa quasi altrettanto vicina.
export function pickRoles(ranked) {
  const main = ranked.filter((x) => !x.role.bonus);
  const top = [];
  while (top.length < 3 && top.length < main.length) {
    let best = null;
    let bestEff = -Infinity;
    for (const x of main) {
      if (top.includes(x)) continue;
      const eff = (x.raw ?? x.match) - 3 * top.filter((t) => t.role.area === x.role.area).length;
      if (eff > bestEff) { bestEff = eff; best = x; }
    }
    top.push(best);
  }
  const bonus = ranked.find((x) => x.role.bonus) || null;
  const mismatch = [];
  const aree = new Set(top.map((t) => t.role.area));
  for (const x of [...main].reverse()) {
    if (mismatch.length >= 3) break;
    if (aree.has(x.role.area) || mismatch.some((m) => m.role.area === x.role.area)) continue;
    mismatch.push(x);
  }
  return { top, bonus, mismatch };
}

// ─── PROVE LEGGIBILI E TENSIONI ────────────────────────────────

function sceneOption(state, sceneId, optId, secondo = false) {
  const sc = sceneContent(state, sceneId);
  const list = secondo ? sc.opzioni2 : sc.opzioni;
  return { sc, o: list?.find((x) => x.id === optId) };
}

// Trasforma una prova in una frase che la persona riconosce ("alle 9 hai
// aperto per prima..."). Restituisce null per le prove troppo deboli o
// indirette per essere raccontate.
export function describeEvidence(state, x) {
  const s = x.src;
  if (s.tipo === 'card') {
    if (s.secondaria || s.v === 'forse') return null;
    const c = cardContent(state, s.id);
    return `Alla carta «${c.testo}» hai risposto ${s.v === 'si' ? 'sì' : 'no'}`;
  }
  if (s.tipo === 'rank') {
    const { sc, o } = sceneOption(state, s.scena, s.opzione);
    if (s.pos < 0) return null;
    const ord = s.pos === 0 ? 'per primo' : s.pos === 1 ? 'per secondo' : 'per terzo';
    const da = o.mittente ? ` di ${o.mittente.split(',')[0].trim()}` : '';
    return `Alle ${sc.ora}, tra i messaggi, hai aperto ${ord} quello${da}: «${o.testo}»`;
  }
  if (s.tipo === 'pick') {
    const { sc, o } = sceneOption(state, s.scena, s.opzione);
    return s.scelta ? `Alle ${sc.ora} («${sc.titolo}») hai scelto «${o.testo}»` : null;
  }
  if (s.tipo === 'twostep') {
    const { sc, o } = sceneOption(state, s.scena, s.opzione);
    if (s.pos === 0) return `Davanti all'imprevisto delle ${sc.ora}, la tua prima mossa è stata «${o.testo}»`;
    if (s.pos === 1) return `Davanti all'imprevisto delle ${sc.ora}, la tua seconda mossa è stata «${o.testo}»`;
    return `Davanti all'imprevisto delle ${sc.ora} hai lasciato per ultimo «${o.testo}»`;
  }
  if (s.tipo === 'budget') {
    const { o } = sceneOption(state, s.scena, s.opzione);
    if (s.t === 0) return `Nel progetto nuovo non hai messo nemmeno un gettone su «${o.testo}»`;
    if (s.t >= 3) return `Nel progetto nuovo hai messo ${s.t} gettoni su «${o.testo}»`;
    return null;
  }
  if (s.tipo === 'energia') {
    const { o } = sceneOption(state, s.scena, s.opzione);
    return `A fine giornata ti ha dato energia «${o.testo.charAt(0).toLowerCase() + o.testo.slice(1)}»`;
  }
  if (s.tipo === 'drain') {
    const { o } = sceneOption(state, s.scena, s.opzione, true);
    return `A fine giornata ti ha tolto energia «${o.testo.charAt(0).toLowerCase() + o.testo.slice(1)}»`;
  }
  if (s.tipo === 'dilemma') {
    const d = dilemmaContent(state, s.id);
    const scelta = d[s.scelta].testo;
    const altra = d[s.scelta === 'a' ? 'b' : 'a'].testo;
    return `Potendo scegliere, hai preferito «${scelta}» a «${altra}»`;
  }
  return null;
}

// Le prove più forti a favore delle dimensioni in testa e contro quelle in
// fondo: sono le "pezze d'appoggio" mostrate nel report.
export function buildProve(state, profile, ev = collectEvidence(state)) {
  const ordinati = [...AXES].sort((x, y) => profile.assi[y] - profile.assi[x]);
  const alti = ordinati.slice(0, 3);
  const bassi = ordinati.slice(-2).filter((k) => profile.assi[k] < 45);
  const usate = new Set();
  const out = [];

  // Per ogni dimensione, prove da momenti diversi del test (una scena, un
  // dilemma, una carta...) invece delle sole carte, che pesano di più ma
  // raccontano meno: sono le scelte nella giornata a far riconoscere la
  // persona nel report.
  const take = (k, segno, n) => {
    const cand = ev
      .filter((x) => x.asse === k && Math.sign(x.e) === segno)
      .sort((x, y) => segno * (y.w * y.e - x.w * x.e))
      .map((x) => ({ x, testo: describeEvidence(state, x) }))
      .filter((c) => c.testo && !usate.has(c.testo));
    const tipi = new Set();
    const scelte = [];
    for (const c of cand) {
      if (scelte.length >= n) break;
      const tipo = c.x.src.tipo === 'card' ? 'card' : 'scelta';
      if (tipi.has(tipo) && cand.some((d) => !scelte.includes(d) && d !== c && !tipi.has(d.x.src.tipo === 'card' ? 'card' : 'scelta'))) continue;
      tipi.add(tipo);
      scelte.push(c);
    }
    for (const c of cand) {
      if (scelte.length >= n) break;
      if (!scelte.includes(c)) scelte.push(c);
    }
    scelte.forEach((c) => { usate.add(c.testo); out.push({ asse: k, segno, testo: c.testo }); });
  };
  alti.forEach((k, i) => take(k, 1, i === 0 ? 3 : 2));
  bassi.forEach((k) => take(k, -1, 1));
  return out;
}

// Dove quello che piace "a parole" (le carte) e quello che si sceglie quando
// bisogna rinunciare a qualcosa (scene e dilemmi) non coincidono: sono gli
// spunti più preziosi per il report.
export function buildTensioni(ev) {
  const out = [];
  for (const k of AXES) {
    const carte = ev.filter((x) => x.asse === k && x.src.tipo === 'card' && !x.src.secondaria);
    const scelte = ev.filter((x) => x.asse === k && x.src.tipo !== 'card');
    if (carte.length < 3 || scelte.length < 3) continue;
    const mc = sum(carte, (x) => x.e) / carte.length;
    const ms = sum(scelte, (x) => x.w * x.e) / sum(scelte, (x) => x.w);
    if (mc - ms >= 0.75) out.push({ asse: k, tipo: 'dichiarato>scelto', testo: `${k}: ti attira quando lo immagini, ma quando devi scegliere lo metti dopo altro` });
    else if (ms - mc >= 0.75) out.push({ asse: k, tipo: 'scelto>dichiarato', testo: `${k}: a prima vista non ti attira molto, ma nelle scelte concrete torna spesso` });
  }
  return out;
}

// ─── RISULTATO COMPLETO ────────────────────────────────────────

export function computeResult(state) {
  const profile = computeProfile(state);
  const ev = collectEvidence(state);
  const ranked = rankRoles(profile.assi, profile.confidenza, contextOf(state), { attenzione: profile.qualita.livello === 'attenzione' });
  const { top, bonus, mismatch } = pickRoles(ranked);
  return {
    versione: 2,
    motore: ENGINE_VERSION,
    assi: profile.assi,
    assi_confidenza: profile.confidenza,
    qualita: profile.qualita,
    ruoli: top.map(roleOut),
    bonus: bonus ? roleOut(bonus) : null,
    mismatch: mismatch.map(roleOut),
    candidati: ranked.filter((x) => !x.role.bonus).slice(0, 10).map(roleOut),
    prove: buildProve(state, profile, ev),
    tensioni: buildTensioni(ev),
    // Quanto del test è stato scritto dall'AI per questa persona.
    fonti: {
      carte: state.ordineCarte.length,
      carte_ai: state.ordineCarte.filter((id) => cardContent(state, id).fonte === 'ai').length,
      scene_ai: SCENES.filter((s) => sceneContent(state, s.id).fonte === 'ai').map((s) => s.id),
      dilemmi: state.dilemmi.length,
      dilemmi_ai: state.dilemmi.filter((id) => dilemmaContent(state, id).fonte === 'ai').length,
    },
  };
}

// ─── RISPOSTE LEGGIBILI (storico e aziende) ────────────────────

// Elenco domanda/risposta salvato con il report. "indiretta: true" = da non
// mostrare mai alle aziende (vedi api/azienda.js).
export function buildAnswers(state) {
  const a = state.answers;
  const ctx = contextOf(state);
  const out = [];
  if (ctx.nomeNuovo) out.push({ id: 'nome', question: 'Come ti chiamiamo?', answer: ctx.nome, indiretta: false });
  if (ctx.momentoTesto) out.push({ id: 'momento', question: 'In che momento sei della tua vita professionale?', answer: ctx.momentoTesto, indiretta: true });
  if (ctx.mondi.length) out.push({ id: 'mondi', question: 'In quali mondi ti incuriosirebbe lavorare?', answer: ctx.mondi.join(', '), indiretta: false });

  const si = state.ordineCarte.filter((id) => a['card:' + id]?.v === 'si').map((id) => cardContent(state, id).testo);
  const no = state.ordineCarte.filter((id) => a['card:' + id]?.v === 'no').map((id) => cardContent(state, id).testo);
  if (si.length) out.push({ id: 'carte_si', question: `${CARD_QUESTION} Sì a:`, answer: si.join('; '), indiretta: false });
  if (no.length) out.push({ id: 'carte_no', question: `${CARD_QUESTION} No a:`, answer: no.join('; '), indiretta: false });

  for (const s of SCENES) {
    const ans = a['scene:' + s.id];
    if (!ans) continue;
    const sc = sceneContent(state, s.id);
    const t = (id, list = sc.opzioni) => list.find((o) => o.id === id)?.testo || '';
    let risposta = '';
    if (s.tipo === 'rank') risposta = (ans.order || []).map((id, i) => `${i + 1}. ${t(id)}`).join(' — ');
    else if (s.tipo === 'pick') risposta = t(ans.pick);
    else if (s.tipo === 'twostep') risposta = `Prima: ${t(ans.first)} — Poi: ${t(ans.second)}`;
    else if (s.tipo === 'budget') {
      risposta = sc.opzioni
        .filter((o) => (ans.tokens?.[o.id] || 0) > 0)
        .sort((x, y) => (ans.tokens[y.id] || 0) - (ans.tokens[x.id] || 0))
        .map((o) => `${o.testo} (${ans.tokens[o.id]})`).join('; ');
    } else if (s.tipo === 'energia') {
      risposta = `Energia: ${(ans.energia || []).map((id) => t(id)).join('; ')} — Fatica: ${t(ans.drain, sc.opzioni2)}`;
    }
    out.push({ id: 'scena_' + s.id, question: `${sc.ora} · ${sc.titolo}. ${sc.domanda}`, answer: risposta, indiretta: false });
  }

  state.dilemmi.forEach((id) => {
    const d = dilemmaContent(state, id);
    const ans = a['dil:' + id];
    if (!d || !ans) return;
    out.push({ id: 'dilemma_' + id, question: `Scelta difficile: «${d.a.testo}» oppure «${d.b.testo}»?`, answer: d[ans.pick]?.testo || '', indiretta: false });
  });

  if (ctx.background) out.push({ id: 'background', question: 'Qual è il tuo background formativo?', answer: ctx.background, indiretta: false });
  if (ctx.racconto) out.push({ id: 'racconto', question: 'Un momento in cui il tempo è volato', answer: ctx.racconto, indiretta: true });
  return out;
}

// ─── PASSAGGIO AL REPORT ───────────────────────────────────────

// Tutto quello che serve per scrivere e salvare il report, anche da un altro
// browser (viaggia nella bozza del link email) o più avanti con il CV.
export function buildPayload(state) {
  return {
    versione: 2,
    motore: ENGINE_VERSION,
    completatoIl: new Date().toISOString(),
    contesto: contextOf(state),
    risultato: computeResult(state),
    risposte: state.answers,
    ordineCarte: state.ordineCarte,
    dilemmi: state.dilemmi,
    seed: state.seed ?? null,
    cast: castOf(state),
    spunto: state.spunto || null,
    carteAi: state.carteAi || {},
    scenes: state.scenes,
    dilemmiAi: state.dilemmiAi || {},
  };
}

const pct = (n) => `${n}%`;

// Testo compatto del profilo, usato come "conversazione" di partenza dalle
// valutazioni di compatibilità (ruolo attuale, ruolo a cui si aspira) che
// si aspettano lo storico di un test.
export function profileSummaryText(payload) {
  const { contesto: c, risultato: r } = payload;
  const righe = [
    'Profilo emerso dal test RoleFit a capitoli (punteggi calcolati, non stimati).',
    c.nome ? `Nome: ${c.nome}.` : null,
    c.momentoTesto ? `Momento professionale: ${c.momentoTesto}.` : null,
    c.background ? `Formazione: ${c.background}.` : null,
    c.mondi.length ? `Mondi che lo incuriosiscono: ${c.mondi.join(', ')}.` : null,
    `Dimensioni (0-100, con confidenza): ${AXES.map((k) => `${k} ${r.assi[k]} (${r.assi_confidenza[k]})`).join(', ')}.`,
    `Ruoli più compatibili: ${r.ruoli.map((x) => `${x.nome} ${pct(x.match)}`).join(', ')}.`,
    r.prove.length ? `Scelte concrete più significative:\n${r.prove.map((p) => `- ${p.testo}`).join('\n')}` : null,
    r.tensioni.length ? `Tensioni tra quello che lo attira e quello che sceglie:\n${r.tensioni.map((t) => `- ${t.testo}`).join('\n')}` : null,
  ];
  return righe.filter(Boolean).join('\n');
}

export function syntheticHistory(payload) {
  return [
    { role: 'user', content: profileSummaryText(payload) },
    { role: 'assistant', content: 'Profilo ricevuto: lo userò per le valutazioni richieste.' },
  ];
}

// Messaggio per l'AI che scrive il report (fase "report_v2"). Numeri e ruoli
// sono già decisi: l'AI li spiega, non li cambia.
export function buildReportRequest(payload, { storico = null, cvText = null } = {}) {
  const { contesto: c, risultato: r } = payload;
  const blocchi = [];
  blocchi.push(`PERSONA\n${[
    c.nome ? `Nome: ${c.nome}` : 'Nome: non indicato (non inventarlo)',
    c.momentoTesto ? `Momento professionale: ${c.momentoTesto}` : null,
    c.background ? `Formazione: ${c.background}` : null,
    c.mondi.length ? `Mondi che la incuriosiscono: ${c.mondi.join(', ')}` : 'Mondi: non ancora chiari',
  ].filter(Boolean).join('\n')}`);

  blocchi.push(`PROFILO MISURATO (calcolato dalle risposte: non modificarlo, non citarne i numeri)\n${AXES.map((k) => `- ${k} (${AXIS_INFO[k]}): ${r.assi[k]}/100, confidenza ${r.assi_confidenza[k]}`).join('\n')}`);

  if (r.prove.length) {
    blocchi.push(`PROVE (scelte concrete fatte durante il test; usale come ancore, citandole in modo naturale)\n${r.prove.map((p) => `- [${p.asse}${p.segno > 0 ? ' +' : ' −'}] ${p.testo}`).join('\n')}`);
  }
  if (r.tensioni.length) {
    blocchi.push(`TENSIONI (dove quello che la attira e quello che sceglie divergono)\n${r.tensioni.map((t) => `- ${t.testo}`).join('\n')}`);
  }
  if (r.qualita?.nota) blocchi.push(`QUALITÀ DELLE RISPOSTE\n${r.qualita.nota} Scrivi con più prudenza del solito.`);

  blocchi.push(`RUOLI (già scelti dal motore: usa ESATTAMENTE questi nomi, in quest'ordine)\n${r.ruoli.map((x, i) => `${i + 1}. ${x.nome} — ${x.desc}`).join('\n')}\nBonus: ${r.bonus ? `${r.bonus.nome} — ${r.bonus.desc}` : 'nessuno'}\nNon fanno per lei/lui:\n${r.mismatch.map((x) => `- ${x.nome} — ${x.desc}`).join('\n')}`);

  if (c.aspirazione) blocchi.push(`RUOLO A CUI ASPIRA (valutato a parte: qui serve solo come contesto)\n${c.aspirazione}`);
  if (c.racconto) blocchi.push(`UN MOMENTO IN CUI IL TEMPO È VOLATO (scritto dalla persona, privato: usalo con delicatezza, mai nel riepilogo per le aziende)\n"""\n${c.racconto.slice(0, 1200)}\n"""`);
  if (storico) blocchi.push(`STORICO DEI TEST PRECEDENTI\n${storico}`);
  if (cvText) {
    blocchi.push(`ESTRATTO DEL CV (possibili imperfezioni di formattazione)\n"""\n${cvText}\n"""\nUsalo per rendere concreti "come si entra" e i settori, e per confrontare i ruoli con il percorso reale. Non cambia le dimensioni: dice cosa la persona ha fatto, non cosa la energizza.`);
  }
  blocchi.push('Scrivi il report completo in JSON, nel formato richiesto.');
  return blocchi.join('\n\n');
}

// Unisce il testo scritto dall'AI con i numeri del motore. Nomi, percentuali,
// dimensioni e prove vengono SEMPRE dal motore: l'AI non può cambiarli.
export function mergeReport(ai, payload) {
  const r = payload.risultato;
  const rep = ai?.report || ai || {};
  const byName = (list, nome, i) => {
    const arr = Array.isArray(list) ? list : [];
    return arr.find((x) => (x?.nome || '').trim().toLowerCase() === nome.toLowerCase()) || arr[i] || {};
  };
  const testo = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

  return {
    chi_sei: {
      come_funzioni: testo(rep.chi_sei?.come_funzioni),
      cosa_ti_alimenta: testo(rep.chi_sei?.cosa_ti_alimenta),
      di_cosa_hai_bisogno: testo(rep.chi_sei?.di_cosa_hai_bisogno),
    },
    riepilogo_aziende: testo(rep.riepilogo_aziende),
    ruoli: r.ruoli.map((x, i) => {
      const t = byName(rep.ruoli, x.nome, i);
      return {
        nome: x.nome,
        match: x.match,
        perche: testo(t.perche),
        cosa_fa: testo(t.cosa_fa, x.desc),
        come_si_entra: testo(t.come_si_entra),
        sorpresa: testo(t.sorpresa),
        settori: Array.isArray(t.settori) ? t.settori.filter((s) => s && typeof s.nome === 'string').slice(0, 3) : [],
      };
    }),
    bonus: r.bonus
      ? { nome: r.bonus.nome, testo: testo(rep.bonus?.testo, r.bonus.desc) }
      : { nome: '', testo: '' },
    ruoli_mismatch: r.mismatch.map((x, i) => {
      const t = byName(rep.ruoli_mismatch, x.nome, i);
      return { nome: x.nome, match: x.match, perche_no: testo(t.perche_no, x.desc) };
    }),
    assi: { ...r.assi },
    assi_confidenza: { ...r.assi_confidenza },
    prove: r.prove.map((p) => p.testo),
    qualita: r.qualita,
    versione_test: 2,
    motore: r.motore,
  };
}
