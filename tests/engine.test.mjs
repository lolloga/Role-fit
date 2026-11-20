// Test del motore del test a capitoli (js/v2-engine.js). Nessuna dipendenza:
//   node tests/engine.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/v2-engine.js';
import { AXES, CARDS, SCENES, DILEMMAS, BACKGROUND, MOMENTI, GIORNATA, CARTE_PER_ASSE } from '../js/v2-items.js';
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
function play(pesi, { nomeNoto = null, rand = rng(1), sceneAi = null, carta = null, riordina = false } = {}) {
  const st = E.createState({ nomeNoto, rand });
  if (sceneAi) st.scenes = { ...sceneAi };
  if (riordina) st.ordineCarte = [...st.ordineCarte].reverse();
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
await t('56 carte (8 per dimensione, 4 per test), 7 scene, 21 dilemmi (uno per coppia), 95 ruoli validi', () => {
  assert.equal(CARDS.length, 56);
  assert.equal(new Set(CARDS.map((c) => c.id)).size, 56, 'id delle carte duplicati');
  AXES.forEach((k) => assert.equal(CARDS.filter((c) => c.asse === k).length, 8, k));
  assert.equal(CARTE_PER_ASSE, 4);
  CARDS.forEach((c) => { assert.ok(c.icona && c.testo.length <= 80, c.id); if (c.sec) assert.ok(AXES.includes(c.sec.asse) && c.sec.asse !== c.asse, c.id); });
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
await t('ogni scena: dimensioni valide e diverse, un "eco" per opzione, solo segnaposto noti', () => {
  const noti = new Set(['{nome}', '{collega}', '{capo}', '{cliente}']);
  SCENES.forEach((s) => {
    for (const list of [s.opzioni, s.opzioni2].filter(Boolean)) {
      list.forEach((o) => assert.ok(AXES.includes(o.asse), `${s.id}: ${o.asse}`));
      assert.equal(new Set(list.map((o) => o.asse)).size, list.length, `${s.id}: dimensioni ripetute`);
      assert.equal(new Set(list.map((o) => o.id)).size, list.length, `${s.id}: id ripetuti`);
    }
    if (['rank', 'budget', 'energia'].includes(s.tipo)) assert.equal(s.opzioni.length, 7, s.id);
    if (s.tipo !== 'energia') s.opzioni.forEach((o) => assert.ok(o.eco, `${s.id}/${o.id}: manca l'eco`));
    if (s.tipo === 'rank') s.opzioni.forEach((o) => assert.ok(o.mittente, `${s.id}/${o.id}: manca il mittente`));
    JSON.stringify(s).match(/\{[a-z]+\}/g)?.forEach((x) => assert.ok(noti.has(x), `${s.id}: segnaposto ${x}`));
  });
  assert.deepEqual([...GIORNATA.mattina, ...GIORNATA.pomeriggio], SCENES.map((s) => s.id));
});

console.log('\nPercorso');
await t('mazzo: 4 carte per dimensione pescate a caso, mai due della stessa dimensione di fila', () => {
  const viste = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const ord = E.shuffleCards(rng(seed));
    assert.equal(new Set(ord).size, 28);
    AXES.forEach((k) => assert.equal(ord.filter((id) => CARDS.find((c) => c.id === id).asse === k).length, 4, k));
    ord.forEach((id) => viste.add(id));
    for (let i = 1; i < ord.length; i++) {
      const a = CARDS.find((c) => c.id === ord[i - 1]).asse;
      const b = CARDS.find((c) => c.id === ord[i]).asse;
      assert.notEqual(a, b, `seed ${seed}, posizione ${i}`);
    }
  }
  for (let i = 0; i < 300; i++) E.shuffleCards().forEach((id) => viste.add(id));
  assert.equal(viste.size, 56, 'in tanti test escono tutte le carte');
});
await t('ogni test è diverso: mazzo, colleghi e spunto cambiano da un test all\'altro', () => {
  const a = E.createState({ rand: rng(11) });
  const b = E.createState({ rand: rng(12) });
  const comuni = a.ordineCarte.filter((id) => b.ordineCarte.includes(id)).length;
  assert.ok(comuni < 28, 'stesso mazzo');
  assert.notDeepEqual(a.cast, b.cast);
  assert.ok(typeof a.spunto === 'string' && a.spunto.length > 10);
  const nomi = Object.values(a.cast);
  assert.equal(new Set(nomi).size, nomi.length, 'colleghi con lo stesso nome');
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
  const b = play(ANALITICO, { rand: rng(5), riordina: true });
  const ra = E.computeResult(a.st);
  const rb = E.computeResult(b.st);
  assert.deepEqual(ra.assi, rb.assi);
  assert.deepEqual(ra.ruoli.map((r) => r.id), rb.ruoli.map((r) => r.id));
  assert.deepEqual(E.computeResult(a.st), ra, 'ricalcolare cambia il risultato');
});
await t('con mazzi diversi la stessa persona ottiene lo stesso profilo, a pochi punti di distanza', () => {
  for (const pesi of [ANALITICO, RELAZIONALE, PRATICO]) {
    const ra = E.computeResult(play(pesi, { rand: rng(5) }).st);
    const rb = E.computeResult(play(pesi, { rand: rng(99) }).st);
    AXES.forEach((k) => assert.ok(Math.abs(ra.assi[k] - rb.assi[k]) <= 12, `${k}: ${ra.assi[k]} vs ${rb.assi[k]}`));
    const topA = [...AXES].sort((x, y) => ra.assi[y] - ra.assi[x])[0];
    const topB = [...AXES].sort((x, y) => rb.assi[y] - rb.assi[x])[0];
    assert.equal(topA, topB);
  }
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

console.log('\nTesti su misura');
// Una risposta dell'AI per una metà della giornata, costruita dai modelli
// che il motore le manda: stessi assi, testi riscritti.
function aiGiornata(req, { rompi = null } = {}) {
  return {
    scene: req.scene.map((sc) => {
      const opt = (o, i) => ({ asse: o.asse, testo: `Opzione ${o.asse} nel reparto`, ...(o.mittente ? { mittente: `Mittente ${i}` } : {}), eco: `Eco di ${o.asse}, {nome}.` });
      const out = { id: sc.id, titolo: `Titolo ${sc.id}`, testo: sc.id === 'avvio' ? `In reparto, {nome}: ${sc.id}.` : `In reparto: ${sc.id}.`, domanda: 'Cosa fai?', opzioni: sc.opzioni.map(opt) };
      if (sc.domanda2) out.domanda2 = 'E poi?';
      if (sc.opzioni2) out.opzioni2 = sc.opzioni2.map(opt);
      if (rompi === sc.id) out.opzioni[1].asse = out.opzioni[0].asse;
      return out;
    }),
  };
}
function avviato(rand = rng(2), nome = 'Giulia') {
  const st = E.createState({ rand });
  E.answer(st, 'intro', { seen: true });
  E.answer(st, 'nome', { v: nome });
  E.answer(st, 'momento', { v: 'neolaureato' });
  E.answer(st, 'mondi', { v: ['Sanità e farmaceutico'] });
  return st;
}
await t('nome: inserito dove serve, e le frasi si adattano quando non c\'è', () => {
  const cast = { collega: 'Luca', capo: 'Sara', cliente: 'Marco' };
  assert.equal(E.personalizza('{nome}, hai un minuto?', { nome: 'Giulia', cast }), 'Giulia, hai un minuto?');
  assert.equal(E.personalizza('{nome}, hai un minuto?', { cast }), 'Hai un minuto?');
  assert.equal(E.personalizza('{capo} ti ferma: «{nome}, {cliente} ha chiamato».', { cast }), 'Sara ti ferma: «Marco ha chiamato».');
  assert.equal(E.personalizza('Grazie, {nome}!', { cast }), 'Grazie!');
  assert.equal(E.personalizza('Parlo con {collega} {ignoto}.', { cast }), 'Parlo con Luca.');
  const st = avviato(rng(2), 'giulia');
  assert.equal(E.contextOf(st).nome, 'Giulia', 'iniziale maiuscola');
  const imp = E.sceneContent(st, 'imprevisto');
  assert.ok(imp.testo.includes('«Giulia, '), imp.testo);
  SCENES.forEach((x) => assert.ok(!/\{[a-z]+\}/.test(JSON.stringify(E.sceneContent(st, x.id))), `segnaposto rimasto in ${x.id}`));
});
await t('se la persona si chiama come un collega, il collega cambia nome', () => {
  const st = E.createState({ rand: rng(4) });
  E.answer(st, 'nome', { v: st.cast.capo.toLowerCase() });
  const c = E.castOf(st);
  assert.equal(c.capo, st.cast.riserva);
  assert.ok(!Object.values(c).map((x) => x.toLowerCase()).includes(st.cast.capo.toLowerCase()));
});
await t('richieste all\'AI: mondi, momento e colleghi, mai il nome della persona; le prime carte restano standard', () => {
  const st = avviato();
  const carte = E.richiestaCarte(st);
  const mattina = E.richiestaGiornata(st, 'mattina');
  const pomeriggio = E.richiestaGiornata(st, 'pomeriggio');
  const dilemmi = E.richiestaDilemmi(st);
  for (const r of [carte, mattina, pomeriggio, dilemmi]) {
    assert.ok(r && !JSON.stringify(r).includes('Giulia'), 'il nome viaggia verso l\'AI');
    assert.deepEqual(r.mondi, ['Sanità e farmaceutico']);
  }
  assert.equal(carte.carte.length, 25);
  assert.ok(!carte.carte.some((c) => st.ordineCarte.slice(0, 3).includes(c.id)));
  assert.deepEqual(mattina.scene.map((x) => x.id), GIORNATA.mattina);
  assert.deepEqual(pomeriggio.scene.map((x) => x.id), GIORNATA.pomeriggio);
  assert.ok(JSON.stringify(pomeriggio).includes('{nome}'), 'il segnaposto resta per l\'AI');
  assert.ok(JSON.stringify(mattina).includes(E.castOf(st).collega), 'i colleghi sono già al loro posto');
  assert.equal(dilemmi.dilemmi.length, 21);
  const prima = E.createState({ rand: rng(2) });
  assert.equal(E.richiestaCarte(prima), null, 'senza mondi non si chiede niente');
});
await t('giornata scritta dall\'AI: stesse dimensioni e stessi id, nome inserito, eco della scelta precedente', () => {
  const st = avviato();
  assert.equal(E.accettaGiornata(st, aiGiornata(E.richiestaGiornata(st, 'mattina')), 'mattina'), 3);
  const posta = E.sceneContent(st, 'posta');
  assert.equal(posta.fonte, 'ai');
  assert.equal(posta.testo, 'In reparto: posta.');
  assert.equal(E.sceneContent(st, 'avvio').testo, 'In reparto, Giulia: avvio.');
  const std = SCENES.find((x) => x.id === 'posta');
  posta.opzioni.forEach((o) => assert.equal(std.opzioni.find((x) => x.id === o.id).asse, o.asse, 'id e dimensione non corrispondono'));
  E.answer(st, 'scene:posta', { order: [posta.opzioni.find((o) => o.asse === 'Relazione').id, posta.opzioni[1].id, posta.opzioni[2].id] });
  assert.equal(E.sceneOpening(st, 'riunione'), 'Eco di Relazione, Giulia.');
  assert.equal(E.sceneOpening(st, 'posta'), null);
  const riunione = E.sceneContent(st, 'riunione');
  E.answer(st, 'scene:riunione', { pick: riunione.opzioni.find((o) => o.asse === 'Curiosità').id });
  assert.equal(E.sceneOpening(st, 'avvio'), 'Eco di Curiosità.', 'se la scena chiama già per nome, l\'eco non lo ripete');
});
await t('scena AI non valida o arrivata tardi → scena standard, e quella già vista non cambia', () => {
  const st = avviato();
  E.lockScene(st, 'posta');
  const req = E.richiestaGiornata(st, 'mattina');
  assert.deepEqual(req.scene.map((x) => x.id), ['riunione', 'avvio'], 'la scena già mostrata non si chiede');
  const risposta = aiGiornata(E.richiestaGiornata(E.createState({ rand: rng(2) }) && avviato(), 'mattina'), { rompi: 'riunione' });
  assert.equal(E.accettaGiornata(st, risposta, 'mattina'), 1, 'solo "avvio" è valida e nuova');
  assert.equal(E.sceneContent(st, 'posta').fonte, 'standard');
  assert.equal(E.sceneContent(st, 'riunione').fonte, 'standard');
  assert.equal(E.sceneContent(st, 'avvio').fonte, 'ai');
  const def = SCENES.find((x) => x.id === 'posta');
  const senzaMittente = aiGiornata({ scene: [{ ...def, opzioni: def.opzioni.map(({ mittente, ...o }) => o) }] }).scene[0];
  assert.equal(E.validAiScene(senzaMittente, def), false, 'posta senza mittenti');
  const corta = aiGiornata({ scene: [def] }).scene[0];
  corta.opzioni = corta.opzioni.slice(0, 6);
  assert.equal(E.validAiScene(corta, def), false, 'un\'opzione in meno');
  assert.equal(E.validAiScene({ ...aiGiornata({ scene: [def] }).scene[0], testo: 'x'.repeat(500) }, def), false, 'testo troppo lungo');
});
await t('dimensioni scritte dall\'AI senza accento o in minuscolo vengono riconosciute', () => {
  const st = avviato();
  const risposta = aiGiornata(E.richiestaGiornata(st, 'mattina'));
  risposta.scene.forEach((sc) => sc.opzioni.forEach((o) => { o.asse = o.asse.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }));
  assert.equal(E.accettaGiornata(st, risposta, 'mattina'), 3);
  assert.ok(E.sceneContent(st, 'riunione').opzioni.some((o) => o.asse === 'Creatività'));
});
await t('opzioni in ordine mescolato per ogni test, ma stabile ricaricando la pagina', () => {
  const ordini = new Set();
  for (let seed = 1; seed <= 6; seed++) {
    const st = avviato(rng(seed));
    const ids = E.sceneContent(st, 'budget').opzioni.map((o) => o.id).join('');
    assert.equal(E.sceneContent(st, 'budget').opzioni.map((o) => o.id).join(''), ids);
    assert.deepEqual([...ids].sort().join(''), 'abcdefg');
    ordini.add(ids);
  }
  assert.ok(ordini.size >= 4, 'l\'ordine non cambia tra un test e l\'altro');
});
await t('carte e dilemmi riscritti dall\'AI: accettati solo se validi e non ancora mostrati', () => {
  const st = avviato();
  const req = E.richiestaCarte(st);
  const [primaAi, secondaAi] = req.carte;
  E.lockCard(st, secondaAi.id);
  const n = E.accettaCarte(st, { carte: [
    { id: primaAi.id, testo: 'Capire dai dati del reparto perché le attese si allungano' },
    { id: secondaAi.id, testo: 'Testo arrivato troppo tardi per questa carta' },
    { id: 'c99', testo: 'Carta che non esiste nel mazzo' },
    { id: req.carte[2].id, testo: 'x' },
  ] });
  assert.equal(n, 1);
  assert.equal(E.cardContent(st, primaAi.id).fonte, 'ai');
  assert.equal(E.cardContent(st, primaAi.id).testo, 'Capire dai dati del reparto perché le attese si allungano');
  assert.equal(E.cardContent(st, secondaAi.id).fonte, 'standard');
  assert.equal(E.accettaDilemmi(st, { dilemmi: [
    { id: 'd01', intro: '{capo} ti propone due turni, {nome}.', a: 'Studiare i dati delle attese', b: { testo: 'Parlare con i pazienti in sala' } },
    { id: 'd02', a: '', b: 'Senza la prima opzione' },
  ] }), 1);
  const d = E.dilemmaContent(st, 'd01');
  assert.equal(d.fonte, 'ai');
  assert.equal(d.intro, `${E.castOf(st).capo} ti propone due turni, Giulia.`);
  assert.equal(d.a.asse, DILEMMAS[0].a.asse);
  assert.equal(d.b.testo, 'Parlare con i pazienti in sala');
  assert.equal(E.dilemmaContent(st, 'd02').fonte, 'standard');
});
await t('i testi dell\'AI pesano un po\' meno e il risultato dice quanto del test hanno scritto', () => {
  const base = play(RELAZIONALE, { rand: rng(8) }).st;
  const conAi = play(RELAZIONALE, { rand: rng(8) }).st;
  conAi.ordineCarte.forEach((id) => { conAi.carteAi[id] = { testo: 'Una carta riscritta per il mondo della persona' }; });
  const peso = (st) => E.collectEvidence(st).filter((x) => x.src.tipo === 'card' && !x.src.secondaria)[0].w;
  assert.equal(peso(base), 1);
  assert.equal(peso(conAi), 0.85);
  const r = E.computeResult(conAi);
  assert.equal(r.fonti.carte, 28);
  assert.equal(r.fonti.carte_ai, 28);
  assert.deepEqual(r.fonti.scene_ai, []);
  assert.ok(r.fonti.dilemmi >= 4 && r.fonti.dilemmi_ai === 0);
  assert.ok(r.prove.some((p) => p.testo.includes('Una carta riscritta')), 'le prove citano il testo che la persona ha visto');
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
