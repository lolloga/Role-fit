-- RoleFit — migrazione 8: profilo arricchito
-- Eseguire nel SQL editor di Supabase (Database → SQL editor → New query).
--
-- 1. job_matches: le ricerche aziendali in cui un candidato visibile è
--    comparso, e se l'azienda ha aperto il suo profilo. Le scrive solo il
--    server (api/azienda.js, service role); il candidato può solo leggere le
--    proprie righe, dalla sezione "Aziende e CV" del profilo.
-- 2. saved_roles: i ruoli che l'utente mette da parte dal banco di prova o
--    dal dizionario. Ognuno legge e gestisce solo i propri.
-- 3. Trigger che tiene profiles.email allineata quando l'utente cambia email
--    dalle impostazioni: api/azienda.js legge l'email da profiles, non da
--    auth.users, quindi senza questo le aziende vedrebbero quella vecchia.
--
-- Il sito funziona anche prima di eseguire questo file: le sezioni nuove
-- restano vuote finché le tabelle non esistono.

-- ─── 1. Ricerche in cui il candidato è comparso ─────────────────
create table if not exists public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.job_requests(id) on delete cascade,
  role_title text,
  company_name text,
  match integer check (match is null or match between 0 and 100),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  viewed_at timestamptz,
  unique (user_id, job_id)
);

create index if not exists job_matches_job_id_idx on public.job_matches (job_id);

alter table public.job_matches enable row level security;

drop policy if exists job_matches_select_own on public.job_matches;
create policy job_matches_select_own on public.job_matches
  for select to authenticated using ((select auth.uid()) = user_id);
-- Nessuna policy di scrittura: inserimenti e aggiornamenti arrivano solo
-- dal server con la service role key, che non passa dalle RLS.

-- ─── 2. Ruoli salvati ───────────────────────────────────────────
create table if not exists public.saved_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  settore text check (settore is null or char_length(settore) <= 120),
  match integer check (match is null or match between 0 and 100),
  nota text check (nota is null or char_length(nota) <= 1000),
  fonte text not null default 'banco' check (fonte in ('banco', 'dizionario')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Chiavi normalizzate: "Product Manager" e "product manager " sono lo
  -- stesso ruolo salvato. Servono al vincolo unique usato dall'upsert.
  nome_key text generated always as (lower(trim(nome))) stored,
  settore_key text generated always as (coalesce(lower(trim(settore)), '')) stored,
  unique (user_id, nome_key, settore_key)
);

alter table public.saved_roles enable row level security;

drop policy if exists saved_roles_select_own on public.saved_roles;
create policy saved_roles_select_own on public.saved_roles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists saved_roles_insert_own on public.saved_roles;
create policy saved_roles_insert_own on public.saved_roles
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists saved_roles_update_own on public.saved_roles;
create policy saved_roles_update_own on public.saved_roles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists saved_roles_delete_own on public.saved_roles;
create policy saved_roles_delete_own on public.saved_roles
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ─── 3. Email del profilo allineata a quella di accesso ─────────
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
