// Test delle funzioni serverless (api/*.js) con richieste finte e fetch
// simulato: nessuna chiamata vera a Supabase o ad Anthropic.
//   node tests/api.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../js/v2-engine.js';
import { CARDS, DILEMMAS, BACKGROUND } from '../js/v2-items.js';

process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
process.env.ANTHROPIC_API_KEY = 'sk-test';
const guard = await import('../api/_guard.js');
const claudeMod = await import('../api/claude.js');
const claude = claudeMod.default;
const azienda = (await import('../api/azienda.js')).default;
const account = (await import('../api/account.js')).default;
const cv = (await import('../api/cv.js')).default;

let pass = 0;
let fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message.split('\n')[0]); }
}
let ipCounter = 0;
function req(body, { origin = 'https://rolefit.test', host = 'rolefit.test', ip, auth } = {}) {
  const headers = { host, 'x-forwarded-for': ip || `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` };
  if (origin) headers.origin = origin;
  if (auth) headers.authorization = auth;
  return { method: 'POST', headers, body };
}
function res() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
let fetchLog = [];
function stubFetch(handler) {
  fetchLog = [];
  globalThis.fetch = async (url, opts = {}) => {
    fetchLog.push({ url: String(url), opts });
    const out = await handler(String(url), opts);
    const status = out.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => out.body,
      text: async () => JSON.stringify(out.body),
      arrayBuffer: async () => out.buffer,
    };
  };
}
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';
const JOB = '44444444-4444-4444-8444-444444444444';
const assi = (v) => ({ Analisi: v, Relazione: v, Creatività: v, Curiosità: v, Leadership: v, Metodo: v });

