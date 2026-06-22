-- RoleFit — schema profilazione (profiles + reports) con RLS
-- Eseguire nel SQL editor di Supabase (Database → SQL editor → New query).

-- profiles: 1 riga per utente, creata automaticamente al primo login
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now()
);

-- reports: N report per utente
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  report_json jsonb not null,            -- l'oggetto `report` completo
  aspiration text,
  current_role_eval jsonb,               -- risultato valutaRuoloAttuale (se presente)
  aspired_role_eval jsonb                 -- risultato valutaRuoloAspirato (se presente)
);

create index if not exists reports_user_id_created_idx
  on public.reports (user_id, created_at desc);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.reports  enable row level security;

-- profiles: ogni utente vede/gestisce solo la propria riga
create policy "own profile select" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "own profile insert" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id);

-- reports: ogni utente vede/gestisce solo i propri report
create policy "own reports select" on public.reports
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own reports insert" on public.reports
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own reports update" on public.reports
  for update to authenticated using ((select auth.uid()) = user_id);

-- crea la riga profiles automaticamente alla registrazione di un nuovo utente
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Hardening: impedisce di invocare la funzione come RPC pubblica
-- (/rest/v1/rpc/handle_new_user). Il trigger sopra continua a funzionare.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
