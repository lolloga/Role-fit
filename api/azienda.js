export const maxDuration = 45;

// Endpoint lato server per il flusso aziende: creare un'azienda/ricerca e
// calcolare il matching con i candidati già presenti su RoleFit.
//
// Usa sempre la SERVICE ROLE KEY (mai l'anon key) perché deve leggere la
// tabella `reports` di TUTTI gli utenti per calcolare il matching — cosa che
// le policy RLS impediscono volutamente all'anon key. Per questo il calcolo
// resta sempre lato server: il browser non ha mai accesso diretto ai dati dei
// candidati, solo al risultato già filtrato che questo endpoint restituisce.

const ASSI_KEYS = ['Analisi', 'Relazione', 'Creatività', 'Curiosità', 'Leadership', 'Metodo'];
const SOGLIA_MATCH = 80;
// Quanti candidati (già ordinati per compatibilità sui 6 assi) passano al
// controllo semantico AI. Tenerlo basso limita costo/latenza della validazione.
const MAX_CANDIDATI_DA_VALIDARE = 15;

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

async function creaAzienda(body, res) {
  const { company_name, contact_name, contact_email } = body;
  if (!company_name || !contact_email) {
    return res.status(400).json({ error: 'company_name e contact_email sono obbligatori' });
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/company_profiles`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({ company_name, contact_name: contact_name || null, contact_email }),
  });
  if (!r.ok) return res.status(500).json({ error: 'Impossibile creare il profilo azienda' });
  const [row] = await r.json();
  return res.status(200).json({ id: row.id });
}

async function creaJob(body, res) {
  const { company_id, role_title, test_history, target_profile } = body;
  if (!company_id || !role_title || !target_profile) {
    return res.status(400).json({ error: 'company_id, role_title e target_profile sono obbligatori' });
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
  if (!job_id) return res.status(400).json({ error: 'job_id obbligatorio' });

  const jobRes = await fetch(
    `${SUPABASE_URL}/rest/v1/job_requests?id=eq.${job_id}&select=*`,
    { headers: supabaseHeaders() }
  );
  if (!jobRes.ok) return res.status(500).json({ error: 'Impossibile leggere la ricerca' });
  const [job] = await jobRes.json();
  if (!job) return res.status(404).json({ error: 'Ricerca non trovata' });

  const reportsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/reports?select=id,user_id,report_json,created_at`,
    { headers: supabaseHeaders() }
  );
  if (!reportsRes.ok) return res.status(500).json({ error: 'Impossibile leggere i candidati' });
  const reports = await reportsRes.json();

  // Un candidato può avere più report nel tempo: teniamo solo il più recente.
  const latestByUser = new Map();
  for (const r of reports) {
    const prev = latestByUser.get(r.user_id);
    if (!prev || new Date(r.created_at) > new Date(prev.created_at)) {
      latestByUser.set(r.user_id, r);
    }
  }

  const shortlist = Array.from(latestByUser.values())
    .map((r) => ({
      user_id: r.user_id,
      match: computeMatch(job.target_profile?.assi, r.report_json?.assi),
      ruoli: (r.report_json?.ruoli || []).map((x) => x.nome),
      ruoli_mismatch: (r.report_json?.ruoli_mismatch || []).map((x) => x.nome),
      come_funzioni: r.report_json?.chi_sei?.come_funzioni || null,
    }))
    .filter((c) => c.match !== null)
    .sort((a, b) => b.match - a.match)
    .slice(0, MAX_CANDIDATI_DA_VALIDARE);

  if (shortlist.length === 0) {
    return res.status(200).json({ job, candidates: [] });
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
    .slice(0, 10);

  if (candidates.length === 0) {
    return res.status(200).json({ job, candidates: [] });
  }

  const userIds = candidates.map((c) => c.user_id);
  const profilesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=in.(${userIds.join(',')})&select=id,email`,
    { headers: supabaseHeaders() }
  );
  const profiles = profilesRes.ok ? await profilesRes.json() : [];
  const emailById = new Map(profiles.map((p) => [p.id, p.email]));

  const result = candidates.map((c) => ({
    user_id: c.user_id,
    email: emailById.get(c.user_id) || null,
    match: c.match,
    ruoli: c.ruoli,
    // Se la validazione AI non è disponibile (errore/timeout), ripieghiamo su
    // un'unica frase informativa invece di lasciare vuota la spiegazione.
    perche_azienda: c.perche_azienda || `Compatibilità calcolata sul profilo psicologico-professionale rispetto al ruolo di ${job.role_title}.`,
  }));

  return res.status(200).json({ job, candidates: result });
}

// URL firmato a scadenza per il CV del candidato (bucket privato "cv").
// Generato sempre lato server con la service role key: le aziende non hanno
// mai accesso diretto allo storage, solo a questo link temporaneo.
async function getCvSignedUrl(cv_path) {
  if (!cv_path) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/cv/${cv_path}`, {
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
  const { user_id } = body;
  if (!user_id) return res.status(400).json({ error: 'user_id obbligatorio' });

  const reportsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/reports?user_id=eq.${user_id}&select=report_json,test_history,created_at&order=created_at.desc&limit=1`,
    { headers: supabaseHeaders() }
  );
  if (!reportsRes.ok) return res.status(500).json({ error: 'Impossibile leggere il candidato' });
  const [report] = await reportsRes.json();
  if (!report) return res.status(404).json({ error: 'Candidato non trovato' });

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}&select=email,cv_path`,
    { headers: supabaseHeaders() }
  );
  const [profile] = profileRes.ok ? await profileRes.json() : [];
  const cvUrl = await getCvSignedUrl(profile?.cv_path);

  // Log domande/risposte per l'azienda: SOLO le domande esplicitamente
  // marcate come non personali (indiretta: false). Se il test è stato
  // fatto prima che questo campo esistesse, non c'è modo di sapere quali
  // domande fossero personali — meglio non mostrare nulla che rischiare di
  // esporre una risposta privata per errore.
  const answers = report.test_history?.answers;
  const qaDisponibile = Array.isArray(answers);
  const qaLog = qaDisponibile
    ? answers.filter((a) => a.indiretta === false).map((a) => ({ domanda: a.question, risposta: a.answer }))
    : [];

  return res.status(200).json({
    email: profile?.email || null,
    report: report.report_json,
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
    const { action } = req.body;
    if (action === 'crea_azienda') return await creaAzienda(req.body, res);
    if (action === 'crea_job') return await creaJob(req.body, res);
    if (action === 'match') return await calcolaMatch(req.body, res);
    if (action === 'dettaglio_candidato') return await dettaglioCandidato(req.body, res);
    return res.status(400).json({ error: 'action non valida' });
  } catch (error) {
    console.error('Errore /api/azienda:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
