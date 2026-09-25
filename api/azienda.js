export const maxDuration = 45;

import { clientIp, isSameOrigin, rateLimit, validateMessages } from './_guard.js';

// Endpoint lato server per il flusso aziende: creare un'azienda/ricerca e
// calcolare il matching con i candidati già presenti su RoleFit.
//
// Usa sempre la SERVICE ROLE KEY (mai l'anon key) perché deve leggere report
// e profili di altri utenti per calcolare il matching — cosa che le policy
// RLS impediscono volutamente all'anon key. Il browser non ha mai accesso
// diretto ai dati dei candidati, solo al risultato filtrato che esce da qui.
//
// PRIVACY — tre regole che questo file deve sempre rispettare:
// 1. Visibili alle aziende sono SOLO i candidati che l'hanno scelto: oggi il
//    consenso è caricare il CV (il sito lo dice esplicitamente: "Carica il CV
//    e diventi visibile alle aziende"). Chi ha solo fatto il test non compare.
// 2. Le aziende non hanno login: chiunque può creare una ricerca. Per questo
//    il dettaglio di un candidato si apre solo passando da una ricerca in cui
//    quel candidato risulta davvero compatibile, mai con un user_id qualunque.
// 3. All'azienda arrivano solo i campi scritti per lei (riepilogo in terza
//    persona, ruoli, assi, domande non personali), mai il report personale
//    scritto in seconda persona per il candidato.

const ASSI_KEYS = ['Analisi', 'Relazione', 'Creatività', 'Curiosità', 'Leadership', 'Metodo'];
const SOGLIA_MATCH = 80;
// Quanti candidati (già ordinati per compatibilità sui 6 assi) passano al
// controllo semantico AI. Tenerlo basso limita costo/latenza della validazione.
const MAX_CANDIDATI_DA_VALIDARE = 15;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMITS = {
  crea_azienda: 10,
  crea_job: 10,
  match: 30,
  dettaglio_candidato: 60,
};
// Ogni apertura della pagina risultati rilancia la validazione AI: oltre al
// limite per IP, uno per ricerca evita che un link condiviso o ricaricato in
// loop generi costi senza fine.
const MATCH_PER_JOB_LIMIT = 10;

const PROMPT_MATCH_VALIDAZIONE = `
Sei un validatore di matching per RoleFit lato aziende. Ricevi una richiesta di ruolo (titolo + sintesi del profilo cercato) e una lista di candidati che hanno già superato una soglia numerica di compatibilità calcolata sui 6 assi psicologici del profilo. Il tuo compito è verificare, per ciascun candidato, se il ruolo cercato dall'azienda è REALMENTE coerente con quello che è emerso dal suo test — non solo sui numeri astratti, ma guardando i ruoli concreti che il suo test gli ha assegnato come compatibili o incompatibili.

REGOLA CHIAVE: due profili possono avere assi psicologici numericamente simili ma essere adatti a ruoli completamente diversi (es. un Business Analyst e un Account Manager possono avere entrambi punteggi alti su Analisi e Relazione, ma il primo lavora sui dati, il secondo sulle persone). Il tuo lavoro è catturare proprio le differenze che i soli numeri non vedono, usando i ruoli reali emersi dal test di ciascun candidato.

Per ciascun candidato ricevi: i suoi ruoli compatibili (con match% dal suo report), i suoi ruoli non compatibili, e una frase su come funziona.

Assegna un punteggio finale 0-100 per candidato, partendo dal punteggio sui 6 assi che ricevi come riferimento:
- Se il ruolo cercato dall'azienda coincide o è chiaramente affine (anche con nome diverso ma stessa sostanza) a uno dei ruoli COMPATIBILI del candidato, il punteggio finale deve restare alto o salire leggermente.
- Se il ruolo cercato coincide o è chiaramente affine a uno dei ruoli NON compatibili del candidato, il punteggio finale deve scendere sotto 40 — anche se il punteggio sui 6 assi era alto.
- Se non c'è una relazione chiara né in un senso né nell'altro, mantieni il punteggio sui 6 assi come punteggio finale.

INOLTRE, per ciascun candidato scrivi un campo "perche_azienda": 2-3 frasi rivolte all'AZIENDA (mai al candidato), che spiegano perché QUESTA persona può fare al caso di QUESTA ricerca specifica. Non è il "come funziona" del candidato riscritto — è un giudizio di idoneità per il ruolo, ancorato a un confronto esplicito tra cosa serve (dalla sintesi del profilo cercato) e cosa emerge dal candidato (i suoi ruoli compatibili, come funziona). Scrivi in terza persona, tono diretto e concreto, come un recruiter che spiega la sua scelta a un collega — non in seconda persona come se parlassi al candidato. Se il match è nella fascia bassa dell'accettabile (75-80%), sii onesto anche su cosa andrebbe verificato in un colloquio, non solo sui punti di forza.

FORMATO OUTPUT — JSON valido, zero testo fuori dal JSON (primo carattere {, ultimo }):
{
  "risultati": [
    { "candidate_id": "id esatto ricevuto in input", "match_finale": 82, "perche_azienda": "..." }
  ]
}
`;

