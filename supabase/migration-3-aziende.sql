-- RoleFit — schema lato aziende (test azienda + matching con i candidati)
-- Eseguire nel SQL editor di Supabase (Database → SQL editor → New query).
--
-- Nota sull'accesso: le aziende non hanno un login in questa fase (MVP di test).
-- L'inserimento è aperto (anon insert), la lettura NON è esposta via anon key:
-- il calcolo del matching e la lettura dei risultati passano sempre dal server
-- (api/azienda.js, con la service role key), mai da query dirette del browser.
-- Questo evita di esporre l'intera tabella reports (con dati dei candidati)
-- a chiunque abbia la chiave pubblica del progetto.

create table if not exists public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.company_profiles(id) on delete cascade,
  role_title text not null,
  test_history jsonb,       -- conversazione del test azienda (domande + risposte)
  target_profile jsonb,     -- { assi: {...}, focus: "...", settori: [...] }
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists job_requests_company_id_idx
  on public.job_requests (company_id, created_at desc);

alter table public.company_profiles enable row level security;
alter table public.job_requests enable row level security;

-- Inserimento libero (anon): creare un profilo azienda o una ricerca non
-- richiede login in questa fase.
create policy "anyone can create company profile" on public.company_profiles
  for insert to anon, authenticated with check (true);

create policy "anyone can create job request" on public.job_requests
  for insert to anon, authenticated with check (true);

-- Nessuna policy di SELECT per anon/authenticated: la lettura (profilo target
-- + candidati compatibili) avviene solo lato server con la service role key,
-- che bypassa RLS by design. Così i risultati (che includono email e profili
-- dei candidati) non sono raggiungibili con la sola chiave pubblica.
