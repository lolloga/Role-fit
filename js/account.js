// ─── AREA PERSONALE — I MIEI REPORT ───────────────────────────
import { getSession, signInWithMagicLink, signOut, listReports } from './supabase.js';

// Gate magic link (riusa lo stesso pattern di report.html, con id propri)
function showGate() {
  document.getElementById('account-loading').classList.add('hidden');
  document.getElementById('account-gate').classList.remove('hidden');

  const btn = document.getElementById('account-auth-btn');
  const emailInput = document.getElementById('account-email');
  const errEl = document.getElementById('account-auth-error');
  const form = document.getElementById('account-auth-form');
  const sent = document.getElementById('account-auth-sent');

  const submit = async () => {
    const email = (emailInput.value || '').trim();
    errEl.classList.add('hidden');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errEl.textContent = 'Inserisci un indirizzo email valido.';
      errEl.classList.remove('hidden');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Invio...';
    const { error } = await signInWithMagicLink(email);
    if (error) {
      btn.disabled = false;
      btn.textContent = 'Inviami il link →';
      errEl.textContent = 'Qualcosa è andato storto. Riprova tra poco.';
      errEl.classList.remove('hidden');
      return;
    }
    form.classList.add('hidden');
    sent.classList.remove('hidden');
  };

  btn.addEventListener('click', submit);
  emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => emailInput.focus(), 100);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

function renderList(reports) {
  document.getElementById('account-loading').classList.add('hidden');
  document.getElementById('account-content').classList.remove('hidden');

  const list = document.getElementById('reports-list');
  const empty = document.getElementById('reports-empty');

  if (!reports.length) {
    empty.classList.remove('hidden');
    return;
  }

  reports.forEach((r) => {
    const ruoloTop = r.report_json?.ruoli?.[0]?.nome || 'Report RoleFit';
    const a = document.createElement('a');
    a.href = `report.html?id=${r.id}`;
    a.className = 'card';
    a.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;text-decoration:none;';
    a.innerHTML = `
      <div>
        <div style="font-family:var(--font-display);font-size:1.15rem;color:var(--text-primary);">${ruoloTop}</div>
        <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;">${formatDate(r.created_at)}</div>
      </div>
      <span style="color:var(--emerald-light);font-size:0.9rem;white-space:nowrap;">Apri →</span>
    `;
    list.appendChild(a);
  });
}

async function init() {
  const session = await getSession();
  if (!session) { showGate(); return; }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut();
    window.location.reload();
  });

  try {
    const reports = await listReports();
    renderList(reports);
  } catch (e) {
    console.error('Errore nel caricare i report:', e);
    document.getElementById('account-loading').querySelector('p').textContent =
      'Non riesco a caricare i tuoi report. Riprova.';
  }
}

document.addEventListener('DOMContentLoaded', init);
