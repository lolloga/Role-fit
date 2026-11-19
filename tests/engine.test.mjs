// Test del motore del test a capitoli (js/v2-engine.js). Nessuna dipendenza:
//   node tests/engine.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/v2-engine.js';
import { AXES, CARDS, SCENES, DILEMMAS, BACKGROUND, MOMENTI } from '../js/v2-items.js';
import { ROLES } from '../js/v2-roles.js';

let pass = 0;
let fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message.split('\n')[0]); }
}

// Generatore pseudo-casuale ripetibile.
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

// Una persona virtuale con preferenze nette: `pesi` dice quanto le piace ogni dimensione (0-100).
function play(pesi, { nomeNoto = null, rand = rng(1), sceneAi = null, carta = null } = {}) {
  const st = E.createState({ nomeNoto, rand });
  if (sceneAi) st.scenes = { ...sceneAi };
  const u = (asse) => pesi[asse] ?? 50;
  const passi = [];
  for (let guard = 0; guard < 200; guard++) {
    const s = E.nextStep(st);
    passi.push(s.tipo);
    if (s.tipo === 'reveal') break;
    const k = s.key;
    if (s.tipo === 'intro' || s.tipo === 'capitolo') { E.answer(st, k, { seen: true }); continue; }
    if (s.tipo === 'nome') { E.answer(st, k, { v: 'Giulia' }); continue; }
    if (s.tipo === 'momento') { E.answer(st, k, { v: 'incerto' }); continue; }
    if (s.tipo === 'mondi') { E.answer(st, k, { v: ['Tecnologia e digitale'] }); continue; }
    if (s.tipo === 'background') { E.answer(st, k, { v: BACKGROUND[2] }); continue; }
    if (s.tipo === 'aspirazione') { E.answer(st, k, { v: 'Product Manager' }); continue; }
    if (s.tipo === 'racconto') { E.answer(st, k, { v: 'Quando ho rifatto il sito della mia associazione.' }); continue; }
    if (s.tipo === 'card') {
      const c = CARDS.find((x) => x.id === s.id);
      const v = carta ? carta(c) : (u(c.asse) > 60 ? 'si' : u(c.asse) < 40 ? 'no' : 'forse');
      E.answer(st, k, { v, ms: 1800 });
      continue;
    }
    if (s.tipo === 'scene') {
      const sc = E.sceneContent(st, s.id);
      const ord = [...sc.opzioni].sort((a, b) => u(b.asse) - u(a.asse));
      if (sc.tipo === 'rank') E.answer(st, k, { order: ord.slice(0, 3).map((o) => o.id) });
      else if (sc.tipo === 'pick') E.answer(st, k, { pick: ord[0].id });
      else if (sc.tipo === 'twostep') E.answer(st, k, { first: ord[0].id, second: ord[1].id });
      else if (sc.tipo === 'budget') {
        const tokens = Object.fromEntries(sc.opzioni.map((o) => [o.id, 0]));
        tokens[ord[0].id] = 5; tokens[ord[1].id] = 3; tokens[ord[2].id] = 2;
        E.answer(st, k, { tokens });
      } else if (sc.tipo === 'energia') {
        const dr = [...sc.opzioni2].sort((a, b) => u(a.asse) - u(b.asse))[0].id;
        E.answer(st, k, { energia: [ord[0].id, ord[1].id], drain: dr });
      }
      continue;
    }
    if (s.tipo === 'dilemma') {
      const d = DILEMMAS.find((x) => x.id === s.id);
      st.dilCorrente = s.id;
      E.answer(st, k, { pick: u(d.a.asse) >= u(d.b.asse) ? 'a' : 'b' });
      continue;
    }
    throw new Error('passo sconosciuto: ' + s.tipo);
  }
  return { st, passi };
}

const RELAZIONALE = { Analisi: 35, Relazione: 92, Creatività: 60, Curiosità: 62, Leadership: 50, Metodo: 45, Concretezza: 30 };
const PRATICO = { Analisi: 50, Relazione: 35, Creatività: 30, Curiosità: 45, Leadership: 35, Metodo: 70, Concretezza: 95 };
const ANALITICO = { Analisi: 95, Relazione: 30, Creatività: 35, Curiosità: 60, Leadership: 30, Metodo: 75, Concretezza: 20 };