function parseRisultati(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const parsed = JSON.parse(text.substring(start, end + 1));
  return new Map(
    parsed.risultati.map((r) => [r.candidate_id, { match: r.match_finale, perche: r.perche_azienda || null }])
  );
}

async function validaMatchSemantico(job, candidati) {
  const payload = {
    ruolo_cercato: job.role_title,
    sintesi_profilo_cercato: job.target_profile?.sintesi || '',
    candidati: candidati.map((c) => ({
      candidate_id: c.user_id,
      match_assi: c.match,
      ruoli_compatibili: c.ruoli,
      ruoli_non_compatibili: c.ruoli_mismatch,
      come_funziona: c.come_funzioni,
    })),
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      // Fino a 15 candidati con 2-3 frasi ciascuno: a 1500 il JSON si troncava
      // a metà e falliva silenziosamente il parse, facendo ricadere tutti sul
      // messaggio di fallback generico. ~500 token per candidato è abbondante.
      max_tokens: 7500,
      temperature: 0.2,
      system: PROMPT_MATCH_VALIDAZIONE,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    }),
  });

  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (!text) {
    console.error('Errore validazione match: risposta AI senza contenuto', data?.error || data);
    return null;
  }

  try {
    return parseRisultati(text);
  } catch {
    // Riprova ripulendo virgole finali e caratteri di controllo, come nel
    // parser di api/claude.js — capita con output lunghi vicini al limite.
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      const controlChars = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]', 'g');
      const repaired = text.substring(start, end + 1)
        .replace(controlChars, '')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      return parseRisultati(repaired);
    } catch (e2) {
      console.error('Errore parsing validazione match (anche dopo repair):', e2, text.slice(0, 500));
      return null;
    }
  }
}

// Le env var Supabase esistenti su Vercel sono minuscole (supabase_url,
// supabase_anon_key), diverse dal case usato altrove nel codice: leggiamo
// entrambe le varianti per non dipendere dal case esatto.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.supabase_url;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.supabase_service_role_key;

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
}

// Distanza media assoluta tra i due profili sui 6 assi, convertita in % di
// compatibilità (100 = profili identici sugli assi che contano per il ruolo).
function computeMatch(targetAssi, candidateAssi) {
  if (!targetAssi || !candidateAssi) return null;
  let totalDiff = 0;
  let count = 0;
  for (const key of ASSI_KEYS) {
    const t = targetAssi[key];
    const c = candidateAssi[key];
    if (typeof t === 'number' && typeof c === 'number') {
      totalDiff += Math.abs(t - c);
      count++;
    }
  }
  if (count === 0) return null;
  return Math.round(100 - totalDiff / count);
}

// Il profilo target arriva dal browser (generato dall'AI lato client): lo
// accettiamo solo se ha la forma attesa, così nel DB non finisce di tutto.
function validTargetProfile(tp) {
  if (!tp || typeof tp !== 'object') return null;
  const sintesi = cleanText(tp.sintesi, 3000);
  if (!sintesi || !tp.assi || typeof tp.assi !== 'object') return null;
  const assi = {};
  for (const key of ASSI_KEYS) {
    const v = Number(tp.assi[key]);
    if (tp.assi[key] === null || tp.assi[key] === '' || !Number.isFinite(v) || v < 0 || v > 100) return null;
    assi[key] = Math.round(v);
  }
  return { sintesi, assi };
}

