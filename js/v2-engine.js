// RoleFit — motore del test a capitoli (versione 2).
//
// Separa la MISURA dal RACCONTO. Ogni risposta ha un punteggio deciso prima
// (v2-items.js), i ruoli escono da una libreria con un profilo per ciascuno
// (v2-roles.js): le stesse risposte danno sempre gli stessi numeri e gli
// stessi ruoli. L'AI non decide più nulla di misurabile: personalizza due
// scene e scrive il report a partire da numeri e prove calcolati qui.
//
// Tutto il file è fatto di funzioni pure (niente DOM, niente rete): gira nel
// browser per il test e sul server per la rigenerazione con il CV, ed è
// testabile da Node.

import {
  AXES, AXIS_INFO, CARDS, SCENES, DILEMMAS, DILEMMI_MIN, DILEMMI_MAX,
  MOMENTI, MOMENTI_LAVORO, CARD_QUESTION,
} from './v2-items.js';
import { ROLES } from './v2-roles.js';

export { AXES };
export const ENGINE_VERSION = '2.0';

// Peso di ogni tipo di risposta. Le carte valgono di più (giudizio diretto
// su un'attività); le scene personalizzate dall'AI un po' meno, perché il
// legame opzione → dimensione lo scrive l'AI, non noi.
const WEIGHTS = {
  card: 1,
  rank: 0.8,
  pick: 0.8,
  pickAi: 0.6,
  twostep: 0.8,
  budget: 0.9,
  energia: 0.9,
  drain: 0.9,
  dilemma: 0.9,
};

const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const SCENE_BY_ID = Object.fromEntries(SCENES.map((s) => [s.id, s]));
const DIL_BY_ID = Object.fromEntries(DILEMMAS.map((d) => [d.id, d]));
const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

// ─── STATO E PERCORSO ──────────────────────────────────────────

// Stato iniziale di un test. `rand` è iniettabile per i test automatici.
export function createState({ nomeNoto = null, rand = Math.random } = {}) {
  return {
    v: 2,
    motore: ENGINE_VERSION,
    startedAt: new Date().toISOString(),
    nomeNoto: nomeNoto || null,
    ordineCarte: shuffleCards(rand),
    answers: {},     // chiave del passo → risposta
    trail: [],       // chiavi risposte, in ordine (per "Indietro")
    dilemmi: [],     // id dei dilemmi già risolti, in ordine
    dilCorrente: null,
    scenes: {},      // scene personalizzate dall'AI, per id
  };
}

