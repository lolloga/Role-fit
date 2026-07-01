// ─── CLIENT SUPABASE ──────────────────────────────────────────
// Modulo unico che incapsula tutto ciò che parla con Supabase: auth (magic link)
// e accesso ai report. Importato come ESM dalle pagine report.html e account.html.
//
// Progetto Supabase "RoleFit" (org BlackBox, region eu-west-1).
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

// Invia il magic link. Al click l'utente torna su report.html con la sessione in URL.
// Se passiamo un draftId, lo mettiamo nel redirect (?draft=...): l'id viaggia dentro
// il link, quindi i dati del test si recuperano anche in un'altra scheda/browser.
export async function signInWithMagicLink(email, draftId = null) {
  const redirect = new URL(`${location.origin}/report.html`);
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
export async function saveReport({ report_json, aspiration = null }) {
  const session = await getSession();
  if (!session) throw new Error('Non autenticato');
  const { data, error } = await sb
    .from('reports')
    .insert({ user_id: session.user.id, report_json, aspiration })
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

// Elenco dei report dell'utente (per account.html).
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

// ─── BOZZE (input del test, prima del login) ──────────────────
// Salva gli input del test come bozza anonima e restituisce { id }. L'id finisce
// nel magic link, così il report sopravvive anche se il link si apre altrove.
export async function createDraft({ history, activities = null, aspiration = null }) {
  const { data, error } = await sb
    .from('report_drafts')
    .insert({ history, activities, aspiration })
    .select('id')
    .single();
  if (error) throw error;
  return data; // { id }
}

// Reclama la bozza dopo il login: la legge, la elimina e restituisce i dati
// ({ history, activities, aspiration }) oppure null se già usata/scaduta.
export async function claimDraft(id) {
  const { data, error } = await sb.rpc('claim_report_draft', { p_id: id });
  if (error) throw error;
  return data || null;
}