console.log('\n_guard.js');
await t('validateMessages accetta una conversazione normale e rifiuta forme strane o eccessi', () => {
  assert.equal(guard.validateMessages([{ role: 'user', content: 'ciao' }, { role: 'assistant', content: '{}' }]), null);
  assert.ok(guard.validateMessages([{ role: 'system', content: 'x' }]));
  assert.ok(guard.validateMessages([{ role: 'user', content: [{ type: 'text', text: 'x' }] }]));
  assert.ok(guard.validateMessages([{ role: 'assistant', content: 'x' }]));
  assert.ok(guard.validateMessages([]));
  assert.ok(guard.validateMessages(Array(81).fill({ role: 'user', content: 'x' })));
  assert.ok(guard.validateMessages([{ role: 'user', content: 'x'.repeat(30001) }]));
});
await t('rateLimit blocca oltre il limite e riparte dopo la finestra', async () => {
  for (let i = 0; i < 3; i++) assert.equal(guard.rateLimit('k', 3, 50), true);
  assert.equal(guard.rateLimit('k', 3, 50), false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(guard.rateLimit('k', 3, 50), true);
});
await t('isSameOrigin: stesso host sì, altro host o nessun header no, Referer come riserva', () => {
  assert.equal(guard.isSameOrigin({ headers: { host: 'a.it', origin: 'https://a.it' } }), true);
  assert.equal(guard.isSameOrigin({ headers: { host: 'a.it', origin: 'https://evil.it' } }), false);
  assert.equal(guard.isSameOrigin({ headers: { host: 'a.it' } }), false);
  assert.equal(guard.isSameOrigin({ headers: { host: 'a.it', referer: 'https://a.it/test.html' } }), true);
});

console.log('\napi/claude.js');
let lastAnthropic = null;
stubFetch(async (url, opts) => {
  if (url.includes('anthropic')) {
    lastAnthropic = JSON.parse(opts.body);
    return { body: { content: [{ type: 'text', text: '{"ok":true}' }] } };
  }
  if (url.endsWith('/auth/v1/user')) return opts.headers.Authorization === 'Bearer good' ? { body: { id: U1 } } : { status: 401, body: {} };
  return { status: 404, body: {} };
});
const one = (content) => [{ role: 'user', content }];
await t('fase sconosciuta → 400; origine diversa → 403 senza chiamare Anthropic; messaggi non validi → 400', async () => {
  let r = res(); await claude(req({ fase: 'libera', messages: one('x') }), r); assert.equal(r.statusCode, 400);
  r = res(); await claude(req({ fase: 'test', messages: one('x') }, { origin: 'https://evil.it' }), r); assert.equal(r.statusCode, 403);
  assert.ok(!fetchLog.some((f) => f.url.includes('anthropic')));
  r = res(); await claude(req({ fase: 'test', messages: one('x'.repeat(40000)) }), r); assert.equal(r.statusCode, 400);
});
await t('fase test: prompt caching su sistema e ultimo messaggio', async () => {
  const r = res();
  await claude(req({ fase: 'test', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }] }), r);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(lastAnthropic.system[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(lastAnthropic.messages[2].content[0], { type: 'text', text: 'c', cache_control: { type: 'ephemeral' } });
});
await t('fase report senza login → 401; rate limit oltre 150 domande in 10 minuti → 429', async () => {
  let r = res(); await claude(req({ fase: 'report', messages: one('x') }), r); assert.equal(r.statusCode, 401);
  let last;
  for (let i = 0; i < 151; i++) { last = res(); await claude(req({ fase: 'test', messages: one('x') }, { ip: '9.9.9.9' }), last); }
  assert.equal(last.statusCode, 429);
});
await t('fase scene: senza login, un solo messaggio corto, prompt dello sceneggiatore', async () => {
  let r = res();
  await claude(req({ fase: 'scene', messages: one(JSON.stringify({ mondi: ['Tecnologia e digitale'] })) }), r);
  assert.equal(r.statusCode, 200);
  assert.ok(lastAnthropic.system.includes('sceneggiatore'));
  assert.equal(lastAnthropic.max_tokens, 1500);
  assert.equal(typeof lastAnthropic.system, 'string', 'niente caching su una chiamata singola');
  r = res(); await claude(req({ fase: 'scene', messages: [...one('a'), { role: 'assistant', content: 'b' }, ...one('c')] }), r);
  assert.equal(r.statusCode, 400, 'più messaggi');
  r = res(); await claude(req({ fase: 'scene', messages: one('x'.repeat(5000)) }), r);
  assert.equal(r.statusCode, 400, 'messaggio troppo lungo');
});
await t('fase report_v2: serve il login; con token valido usa il prompt v2', async () => {
  let r = res(); await claude(req({ fase: 'report_v2', messages: one('PROFILO') }), r);
  assert.equal(r.statusCode, 401);
  r = res(); await claude(req({ fase: 'report_v2', messages: one('PROFILO') }, { auth: 'Bearer bad' }), r);
  assert.equal(r.statusCode, 401);
  r = res(); await claude(req({ fase: 'report_v2', messages: one('PROFILO') }, { auth: 'Bearer good' }), r);
  assert.equal(r.statusCode, 200);
  assert.equal(lastAnthropic.system, claudeMod.PROMPT_REPORT_V2);
  assert.equal(lastAnthropic.max_tokens, 7000);
  assert.equal(lastAnthropic.temperature, 0.6);
  r = res(); await claude(req({ fase: 'report_v2', messages: one('x'.repeat(35000)) }, { auth: 'Bearer good' }), r);
  assert.equal(r.statusCode, 200, 'richiesta lunga (con estratto del CV) accettata');
  r = res(); await claude(req({ fase: 'report_v2', messages: one('x'.repeat(40001)) }, { auth: 'Bearer good' }), r);
  assert.equal(r.statusCode, 400, 'oltre il limite');
});
await t('prompt aziende: chiede 7 dimensioni, Concretezza compresa', () => {
  // Il prompt è interno al modulo: lo controlliamo dalla richiesta inviata.
  return (async () => {
    const r = res();
    await claude(req({ fase: 'azienda_report', messages: one('x') }), r);
    assert.ok(lastAnthropic.system.includes('"Concretezza"'));
    assert.ok(lastAnthropic.system.includes('7 dimensioni'));
  })();
});

console.log('\napi/azienda.js');
const profiles = [{ id: U1, nome: 'Anna', email: 'anna@example.com' }, { id: U2, nome: null, email: 'bruno@example.com' }];
const reports = [
  { user_id: U1, created_at: '2026-09-02', report_json: { assi: { ...assi(70), Concretezza: 40 }, ruoli: [{ nome: 'Business Analyst', match: 90, cosa_fa: 'x' }], ruoli_mismatch: [], riepilogo_aziende: 'Anna ...' }, test_history: { answers: [{ id: 'nome', question: 'Nome?', answer: 'Anna', indiretta: false }, { id: 'q1', question: 'Cosa ti piace?', answer: 'I dati', indiretta: false }, { id: 'q2', question: 'Paura?', answer: 'privata', indiretta: true }] } },
  { user_id: U1, created_at: '2026-08-01', report_json: { assi: assi(10) } },
  { user_id: U2, created_at: '2026-09-01', report_json: { assi: assi(20), ruoli: [], ruoli_mismatch: [] } },
];
let jobMatchesDown = false;
let jobMatchesPatchRows = [];
function aziendaSupabase(url, opts) {
  if (url.includes('/rest/v1/job_requests?id=eq.')) return { body: url.includes(JOB) ? [{ id: JOB, role_title: 'Junior BDM', target_profile: { sintesi: 's', assi: assi(72) }, company_profiles: { company_name: 'CBRE' } }] : [] };
  if (url.includes('/rest/v1/job_matches')) {
    if (jobMatchesDown) return { status: 404, body: { message: 'relation does not exist' } };
    if (opts.method === 'PATCH') return { body: jobMatchesPatchRows };
    return { status: 201, body: null };
  }
  if (url.includes('/rest/v1/profiles?cv_path=not.is.null')) return { body: profiles };
  if (url.includes('/rest/v1/reports?user_id=in.')) return { body: reports };
  if (url.includes('/rest/v1/reports?user_id=eq.')) return { body: reports.filter((r) => url.includes(r.user_id)).slice(0, 1) };
  if (url.includes('/storage/v1/object/sign/')) return { body: { signedURL: '/object/sign/cv/x?token=t' } };
  if (url.includes('anthropic')) return { body: { content: [{ text: JSON.stringify({ risultati: [{ candidate_id: U1, match_finale: 88, perche_azienda: 'Adatta.' }, { candidate_id: U2, match_finale: 30, perche_azienda: 'No.' }] }) }] } };
  if (url.includes('/rest/v1/company_profiles') && opts.method === 'POST') return { body: [{ id: U3 }] };
  if (url.includes('/rest/v1/job_requests') && opts.method === 'POST') return { body: [{ id: JOB }] };
  return { status: 500, body: {} };
}
stubFetch(aziendaSupabase);
await t('azione sconosciuta → 400; origine diversa → 403', async () => {
  let r = res(); await azienda(req({ action: 'lista_tutti' }), r); assert.equal(r.statusCode, 400);
  r = res(); await azienda(req({ action: 'match', job_id: JOB }, { origin: null }), r); assert.equal(r.statusCode, 403);
});
await t('match: solo candidati visibili sopra soglia, senza email; registra la ricerca per il candidato', async () => {
  fetchLog.length = 0;
  const r = res(); await azienda(req({ action: 'match', job_id: JOB }), r);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.candidates.length, 1);
  assert.equal(r.body.candidates[0].nome, 'Anna');
  assert.ok(!JSON.stringify(r.body).includes('@'));
  const up = fetchLog.find((f) => f.url.includes('/rest/v1/job_matches') && f.opts.method === 'POST');
  const rows = JSON.parse(up.opts.body);
  assert.equal(rows[0].company_name, 'CBRE');
  assert.ok(!('viewed_at' in rows[0]));
});
await t('match e dettaglio funzionano anche se job_matches non esiste ancora', async () => {
  jobMatchesDown = true;
  let r = res(); await azienda(req({ action: 'match', job_id: JOB }), r);
  assert.equal(r.statusCode, 200);
  r = res(); await azienda(req({ action: 'dettaglio_candidato', user_id: U1, job_id: JOB }), r);
  jobMatchesDown = false;
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.email, 'anna@example.com');
});
await t('dettaglio: fuori shortlist → 404; dentro: email, CV, solo risposte non personali, "profilo aperto" registrato', async () => {
  let r = res(); await azienda(req({ action: 'dettaglio_candidato', user_id: U3, job_id: JOB }), r); assert.equal(r.statusCode, 404);
  jobMatchesPatchRows = [{ id: 'x' }];
  fetchLog.length = 0;
  r = res(); await azienda(req({ action: 'dettaglio_candidato', user_id: U1, job_id: JOB }), r);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.qa_log, [{ domanda: 'Cosa ti piace?', risposta: 'I dati' }]);
  assert.equal(r.body.report.assi.Concretezza, 40);
  const patch = fetchLog.find((f) => f.url.includes('/rest/v1/job_matches') && f.opts.method === 'PATCH');
  assert.ok(JSON.parse(patch.opts.body).viewed_at);
});
await t('crea_azienda in beta accetta qualsiasi email non vuota; crea_job: Concretezza facoltativa ma validata', async () => {
  let r = res(); await azienda(req({ action: 'crea_azienda', company_name: 'CBRE', contact_email: '   ' }), r); assert.equal(r.statusCode, 400);
  r = res(); await azienda(req({ action: 'crea_azienda', company_name: 'CBRE', contact_email: 'prova' }), r); assert.equal(r.statusCode, 200);
  r = res(); await azienda(req({ action: 'crea_job', company_id: U3, role_title: 'BDM', target_profile: { sintesi: 's', assi: assi(50) } }), r);
  assert.equal(r.statusCode, 200, 'profilo senza Concretezza (vecchio formato)');
  r = res(); await azienda(req({ action: 'crea_job', company_id: U3, role_title: 'BDM', target_profile: { sintesi: 's', assi: { ...assi(50), Concretezza: '65' } } }), r);
  assert.equal(r.statusCode, 200);
  const sent = JSON.parse(fetchLog.filter((f) => f.url.endsWith('/rest/v1/job_requests')).pop().opts.body);
  assert.equal(sent.target_profile.assi.Concretezza, 65);
  r = res(); await azienda(req({ action: 'crea_job', company_id: U3, role_title: 'BDM', target_profile: { sintesi: 's', assi: { ...assi(50), Concretezza: 140 } } }), r);
  assert.equal(r.statusCode, 400, 'Concretezza fuori scala');
  r = res(); await azienda(req({ action: 'crea_job', company_id: U3, role_title: 'BDM', target_profile: { sintesi: 's', assi: { ...assi(50), Metodo: undefined } } }), r);
  assert.equal(r.statusCode, 400, 'manca una dimensione obbligatoria');
});

