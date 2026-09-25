-- RoleFit — migrazione 7: tabella feedback documentata + correzioni prestazioni
-- Eseguire nel SQL editor di Supabase (Database → SQL editor → New query).
--
-- La tabella "feedback" (usata da js/feedback.js) esiste già nel database ma
-- non era mai stata registrata tra le migrazioni del repo: il "create table
-- if not exists" qui sotto la documenta e non modifica nulla se c'è già.
--
-- In più risolve i due avvisi del Performance Advisor di Supabase:
-- 1. manca un indice sulla foreign key report_id;
-- 2. le policy RLS chiamano auth.uid() riga per riga invece di una volta sola.
-- Nessun cambiamento di comportamento: stesse regole di accesso, più veloci.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  created_at timestamptz not null default now(),
  q1_rispecchio integer check (q1_rispecchio between 1 and 10),
  q2_ruoli integer check (q2_ruoli between 1 and 10),
  q3_domande integer check (q3_domande between 1 and 10),
  q4_coinvolgimento integer check (q4_coinvolgimento between 1 and 10),
  q5_fiducia integer check (q5_fiducia between 1 and 10),
  q6_consiglio integer check (q6_consiglio between 1 and 10),
  suggerimenti text,
  unique (user_id, report_id)
);

alter table public.feedback enable row level security;

create index if not exists feedback_report_id_idx on public.feedback (report_id);

drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert to authenticated with check ((select auth.uid()) = user_id);
