// ─── CLIENT SUPABASE ──────────────────────────────────────────
// Modulo unico che incapsula tutto ciò che parla con Supabase: auth (magic link)
// e accesso ai report. Importato come ESM dalle pagine report.html e account.html.
//
// Questi valori sono PUBBLICI per design: la publishable key è pensata per stare
// nel frontend, la sicurezza dei dati la fanno le Row Level Security policies.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://tywckwehbitvxjxhldiv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UDvK7F8-b_30X4QYyRsnEQ_3rmvPJrI';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // implicit: i token tornano nel fragment dell'URL (#access_token=...), senza
    // code_verifier. Così il magic link autentica anche se aperto in un browser/
    // dispositivo diverso da quello che l'ha richiesto (il PKCE invece fallirebbe).
    flowType: 'implicit',
    detectSessionInUrl: true, // raccoglie la sessione dal redirect del magic link
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ─── AUTH ─────────────────────────────────────────────────────
export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session; // null se non loggato
}

// Invia il magic link. `redirectTo` indica su quale pagina tornare dopo il click:
//  - 'report.html'  → login fatto dopo il test (default)
//  - 'account.html' → login fatto dalla home / da "Accedi" → atterra sul profilo
// `draftId` (opzionale): se presente, lo aggiungiamo come ?draft=... al redirect,
// così l'id della bozza viaggia dentro il link e i dati del test si recuperano
// anche se il link si apre in un'altra scheda/browser.
export async function signInWithMagicLink(email, redirectTo = 'report.html', draftId = null) {
  const redirect = new URL(`${location.origin}/${redirectTo}`);
  if (draftId) redirect.searchParams.set('draft', draftId);
  return sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect.toString() },
  });
}

export async function signOut() {
  return sb.auth.signOut();
}

// Token di accesso corrente (JWT) — serve per autorizzare le chiamate a /api/claude.
export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || null;
}

// ─── REPORT ───────────────────────────────────────────────────
// Salva un nuovo report e restituisce la riga creata (con il suo id).
// test_history: la conversazione completa del test (domande + risposte + attività),
// serve per valutazioni future basate sulle risposte grezze, non sul report finito.
export async function saveReport({ report_json, aspiration = null, test_history = null }) {
  const session = await getSession();
  if (!session) throw new Error('Non autenticato');
  const { data, error } = await sb
    .from('reports')
    .insert({ user_id: session.user.id, report_json, aspiration, test_history })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Aggiorna le valutazioni ruolo attuale/aspirato calcolate dopo il salvataggio.
export async function updateReportEval(id, patch) {
  const { error } = await sb.from('reports').update(patch).eq('id', id);
  if (error) throw error;
}

// Elenco dei report dell'utente (per account.html e storico.html).
export async function listReports() {
  const { data, error } = await sb
    .from('reports')
    .select('id, created_at, report_json')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Un singolo report per id (per report.html?id=...).
export async function getReport(id) {
  const { data, error } = await sb.from('reports').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// ─── CV ────────────────────────────────────────────────────────
// Stato del CV (path nello storage + data dell'ultima rigenerazione).
export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('cv_path, cv_updated_at')
    .eq('id', session.user.id)
    .single();
  if (error) throw error;
  return data;
}

// Carica il PDF nel bucket privato "cv", dentro la cartella dell'utente
// (RLS lo consente solo per il proprio user id). Ritorna il path salvato.
export async function uploadCv(file) {
  const session = await getSession();
  if (!session) throw new Error('Non autenticato');
  const path = `${session.user.id}/cv.pdf`;
  const { error } = await sb.storage.from('cv').upload(path, file, {
    upsert: true,
    contentType: 'application/pdf',
  });
  if (error) throw error;
  return path;
}

// Registra il path del CV appena caricato sul profilo (own-row update,
// già permesso dalla policy RLS esistente su profiles).
export async function saveCvPath(path) {
  const session = await getSession();
  if (!session) throw new Error('Non autenticato');
  const { error } = await sb.from('profiles').update({ cv_path: path }).eq('id', session.user.id);
  if (error) throw error;
}

// ─── BOZZE (input del test, prima del login) ──────────────────
// Salva gli input del test come bozza anonima e restituisce { id }. L'id finisce
// nel magic link, così il report sopravvive anche se il link si apre altrove.
// L'id lo generiamo qui (uuid): così non serve farci restituire la riga con
// .select() — che richiederebbe una policy di lettura anonima sulle bozze. Gli
// anonimi possono solo INSERIRE, mai leggere: la sicurezza resta intatta.
export async function createDraft({ history, activities = null, aspiration = null }) {
  const id = crypto.randomUUID();
  const { error } = await sb
    .from('report_drafts')
    .insert({ id, history, activities, aspiration });
  if (error) throw error;
  return { id };
}

// Legge la bozza dopo il login SENZA cancellarla (vedi migration-5-draft-fix.sql):
// se la generazione del report fallisce subito dopo, il link resta valido e
// ricaricare la pagina recupera di nuovo la stessa bozza, invece di perderla.
// Restituisce { history, activities, aspiration } oppure null se non esiste
// (link scaduto o mai creato).
export async function claimDraft(id) {
  const { data, error } = await sb.rpc('claim_report_draft', { p_id: id });
  if (error) throw error;
  return data || null;
}

// Cancella la bozza: va chiamata SOLO dopo che il report è stato generato e
// salvato con successo su "reports". Best-effort: un fallimento qui non deve
// mai bloccare l'utente, la bozza verrà ripulita comunque dalla manutenzione
// periodica (vedi fondo di migration-2-report-drafts.sql).
export async function deleteDraft(id) {
  const { error } = await sb.rpc('delete_report_draft', { p_id: id });
  if (error) throw error;
}
