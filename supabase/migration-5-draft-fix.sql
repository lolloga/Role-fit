-- RoleFit — migrazione 5: le bozze del test non si cancellano più al primo tentativo
-- Eseguire nel SQL editor di Supabase (Database → SQL editor → New query).
--
-- BUG CORRETTO: claim_report_draft cancellava la bozza appena letta, prima
-- ancora che il report fosse stato generato e salvato con successo. Se la
-- generazione (chiamata a Claude) andava in timeout, o il salvataggio su
-- "reports" falliva per qualsiasi motivo, le risposte del test venivano
-- perse per sempre: ricaricare la pagina o ricliccare il link nella mail
-- non recuperava più nulla, perché la riga in report_drafts non c'era già più.
--
-- Ora la lettura NON cancella nulla: la bozza si elimina solo con la nuova
-- funzione delete_report_draft, chiamata dal frontend (js/report.js) SOLO
-- dopo che il report è stato generato E salvato con successo su "reports".
-- Nel frattempo la bozza resta comunque protetta: nessuna policy di SELECT
-- diretta per anon/authenticated, leggibile solo tramite questa funzione
-- (security definer), che richiede comunque di conoscere l'id (uuid non
-- indovinabile, generato lato client e mai esposto se non nel link email).

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
  return d; -- null se non esiste (link scaduto, mai creato, o già ripulito)
end;
$$;

create or replace function public.delete_report_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.report_drafts where id = p_id;
end;
$$;

revoke execute on function public.delete_report_draft(uuid) from public, anon;
grant  execute on function public.delete_report_draft(uuid) to authenticated;
