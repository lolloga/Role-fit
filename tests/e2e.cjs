// Test end-to-end di RoleFit in Chromium, con Supabase e le API simulate.
//
// Uso (Playwright installato globalmente, come negli ambienti cloud):
//   NODE_PATH=$(npm root -g) node tests/e2e.cjs
// Variabili: ONLY=v2|v1|profilo|azienda per una sezione sola,
//            CHROME_PATH per usare un Chromium diverso da quello di Playwright.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS || path.join(require('os').tmpdir(), 'rolefit-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ONLY = process.env.ONLY || '';
const want = (section) => !ONLY || ONLY.split(',').includes(section);

let pass = 0, fail = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; failures.push(name); console.log('  ✗', name, '\n    ', (e.message || String(e)).split('\n')[0]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'asserzione fallita'); }

// ─── Supabase simulato (sostituisce js/supabase.js) ─────────────
const SUPABASE_MOCK = `
const cfg = window.__SB || {};
const log = (window.__SBLOG = window.__SBLOG || []);
const session = cfg.session ? { access_token: 'tok', user: { id: 'u-1', email: 'test@example.com', created_at: '2026-09-01T10:00:00Z' } } : null;
const REPORT_ROW = () => ({ id: 'r-1', created_at: '2026-09-20T10:00:00Z', report_json: window.__MOCK_REPORT, aspiration: null, test_history: { answers: [] } });
const chain = () => { const c = { select: () => c, eq: () => c, order: () => c, limit: () => c, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), insert: async (v) => { log.push(['insert', v]); return { data: null, error: null }; }, update: () => c, then: (r) => r({ data: [], error: null }) }; return c; };
export const sb = { from: () => chain(), auth: { getSession: async () => ({ data: { session } }) }, rpc: async () => ({ data: null, error: null }), storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) } };
export async function getSession() { return session; }
export async function signInWithMagicLink(email, redirectTo, draftId) { log.push(['magic', email, redirectTo, draftId]); return { error: null }; }
export async function signOut() { log.push(['signOut']); }
export async function getAccessToken() { return session ? 'tok' : null; }
export async function saveReport(r) { log.push(['saveReport', r]); return { id: 'r-new' }; }
export async function updateReportEval(id, p) { log.push(['updateReportEval', id, p]); }
export async function listReports() { return cfg.reportsList || (cfg.reports ? [REPORT_ROW()] : []); }
export async function getReport(id) { return REPORT_ROW(); }
export async function getLastTestHistory() { return null; }
export async function getHistoricalProfile() { return []; }
const PROFILE = { nome: cfg.nome || null, email: 'test@example.com', marketing_consent: !!cfg.marketing, cv_path: cfg.cv ? 'u-1/cv.pdf' : null, cv_updated_at: cfg.cv ? '2026-09-20T10:00:00Z' : null };
export async function getProfile() { return { ...PROFILE }; }
export async function updateProfile(p) { log.push(['updateProfile', p]); Object.assign(PROFILE, p); }
export async function changeEmail(e) { log.push(['changeEmail', e]); }
export async function saveUserName(n) { log.push(['saveUserName', n]); }
export async function uploadCv() { return 'u-1/cv.pdf'; }
export async function saveCvPath() {}
export async function removeCv() { log.push(['removeCv']); }
export async function createDraft(d) { log.push(['createDraft', d]); return { id: 'd-1' }; }
export async function claimDraft() { return null; }
export async function deleteDraft() {}
let SAVED = (cfg.saved || []).map((r, i) => ({ id: 's-' + i, created_at: '2026-09-15T10:00:00Z', updated_at: '2026-09-15T10:00:00Z', fonte: 'banco', settore: null, match: null, nota: null, ...r }));
const key = (r) => (r.nome || '').trim().toLowerCase() + '|' + (r.settore || '').trim().toLowerCase();
export async function listSavedRoles() { if (cfg.tablesMissing) throw new Error('relation "saved_roles" does not exist'); return SAVED.map(r => ({ ...r })); }
export async function saveRole(r) {
  log.push(['saveRole', r]);
  if (cfg.tablesMissing) throw new Error('relation "saved_roles" does not exist');
  const i = SAVED.findIndex(x => key(x) === key(r));
  const clean = Object.fromEntries(Object.entries(r).filter(([, v]) => v != null));
  if (i >= 0) SAVED[i] = { ...SAVED[i], ...clean, updated_at: new Date().toISOString() };
  else SAVED.unshift({ id: 's-' + Date.now(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), settore: null, match: null, nota: null, ...clean });
}
export async function removeSavedRole(id) { log.push(['removeSavedRole', id]); SAVED = SAVED.filter(r => r.id !== id); }
export async function listJobMatches() { if (cfg.tablesMissing) throw new Error('relation "job_matches" does not exist'); return (cfg.matches || []).map(m => ({ ...m })); }
export async function exportMyData() { log.push(['exportMyData']); return { profilo: PROFILE, report: [], ruoli_salvati: SAVED, ricerche_aziendali: cfg.matches || [] }; }
`;

const ASSI = { Analisi: 72, Relazione: 80, 'Creatività': 55, 'Curiosità': 78, Leadership: 60, Metodo: 64 };
const MOCK_REPORT = {
  chi_sei: { come_funzioni: 'Ragioni per connessioni.', cosa_ti_alimenta: 'Le persone e i problemi aperti.', di_cosa_hai_bisogno: 'Autonomia e confronto.' },
  riepilogo_aziende: 'Profilo relazionale e analitico.',
  ruoli: [1, 2, 3].map(i => ({ nome: `Ruolo ${i}`, match: 90 - i * 4, perche: 'Perché sì.', cosa_fa: 'Fa cose.', come_si_entra: 'Così.', sorpresa: 'Sorpresa.', settori: [{ nome: 'Consulenza', declinazione: 'Declinazione.', aziende: ['A', 'B', 'C'] }] })),
  bonus: { nome: 'Ruolo Bonus', testo: 'Bonus.' },
  ruoli_mismatch: [{ nome: 'Contabile', match: 22, perche_no: 'Troppo ripetitivo.' }],
  assi: ASSI,
  assi_confidenza: { Analisi: 'alta', Relazione: 'alta', 'Creatività': 'media', 'Curiosità': 'media', Leadership: 'bassa', Metodo: 'alta' },
};

