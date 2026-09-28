// Controllo sessione condiviso da tutte le pagine: se l'utente è loggato,
// il pulsante "Il tuo profilo" nella nav diventa un avatar con le iniziali
// (del nome, se l'ha dato; altrimenti dell'email).
import { getSession, getProfile } from './supabase.js';

function iniziali(email, nome) {
  const parole = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (parole.length) return ((parole[0][0] || '') + (parole[1]?.[0] || '')).toUpperCase();
  const base = (email || '').split('@')[0] || '';
  const parti = base.split(/[.\-_]/).filter(Boolean);
  const txt = (parti[0]?.[0] || '') + (parti[1]?.[0] || parti[0]?.[1] || '');
  return (txt || '··').toUpperCase().slice(0, 2);
}

(async function initSiteNavAuth() {
  const cta = document.getElementById('site-nav-cta');
  if (!cta) return;
  try {
    const session = await getSession();
    if (session && session.user) {
      cta.textContent = iniziali(session.user.email);
      cta.classList.remove('site-nav-cta');
      cta.classList.add('site-nav-avatar');
      cta.title = 'Il tuo profilo';
      const profile = await getProfile().catch(() => null);
      if (profile?.nome) cta.textContent = iniziali(session.user.email, profile.nome);
    }
  } catch (e) {
    console.error('Controllo sessione (nav) non riuscito:', e);
  }
})();