console.log('\nContenuti');
await t('28 carte (4 per dimensione), 7 scene, 21 dilemmi (uno per coppia), 95 ruoli validi', () => {
  assert.equal(CARDS.length, 28);
  AXES.forEach((k) => assert.equal(CARDS.filter((c) => c.asse === k).length, 4, k));
  assert.equal(SCENES.length, 7);
  assert.equal(DILEMMAS.length, 21);
  const coppie = new Set(DILEMMAS.map((d) => [d.a.asse, d.b.asse].sort().join('|')));
  assert.equal(coppie.size, 21);
  assert.equal(ROLES.length, 95);
  assert.equal(new Set(ROLES.map((r) => r.id)).size, ROLES.length, 'id dei ruoli duplicati');
  ROLES.forEach((r) => {
    assert.equal(r.assi.length, 7, r.id);
    r.assi.forEach((v) => assert.ok(v >= 0 && v <= 100, r.id));
    assert.ok(r.nome && r.desc && r.area, r.id);
  });
});
await t('ogni scena ha dimensioni valide e le scene personalizzate hanno 4 dimensioni diverse', () => {
  SCENES.forEach((s) => {
    const opts = s.personalizzata ? s.fallback.opzioni : s.opzioni;
    opts.forEach((o) => assert.ok(AXES.includes(o.asse), `${s.id}: ${o.asse}`));
    if (s.personalizzata) {
      assert.equal(new Set(s.assi).size, 4);
      assert.deepEqual([...opts.map((o) => o.asse)].sort(), [...s.assi].sort());
    }
  });
});

console.log('\nPercorso');
await t('mazzo: tutte le carte una volta sola, mai due della stessa dimensione di fila', () => {
  for (let seed = 1; seed < 40; seed++) {
    const ord = E.shuffleCards(rng(seed));
    assert.equal(new Set(ord).size, 28);
    for (let i = 1; i < ord.length; i++) {
      const a = CARDS.find((c) => c.id === ord[i - 1]).asse;
      const b = CARDS.find((c) => c.id === ord[i]).asse;
      assert.notEqual(a, b, `seed ${seed}, posizione ${i}`);
    }
  }
});
await t('percorso completo: prologo, 28 carte, 7 scene, 4-6 dilemmi, epilogo, risultato', () => {
  const { passi } = play(RELAZIONALE);
  const conta = (tipo) => passi.filter((x) => x === tipo).length;
  assert.deepEqual(passi.slice(0, 5), ['intro', 'nome', 'momento', 'mondi', 'capitolo']);
  assert.equal(conta('card'), 28);
  assert.equal(conta('scene'), 7);
  assert.ok(conta('dilemma') >= 4 && conta('dilemma') <= 6, `dilemmi: ${conta('dilemma')}`);
  assert.equal(conta('capitolo'), 3);
  assert.deepEqual(passi.slice(-4), ['background', 'aspirazione', 'racconto', 'reveal']);
});
await t('chi ha già un nome sul profilo non se lo vede richiedere', () => {
  const { passi, st } = play(RELAZIONALE, { nomeNoto: 'Marta' });
  assert.ok(!passi.includes('nome'));
  assert.equal(E.contextOf(st).nome, 'Marta');
  assert.equal(E.contextOf(st).nomeNuovo, false);
});
await t('"Indietro" annulla l\'ultima risposta e ripropone lo stesso passo; le introduzioni non contano', () => {
  const st = E.createState({ rand: rng(3) });
  E.answer(st, 'intro', { seen: true });
  E.answer(st, 'nome', { v: 'Luca' });
  E.answer(st, 'momento', { v: 'studio' });
  assert.equal(E.nextStep(st).tipo, 'mondi');
  assert.equal(E.undo(st), 'momento');
  assert.equal(E.nextStep(st).tipo, 'momento');
  assert.equal(E.undo(st), 'nome');
  assert.equal(E.undo(st), null, 'l\'introduzione non si annulla');
  assert.equal(E.nextStep(st).tipo, 'nome');
});
await t('annullare un dilemma ripropone lo stesso dilemma', () => {
  const { st } = play(RELAZIONALE);
  const ultimo = st.dilemmi[st.dilemmi.length - 1];
  // torna indietro fino all'ultimo dilemma
  while (st.trail[st.trail.length - 1] !== 'dil:' + ultimo) E.undo(st);
  E.undo(st);
  const s = E.nextStep(st);
  assert.equal(s.tipo, 'dilemma');
  assert.equal(s.id, ultimo);
});