// Scene personalizzate e report del test a capitoli, come li scriverebbe l'AI.
const AI_SCENE = { scene: [
  { id: 'ai1', titolo: 'La app in ritardo', testo: 'La nuova app per i clienti va in prova domani e mancano dei pezzi.', domanda: 'Cosa fai?', opzioni: [
    { testo: 'Sento chi la userà per capire cosa conta', asse: 'Relazione' }, { testo: 'Rifaccio la lista delle cose da chiudere', asse: 'Metodo' },
    { testo: 'Guardo come l\'hanno risolto altri team', asse: 'Curiosità' }, { testo: 'Provo subito la app sul telefono', asse: 'Concretezza' }] },
  { id: 'ai2', titolo: 'La campagna nuova', testo: 'In agenzia si apre una campagna per un cliente di moda.', domanda: 'Da dove parti?', opzioni: [
    { testo: 'Butto giù tre idee di concept', asse: 'Creatività' }, { testo: 'Propongo io come dividerci il lavoro', asse: 'Leadership' },
    { testo: 'Studio il pubblico che non conosco', asse: 'Curiosità' }, { testo: 'Preparo un calendario delle consegne', asse: 'Metodo' }] },
] };
const AI_REPORT_V2 = { report: {
  chi_sei: { come_funzioni: 'Paragrafo come funzioni.', cosa_ti_alimenta: 'Paragrafo cosa ti alimenta.', di_cosa_hai_bisogno: 'Paragrafo bisogni.' },
  riepilogo_aziende: 'Questa persona lavora bene con gli altri.',
  ruoli: [1, 2, 3].map(i => ({ nome: `Nome inventato ${i}`, perche: `Perché ${i}.`, cosa_fa: `Cosa fa ${i}.`, come_si_entra: `Come si entra ${i}.`, sorpresa: `Sorpresa ${i}.`, settori: [{ nome: 'Editoria digitale', declinazione: 'Così.', aziende: ['Mondadori'] }] })),
  bonus: { nome: 'Bonus inventato', testo: 'Testo del bonus.' },
  ruoli_mismatch: [1, 2, 3].map(i => ({ nome: `No ${i}`, perche_no: `Non fa per te ${i}.` })),
} };

function claudeReply(fase, body, counters) {
  const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
  if (fase === 'test') {
    counters.test = (counters.test || 0) + 1;
    const n = counters.test;
    if (n > 7) return text({ action: 'report', phase: 'almost' });
    return text({ action: 'ask', phase: n < 3 ? 'building' : n < 6 ? 'deepening' : 'almost', question: { text: `Domanda AI numero ${n}?`, options: [`Opzione concreta A${n}`, `Opzione concreta B${n}`, `Opzione concreta C${n}`, `Opzione concreta D${n}`] } });
  }
  if (fase === 'report') return text({ report: MOCK_REPORT });
  if (fase === 'report_v2') return text(AI_REPORT_V2);
  if (fase === 'scene') return text(AI_SCENE);
  if (fase === 'compatibilita') return text({ match: 64, titolo: 'Compatibile in parte', descrizione: 'Ti somiglia per metà: serve più metodo.' });
  if (fase === 'dizionario') return text({ ruolo: { nome: 'Data Analyst', titoli_alternativi: ['Analista dati'], descrizione: 'Trasforma dati in decisioni.', giornata_tipo: 'SQL e riunioni.', con_chi_lavora: ['Product'], come_si_entra: 'Stage.', stipendio_junior: '28k', stipendio_senior: '50k', trend: 'in crescita', trend_descrizione: 'Richiesto.', cosa_non_sai: 'Parla molto.', titoli_adiacenti: ['BI Analyst'] } });
  if (fase === 'azienda_test') {
    counters.az = (counters.az || 0) + 1;
    if (counters.az > 3) return text({ action: 'report' });
    return text({ action: 'ask', question: { text: `Domanda azienda ${counters.az}?`, type: 'multiple_choice', options: ['Uno', 'Due', 'Tre', 'Quattro'] } });
  }
  if (fase === 'azienda_report') return text({ target_profile: { sintesi: 'Junior BDM relazionale.', assi: { ...ASSI, Concretezza: 40 } } });
  return text({});
}

async function newPage(browser, { session = false, cv = false, reports = false, mobile = true, sb = {}, sceneFail = false } = {}) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(([cfg, rep]) => { window.__SB = cfg; window.__MOCK_REPORT = rep; }, [{ session, cv, reports, ...sb }, MOCK_REPORT]);
  const page = await ctx.newPage();
  const counters = {};
  const apiLog = [];
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/_vercel\/insights|Failed to load resource|Errore API Claude|Risposta Claude non valida|Errore generazione report|non disponibili/.test(m.text())) errors.push(m.text()); });
  await page.route('**/js/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: SUPABASE_MOCK }));
  await page.route('**/_vercel/insights/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/api/**', async (r) => {
    const url = r.request().url();
    const body = JSON.parse(r.request().postData() || '{}');
    apiLog.push({ url, body, headers: r.request().headers() });
    if (url.endsWith('/api/claude')) {
      if (counters.fail429) { counters.fail429--; return r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Troppe richieste' }) }); }
      if (body.fase === 'scene' && sceneFail) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(claudeReply(body.fase, body, counters)) });
    }
    if (url.endsWith('/api/azienda')) {
      const a = body.action;
      const out = a === 'crea_azienda' ? { id: 'c-1' }
        : a === 'crea_job' ? { id: '44444444-4444-4444-8444-444444444444' }
        : a === 'match' ? { job: { id: 'j', role_title: 'Junior BDM', target_profile: { sintesi: 'Junior BDM relazionale.', assi: { ...ASSI, Concretezza: 40 } } }, candidates: [{ user_id: '11111111-1111-4111-8111-111111111111', nome: 'Anna', match: 88, ruoli: ['Business Analyst'], perche_azienda: 'Adatta.' }], soglia: 80 }
        : a === 'dettaglio_candidato' ? { nome: 'Anna', email: 'anna@example.com', report: { riepilogo_aziende: 'Anna è...', ruoli: [{ nome: 'Business Analyst', match: 90, cosa_fa: 'x' }], assi: { ...ASSI, Concretezza: 35 }, assi_confidenza: MOCK_REPORT.assi_confidenza }, qa_log: [{ domanda: 'D?', risposta: 'R' }], qa_disponibile: true, cv_url: null }
        : { error: 'x' };
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(out) });
    }
    if (url.endsWith('/api/account')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  return { ctx, page, counters, apiLog, errors };
}

