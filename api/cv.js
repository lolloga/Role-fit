export const maxDuration = 60;

import { PROMPT_REPORT } from './claude.js';
import { envReady, serviceHeaders, getUserFromToken, extractCvText } from './_cv-shared.js';

// Endpoint lato server per il CV del candidato: dopo l'upload (fatto dal
// browser direttamente su Supabase Storage, protetto da RLS scoped alla
// propria cartella), questo endpoint legge il PDF con la service role key,
// ne estrae il testo e rigenera il report riusando la stessa conversazione
// del test originale (salvata in reports.test_history) più il CV come nuovo
// contesto. Il risultato è un NUOVO report (non una modifica in place), così
// lo storico dei test resta intatto.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.supabase_url;

// Limite di caratteri del testo estratto dal PDF passato al modello: un CV
// normale sta ampiamente sotto questa soglia, serve solo a evitare che un
// PDF anomalo (es. scansione con OCR rumoroso) esploda il budget di token.
const MAX_CV_CHARS = 12000;

function parseReportJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('JSON non trovato nella risposta');
  const slice = text.substring(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    const controlChars = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]', 'g');
    const repaired = slice
      .replace(controlChars, '')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    return JSON.parse(repaired);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!envReady()) {
    return res.status(500).json({ error: 'Configurazione server incompleta' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const user = await getUserFromToken(token);
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=cv_path`,
      { headers: serviceHeaders() }
    );
    if (!profileRes.ok) return res.status(500).json({ error: 'Impossibile leggere il profilo' });
    const [profile] = await profileRes.json();
    if (!profile?.cv_path) return res.status(400).json({ error: 'Nessun CV caricato' });

    // Il percorso reale sul bucket si ricostruisce sempre dall'id utente
    // verificato dal token (mai da profiles.cv_path, scrivibile dal client),
    // così nessuno può farsi leggere un file che non è il proprio.
    let cvText;
    try {
      cvText = await extractCvText(user.id, MAX_CV_CHARS);
    } catch (e) {
      console.error('Errore estrazione testo PDF:', e);
      return res.status(400).json({ error: 'Non riesco a leggere questo PDF' });
    }

    const reportsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/reports?user_id=eq.${user.id}&select=*&order=created_at.desc&limit=1`,
      { headers: serviceHeaders() }
    );
    if (!reportsRes.ok) return res.status(500).json({ error: 'Impossibile leggere il report esistente' });
    const [lastReport] = await reportsRes.json();
    if (!lastReport) return res.status(400).json({ error: 'Fai prima il test RoleFit' });

    const history = lastReport.test_history?.history;
    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({
        error: 'Il test collegato a questo profilo è troppo vecchio per essere rigenerato con il CV. Rifai il test e poi ricarica il CV.',
      });
    }
    const activities = lastReport.test_history?.activities || {};
    const activitiesSummary = Object.entries(activities)
      .map(([k, v]) => `Attività "${k}": ${JSON.stringify(v)}`)
      .join('\n');

    const messages = [
      ...history,
      {
        role: 'user',
        content: `Il candidato ha caricato il proprio CV in PDF dopo aver già completato il test. Ecco il testo estratto automaticamente dal PDF (potrebbero esserci imperfezioni di formattazione dovute all'estrazione):\n\n"""\n${cvText}\n"""\n\nREGOLA FONDAMENTALE SU COME USARE QUESTO CV: il test misura chi è questa persona (attitudini, cosa la energizza, di cosa ha bisogno) attraverso scenari pensati per far emergere pattern autentici. Il CV racconta invece cosa questa persona HA FATTO — spesso per percorso professionale o necessità, non per attitudine naturale. Un ruolo attuale o passato molto analitico NON significa che la persona abbia naturalmente alta "Analisi" e bassa "Relazione": potrebbe semplicemente ricoprire un ruolo che le sta stretto, ed è proprio questo disallineamento che il test è progettato per far emergere, non per nasconderlo dietro il CV.\n\nUsa quindi il CV così:\n- Per gli ASSI e per il blocco CHI SEI: restano ancorati PRIMARIAMENTE ai segnali del test. Il CV può rafforzare un pattern se lo conferma, ma non deve mai ribaltarlo o attenuarlo solo perché il lavoro attuale o passato richiede altro.\n- Per i RUOLI SUGGERITI, "come si entra" e "dove brilla per te": qui il CV è preziosissimo, usalo per rendere concreto il percorso (esperienze reali, competenze già dimostrate, settori già frequentati) invece di restare generico.\n- Se il ruolo più recente nel CV diverge dai ruoli che il profilo del test suggerisce, trattalo come il "ruolo attuale" già previsto dalla struttura del report: nomina esplicitamente il confronto (cosa guadagnerebbe, cosa perderebbe cambiando), non come prova che il test si sbagliava.\n\nRigenera il report finale integrando il CV con tutto ciò che è emerso dal test, rispettando questa regola.\n\nRiepilogo attività interattive:\n${activitiesSummary}\n\nGenera il report completo in JSON.`,
      },
    ];

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        temperature: 0.7,
        system: PROMPT_REPORT,
        messages,
      }),
    });

    const aiData = await aiResponse.json();
    const text = aiData?.content?.[0]?.text;
    if (!text) {
      console.error('Errore rigenerazione report da CV:', aiData?.error || aiData);
      return res.status(500).json({ error: 'Rigenerazione non riuscita' });
    }

    let parsed;
    try {
      parsed = parseReportJson(text);
    } catch (e) {
      console.error('Errore parsing report rigenerato da CV:', e, text.slice(0, 500));
      return res.status(500).json({ error: 'Rigenerazione non riuscita' });
    }
    if (!parsed?.report) return res.status(500).json({ error: 'Rigenerazione non riuscita' });

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
      method: 'POST',
      headers: { ...serviceHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: user.id,
        report_json: parsed.report,
        aspiration: lastReport.aspiration || null,
        test_history: {
          ...lastReport.test_history,
          cv_used: true,
          savedAt: new Date().toISOString(),
        },
      }),
    });
    if (!insertRes.ok) return res.status(500).json({ error: 'Impossibile salvare il nuovo report' });
    const [newReport] = await insertRes.json();

    // Non blocchiamo la risposta sull'esito di questo update: il report è
    // già salvato correttamente, questo timestamp è solo informativo per la UI.
    fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: serviceHeaders(),
      body: JSON.stringify({ cv_updated_at: new Date().toISOString() }),
    }).catch(() => {});

    return res.status(200).json({ report_id: newReport.id });
  } catch (error) {
    console.error('Errore /api/cv:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
