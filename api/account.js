// Cancellazione dell'account su richiesta dell'utente (diritto all'oblio, GDPR
// art. 17). Serve la service role key: l'utente non può eliminare da solo il
// proprio record in auth.users. Profilo, report e feedback hanno foreign key
// "on delete cascade" verso auth.users, quindi spariscono insieme all'utente;
// il CV nello storage no, e va rimosso prima esplicitamente.

import { envReady, serviceHeaders, getUserFromToken } from './_cv-shared.js';
import { clientIp, isSameOrigin, rateLimit } from './_guard.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.supabase_url;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!envReady()) {
    return res.status(500).json({ error: 'Configurazione server incompleta' });
  }

  const { action } = req.body || {};
  if (action !== 'delete') {
    return res.status(400).json({ error: 'Azione non valida' });
  }
  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: 'Origine non consentita' });
  }
  if (!rateLimit(`account:${clientIp(req)}`, 5, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const user = await getUserFromToken(token);
  if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Il CV: un 404 (nessun CV caricato) va bene, qualunque altro errore no,
    // perché lascerebbe un file personale orfano dopo la cancellazione.
    const cvRes = await fetch(`${SUPABASE_URL}/storage/v1/object/cv/${user.id}/cv.pdf`, {
      method: 'DELETE',
      headers: serviceHeaders(),
    });
    if (!cvRes.ok && cvRes.status !== 404 && cvRes.status !== 400) {
      console.error('Cancellazione CV fallita:', cvRes.status, await cvRes.text());
      return res.status(502).json({ error: 'Non sono riuscito a cancellare il CV. Riprova tra poco.' });
    }

    const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: serviceHeaders(),
    });
    if (!delRes.ok) {
      console.error('Cancellazione utente fallita:', delRes.status, await delRes.text());
      return res.status(502).json({ error: 'Non sono riuscito a cancellare l\'account. Riprova tra poco.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Errore cancellazione account:', err);
    return res.status(500).json({ error: 'Errore interno' });
  }
}
