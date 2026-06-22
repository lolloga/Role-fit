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
