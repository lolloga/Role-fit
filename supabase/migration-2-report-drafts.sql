-- RoleFit — migrazione 2: bozze anonime del test (fix "report perso dopo il login")
-- Eseguire nel SQL editor di Supabase (Database → SQL editor → New query) del progetto RoleFit.
-- Va applicata DOPO supabase/migration.sql.
--
-- A cosa serve: quando l'utente arriva al gate e chiede il magic link, salviamo gli
-- input del test come "bozza anonima". L'id della bozza viaggia dentro il link
-- (report.html?draft=<id>), quindi i dati tornano anche se il link si apre in un
-- altro browser/dispositivo. Al ritorno la bozza viene reclamata (letta + eliminata)
-- e da lì si genera e salva il report definitivo sull'account dell'utente.

-- Bozza anonima degli input del test, creata prima del login e reclamata dopo
create table if not exists public.report_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  history jsonb not null,          -- rf_history (conversazione del test)
  activities jsonb,                -- rf_activities (risultati attività)
  aspiration text                  -- rf_aspiration (ruolo aspirato)
);

alter table public.report_drafts enable row level security;

-- Chiunque (anche non loggato) può CREARE una bozza; nessuno può leggerla direttamente.
drop policy if exists "anyone can create draft" on public.report_drafts;
create policy "anyone can create draft" on public.report_drafts
  for insert to anon, authenticated with check (true);

-- Reclamo sicuro: legge la bozza per id, la elimina, restituisce i dati.
-- L'id uuid non indovinabile funge da capability token. Solo utenti loggati.
create or replace function public.claim_report_draft(p_id uuid)
returns public.report_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.report_drafts;
begin
  select * into d from public.report_drafts where id = p_id;
  if not found then
    return null;
  end if;
  delete from public.report_drafts where id = p_id;
  return d;
end;
$$;

-- La funzione è invocabile solo da utenti autenticati (non via anon/pubblico).
revoke execute on function public.claim_report_draft(uuid) from public, anon;
grant  execute on function public.claim_report_draft(uuid) to authenticated;

-- Igiene: pulizia bozze vecchie (spam anon o link mai cliccati).
-- Eseguibile a mano ogni tanto, oppure schedulabile con pg_cron se disponibile:
-- delete from public.report_drafts where created_at < now() - interval '1 day';