const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
const noOverflow = async (page, where) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!o, 'scroll orizzontale in ' + where);
};

// ─── Test classico: risponde a ciò che c'è a schermo ───────────
async function actV1(page) {
  page.setDefaultTimeout(5000);
  if (await visible(page, '#test-retry-btn')) { await page.click('#test-retry-btn'); return 'retry'; }
  if (await visible(page, '#activity-area:not(.hidden) .activity-card')) {
    const title = (await page.locator('.activity-title').first().textContent()) || '';
    if (title.includes('Riunione')) { await page.locator('.riunione-card').first().click(); return 'riunione'; }
    if (title.includes('Termometro')) {
      const rows = page.locator('.termometro-row');
      const n = await rows.count();
      for (let i = 0; i < n; i++) await rows.nth(i).locator('.reaction-btn').nth(i % 3).click();
      return 'termometro';
    }
    if (title.includes('Dilemma')) {
      const pairs = page.locator('.dilemma-pair');
      const n = await pairs.count();
      for (let i = 0; i < n; i++) await pairs.nth(i).locator('.dilemma-option').nth(i % 2).click();
      return 'dilemma';
    }
    if (title.includes('Settimana')) {
      const btns = page.locator('#activity-content .option-btn');
      for (let i = 0; i < 5; i++) await btns.nth(i).click();
      return 'costruisci';
    }
    if (title.includes('Smonta')) {
      const rows = page.locator('#activity-content div[data-stato]');
      for (let i = 0; i < 4; i++) await rows.nth(i).click();
      await page.click('text=Conferma e continua');
      return 'smonta';
    }
    return 'attività sconosciuta: ' + title;
  }
  if (await visible(page, '#active-question:not(.hidden)')) {
    const q = (await page.locator('#question-text').textContent()) || '';
    if (/aspiri|obiettivo|ruolo/i.test(q) && await visible(page, 'textarea.open-input')) {
      await page.fill('textarea.open-input', 'Product Manager');
      await page.click('text=Vedi il mio report');
      return 'aspirazione-testo';
    }
    if (await visible(page, 'input.open-input')) { await page.fill('input.open-input', 'Giulia'); await page.click('#question-input .btn--primary'); return 'nome'; }
    if (await visible(page, 'textarea.open-input')) { await page.fill('textarea.open-input', 'Risposta libera di prova'); await page.click('#question-input .btn--primary'); return 'aperta'; }
    const opts = page.locator('#question-input .option-btn:not([disabled])');
    if (await opts.count()) {
      await opts.first().click();
      const confirm = page.locator('#question-input .btn--primary');
      if (await confirm.count() && await confirm.first().isVisible()) await confirm.first().click();
      return 'opzione: ' + q.slice(0, 40);
    }
  }
  return null;
}
async function runUntil(page, predicate, act, maxSteps = 90) {
  const steps = [];
  for (let i = 0; i < maxSteps; i++) {
    if (await predicate()) return steps;
    const a = await act(page);
    if (a) steps.push(a);
    await page.waitForTimeout(a ? 650 : 300);
  }
  throw new Error('Non arrivato alla condizione. Ultimi passi: ' + steps.slice(-6).join(' | '));
}

