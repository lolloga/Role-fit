// ─── STORICO — TUTTI I TEST ───────────────────────────────────
// Lista completa dei report dell'utente. Ogni card mostra fino a 3 ruoli con %
// e apre il report completo (report.html?id=...).
import { getSession, listReports } from './supabase.js';

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
}

// Stringa "Ruolo 92% · Ruolo 81% · Ruolo 74%" dai primi 3 ruoli del report_json
function rolesLine(report_json) {
  const ruoli = Array.isArray(report_json?.ruoli) ? report_json.ruoli.slice(0, 3) : [];
  if (!ruoli.length) return 'Report RoleFit';
  return ruoli.map((r) => {
    const nome = r?.nome || 'Ruolo';
    const m = (typeof r?.match === 'number') ? ' ' + r.match + '%' : '';
    return nome + m;
  }).join(' · ');
}

function renderList(reports) {
  document.getElementById('st-loading').classList.add('hidden');
  const list = document.getElementById('st-list');
  const empty = document.getElementById('st-empty');
  const count = document.getElementById('st-count');

  count.textContent = reports.length + (reports.length === 1 ? ' test completato' : ' test completati');

  if (!reports.length) {
    empty.classList.remove('hidden');
    return;
  }

  reports.forEach((r, i) => {
    const a = document.createElement('a');
    a.href = 'report.html?id=' + r.id;
    a.className = 'st-card';

    const badge = (i === 0) ? '<span class="st-badge">Più recente</span>' : '';
    a.innerHTML =
      '<div class="st-card-top">' +
        '<p class="st-date">' + formatDate(r.created_at) + '</p>' +
        badge +
      '</div>' +
      '<p class="st-roles">' + rolesLine(r.report_json) + '</p>' +
      '<div class="st-foot"><span class="st-open">Apri il report completo →</span></div>';
    list.appendChild(a);
  });
}

async function init() {
  const session = await getSession();
  if (!session) {
    // Non loggato: rimanda alla pagina profilo che gestisce il login
    window.location.href = 'account.html';
    return;
  }
  try {
    const reports = await listReports();
    renderList(reports);
  } catch (e) {
    console.error('Errore nel caricare lo storico:', e);
    document.getElementById('st-loading').textContent = 'Non riesco a caricare lo storico. Riprova.';
  }
}

document.addEventListener('DOMContentLoaded', init);