async function loadJob(job_id) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/job_requests?id=eq.${encodeURIComponent(job_id)}&status=eq.active&select=id,role_title,target_profile`,
    { headers: supabaseHeaders() }
  );
  if (!r.ok) throw new Error('Impossibile leggere la ricerca');
  const [job] = await r.json();
  return job || null;
}

// Candidati visibili (hanno scelto di esserlo caricando il CV) con il loro
// report più recente, ordinati per compatibilità numerica col profilo target.
// Usato sia per la lista risultati sia come controllo di autorizzazione del
// dettaglio: si apre solo il profilo di chi è in questa shortlist.
async function computeShortlist(job) {
  const profilesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?cv_path=not.is.null&select=id,nome,email`,
    { headers: supabaseHeaders() }
  );
  if (!profilesRes.ok) throw new Error('Impossibile leggere i profili');
  const profiles = await profilesRes.json();
  if (!profiles.length) return [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const ids = profiles.map((p) => encodeURIComponent(p.id)).join(',');
  const reportsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/reports?user_id=in.(${ids})&select=user_id,report_json,created_at&order=created_at.desc`,
    { headers: supabaseHeaders() }
  );
  if (!reportsRes.ok) throw new Error('Impossibile leggere i candidati');
  const reports = await reportsRes.json();

  // Ordinati dal più recente: il primo che incontriamo per utente è l'ultimo test.
  const latestByUser = new Map();
  for (const r of reports) {
    if (!latestByUser.has(r.user_id)) latestByUser.set(r.user_id, r);
  }

  return Array.from(latestByUser.values())
    .map((r) => ({
      user_id: r.user_id,
      nome: profileById.get(r.user_id)?.nome || null,
      email: profileById.get(r.user_id)?.email || null,
      match: computeMatch(job.target_profile?.assi, r.report_json?.assi),
      ruoli: (r.report_json?.ruoli || []).map((x) => x.nome),
      ruoli_mismatch: (r.report_json?.ruoli_mismatch || []).map((x) => x.nome),
      come_funzioni: r.report_json?.chi_sei?.come_funzioni || null,
    }))
    .filter((c) => c.match !== null)
    .sort((a, b) => b.match - a.match)
    .slice(0, MAX_CANDIDATI_DA_VALIDARE);
}

async function creaAzienda(body, res) {
  const company_name = cleanText(body.company_name, 120);
  const contact_email = cleanText(body.contact_email, 254);
  const contact_name = body.contact_name ? cleanText(body.contact_name, 120) : null;
  if (!company_name || !contact_email || !EMAIL_RE.test(contact_email)) {
    return res.status(400).json({ error: 'Nome azienda ed email valida sono obbligatori' });
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/company_profiles`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({ company_name, contact_name, contact_email }),
  });
  if (!r.ok) return res.status(500).json({ error: 'Impossibile creare il profilo azienda' });
  const [row] = await r.json();
  return res.status(200).json({ id: row.id });
}

async function creaJob(body, res) {
  const { company_id, test_history } = body;
  const role_title = cleanText(body.role_title, 120);
  const target_profile = validTargetProfile(body.target_profile);
  if (!isUuid(company_id) || !role_title || !target_profile) {
    return res.status(400).json({ error: 'Dati della ricerca non validi' });
  }
  if (test_history != null && validateMessages(test_history, { maxMessages: 60, maxCharsPerMessage: 8000, maxTotalChars: 60000 })) {
    return res.status(400).json({ error: 'Conversazione non valida' });
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/job_requests`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id,
      role_title,
      test_history: test_history || null,
      target_profile,
    }),
  });
  if (!r.ok) return res.status(500).json({ error: 'Impossibile creare la ricerca' });
  const [row] = await r.json();
  return res.status(200).json({ id: row.id });
}

async function calcolaMatch(body, res) {
  const { job_id } = body;
  if (!isUuid(job_id)) return res.status(400).json({ error: 'job_id non valido' });
  if (!rateLimit(`azienda:match-job:${job_id}`, MATCH_PER_JOB_LIMIT, RATE_WINDOW_MS)) {
    return res.status(429).json({ error: 'Troppe richieste per questa ricerca. Riprova tra qualche minuto.' });
  }

  const job = await loadJob(job_id);
  if (!job) return res.status(404).json({ error: 'Ricerca non trovata' });
  const publicJob = { id: job.id, role_title: job.role_title, target_profile: job.target_profile };

  const shortlist = await computeShortlist(job);
  if (shortlist.length === 0) {
    return res.status(200).json({ job: publicJob, candidates: [] });
  }

  // Passo 2: validazione semantica sui ruoli reali emersi dal test di ognuno,
  // non solo sui 6 numeri — un profilo può avere assi vicini ma essere adatto
  // a un ruolo completamente diverso da quello cercato.
  const matchFinaliById = await validaMatchSemantico(job, shortlist);

  const candidates = shortlist
    .map((c) => {
      const validato = matchFinaliById?.get(c.user_id);
      return {
        ...c,
        match: validato?.match ?? c.match,
        perche_azienda: validato?.perche ?? null,
      };
    })
    .filter((c) => c.match >= SOGLIA_MATCH)
    .sort((a, b) => b.match - a.match)
    .slice(0, 10)
    .map((c) => ({
      user_id: c.user_id,
      // L'email resta nel dettaglio (per il contatto), non nella lista.
      nome: c.nome,
      match: c.match,
      ruoli: c.ruoli,
      // Se la validazione AI non è disponibile (errore/timeout), ripieghiamo su
      // un'unica frase informativa invece di lasciare vuota la spiegazione.
      perche_azienda: c.perche_azienda || `Compatibilità calcolata sul profilo psicologico-professionale rispetto al ruolo di ${job.role_title}.`,
    }));

  return res.status(200).json({ job: publicJob, candidates, soglia: SOGLIA_MATCH });
}

// URL firmato a scadenza per il CV del candidato (bucket privato "cv").
// Generato sempre lato server con la service role key: le aziende non hanno
// mai accesso diretto allo storage, solo a questo link temporaneo.
// Il path si ricostruisce dallo user_id (profiles.cv_path è scrivibile dal
// client): così nessuno può farsi generare un link per il file di altri.
async function getCvSignedUrl(user_id) {
  try {
    const cvPath = `${user_id}/cv.pdf`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/cv/${cvPath}`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
  } catch {
    return null;
  }
}

