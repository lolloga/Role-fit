export const maxDuration = 60;

import pdfParse from 'pdf-parse';
import { PROMPT_REPORT } from './claude.js';

// Endpoint lato server per il CV del candidato: dopo l'upload (fatto dal
// browser direttamente su Supabase Storage, protetto da RLS scoped alla
// propria cartella), questo endpoint legge il PDF con la service role key,
// ne estrae il testo e rigenera il report riusando la stessa conversazione
// del test originale (salvata in reports.test_history) più il CV come nuovo
// contesto. Il risultato è un NUOVO report (non una modifica in place), così
// lo storico dei test resta intatto.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.supabase_url;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.supabase_anon_key;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.supabase_service_role_key;

// Limite di caratteri del testo estratto dal PDF passato al modello: un CV
// normale sta ampiamente sotto questa soglia, serve solo a evitare che un
// PDF anomalo (es. scansione con OCR rumoroso) esploda il budget di token.
const MAX_CV_CHARS = 12000;

function serviceHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function getUserFromToken(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
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

    const fileRes = await fetch(`${SUPABASE_URL}/storage/v1/object/cv/${profile.cv_path}`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!fileRes.ok) return res.status(500).json({ error: 'Impossibile leggere il file CV' });
    const arrayBuffer = await fileRes.arrayBuffer();

    let cvText;
    try {
      const parsed = await pdfParse(Buffer.from(arrayBuffer));
      cvText = (parsed.text || '').trim();
    } catch (e) {
      console.error('Errore estrazione testo PDF:', e);
      return res.status(400).json({ error: 'Non riesco a leggere questo PDF' });
    }
    if (!cvText) return res.status(400).json({ error: 'Il PDF non contiene testo leggibile' });
    if (cvText.length > MAX_CV_CHARS) cvText = cvText.slice(0, MAX_CV_CHARS);

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
        content: `Il candidato ha caricato il proprio CV in PDF dopo aver già completato il test. Ecco il testo estratto automaticamente dal PDF (potrebbero esserci imperfezioni di formattazione dovute all'estrazione):\n\n"""\n${cvText}\n"""\n\nRigenera il report finale integrando queste informazioni con tutto ciò che è emerso dal test. Il CV aggiunge fatti concreti (esperienze reali, ruoli ricoperti, competenze dimostrate sul campo): usali per rendere il profilo più preciso, specifico e ancorato alla realtà, senza ignorare quanto di vero è emerso dal test.\n\nRiepilogo attività interattive:\n${activitiesSummary}\n\nGenera il report completo in JSON.`,
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