// Mescola le carte a "giri": in ogni giro compare una carta per dimensione,
// in ordine casuale e mai due carte della stessa dimensione di fila. Così le
// dimensioni si distribuiscono lungo tutto il mazzo.
export function shuffleCards(rand = Math.random) {
  const perAxis = {};
  AXES.forEach((k) => { perAxis[k] = shuffle(CARDS.filter((c) => c.asse === k).map((c) => c.id), rand); });
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

export function contextOf(state) {
  const a = state.answers;
  const momentoId = a.momento?.v || null;
  return {
    nome: (state.nomeNoto || a.nome?.v || '').trim() || null,
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

// ─── SCENE PERSONALIZZATE ──────────────────────────────────────

// Una scena dell'AI è accettata solo se ha esattamente la forma attesa e le
// stesse 4 dimensioni della scena di riserva: la misura non cambia mai, se
// l'AI sbaglia formato si usa la scena standard.
export function validAiScene(ai, scene) {
  if (!ai || typeof ai !== 'object') return false;
  const okText = (t, max) => typeof t === 'string' && t.trim().length > 0 && t.length <= max;
  if (!okText(ai.titolo, 80) || !okText(ai.testo, 400) || !okText(ai.domanda, 160)) return false;
  if (!Array.isArray(ai.opzioni) || ai.opzioni.length !== 4) return false;
  if (!ai.opzioni.every((o) => o && okText(o.testo, 140) && scene.assi.includes(o.asse))) return false;
  return new Set(ai.opzioni.map((o) => o.asse)).size === 4;
}

// Contenuto effettivo di una scena: quella fissa, oppure la versione
// personalizzata (se valida) o di riserva, con id delle opzioni a/b/c/d.
export function sceneContent(state, id) {
  const s = SCENE_BY_ID[id];
  if (!s) return null;
  if (!s.personalizzata) return s;
  const ai = state?.scenes?.[id];
  const useAi = validAiScene(ai, s);
  const src = useAi ? ai : s.fallback;
  return {
    ...s,
    titolo: src.titolo.trim(),
    testo: src.testo.trim(),
    domanda: src.domanda.trim(),
    opzioni: src.opzioni.map((o, i) => ({ id: OPTION_IDS[i], testo: o.testo.trim(), asse: o.asse })),
    fonte: useAi ? 'ai' : 'standard',
  };
}

export const PERSONALIZED_SCENES = SCENES.filter((s) => s.personalizzata).map((s) => ({ id: s.id, ora: s.ora, assi: s.assi }));

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
    ev.push({ asse: c.asse, e, w: WEIGHTS.card, src: { tipo: 'card', id: c.id, v } });
    if (c.sec) ev.push({ asse: c.sec.asse, e, w: WEIGHTS.card * c.sec.peso, src: { tipo: 'card', id: c.id, v, secondaria: true } });
  }

  for (const s of SCENES) {
    const ans = a['scene:' + s.id];
    if (!ans) continue;
    const sc = sceneContent(state, s.id);
    const opt = (id) => sc.opzioni.find((o) => o.id === id);

    if (s.tipo === 'rank') {
      const valori = [1, 0.6, 0.3];
      const order = (ans.order || []).filter((id) => opt(id));
      sc.opzioni.forEach((o) => {
        const pos = order.indexOf(o.id);
        const e = pos >= 0 ? (valori[pos] ?? 0.2) : -0.25;
        ev.push({ asse: o.asse, e, w: WEIGHTS.rank, src: { tipo: 'rank', scena: s.id, opzione: o.id, pos } });
      });
    } else if (s.tipo === 'pick') {
      const w = s.personalizzata ? WEIGHTS.pickAi : WEIGHTS.pick;
      sc.opzioni.forEach((o) => {
        const scelta = o.id === ans.pick;
        ev.push({ asse: o.asse, e: scelta ? 1 : -0.33, w, src: { tipo: 'pick', scena: s.id, opzione: o.id, scelta } });
      });
    } else if (s.tipo === 'twostep') {
      sc.opzioni.forEach((o) => {
        const e = o.id === ans.first ? 1 : o.id === ans.second ? 0.5 : -0.4;
        const pos = o.id === ans.first ? 0 : o.id === ans.second ? 1 : -1;
        ev.push({ asse: o.asse, e, w: WEIGHTS.twostep, src: { tipo: 'twostep', scena: s.id, opzione: o.id, pos } });
      });
    } else if (s.tipo === 'budget') {
      const media = s.gettoni / sc.opzioni.length;
      sc.opzioni.forEach((o) => {
        const t = Number(ans.tokens?.[o.id]) || 0;
        ev.push({ asse: o.asse, e: clamp((t - media) / 2.5, -1, 1), w: WEIGHTS.budget, src: { tipo: 'budget', scena: s.id, opzione: o.id, t } });
      });
    } else if (s.tipo === 'energia') {
      const scelte = (ans.energia || []).filter((id) => opt(id));
      const val = scelte.length > 1 ? 0.85 : 1;
      scelte.forEach((id) => {
        ev.push({ asse: opt(id).asse, e: val, w: WEIGHTS.energia, src: { tipo: 'energia', scena: s.id, opzione: id } });
      });
      const drain = s.opzioni2.find((o) => o.id === ans.drain);
      if (drain) ev.push({ asse: drain.asse, e: -1, w: WEIGHTS.drain, src: { tipo: 'drain', scena: s.id, opzione: drain.id } });
    }
  }

  for (const id of state.dilemmi) {
    const d = DIL_BY_ID[id];
    const ans = a['dil:' + id];
    if (!d || !ans || (ans.pick !== 'a' && ans.pick !== 'b')) continue;
    const win = d[ans.pick];
    const lose = d[ans.pick === 'a' ? 'b' : 'a'];
    ev.push({ asse: win.asse, e: 0.8, w: WEIGHTS.dilemma, src: { tipo: 'dilemma', id, scelta: ans.pick, vince: true } });
    ev.push({ asse: lose.asse, e: -0.6, w: WEIGHTS.dilemma, src: { tipo: 'dilemma', id, scelta: ans.pick, vince: false } });
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
    const c = CARD_BY_ID[s.id];
    return `Alla carta «${c.testo}» hai risposto ${s.v === 'si' ? 'sì' : 'no'}`;
  }
  if (s.tipo === 'rank') {
    const { sc, o } = sceneOption(state, s.scena, s.opzione);
    if (s.pos < 0) return null;
    const ord = s.pos === 0 ? 'per primo' : s.pos === 1 ? 'per secondo' : 'per terzo';
    return `Alle ${sc.ora}, tra i messaggi, hai aperto ${ord} quello su «${o.testo}»`;
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
    const d = DIL_BY_ID[s.id];
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
    scene_fonte: Object.fromEntries(PERSONALIZED_SCENES.map((s) => [s.id, sceneContent(state, s.id).fonte])),
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

  const si = state.ordineCarte.filter((id) => a['card:' + id]?.v === 'si').map((id) => CARD_BY_ID[id].testo);
  const no = state.ordineCarte.filter((id) => a['card:' + id]?.v === 'no').map((id) => CARD_BY_ID[id].testo);
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
      risposta = `Energia: ${(ans.energia || []).map((id) => t(id)).join('; ')} — Fatica: ${t(ans.drain, s.opzioni2)}`;
    }
    out.push({ id: 'scena_' + s.id, question: `${sc.ora} · ${sc.titolo}. ${sc.domanda}`, answer: risposta, indiretta: false });
  }

  state.dilemmi.forEach((id) => {
    const d = DIL_BY_ID[id];
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
    scenes: state.scenes,
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
