// Condiviso tra api/cv.js (rigenerazione report da CV) e api/cv-context.js
// (estratto rapido usato dal test per domande adattive più mirate). Il
// prefisso "_" fa sì che Vercel non lo tratti come una route a sé.

import pdfParse from 'pdf-parse';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.supabase_url;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.supabase_anon_key;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.supabase_service_role_key;

export function envReady() {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_ANON_KEY);
}

export function serviceHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function getUserFromToken(token) {
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

// Legge il PDF del CV dell'utente ed estrae il testo. Il path è sempre
// ricostruito dall'id utente verificato dal token (mai dalla colonna
// profiles.cv_path, scrivibile dal client), così nessuno può farsi leggere
// un file che non è il proprio. maxChars tronca per non esplodere il budget
// di token in caso di PDF anomali (es. scansioni con OCR rumoroso).
export async function extractCvText(userId, maxChars) {
  const cvPath = `${userId}/cv.pdf`;
  const fileRes = await fetch(`${SUPABASE_URL}/storage/v1/object/cv/${cvPath}`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!fileRes.ok) throw new Error('Impossibile leggere il file CV');
  const arrayBuffer = await fileRes.arrayBuffer();

  const parsed = await pdfParse(Buffer.from(arrayBuffer));
  let text = (parsed.text || '').trim();
  if (!text) throw new Error('Il PDF non contiene testo leggibile');
  if (maxChars && text.length > maxChars) text = text.slice(0, maxChars);
  return text;
}
