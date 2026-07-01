# RoleFit — modifiche da mettere nel repo (integrazione Supabase)

Queste modifiche aggiungono: login con magic link, salvataggio dei report per
utente su Supabase, area "I miei report", e una protezione sull'endpoint API.

Il **database Supabase e le variabili d'ambiente su Vercel sono già configurati**.
Manca solo portare questi file nel repo e fare deploy.

## Cosa fare
1. Copia i file qui sotto nel repo, **mantenendo i percorsi** (sovrascrivi quelli esistenti).
2. Commit + push sul branch che Vercel pubblica → il deploy parte da solo.

## File NUOVI (da aggiungere)
- `js/supabase.js`      ← client Supabase + chiavi (pubbliche)
- `js/account.js`       ← logica area personale
- `account.html`        ← pagina "I miei report"
- `supabase/migration.sql`  ← solo documentazione: la migrazione è GIÀ applicata al DB

## File MODIFICATI (da sostituire)
- `report.html`         ← aggiunto il gate email prima del report
- `js/report.js`        ← gate login, salvataggio report, rilettura report salvati
- `js/test.js`          ← handoff del test su localStorage (serve al magic link)
- `api/claude.js`       ← richiede login sulle chiamate 'report' e 'compatibilita'

## NON toccare
- `index.html` e `css/style.css` sono identici all'originale: nessuna modifica.

## Variabili d'ambiente (già messe, solo verifica)
Sul progetto Vercel devono esserci:
- `ANTHROPIC_API_KEY`   (già esistente)
- `SUPABASE_URL` = https://tywckwehbitvxjxhldiv.supabase.co
- `SUPABASE_ANON_KEY` = sb_publishable_UDvK7F8-b_30X4QYyRsnEQ_3rmvPJrI

Dopo il push, se le env var erano appena state aggiunte, assicurati che il deploy
nuovo le includa (un Redeploy basta).

## Nota sul comportamento
Dopo questo aggiornamento, alla fine del test compare una schermata che chiede
l'email per vedere/salvare il report (prima il report si vedeva subito). È voluto:
è il login. Il test resta libero, l'email serve solo per salvare.

---

# AGGIORNAMENTO — fix limite email + report perso dopo il login

Due problemi risolti: (1) il mittente email di default di Supabase ha un limite
troppo basso e blocca gli invii; (2) cliccando il magic link da un'altra scheda/
telefono il report si perdeva ("non contiene nessun report").

## 1. Migrazione DB da eseguire (nuova)
Nel SQL editor di Supabase (progetto RoleFit) esegui il contenuto di:
- `supabase/migration-2-report-drafts.sql`

Crea la tabella `report_drafts` (bozze anonime del test) + la funzione
`claim_report_draft`. Serve a far sopravvivere il report quando il link si apre in
un browser diverso. Va eseguita una sola volta.

## 2. SMTP custom con Resend (toglie il limite email)
Il limite non si alza cambiando codice: va collegato un SMTP proprio.
1. Crea un account su https://resend.com → verifica un dominio mittente (aggiungi i
   record DNS che Resend indica; senza dominio verificato le mail rischiano lo spam).
2. In Resend prendi le credenziali SMTP: host `smtp.resend.com`, porta `465`,
   user `resend`, password = la tua API key Resend.
3. Supabase → **Authentication → Emails → SMTP Settings** → abilita "Custom SMTP" e
   inserisci host/porta/user/password + un mittente tipo `no-reply@tuodominio`.
4. (Opzionale) Authentication → Rate Limits: alza il limite email ora che l'SMTP regge.

## 3. Redirect URL (verifica)
Supabase → Authentication → URL Configuration → Redirect URLs: devono essere
presenti gli URL di `report.html` per prod, preview e locale, es.
`https://<dominio-prod>/report.html`, `https://role-fit-beta.vercel.app/report.html`,
`http://localhost:3000/report.html`.

## File modificati in questo aggiornamento
- `js/supabase.js`  ← flusso `implicit` (magic link cross-browser) + helper bozze
- `js/report.js`    ← crea la bozza al submit email + ramo `?draft=` al ritorno
- `supabase/migration-2-report-drafts.sql`  ← NUOVO, la migrazione qui sopra

Nessuna nuova variabile d'ambiente su Vercel. `api/claude.js` invariato.