async function dettaglioCandidato(body, res) {
  const { user_id, job_id } = body;
  if (!isUuid(user_id) || !isUuid(job_id)) {
    return res.status(400).json({ error: 'Parametri non validi' });
  }

  const job = await loadJob(job_id);
  if (!job) return res.status(404).json({ error: 'Ricerca non trovata' });

  const shortlist = await computeShortlist(job);
  const candidato = shortlist.find((c) => c.user_id === user_id);
  // Stessa risposta per "non esiste" e "non autorizzato": non confermiamo
  // a chi prova user_id a caso se un candidato esiste o no.
  if (!candidato) return res.status(404).json({ error: 'Candidato non trovato' });

  const reportsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/reports?user_id=eq.${encodeURIComponent(user_id)}&select=report_json,test_history,created_at&order=created_at.desc&limit=1`,
    { headers: supabaseHeaders() }
  );
  if (!reportsRes.ok) return res.status(500).json({ error: 'Impossibile leggere il candidato' });
  const [report] = await reportsRes.json();
  if (!report) return res.status(404).json({ error: 'Candidato non trovato' });

  const cvUrl = await getCvSignedUrl(user_id);

  // Log domande/risposte per l'azienda: SOLO le domande esplicitamente
  // marcate come non personali (indiretta: false). Se il test è stato
  // fatto prima che questo campo esistesse, non c'è modo di sapere quali
  // domande fossero personali — meglio non mostrare nulla che rischiare di
  // esporre una risposta privata per errore. Il nome è un dato anagrafico,
  // non una risposta al test: non va nel log.
  const answers = report.test_history?.answers;
  const qaDisponibile = Array.isArray(answers);
  const qaLog = qaDisponibile
    ? answers
        .filter((a) => a.indiretta === false && a.id !== 'nome')
        .map((a) => ({ domanda: a.question, risposta: a.answer }))
    : [];

  const rj = report.report_json || {};
  return res.status(200).json({
    nome: candidato.nome,
    email: candidato.email,
    report: {
      riepilogo_aziende: rj.riepilogo_aziende || null,
      ruoli: (rj.ruoli || []).map((r) => ({ nome: r.nome, match: r.match, cosa_fa: r.cosa_fa })),
      assi: rj.assi || null,
      assi_confidenza: rj.assi_confidenza || null,
    },
    qa_log: qaLog,
    qa_disponibile: qaDisponibile,
    cv_url: cvUrl,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurazione server incompleta' });
  }

  try {
    const { action } = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(RATE_LIMITS, action)) {
      return res.status(400).json({ error: 'action non valida' });
    }
    if (!isSameOrigin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!rateLimit(`azienda:${action}:${clientIp(req)}`, RATE_LIMITS[action], RATE_WINDOW_MS)) {
      return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
    }
    if (action === 'crea_azienda') return await creaAzienda(req.body, res);
    if (action === 'crea_job') return await creaJob(req.body, res);
    if (action === 'match') return await calcolaMatch(req.body, res);
    return await dettaglioCandidato(req.body, res);
  } catch (error) {
    console.error('Errore /api/azienda:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
