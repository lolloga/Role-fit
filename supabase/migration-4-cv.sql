-- RoleFit — CV del candidato (upload PDF + rigenerazione profilo)
-- Eseguire nel SQL editor di Supabase (Database → SQL editor → New query).

alter table public.profiles
  add column if not exists cv_path text,
  add column if not exists cv_updated_at timestamptz;

-- Bucket privato per i CV: nessun accesso pubblico diretto. Il download da
-- parte delle aziende avviene sempre tramite URL firmato generato lato server
-- (api/azienda.js, con la service role key), mai con la chiave pubblica.
-- file_size_limit e allowed_mime_types replicano lato server i controlli già
-- fatti dal frontend (solo PDF, max 10MB), come difesa in profondità.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv', 'cv', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS su storage.objects per il bucket 'cv': ogni utente autenticato può
-- caricare/leggere/sostituire/eliminare solo i file dentro la propria
-- cartella (il primo segmento del path deve coincidere col suo user id).
-- Il path usato dal frontend è sempre "<user_id>/cv.pdf".
create policy "own cv insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cv' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own cv select" on storage.objects
  for select to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own cv update" on storage.objects
  for update to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own cv delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Nessuna policy di lettura per il ruolo anon: le aziende (che non hanno un
-- login) non possono mai leggere i file direttamente. Vedono il CV solo
-- tramite un URL firmato a scadenza generato da api/azienda.js con la
-- service role key, che bypassa RLS by design.
