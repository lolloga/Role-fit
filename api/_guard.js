// Difese condivise dagli endpoint serverless. Il prefisso "_" fa sì che
// Vercel non lo tratti come una route a sé.
//
// Nessuna di queste è una barriera assoluta (un client non-browser può
// falsificare Origin, e il rate limit vive in memoria di una singola istanza
// serverless): servono a togliere di mezzo l'abuso più comune e a basso
// sforzo — script che usano l'endpoint come proxy gratuito verso Claude o
// che scaricano i dati dei candidati — senza introdurre infrastruttura nuova.
// Per un limite condiviso tra istanze va configurata la regola di rate limit
// del Firewall di Vercel (vedi report di lancio).

const buckets = new Map();
const MAX_BUCKETS = 5000;

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// true = richiesta ammessa. Finestra fissa per chiave (es. "claude:test:<ip>").
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  }
  return bucket.count <= limit;
}

// Le pagine chiamano sempre le API con un fetch relativo dallo stesso dominio,
// quindi Origin (o in mancanza Referer) deve coincidere con l'host richiesto.
// Una richiesta senza nessuno dei due arriva quasi sempre da uno script.
// GUARD_ORIGIN=off su Vercel disattiva il controllo in caso di emergenza.
export function isSameOrigin(req) {
  if (process.env.GUARD_ORIGIN === 'off') return true;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const source = req.headers.origin || req.headers.referer;
  if (!host || !source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

// Valida la conversazione inoltrata ad Anthropic. I limiti sono circa 5 volte
// sopra le conversazioni reali più lunghe mai salvate (34 messaggi, ~23.000
// caratteri): nessun test legittimo li sfiora, ma impediscono di usare
// l'endpoint per inviare prompt arbitrariamente grandi a nostre spese.
export function validateMessages(messages, { maxMessages = 80, maxCharsPerMessage = 30000, maxTotalChars = 120000 } = {}) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > maxMessages) {
    return 'Conversazione non valida';
  }
  let total = 0;
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return 'Ruolo non valido';
    if (typeof m.content !== 'string' || m.content.length === 0) return 'Contenuto non valido';
    if (m.content.length > maxCharsPerMessage) return 'Messaggio troppo lungo';
    total += m.content.length;
  }
  if (total > maxTotalChars) return 'Conversazione troppo lunga';
  if (messages[0].role !== 'user') return 'Conversazione non valida';
  return null;
}
