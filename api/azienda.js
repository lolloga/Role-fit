export const maxDuration = 30;

// Endpoint lato server per il flusso aziende: creare un'azienda/ricerca e
// calcolare il matching con i candidati già presenti su RoleFit.
//
// Usa sempre la SERVICE ROLE KEY (mai l'anon key) perché deve leggere la
// tabella `reports` di TUTTI gli utenti per calcolare il matching — cosa che
// le policy RLS impediscono volutamente all'anon key. Per questo il calcolo
// resta sempre lato server: il browser non ha mai accesso diretto ai dati dei
// candidati, solo al risultato già filtrato che questo endpoint restituisce.

const ASSI_KEYS = ['Analisi', 'Relazione', 'Creatività', 'Curiosità', 'Leadership', 'Metodo'];

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

  const candidates = Array.from(latestByUser.values())
    .map((r) => ({
      user_id: r.user_id,
      match: computeMatch(job.target_profile?.assi, r.report_json?.assi),
      ruoli: (r.report_json?.ruoli || []).map((x) => x.nome),
      come_funzioni: r.report_json?.chi_sei?.come_funzioni || null,
    }))
    .filter((c) => c.match !== null)
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
    email: emailById.get(c.user_id) || null,
    match: c.match,
    ruoli: c.ruoli,
    come_funzioni: c.come_funzioni,
  }));

  return res.status(200).json({ job, candidates: result });
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
    return res.status(400).json({ error: 'action non valida' });
  } catch (error) {
    console.error('Errore /api/azienda:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