console.log('\napi/account.js');
stubFetch(async (url, opts) => {
  if (url.endsWith('/auth/v1/user')) return opts.headers.Authorization === 'Bearer good' ? { body: { id: U1 } } : { status: 401, body: {} };
  if (url.includes('/storage/v1/object/cv/') && opts.method === 'DELETE') return { status: 404, body: {} };
  if (url.includes('/auth/v1/admin/users/') && opts.method === 'DELETE') return { body: {} };
  return { status: 500, body: {} };
});
await t('senza token valido → 401; con token cancella CV e poi l\'utente giusto', async () => {
  let r = res(); await account(req({ action: 'delete' }, { auth: 'Bearer bad' }), r);
  assert.equal(r.statusCode, 401);
  r = res(); await account(req({ action: 'delete' }, { auth: 'Bearer good' }), r);
  assert.equal(r.statusCode, 200);
  const dels = fetchLog.filter((f) => f.opts.method === 'DELETE').map((f) => f.url);
  assert.deepEqual(dels, [`https://sb.test/storage/v1/object/cv/${U1}/cv.pdf`, `https://sb.test/auth/v1/admin/users/${U1}`]);
});

console.log('\napi/cv.js — rigenerazione con il CV');
// Un test a capitoli completo, come lo salverebbe report.js.
function payloadV2() {
  let seed = 11;
  const st = E.createState({ rand: () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; } });
  for (let g = 0; g < 200; g++) {
    const s = E.nextStep(st);
    if (s.tipo === 'reveal') break;
    const k = s.key;
    if (s.tipo === 'intro' || s.tipo === 'capitolo') E.answer(st, k, { seen: true });
    else if (s.tipo === 'mondi') E.answer(st, k, { v: ['Media, comunicazione e marketing'] });
    else if (s.tipo === 'momento') E.answer(st, k, { v: 'incerto' });
    else if (s.tipo === 'background') E.answer(st, k, { v: BACKGROUND[0] });
    else if (['nome', 'aspirazione', 'racconto'].includes(s.tipo)) E.answer(st, k, { v: s.tipo === 'nome' ? 'Giulia' : '' });
    else if (s.tipo === 'card') E.answer(st, k, { v: CARDS.find((c) => c.id === s.id).asse === 'Relazione' ? 'si' : 'forse', ms: 1500 });
    else if (s.tipo === 'scene') {
      const sc = E.sceneContent(st, s.id);
      const o = sc.opzioni;
      if (sc.tipo === 'rank') E.answer(st, k, { order: [o[1].id, o[2].id, o[0].id] });
      else if (sc.tipo === 'pick') E.answer(st, k, { pick: o[0].id });
      else if (sc.tipo === 'twostep') E.answer(st, k, { first: o[1].id, second: o[0].id });
      else if (sc.tipo === 'budget') E.answer(st, k, { tokens: { a: 1, b: 5, c: 4, d: 0, e: 0, f: 0, g: 0 } });
      else E.answer(st, k, { energia: [o[1].id], drain: sc.opzioni2[0].id });
    } else if (s.tipo === 'dilemma') { st.dilCorrente = s.id; E.answer(st, k, { pick: 'a' }); }
  }
  return E.buildPayload(st);
}
const PDF = fs.readFileSync(new URL('./fixtures/cv-prova.pdf', import.meta.url));
let inserted = null;
let anthropicReq = null;
function cvSupabase(payload, { aiText }) {
  return async (url, opts) => {
    if (url.endsWith('/auth/v1/user')) return { body: { id: U1 } };
    if (url.includes('/rest/v1/profiles?id=eq.') && !opts.method) return { body: [{ cv_path: `${U1}/cv.pdf` }] };
    if (url.includes(`/storage/v1/object/cv/${U1}/cv.pdf`)) return { buffer: PDF.buffer.slice(PDF.byteOffset, PDF.byteOffset + PDF.byteLength) };
    if (url.includes('/rest/v1/reports?user_id=eq.')) return { body: [{ id: 'r-1', aspiration: 'Copywriter', test_history: { versione: 2, history: E.syntheticHistory(payload), activities: { _v2: payload }, answers: [] }, report_json: {} }] };
    if (url.includes('anthropic')) { anthropicReq = JSON.parse(opts.body); return { body: { content: [{ text: aiText }] } }; }
    if (url.endsWith('/rest/v1/reports') && opts.method === 'POST') { inserted = JSON.parse(opts.body); return { body: [{ id: 'r-2' }] }; }
    if (url.includes('/rest/v1/profiles?id=eq.') && opts.method === 'PATCH') return { body: [] };
    return { status: 500, body: {} };
  };
}
await t('report del test a capitoli: il CV entra nel racconto, numeri e ruoli restano quelli calcolati', async () => {
  const payload = payloadV2();
  const ai = { report: { chi_sei: { come_funzioni: 'CF', cosa_ti_alimenta: 'CA', di_cosa_hai_bisogno: 'DB' }, riepilogo_aziende: 'RA', ruoli: [{ nome: 'Ruolo inventato', perche: 'P' }], bonus: { nome: 'x', testo: 'B' }, ruoli_mismatch: [] } };
  stubFetch(cvSupabase(payload, { aiText: JSON.stringify(ai) }));
  const r = res();
  await cv(req({}, { auth: 'Bearer good' }), r);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.report_id, 'r-2');
  assert.equal(anthropicReq.system, claudeMod.PROMPT_REPORT_V2);
  const content = anthropicReq.messages[0].content;
  assert.ok(content.includes('ESTRATTO DEL CV') && content.includes('marketing digitale'), 'CV non passato all\'AI');
  assert.deepEqual(inserted.report_json.ruoli.map((x) => x.nome), payload.risultato.ruoli.map((x) => x.nome));
  assert.deepEqual(inserted.report_json.assi, payload.risultato.assi);
  assert.equal(inserted.report_json.cv_usato, true);
  assert.equal(inserted.report_json.versione_test, 2);
  assert.equal(inserted.test_history.versione, 2);
  assert.equal(inserted.aspiration, 'Copywriter');
});
await t('report del test a capitoli: risposta dell\'AI illeggibile → 500, niente salvato', async () => {
  inserted = null;
  stubFetch(cvSupabase(payloadV2(), { aiText: 'non è JSON' }));
  const r = res();
  await cv(req({}, { auth: 'Bearer good' }), r);
  assert.equal(r.statusCode, 500);
  assert.equal(inserted, null);
});

console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