console.log('\nMisura');
await t('stesse risposte, stesso risultato (anche con il mazzo in un altro ordine)', () => {
  const a = play(ANALITICO, { rand: rng(5) });
  const b = play(ANALITICO, { rand: rng(99) });
  const ra = E.computeResult(a.st);
  const rb = E.computeResult(b.st);
  assert.deepEqual(ra.assi, rb.assi);
  assert.deepEqual(ra.ruoli.map((r) => r.id), rb.ruoli.map((r) => r.id));
  assert.deepEqual(E.computeResult(a.st), ra, 'ricalcolare cambia il risultato');
});
await t('il profilo misurato rispecchia le preferenze: relazionale, pratico, analitico', () => {
  const top = (pesi) => {
    const r = E.computeResult(play(pesi).st);
    return [...AXES].sort((x, y) => r.assi[y] - r.assi[x])[0];
  };
  assert.equal(top(RELAZIONALE), 'Relazione');
  assert.equal(top(PRATICO), 'Concretezza');
  assert.equal(top(ANALITICO), 'Analisi');
});
await t('i ruoli seguono il profilo: il pratico non riceve ruoli da scrivania, l\'analitico sì', () => {
  const pratico = E.computeResult(play(PRATICO).st);
  assert.ok(pratico.ruoli.every((r) => ['tecnica', 'salute', 'ospitalita', 'vendite'].includes(r.area)), pratico.ruoli.map((r) => r.nome).join(', '));
  const analitico = E.computeResult(play(ANALITICO).st);
  assert.ok(analitico.ruoli.some((r) => ['dati', 'finanza', 'tecnologia'].includes(r.area)), analitico.ruoli.map((r) => r.nome).join(', '));
});
await t('risultato completo: 3 ruoli in ordine, bonus insolito, 3 ruoli da evitare di aree diverse', () => {
  const r = E.computeResult(play(RELAZIONALE).st);
  assert.equal(r.ruoli.length, 3);
  assert.ok(r.ruoli[0].match >= r.ruoli[1].match - 3);
  r.ruoli.forEach((x) => assert.ok(!ROLES.find((y) => y.id === x.id).bonus));
  assert.ok(ROLES.find((y) => y.id === r.bonus.id).bonus);
  assert.equal(r.mismatch.length, 3);
  assert.equal(new Set(r.mismatch.map((x) => x.area)).size, 3);
  assert.ok(r.mismatch.every((x) => x.match < r.ruoli[2].match));
  AXES.forEach((k) => assert.ok(['alta', 'media', 'bassa'].includes(r.assi_confidenza[k])));
});
await t('chi risponde sì a tutto in fretta viene segnalato e la confidenza scende', () => {
  const { st } = play(RELAZIONALE, { carta: () => 'si' });
  Object.values(st.answers).forEach((a) => { if (a.v === 'si') a.ms = 300; });
  const r = E.computeResult(st);
  assert.equal(r.qualita.livello, 'attenzione');
  assert.ok(r.qualita.segnali.includes('veloce') && r.qualita.segnali.includes('uniforme'));
  assert.ok(r.qualita.nota.includes('prima bozza'));
  assert.ok(!Object.values(r.assi_confidenza).includes('alta'));
});
await t('compatibilità sempre tra 1 e 99; i mondi scelti danno un piccolo vantaggio (max 3)', () => {
  const assi = Object.fromEntries(AXES.map((k) => [k, 50]));
  const conf = Object.fromEntries(AXES.map((k) => [k, 'media']));
  ROLES.forEach((role) => {
    const m = E.matchScore(assi, conf, role);
    assert.ok(m >= 1 && m <= 99);
  });
  const dev = ROLES.find((r) => r.id === 'sviluppatore-software');
  assert.equal(E.contextBonus(dev, { mondi: ['Tecnologia e digitale'], background: BACKGROUND[2], momento: 'studio' }), 3);
  assert.equal(E.contextBonus(dev, { mondi: ['Tecnologia e digitale'], background: BACKGROUND[2], momento: 'cambio' }), 2, 'chi cambia strada non viene riportato al suo percorso');
  assert.equal(E.contextBonus(dev, { mondi: ['Difesa'], background: BACKGROUND[0], momento: 'studio' }), 2);
});

console.log('\nScene personalizzate');
const sceneAi = {
  ai1: { titolo: 'Il nuovo cliente', testo: 'Un cliente chiede una app.', domanda: 'Cosa fai?', opzioni: [
    { testo: 'Lo chiamo', asse: 'Relazione' }, { testo: 'Faccio un piano', asse: 'Metodo' },
    { testo: 'Studio altri casi', asse: 'Curiosità' }, { testo: 'Provo un prototipo', asse: 'Concretezza' }] },
};
await t('scena AI valida usata con id a-d; non valida o bloccata → scena standard', () => {
  const s = E.createState({ rand: rng(2) });
  s.scenes = sceneAi;
  const c = E.sceneContent(s, 'ai1');
  assert.equal(c.fonte, 'ai');
  assert.equal(c.titolo, 'Il nuovo cliente');
  assert.deepEqual(c.opzioni.map((o) => o.id), ['a', 'b', 'c', 'd']);
  s.scenes = { ai1: { standard: true } };
  assert.equal(E.sceneContent(s, 'ai1').fonte, 'standard');
  const def = SCENES.find((x) => x.id === 'ai1');
  const bad = JSON.parse(JSON.stringify(sceneAi.ai1));
  bad.opzioni[3].asse = 'Relazione';
  assert.equal(E.validAiScene(bad, def), false, 'dimensioni ripetute');
  bad.opzioni = bad.opzioni.slice(0, 3);
  assert.equal(E.validAiScene(bad, def), false, 'solo 3 opzioni');
  assert.equal(E.validAiScene({ ...sceneAi.ai1, testo: 'x'.repeat(500) }, def), false, 'testo troppo lungo');
  assert.equal(E.validAiScene(sceneAi.ai1, def), true);
});

