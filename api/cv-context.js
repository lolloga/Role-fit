export const maxDuration = 30;

import { envReady, getUserFromToken, extractCvText } from './_cv-shared.js';

// Estratto rapido del CV, usato dal test adattivo (non dalla rigenerazione
// del report, vedi api/cv.js): a chi rifà il test da loggato e ha già un CV
// caricato, permette di agganciare 1-2 domande adattive a un'esperienza
// reale invece di restare generiche. Testo più corto di quello usato per la
// rigenerazione del report: qui serve solo abbastanza contesto per una
// domanda mirata, non l'intero CV.
const MAX_CHARS = 6000;

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

    try {
      const text = await extractCvText(user.id, MAX_CHARS);
      return res.status(200).json({ text });
    } catch {
      // Nessun CV caricato o PDF illeggibile: non è un errore per il test,
      // semplicemente non ci sarà contesto CV per le domande adattive.
      return res.status(200).json({ text: null });
    }
  } catch (error) {
    console.error('Errore /api/cv-context:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