// ─── Test a capitoli: risponde a ciò che c'è a schermo ─────────
let cardTurn = 0;
async function actV2(page, { drag = false } = {}) {
  const title = await page.evaluate(() => (document.querySelector('#v2-stage .v2-title')?.textContent || '').trim());
  if (await visible(page, '.v2-role-card')) return null;
  if (await visible(page, '.v2-card')) {
    const v = ['si', 'no', 'forse', 'si'][cardTurn++ % 4];
    if (drag && v !== 'forse') {
      const box = await page.locator('.v2-card').boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + (v === 'si' ? 170 : -170), y + 10, { steps: 8 }); await page.mouse.up();
    } else {
      await page.locator(`.v2-swipe-btn.${v}`).click();
    }
    return 'carta ' + v;
  }
  if (await visible(page, '.v2-dil-opt')) { await page.locator('.v2-dil-opt').nth(cardTurn++ % 2).click(); return 'dilemma'; }
  if (await visible(page, 'input[aria-label="Il tuo nome"]')) { await page.fill('input[aria-label="Il tuo nome"]', 'Giulia'); await page.click('text=Continua'); return 'nome'; }
  if (title === 'In che momento sei?') { await page.locator('.v2-opt').nth(2).click(); return 'momento'; }
  if (await visible(page, '.v2-chip')) {
    await page.locator('.v2-chip', { hasText: 'Tecnologia e digitale' }).click();
    await page.locator('.v2-chip', { hasText: 'Media, comunicazione e marketing' }).click();
    await page.click('text=Continua');
    return 'mondi';
  }
  if (await visible(page, '.v2-budget')) {
    const plus = page.locator('.v2-budget-row [data-op="+"]');
    for (const [row, n] of [[1, 4], [5, 3], [6, 2], [0, 1]]) for (let i = 0; i < n; i++) await plus.nth(row).click();
    await page.click('text=Avanti');
    return 'budget';
  }
  if (await visible(page, '.v2-scene-head')) {
    const q = await page.evaluate(() => document.querySelector('#v2-stage .v2-question')?.textContent || '');
    if (/Toccane tre/.test(q)) {
      const opts = page.locator('.v2-opt');
      await opts.nth(1).click(); await opts.nth(4).click(); await opts.nth(0).click();
      await page.click('text=Avanti');
      return 'posta';
    }
    if (/energia/.test(q) && await visible(page, 'text=Avanti')) {
      const opts = page.locator('.v2-opt');
      await opts.nth(1).click(); await opts.nth(3).click();
      await page.click('text=Avanti');
      return 'energia';
    }
    await page.locator('.v2-opt').first().click();
    return 'scena: ' + q.slice(0, 30);
  }
  if (title === 'Da dove parti?') { await page.locator('.v2-opt').first().click(); return 'studi'; }
  if (await visible(page, 'input[aria-label="Il ruolo che hai in mente"]')) { await page.fill('input[aria-label="Il ruolo che hai in mente"]', 'Product Manager'); await page.click('text=Continua'); return 'aspirazione'; }
  if (await visible(page, 'textarea.v2-textarea')) { await page.fill('textarea.v2-textarea', 'Quando ho organizzato il festival del mio paese.'); await page.click('text=Vedi il risultato'); return 'racconto'; }
  for (const label of ['Iniziamo', 'Inizia', 'Entra nella giornata', 'Avanti']) {
    const b = page.locator('#v2-stage .v2-main-btn', { hasText: label });
    if (await b.count() && await b.first().isEnabled()) { await b.first().click(); return 'bottone ' + label; }
  }
  return null;
}
async function runV2Until(page, predicate, opts = {}, maxSteps = 120) {
  const steps = [];
  for (let i = 0; i < maxSteps; i++) {
    if (await predicate()) return steps;
    const a = await actV2(page, opts);
    if (a) steps.push(a);
    await page.waitForTimeout(a ? 380 : 200);
  }
  throw new Error('Non arrivato alla condizione. Ultimi passi: ' + steps.slice(-6).join(' | '));
}
const stepTitle = (page) => page.evaluate(() => document.querySelector('#v2-stage .v2-eyebrow')?.textContent || '');

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

  try {
    if (want('v1')) {
      console.log('\nPagine pubbliche e anteprima LinkedIn');
      await t('home: meta Open Graph assoluti, immagine e favicon raggiungibili', async () => {
        const { page, errors, ctx } = await newPage(browser);
        await page.goto(BASE + '/index.html');
        const og = await page.getAttribute('meta[property="og:image"]', 'content');
        assert(/^https:\/\/.+\/og-image\.png$/.test(og), 'og:image non assoluto: ' + og);
        for (const p of ['/og-image.png', '/favicon.svg', '/robots.txt']) {
          const r = await page.request.get(BASE + p); assert(r.ok(), p + ' non trovato');
        }
        assert(errors.length === 0, 'errori console: ' + errors.join(' | '));
        await ctx.close();
      });
      await t('tutte le pagine: favicon, titolo, nessun errore JS, niente scroll orizzontale su telefono', async () => {
        for (const p of ['index', 'come-funziona', 'azienda', 'dizionario', 'chi-siamo', 'test-azienda', 'account', 'storico', 'test-v2']) {
          const { page, errors, ctx } = await newPage(browser);
          await page.goto(`${BASE}/${p}.html`);
          await page.waitForTimeout(400);
          assert(await page.locator('link[rel="icon"]').count() === 1, p + ': favicon mancante');
          assert((await page.title()).includes('RoleFit'), p + ': titolo');
          assert(errors.length === 0, `${p}: ${errors.join(' | ')}`);
          await noOverflow(page, p);
          await ctx.close();
        }
      });

      console.log('\nTest classico — telefono');
      const S = await newPage(browser);
      const { page } = S;
      await t('parte dalla prima domanda, "Cambia risposta" non salta domande, doppio tocco = una risposta', async () => {
        await page.goto(BASE + '/test.html');
        await page.waitForSelector('#active-question:not(.hidden)');
        await actV1(page); await page.waitForTimeout(500);
        const q2 = await page.locator('#question-text').textContent();
        await actV1(page); await page.waitForTimeout(500);
        const q3 = await page.locator('#question-text').textContent();
        await page.click('#back-btn'); await page.waitForTimeout(400);
        assert((await page.locator('#question-text').textContent()) === q2, 'non è tornato alla domanda 2');
        await actV1(page); await page.waitForTimeout(500);
        assert((await page.locator('#question-text').textContent()) === q3, 'ha saltato la domanda 3');
        const before = await page.evaluate(() => JSON.parse(localStorage.getItem('rf_state')).answers.length);
        const opt = page.locator('#question-input .option-btn').first();
        if (await opt.count()) { await opt.dblclick(); const c = page.locator('#question-input .btn--primary'); if (await c.count() && await c.first().isVisible()) await c.first().dblclick(); } else await actV1(page);
        await page.waitForTimeout(800);
        const after = await page.evaluate(() => JSON.parse(localStorage.getItem('rf_state')).answers.length);
        assert(after === before + 1, `attese ${before + 1} risposte, trovate ${after}`);
      });
      await t('ricaricare durante un\'attività e durante una domanda dell\'AI riprende dal punto giusto', async () => {
        await runUntil(page, () => visible(page, '#activity-area:not(.hidden) .activity-card'), actV1);
        const title = await page.locator('.activity-title').textContent();
        await page.reload(); await page.waitForTimeout(800);
        assert((await page.locator('.activity-title').textContent()) === title, 'attività diversa dopo reload');
        await runUntil(page, async () => /Domanda AI numero/.test(await page.locator('#question-text').textContent().catch(() => '')) && await visible(page, '#active-question:not(.hidden)'), actV1);
        const q = await page.locator('#question-text').textContent();
        await page.reload(); await page.waitForTimeout(800);
        assert((await page.locator('#question-text').textContent()) === q, 'domanda cambiata dopo reload');
      });
      await t('la home offre "Riprendi il tuo test" con un test classico in corso', async () => {
        const p2 = await S.ctx.newPage();
        await p2.route('**/js/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: SUPABASE_MOCK }));
        await p2.goto(BASE + '/index.html');
        assert((await p2.locator('#hero-test-cta-label').textContent()) === 'Riprendi il tuo test');
        assert((await p2.getAttribute('#hero-test-cta', 'href')) === 'test.html');
        await p2.close();
      });
      await t('errore 429 con Riprova; tutte le attività; cancello email con bozza completa', async () => {
        S.counters.fail429 = 1;
        await runUntil(page, () => visible(page, '#test-retry-btn'), actV1, 20);
        assert(/Troppe richieste/.test(await page.locator('#thinking-phrase').textContent()));
        await page.click('#test-retry-btn'); await page.waitForTimeout(800);
        await runUntil(page, async () => (await page.locator('#question-context').textContent().catch(() => '')).includes('Ultima domanda'), actV1);
        const acts = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rf_state')).activityResults));
        for (const a of ['riunione', 'termometro', 'dilemma', 'costruisci', 'smonta']) assert(acts.includes(a), 'attività mancante: ' + a);
        await page.locator('#question-input .option-btn').first().click();
        await page.waitForTimeout(300);
        await runUntil(page, async () => page.url().includes('report.html'), actV1, 10);
        await page.waitForSelector('text=Le aziende non la vedono', { timeout: 5000 });
        await page.fill('input[type="email"]', 'giulia@example.com');
        await page.press('input[type="email"]', 'Enter');
        await page.waitForTimeout(800);
        const draft = (await page.evaluate(() => window.__SBLOG)).find(l => l[0] === 'createDraft');
        assert(draft && Array.isArray(draft[1].activities._answers) && draft[1].activities.riunione, 'bozza incompleta');
      });
      const errs = S.errors.slice();
      await S.ctx.close();
      await t('nessun errore JavaScript durante il test classico', async () => { assert(errs.length === 0, errs.join(' | ')); });

      console.log('\nReport del test classico');
      await t('il report si genera, si salva, mostra i ruoli e si condivide su LinkedIn', async () => {
        const R = await newPage(browser, { session: true });
        await R.page.goto(BASE + '/index.html');
        await R.page.evaluate(() => {
          localStorage.setItem('rf_history', JSON.stringify([{ role: 'user', content: 'Domanda: "Nome"\nRisposta: "Giulia"' }, { role: 'assistant', content: '{"action":"report"}' }]));
          localStorage.setItem('rf_activities', '{}');
          localStorage.setItem('rf_answers', JSON.stringify([{ id: 'nome', question: 'Nome?', answer: 'Giulia' }]));
          localStorage.setItem('rf_aspiration', 'Product Manager');
          localStorage.removeItem('rf_report_saved');
        });
        await R.page.goto(BASE + '/report.html');
        await R.page.waitForSelector('text=Ruolo 1', { timeout: 15000 });
        await R.page.waitForTimeout(800);
        const log = await R.page.evaluate(() => window.__SBLOG);
        const saved = log.find(l => l[0] === 'saveReport');
        assert(saved && saved[1].test_history.versione === undefined, 'report classico marcato come versione 2');
        assert(R.apiLog.some(a => a.body.fase === 'report'), 'fase report non chiamata');
        assert(!(await R.page.locator('#prove-box').isVisible()), 'prove visibili nel report classico');
        await R.page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); }; });
        await R.page.click('text=Condividi su LinkedIn');
        const opened = await R.page.evaluate(() => window.__opened[0] || '');
        assert(opened.startsWith('https://www.linkedin.com/feed/?shareActive=true&text='), 'URL: ' + opened);
        assert(R.errors.length === 0, R.errors.join(' | '));
        await R.ctx.close();
      });
    }

    if (want('v2')) {
      console.log('\nTest a capitoli — telefono');
      cardTurn = 0;
      const V = await newPage(browser);
      const vp = V.page;
      await t('si apre senza menu del sito, con orologio e capitolo, e niente scroll orizzontale', async () => {
        await vp.goto(BASE + '/test-v2.html');
        await vp.waitForSelector('text=Iniziamo');
        assert(!(await visible(vp, '.site-nav')), 'menu del sito visibile');
        assert((await vp.locator('#v2-ora').textContent()) === '07:30');
        assert((await vp.locator('#v2-cap').textContent()) === 'Prologo');
        assert(await vp.locator('.v2-layer.on[data-fase="alba"]').count() === 1, 'cielo dell\'alba non attivo');
        await noOverflow(vp, 'intro');
        await vp.screenshot({ path: SHOTS + '/v2-01-intro.png' });
      });
      await t('prologo: nome, momento, mondi; parte la richiesta delle scene personalizzate', async () => {
        await runV2Until(vp, async () => (await stepTitle(vp)) === 'Capitolo 1 di 3');
        const sc = V.apiLog.filter(a => a.body.fase === 'scene');
        assert(sc.length === 1, 'richieste scene: ' + sc.length);
        const msg = JSON.parse(sc[0].body.messages[0].content);
        assert(msg.mondi.includes('Tecnologia e digitale') && msg.scene.length === 2, JSON.stringify(msg));
        assert(!sc[0].body.messages[0].content.includes('Giulia'), 'il nome non deve andare all\'AI delle scene');
        await vp.screenshot({ path: SHOTS + '/v2-02-capitolo1.png' });
      });
      await t('carte: si rispondono con i bottoni e trascinando; la costellazione e l\'orologio avanzano', async () => {
        await runV2Until(vp, async () => (await stepTitle(vp)) === 'Carta 3 di 28', { drag: true });
        await vp.screenshot({ path: SHOTS + '/v2-03-carta.png' });
        const ora = await vp.locator('#v2-ora').textContent();
        assert(ora === '08:06', 'orologio: ' + ora);
        const n = await vp.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rf_v2_state')).answers).filter(k => k.startsWith('card:')).length);
        assert(n === 2, 'carte registrate: ' + n);
      });
      await t('"Indietro" riporta alla carta precedente', async () => {
        await vp.click('#v2-back'); await vp.waitForTimeout(300);
        assert((await stepTitle(vp)) === 'Carta 2 di 28', await stepTitle(vp));
        await actV2(vp); await vp.waitForTimeout(400);
        assert((await stepTitle(vp)) === 'Carta 3 di 28');
      });
      await t('ricaricare a metà mazzo riprende dalla stessa carta, con un avviso', async () => {
        await runV2Until(vp, async () => (await stepTitle(vp)) === 'Carta 10 di 28');
        const testo = await vp.locator('.v2-card-text').textContent();
        await vp.reload(); await vp.waitForSelector('.v2-card');
        assert((await vp.locator('.v2-card-text').textContent()) === testo, 'carta diversa dopo il reload');
        assert(await visible(vp, '#v2-toast:not(.hidden)'), 'manca l\'avviso di ripresa');
      });
      await t('la home propone di riprendere il test a capitoli', async () => {
        const p2 = await V.ctx.newPage();
        await p2.route('**/js/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: SUPABASE_MOCK }));
        await p2.goto(BASE + '/index.html');
        assert((await p2.locator('#hero-test-cta-label').textContent()) === 'Riprendi il tuo test');
        assert((await p2.getAttribute('#hero-test-cta', 'href')) === 'test-v2.html');
        await p2.close();
      });
      await t('la giornata: posta, scena personalizzata dall\'AI, cielo che cambia, imprevisto in due mosse', async () => {
        await runV2Until(vp, async () => (await visible(vp, '.v2-scene-head')) && /Toccane tre/.test(await vp.locator('.v2-question').textContent()));
        assert((await vp.locator('#v2-ora').textContent()) === '09:00');
        assert(await vp.locator('.v2-layer.on[data-fase="mattino"]').count() === 1, 'cielo del mattino non attivo');
        await vp.screenshot({ path: SHOTS + '/v2-04-posta.png' });
        await actV2(vp); await vp.waitForTimeout(400);
        await actV2(vp); await vp.waitForTimeout(500); // riunione
        assert((await vp.locator('.v2-scene-titolo').textContent()) === 'La app in ritardo', 'scena AI non usata: ' + await vp.locator('.v2-scene-titolo').textContent());
        await vp.screenshot({ path: SHOTS + '/v2-05-scena-ai.png' });
        await actV2(vp); await vp.waitForTimeout(500);
        assert((await vp.locator('.v2-scene-titolo').textContent()) === 'L\'imprevisto');
        await vp.locator('.v2-opt').nth(1).click(); await vp.waitForTimeout(450);
        assert(await visible(vp, '.v2-pill'), 'manca la prima mossa');
        assert(await vp.locator('.v2-opt').count() === 3, 'la seconda mossa deve avere 3 opzioni');
        await vp.locator('.v2-opt').first().click(); await vp.waitForTimeout(450);
        assert(await vp.locator('.v2-layer.on[data-fase="pomeriggio"]').count() === 1, 'cielo del pomeriggio non attivo');
      });
      await t('budget: "Avanti" solo con tutti i 10 gettoni, massimo 5 per voce', async () => {
        assert(await visible(vp, '.v2-budget'));
        const avanti = vp.locator('#v2-stage .v2-main-btn');
        assert(await avanti.isDisabled(), 'Avanti attivo senza gettoni');
        const plus = vp.locator('.v2-budget-row [data-op="+"]');
        for (let i = 0; i < 5; i++) await plus.nth(0).click();
        assert(await plus.nth(0).isDisabled(), 'più di 5 gettoni sulla stessa voce');
        await vp.screenshot({ path: SHOTS + '/v2-06-budget.png' });
        for (let i = 0; i < 5; i++) await plus.nth(1).click();
        assert(await avanti.isEnabled(), 'Avanti non si attiva con 10 gettoni');
        await avanti.click(); await vp.waitForTimeout(400);
      });
      await t('fine giornata e dilemmi adattivi (da 4 a 6), poi epilogo e risultato', async () => {
        await runV2Until(vp, async () => (await stepTitle(vp)) === 'Capitolo 3 di 3');
        assert(await vp.locator('.v2-layer.on[data-fase="notte"]').count() === 1, 'cielo della notte non attivo');
        await runV2Until(vp, () => visible(vp, '.v2-dil-opt'));
        await vp.screenshot({ path: SHOTS + '/v2-07-dilemma.png' });
        await runV2Until(vp, () => visible(vp, '.v2-role-card'));
        const st = await vp.evaluate(() => JSON.parse(localStorage.getItem('rf_v2_state')));
        assert(st.dilemmi.length >= 4 && st.dilemmi.length <= 6, 'dilemmi: ' + st.dilemmi.length);
        await vp.waitForTimeout(1600);
        await vp.screenshot({ path: SHOTS + '/v2-08-risultato.png', fullPage: true });
      });
      await t('risultato: costellazione grande, primo ruolo con percentuale, passaggio al report pronto', async () => {
        assert(await vp.locator('#v2-stars-wrap.is-big').count() === 1, 'costellazione non ingrandita');
        assert((await vp.locator('.v2-title').textContent()).startsWith('Giulia, ecco'), 'manca il nome nel titolo');
        assert(/^\d{2}%$/.test(await vp.locator('.v2-role-pct').textContent()), 'percentuale');
        const h = await vp.evaluate(() => ({
          act: JSON.parse(localStorage.getItem('rf_activities')),
          hist: JSON.parse(localStorage.getItem('rf_history')),
          ans: JSON.parse(localStorage.getItem('rf_answers')),
          asp: localStorage.getItem('rf_aspiration'),
        }));
        const r = h.act._v2.risultato;
        assert(h.act._v2.versione === 2 && r.ruoli.length === 3 && typeof r.assi.Concretezza === 'number', 'payload incompleto');
        assert((await vp.locator('.v2-role-name').textContent()) === r.ruoli[0].nome, 'ruolo diverso da quello del motore');
        assert(h.hist.length === 2 && h.hist[0].role === 'user', 'storia sintetica');
        assert(h.ans.some(a => a.id === 'nome' && a.answer === 'Giulia'), 'nome mancante nelle risposte');
        assert(h.asp === 'Product Manager', 'aspirazione');
        assert(r.scene_fonte.ai1 === 'ai' && r.scene_fonte.ai2 === 'ai', 'scene AI non registrate: ' + JSON.stringify(r.scene_fonte));
        await noOverflow(vp, 'risultato');
      });
      await t('report completo: senza login c\'è il cancello email e la bozza porta con sé tutto il test', async () => {
        await vp.click('text=Leggi il report completo');
        await vp.waitForURL('**/report.html');
        await vp.waitForSelector('#auth-gate:not(.hidden)');
        assert(await vp.evaluate(() => localStorage.getItem('rf_v2_state')) === null, 'stato del test non pulito');
        await vp.fill('#auth-email', 'giulia@example.com');
        await vp.click('#auth-btn'); await vp.waitForTimeout(600);
        const draft = (await vp.evaluate(() => window.__SBLOG)).find(l => l[0] === 'createDraft');
        assert(draft && draft[1].activities._v2 && draft[1].activities._v2.risultato.ruoli.length === 3, 'bozza senza il test a capitoli');
      });
      const vErr = V.errors.slice();
      await V.ctx.close();
      await t('nessun errore JavaScript durante il test a capitoli', async () => { assert(vErr.length === 0, vErr.join(' | ')); });

      await t('se l\'AI delle scene non risponde si usano le scene standard e il test si completa', async () => {
        cardTurn = 0;
        const F = await newPage(browser, { sceneFail: true, mobile: false });
        await F.page.goto(BASE + '/test-v2.html');
        await runV2Until(F.page, async () => (await visible(F.page, '.v2-scene-titolo')) && (await F.page.locator('.v2-scene-titolo').textContent()) === 'Il progetto mai fatto', {}, 140);
        await runV2Until(F.page, () => visible(F.page, '.v2-role-card'), {}, 80);
        await F.page.waitForTimeout(1800);
        const r = await F.page.evaluate(() => JSON.parse(localStorage.getItem('rf_activities'))._v2.risultato);
        // il disegno della costellazione deve avere le stesse proporzioni del riquadro (niente stelle deformate)
        const prop = await F.page.evaluate(() => { const c = document.getElementById('v2-stars'); const b = c.getBoundingClientRect(); return { bw: c.width / b.width, bh: c.height / b.height }; });
        assert(Math.abs(prop.bw - prop.bh) < 0.02, 'costellazione deformata: ' + JSON.stringify(prop));
        assert(r.scene_fonte.ai1 === 'standard' && r.scene_fonte.ai2 === 'standard', JSON.stringify(r.scene_fonte));
        await F.page.screenshot({ path: SHOTS + '/v2-09-risultato-desktop.png' });
        assert(F.errors.length === 0, F.errors.join(' | '));
        await F.ctx.close();
      });

      await t('report del test a capitoli: numeri e ruoli del motore, testo dell\'AI, prove visibili, salvato come versione 2', async () => {
        cardTurn = 0;
        const R = await newPage(browser, { session: true });
        await R.page.goto(BASE + '/test-v2.html');
        await runV2Until(R.page, () => visible(R.page, '.v2-role-card'), {}, 140);
        const atteso = await R.page.evaluate(() => JSON.parse(localStorage.getItem('rf_activities'))._v2.risultato);
        await R.page.click('text=Leggi il report completo');
        await R.page.waitForURL('**/report.html');
        await R.page.waitForSelector('#report-content:not(.hidden)', { timeout: 15000 });
        await R.page.waitForTimeout(800);
        const call = R.apiLog.find(a => a.body.fase === 'report_v2');
        assert(call, 'fase report_v2 non chiamata');
        assert(call.headers.authorization === 'Bearer tok', 'report_v2 senza token');
        const content = call.body.messages[0].content;
        assert(content.includes('PROFILO MISURATO') && content.includes(atteso.ruoli[0].nome), 'richiesta incompleta');
        const nomi = await R.page.locator('#ruoli-list .ruolo-nome').allTextContents();
        assert(JSON.stringify(nomi) === JSON.stringify(atteso.ruoli.map(x => x.nome)), 'ruoli: ' + nomi.join(', '));
        const pct = await R.page.locator('#ruoli-list .ruolo-match-number').allTextContents();
        assert(JSON.stringify(pct) === JSON.stringify(atteso.ruoli.map(x => x.match + '%')), 'percentuali: ' + pct.join(', '));
        assert((await R.page.locator('#ruoli-list').textContent()).includes('Perché 1.'), 'testo dell\'AI mancante');
        assert(!(await R.page.locator('body').textContent()).includes('Nome inventato'), 'nome inventato dall\'AI mostrato');
        assert(await R.page.locator('#prove-list li').count() >= 4, 'prove mancanti');
        const saved = (await R.page.evaluate(() => window.__SBLOG)).find(l => l[0] === 'saveReport')[1];
        assert(saved.report_json.versione_test === 2 && saved.test_history.versione === 2, 'non salvato come versione 2');
        assert(typeof saved.report_json.assi.Concretezza === 'number', 'manca Concretezza');
        assert(saved.test_history.answers.some(a => a.id === 'scena_posta'), 'risposte mancanti');
        const compat = R.apiLog.filter(a => a.body.fase === 'compatibilita');
        assert(compat.length === 1 && compat[0].body.messages[0].content.includes('Profilo emerso dal test RoleFit a capitoli'), 'valutazione aspirazione senza profilo');
        await R.page.locator('#prove-box').scrollIntoViewIfNeeded();
        await R.page.screenshot({ path: SHOTS + '/v2-10-report-prove.png' });
        assert(R.errors.length === 0, R.errors.join(' | '));
        await R.ctx.close();
      });

      await t('home: ?test=2 manda al test a capitoli; di base resta il test classico', async () => {
        const H = await newPage(browser);
        await H.page.goto(BASE + '/index.html');
        assert((await H.page.getAttribute('#hero-test-cta', 'href')) === 'test.html');
        await H.page.goto(BASE + '/index.html?test=2');
        assert((await H.page.getAttribute('#hero-test-cta', 'href')) === 'test-v2.html');
        await H.ctx.close();
      });
      await t('home: con un test classico lasciato a metà, ?test=2 apre comunque il test a capitoli', async () => {
        const H = await newPage(browser);
        await H.page.goto(BASE + '/index.html');
        await H.page.evaluate(() => localStorage.setItem('rf_state', JSON.stringify({ questionCount: 4 })));
        await H.page.goto(BASE + '/index.html');
        assert((await H.page.getAttribute('#hero-test-cta', 'href')) === 'test.html', 'senza ?test=2 si riprende il classico');
        assert((await H.page.textContent('#hero-test-cta-label')).includes('Riprendi'));
        await H.page.goto(BASE + '/index.html?test=2');
        assert((await H.page.getAttribute('#hero-test-cta', 'href')) === 'test-v2.html', '?test=2 ignorato');
        assert(!(await H.page.textContent('#hero-test-cta-label')).includes('Riprendi'));
        assert(await H.page.evaluate(() => localStorage.getItem('rf_state') !== null), 'il test classico salvato non va cancellato');
        await H.ctx.close();
      });
    }

    if (want('profilo')) {
      console.log('\nProfilo');
      const REP = (id, date, assi, asp, match, versione) => ({ id, created_at: date, report_json: { ...MOCK_REPORT, assi, ...(versione ? { versione_test: versione } : {}) }, aspiration: asp, aspired_role_eval: match == null ? null : { match, titolo: 'Buona compatibilità', descrizione: 'Il ruolo usa la tua curiosità.' } });
      const FULL = {
        nome: 'Giulia',
        reportsList: [
          REP('r-3', '2026-11-10T10:00:00Z', { ...ASSI, Concretezza: 42 }, 'Product Manager', 77, 2),
          REP('r-2', '2026-09-20T10:00:00Z', ASSI, 'Product Manager', 74),
          REP('r-1', '2026-07-10T10:00:00Z', { ...ASSI, Analisi: 50 }, 'product manager', 61),
        ],
        saved: [{ nome: 'Data Analyst', match: 70, nota: 'Solida base analitica', fonte: 'banco' }, { nome: 'UX Designer', fonte: 'dizionario' }],
        matches: [{ id: 'm1', role_title: 'Junior BDM', company_name: 'CBRE', match: 86, first_seen_at: '2026-09-21T10:00:00Z', last_seen_at: '2026-09-23T10:00:00Z', viewed_at: '2026-09-23T11:00:00Z' }],
      };
      await t('profilo vuoto: invito al test e profilo di esempio con 7 dimensioni', async () => {
        const P = await newPage(browser, { session: true });
        await P.page.goto(BASE + '/account.html');
        await P.page.waitForSelector('#pf-empty:not(.hidden)');
        assert(await P.page.locator('#pf-constellation.is-demo').isVisible());
        assert((await P.page.locator('#cnst-legend').textContent()).includes('Concretezza'));
        await noOverflow(P.page, 'profilo vuoto');
        assert(P.errors.length === 0, P.errors.join(' | '));
        await P.ctx.close();
      });
      await t('profilo con test di entrambe le versioni: 7 dimensioni, test vecchi segnati, nota sulla versione', async () => {
        const F = await newPage(browser, { session: true, cv: true, sb: FULL });
        await F.page.goto(BASE + '/account.html');
        await F.page.waitForSelector('#pf-aspiration:not(.hidden)');
        await F.page.waitForTimeout(500);
        assert((await F.page.locator('#hello-title').textContent()) === 'Ciao, Giulia');
        assert((await F.page.locator('#cnst-legend').textContent()).includes('Concretezza'), 'legenda senza Concretezza');
        const labels = await F.page.locator('.timeline-label').allTextContents();
        assert(labels.filter(l => l.includes('◦')).length === 2, 'test vecchi non segnati: ' + labels.join(' | '));
        assert(await F.page.locator('#cnst-versione').isVisible(), 'nota sulla versione mancante');
        await F.page.locator('.timeline-point').first().click();
        await F.page.waitForTimeout(800);
        await F.page.screenshot({ path: SHOTS + '/v2-11-profilo-timeline.png' });
        await F.page.locator('.bb-item[data-sec="storico"]').click();
        assert((await F.page.locator('#st-list').textContent()).includes('Versione precedente'), 'badge versione precedente mancante');
        assert(F.errors.length === 0, F.errors.join(' | '));
        await F.ctx.close();
      });
      await t('ruoli salvati, banco di prova, ricerche aziendali, impostazioni', async () => {
        const F = await newPage(browser, { session: true, cv: true, sb: FULL });
        F.page.on('dialog', d => d.accept());
        await F.page.goto(BASE + '/account.html#ruoli');
        await F.page.waitForTimeout(700);
        assert(await F.page.locator('#saved-list .list-item').count() === 2);
        await F.page.fill('#banco-input', 'Consulente');
        await F.page.click('#banco-btn');
        await F.page.waitForSelector('#banco-save', { timeout: 10000 });
        await F.page.click('#banco-save'); await F.page.waitForTimeout(400);
        assert((await F.page.locator('#saved-list').textContent()).includes('Consulente'));
        await F.page.locator('.bb-item[data-sec="aziende"]').click();
        assert((await F.page.locator('#matches-list').textContent()).includes('Ha aperto il tuo profilo'));
        await F.page.locator('.bb-item[data-sec="impostazioni"]').click();
        await F.page.fill('#set-nome', 'Giulia Rossi'); await F.page.click('#set-nome-btn');
        await F.page.waitForSelector('#set-nome-msg.ok');
        const [dl] = await Promise.all([F.page.waitForEvent('download'), F.page.click('#export-btn')]);
        assert(/^rolefit-dati-/.test(dl.suggestedFilename()));
        await Promise.all([F.page.waitForURL('**/index.html', { timeout: 5000 }), F.page.click('#delete-account-btn')]);
        assert(F.apiLog.some(a => a.url.endsWith('/api/account') && a.body.action === 'delete'));
        assert(F.errors.length === 0, F.errors.join(' | '));
        await F.ctx.close();
      });
      await t('dizionario: salva nel profilo (invito ad accedere se non sei loggato)', async () => {
        const G = await newPage(browser);
        await G.page.goto(BASE + '/dizionario.html?q=Data%20Analyst');
        await G.page.click('#diz-save-btn');
        await G.page.waitForSelector('#diz-save-msg a[href="account.html"]');
        await G.ctx.close();
        const H = await newPage(browser, { session: true });
        await H.page.goto(BASE + '/dizionario.html?q=Data%20Analyst');
        await H.page.click('#diz-save-btn');
        await H.page.waitForSelector('#diz-save-msg a[href="account.html#ruoli"]');
        assert(H.errors.length === 0, H.errors.join(' | '));
        await H.ctx.close();
      });
    }

    if (want('azienda')) {
      console.log('\nFlusso azienda');
      await t('test azienda → risultati con 7 dimensioni → dettaglio candidato', async () => {
        const Z = await newPage(browser, { mobile: false });
        await Z.page.goto(BASE + '/test-azienda.html');
        const fill = async (v) => { await Z.page.fill('#question-input input', v); await Z.page.click('#question-input .btn--primary'); await Z.page.waitForTimeout(300); };
        assert((await Z.page.locator('#question-context').textContent()).includes('candidati compatibili vedranno'), 'manca l\'avviso sul nome visibile ai candidati');
        await fill('CBRE');
        assert((await Z.page.locator('#question-context').textContent()).includes('beta'), 'manca la frase sulla beta');
        await fill('prova');
        await fill('Junior BDM');
        await Z.page.locator('.option-btn').first().click(); await Z.page.waitForTimeout(300);
        await Z.page.locator('.option-btn').first().dblclick(); await Z.page.waitForTimeout(700);
        for (let i = 0; i < 3; i++) { await Z.page.locator('.option-btn').first().click(); await Z.page.waitForTimeout(700); }
        await Z.page.waitForURL('**/risultati-azienda.html?id=*', { timeout: 10000 });
        await Z.page.waitForSelector('text=Anna');
        assert((await Z.page.locator('#target-assi').textContent()).includes('Concretezza'), 'profilo cercato senza Concretezza');
        await Z.page.click('text=Anna');
        await Z.page.waitForURL('**/candidato-azienda.html*');
        await Z.page.waitForSelector('#candidato-email');
        await Z.page.waitForTimeout(500);
        await Z.page.screenshot({ path: SHOTS + '/v2-12-candidato.png' });
        assert(Z.errors.length === 0, Z.errors.join(' | '));
        await Z.ctx.close();
      });
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n${pass} superati, ${fail} falliti${fail ? ': ' + failures.join('; ') : ''}`);
  console.log('Screenshot in ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
