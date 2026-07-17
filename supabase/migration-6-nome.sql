-- RoleFit — nome del candidato (per rendere il test/report meno anonimi
-- dal secondo tentativo in poi, senza doverlo indovinare dall'email).
-- Eseguire nel SQL editor di Supabase (Database → SQL editor → New query).

alter table public.profiles
  add column if not exists nome text;

-- Nessuna nuova policy RLS necessaria: la colonna è coperta dalle policy
-- "own profile select/update" già esistenti sulla tabella profiles.
