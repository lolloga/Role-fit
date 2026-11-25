// Tiene sveglio il database. Nel piano gratuito Supabase mette in pausa il
// progetto dopo una settimana senza attività, e da quel momento il sito non
// salva più report né accessi (è successo tra settembre e novembre 2026).
// Vercel chiama questa funzione una volta al giorno (vedi "crons" in
// vercel.json): una lettura minima basta a contare come attività.
// Non restituisce dati, solo se il database ha risposto.
import { rateLimit } from './_guard.js';

export const maxDuration = 20;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.supabase_url;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.supabase_service_role_key;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  // Se su Vercel è impostato CRON_SECRET, il cron lo manda da solo e
  // nessun altro può chiamare la funzione.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Senza segreto resta aperta (fa solo una lettura minima), ma con un tetto.
  if (!secret && !rateLimit('keepalive', 6, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Troppe richieste' });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ ok: false, error: 'Configurazione mancante' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      signal: controller.signal,
    });
    if (!r.ok) {
      console.error('Keepalive: il database ha risposto con', r.status);
      return res.status(502).json({ ok: false, status: r.status });
    }
    return res.status(200).json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    console.error('Keepalive: database non raggiungibile:', e?.name || e);
    return res.status(502).json({ ok: false });
  } finally {
    clearTimeout(timer);
  }
}