console.log('\nReport');
await t('le prove sono frasi leggibili e il risultato ha le tensioni come elenco', () => {
  const r = E.computeResult(play(RELAZIONALE).st);
  assert.ok(r.prove.length >= 5, `prove: ${r.prove.length}`);
  r.prove.forEach((p) => { assert.ok(typeof p.testo === 'string' && p.testo.length > 15); assert.ok(AXES.includes(p.asse)); });
  assert.ok(Array.isArray(r.tensioni));
});
await t('richiesta per l\'AI: contesto, profilo, prove, ruoli in ordine; il racconto resta marcato come privato', () => {
  const { st } = play(RELAZIONALE);
  const payload = E.buildPayload(st);
  const req = E.buildReportRequest(payload, { storico: 'Test di luglio: ...', cvText: 'Esperienza in marketing' });
  ['PERSONA', 'PROFILO MISURATO', 'PROVE', 'RUOLI', 'STORICO', 'ESTRATTO DEL CV', 'Giulia'].forEach((x) => assert.ok(req.includes(x), x));
  const pos = payload.risultato.ruoli.map((r) => req.indexOf(`${r.nome} —`));
  assert.ok(pos[0] < pos[1] && pos[1] < pos[2], 'ruoli non in ordine');
  assert.ok(req.includes('mai nel riepilogo per le aziende'));
});
await t('unione con il testo dell\'AI: nomi, percentuali e dimensioni restano quelli del motore', () => {
  const { st } = play(ANALITICO);
  const payload = E.buildPayload(st);
  const ai = { report: {
    chi_sei: { come_funzioni: 'A', cosa_ti_alimenta: 'B', di_cosa_hai_bisogno: 'C' },
    riepilogo_aziende: 'R',
    ruoli: [{ nome: 'Astronauta', match: 100, perche: 'P1', settori: [{ nome: 'Spazio', declinazione: 'x', aziende: ['ASI'] }] }, { perche: 'P2' }],
    bonus: { nome: 'Mago', testo: 'BT' },
    ruoli_mismatch: [{ nome: 'Pirata', perche_no: 'N1' }],
  } };
  const rep = E.mergeReport(ai, payload);
  assert.deepEqual(rep.ruoli.map((r) => r.nome), payload.risultato.ruoli.map((r) => r.nome));
  assert.deepEqual(rep.ruoli.map((r) => r.match), payload.risultato.ruoli.map((r) => r.match));
  assert.equal(rep.ruoli[0].perche, 'P1');
  assert.equal(rep.ruoli[2].cosa_fa, payload.risultato.ruoli[2].desc, 'testo mancante → descrizione della libreria');
  assert.equal(rep.bonus.nome, payload.risultato.bonus.nome);
  assert.equal(rep.ruoli_mismatch.length, 3);
  assert.deepEqual(rep.assi, payload.risultato.assi);
  assert.equal(rep.versione_test, 2);
  assert.ok(rep.prove.length && typeof rep.prove[0] === 'string');
  assert.equal(rep.ruoli[0].settori[0].nome, 'Spazio');
});
await t('risposte per storico e aziende: momento e racconto privati, nome solo se nuovo', () => {
  const { st } = play(RELAZIONALE);
  const ans = E.buildAnswers(st);
  const byId = Object.fromEntries(ans.map((a) => [a.id, a]));
  assert.equal(byId.nome.answer, 'Giulia');
  assert.equal(byId.momento.indiretta, true);
  assert.equal(byId.racconto.indiretta, true);
  assert.equal(byId.background.answer, BACKGROUND[2]);
  assert.ok(byId.scena_posta.answer.startsWith('1. '));
  assert.ok(ans.filter((a) => a.id.startsWith('dilemma_')).length >= 4);
  const conNome = E.buildAnswers(play(RELAZIONALE, { nomeNoto: 'Marta' }).st);
  assert.ok(!conNome.some((a) => a.id === 'nome'));
});
await t('storia sintetica per le valutazioni di compatibilità: alterna utente e assistente', () => {
  const h = E.syntheticHistory(E.buildPayload(play(PRATICO).st));
  assert.equal(h.length, 2);
  assert.equal(h[0].role, 'user');
  assert.equal(h[1].role, 'assistant');
  assert.ok(h[0].content.includes('Concretezza'));
  assert.ok(MOMENTI.some((m) => h[0].content.includes(m.testo)));
});

console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
