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
    .select('id, created_at, report_json, aspiration, aspired_role_eval')
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

// test_history completo dell'ultimo test (per chi rifà il test da loggato):
// .answers serve a test.js per non richiedere di nuovo domande puramente
// anagrafiche di cui la risposta non cambia (es. età, formazione); .activities
// serve a non riproporre la stessa variante di un'attività interattiva vista
// l'ultima volta (vedi getRandomVariant in test.js). null se non c'è nessun
// test precedente o se è troppo vecchio per avere questo campo.
export async function getLastTestHistory() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await sb
    .from('reports')
    .select('test_history')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.test_history || null;
}

// Storico dei test più recenti (fino a `limit`), usato per costruire un
// profilo cumulativo che si affina test dopo test — sia nelle domande
// adattive (test.js) sia nel report (report.js). Solo i campi derivati
// (assi, ruoli, ruolo dichiarato) e non le risposte grezze di ogni singolo
// test passato: restano leggeri da passare al modello anche con molti test
// alle spalle.
export async function getHistoricalProfile(limit = 5) {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await sb
    .from('reports')
    .select('created_at, report_json, current_role_eval, aspiration')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ─── CV ────────────────────────────────────────────────────────
// Stato del CV (path nello storage + data dell'ultima rigenerazione).
export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('cv_path, cv_updated_at, nome, email, marketing_consent')
    .eq('id', session.user.id)
    .single();
  if (error) throw error;
  return data;
}

// Salva il nome dato dall'utente al test (una sola volta, la prima volta che
// lo dà): da quel momento in poi test.js non lo richiede più, lo legge da
// qui invece di indovinarlo o richiederlo di nuovo ogni volta.
export async function saveUserName(nome) {
  const session = await getSession();
  if (!session) throw new Error('Non autenticato');
  const { error } = await sb.from('profiles').update({ nome }).eq('id', session.user.id);
  if (error) throw error;
}

// Aggiorna i campi del profilo modificabili dalle impostazioni. Solo le
// chiavi elencate: il resto della riga (es. cv_path) ha le sue funzioni.
export async function updateProfile(patch) {
  const session = await getSession();
  if (!session) throw new Error('Non autenticato');
  const allowed = {};
  if ('nome' in patch) allowed.nome = patch.nome;
  if ('marketing_consent' in patch) allowed.marketing_consent = !!patch.marketing_consent;
  const { error } = await sb.from('profiles').update(allowed).eq('id', session.user.id);
  if (error) throw error;
}

// Avvia il cambio dell'email di accesso: Supabase manda un link di conferma
// e il cambio diventa effettivo solo quando viene aperto. profiles.email si
// riallinea da sola con il trigger di migration-8.
export async function changeEmail(email) {
  const { error } = await sb.auth.updateUser(
    { email },
    { emailRedirectTo: `${location.origin}/account.html#impostazioni` }
  );
  if (error) throw error;
}

// ─── RUOLI SALVATI (migration-8) ───────────────────────────────
export async function listSavedRoles() {
  const { data, error } = await sb
    .from('saved_roles')
    .select('id, nome, settore, match, nota, fonte, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Salva (o aggiorna, se c'è già lo stesso ruolo nello stesso settore) un
// ruolo. I campi vuoti non vengono inviati: così salvare dal dizionario un
// ruolo già valutato nel banco di prova non ne cancella il punteggio.
export async function saveRole({ nome, settore = null, match = null, nota = null, fonte = 'banco' }) {
  const session = await getSession();
  if (!session) throw new Error('Non autenticato');
  const row = { user_id: session.user.id, nome: String(nome).trim().slice(0, 120), fonte, updated_at: new Date().toISOString() };
  if (settore) row.settore = String(settore).slice(0, 120);
  if (typeof match === 'number' && Number.isFinite(match)) row.match = Math.max(0, Math.min(100, Math.round(match)));
  if (nota) row.nota = String(nota).slice(0, 1000);
  const { error } = await sb
    .from('saved_roles')
    .upsert(row, { onConflict: 'user_id,nome_key,settore_key' });
  if (error) throw error;
}

export async function removeSavedRole(id) {
  const { error } = await sb.from('saved_roles').delete().eq('id', id);
  if (error) throw error;
}

// ─── RICERCHE AZIENDALI IN CUI SEI COMPARSO (migration-8) ─────
export async function listJobMatches() {
  const { data, error } = await sb
    .from('job_matches')
    .select('id, role_title, company_name, match, first_seen_at, last_seen_at, viewed_at')
    .order('last_seen_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── I TUOI DATI (esportazione, GDPR art. 20) ──────────────────
// Tutto ciò che l'utente può leggere di sé, in un unico oggetto. Una tabella
// che non esiste ancora (migrazione non eseguita) non blocca l'esportazione.
export async function exportMyData() {
  const session = await getSession();
  if (!session) throw new Error('Non autenticato');
  const safe = async (query) => {
    const { data, error } = await query;
    return error ? [] : (data || []);
  };
  const [profile, reports, savedRoles, jobMatches] = await Promise.all([
    safe(sb.from('profiles').select('*').eq('id', session.user.id)),
    safe(sb.from('reports').select('*').order('created_at', { ascending: true })),
    safe(sb.from('saved_roles').select('nome, settore, match, nota, fonte, created_at, updated_at')),
    safe(sb.from('job_matches').select('role_title, company_name, match, first_seen_at, last_seen_at, viewed_at')),
  ]);
  return {
    esportato_il: new Date().toISOString(),
    account: { email: session.user.email, creato_il: session.user.created_at },
    profilo: profile[0] || null,
    report: reports,
    ruoli_salvati: savedRoles,
    ricerche_aziendali: jobMatches,
  };
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

// Rimuove il CV: cancella il file dal bucket (policy "own cv delete") e
// azzera cv_path. È anche il modo per tornare invisibili alle aziende, che
// vedono solo chi ha un CV caricato (vedi api/azienda.js). Prima il profilo,
// poi il file: se la cancellazione del file fallisse, la visibilità è già
// stata tolta, che è la parte che conta per l'utente.
export async function removeCv() {
  const session = await getSession();
  if (!session) throw new Error('Non autenticato');
  const { error: profileError } = await sb
    .from('profiles')
    .update({ cv_path: null, cv_updated_at: null })
    .eq('id', session.user.id);
  if (profileError) throw profileError;
  const { error: storageError } = await sb.storage.from('cv').remove([`${session.user.id}/cv.pdf`]);
  if (storageError) console.error('Rimozione file CV non riuscita (profilo già reso invisibile):', storageError);
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
