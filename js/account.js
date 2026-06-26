// ─── PROFILO LAYOUT D (magic link) ───────────────────────────
import { getSession, signInWithMagicLink, signOut, listReports } from './supabase.js';

// ─── Gate magic link (redirect al profilo) ───
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
    btn.textContent = 'Invio…';
    const { error } = await signInWithMagicLink(email, 'account.html');
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

// ─── Helper ───
function formatDate(iso) {
  try { return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return ''; }
}
function formatShort(iso) {
  try { return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }); }
  catch { return ''; }
}
function topRole(report_json) {
  const r = report_json?.ruoli?.[0];
  return { nome: r?.nome || 'Report RoleFit', match: (typeof r?.match === 'number') ? r.match : null };
}
function rolesLine(report_json) {
  const ruoli = Array.isArray(report_json?.ruoli) ? report_json.ruoli.slice(0, 3) : [];
  if (!ruoli.length) return 'Report RoleFit';
  return ruoli.map((r) => (r?.nome || 'Ruolo') + ((typeof r?.match === 'number') ? ' ' + r.match + '%' : '')).join(' · ');
}
function initials(email) {
  const base = (email || '').split('@')[0] || '';
  const parts = base.split(/[.\-_]/).filter(Boolean);
  const txt = (parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '');
  return (txt || '··').toUpperCase().slice(0, 2);
}
function mostRecurringRole(reports) {
  const counts = {};
  reports.forEach((r) => { const n = topRole(r.report_json).nome; counts[n] = (counts[n] || 0) + 1; });
  let best = null, bestN = 0;
  for (const k in counts) { if (counts[k] > bestN) { best = k; bestN = counts[k]; } }
  return best;
}

// ─── Navigazione tra sezioni (sidebar + bottom bar) ───
function setupNav() {
  const items = document.querySelectorAll('[data-sec]');
  const sections = document.querySelectorAll('.app-sec');

  function show(sec) {
    sections.forEach((s) => s.classList.toggle('hidden', s.getAttribute('data-sec') !== sec));
    // attiva il pulsante giusto sia in sidebar che in bottom bar
    document.querySelectorAll('.sb-item[data-sec], .bb-item[data-sec]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-sec') === sec);
    });
  }

  document.querySelectorAll('.sb-item[data-sec], .bb-item[data-sec]').forEach((btn) => {
    btn.addEventListener('click', () => show(btn.getAttribute('data-sec')));
  });
}

// ─── Render dati profilo ───
function renderProfile(session, reports) {
  const email = session.user?.email || '';
  document.getElementById('sb-email').textContent = email || '—';
  document.getElementById('sb-avatar').textContent = initials(email);
  const since = session.user?.created_at;
  document.getElementById('sb-since').textContent =
    since ? 'da ' + new Date(since).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : '';

  // Panoramica
  if (!reports.length) {
    document.getElementById('pf-last-role').textContent = 'Nessun test ancora';
    document.getElementById('pf-last-pct').textContent = '';
    document.getElementById('pf-last-sub').textContent = 'Fai il test per scoprire i ruoli più adatti a te.';
    document.getElementById('pf-time-invite').classList.remove('hidden');
  } else {
    const last = reports[0];
    const lastTop = topRole(last.report_json);
    document.getElementById('pf-last-role').textContent = lastTop.nome;
    document.getElementById('pf-last-pct').textContent = (lastTop.match != null) ? '· ' + lastTop.match + '%' : '';

    if (reports.length === 1) {
      document.getElementById('pf-last-sub').textContent = 'Hai fatto il test il ' + formatDate(last.created_at) + '.';
    } else {
      const ric = mostRecurringRole(reports);
      document.getElementById('pf-last-sub').textContent =
        'Hai fatto il test ' + reports.length + ' volte. ' + (ric ? 'Il ruolo che torna più spesso è ' + ric + '.' : '');
    }

    if (reports.length >= 2) {
      renderChart(reports);
      document.getElementById('pf-time-chart').classList.remove('hidden');
    } else {
      document.getElementById('pf-time-invite').classList.remove('hidden');
    }
  }

  // Storico (dentro la sezione)
  renderStorico(reports);
}

function renderChart(reports) {
  const recent = reports.slice(0, 3).reverse();
  const bars = document.getElementById('pf-chart-bars');
  const axis = document.getElementById('pf-chart-axis');
  bars.innerHTML = ''; axis.innerHTML = '';
  recent.forEach((r, i) => {
    const t = topRole(r.report_json);
    const pct = (t.match != null) ? t.match : 0;
    const isLast = (i === recent.length - 1);
    const col = document.createElement('div'); col.className = 'pf-bar-col';
    const bar = document.createElement('div'); bar.className = 'pf-bar' + (isLast ? ' last' : '');
    bar.style.height = Math.max(8, pct) + '%'; col.appendChild(bar); bars.appendChild(col);
    const cell = document.createElement('div'); cell.className = 'pf-xcell' + (isLast ? ' last' : '');
    cell.innerHTML = '<p class="pf-xdate">' + formatShort(r.created_at) + '</p>' +
      '<p class="pf-xrole">' + (t.nome || '') + '</p>' +
      '<p class="pf-xpct">' + (t.match != null ? t.match + '%' : '—') + '</p>';
    axis.appendChild(cell);
  });
}

function renderStorico(reports) {
  const list = document.getElementById('st-list');
  const empty = document.getElementById('st-empty');
  const count = document.getElementById('st-count');
  count.textContent = reports.length + (reports.length === 1 ? ' test completato' : ' test completati');
  if (!reports.length) { empty.classList.remove('hidden'); return; }
  list.innerHTML = '';
  reports.forEach((r, i) => {
    const a = document.createElement('a');
    a.href = 'report.html?id=' + r.id; a.className = 'st-card';
    const badge = (i === 0) ? '<span class="st-badge">Più recente</span>' : '';
    a.innerHTML =
      '<div class="st-card-top"><p class="st-date">' + formatDate(r.created_at) + '</p>' + badge + '</div>' +
      '<p class="st-roles">' + rolesLine(r.report_json) + '</p>' +
      '<span class="st-open">Apri il report completo →</span>';
    list.appendChild(a);
  });
}

// ─── Init ───
async function init() {
  const session = await getSession();
  if (!session) { showGate(); return; }

  document.getElementById('account-loading').classList.add('hidden');
  document.getElementById('account-content').classList.remove('hidden');

  setupNav();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => { await signOut(); window.location.reload(); });

  try {
    const reports = await listReports();
    renderProfile(session, reports);
  } catch (e) {
    console.error('Errore nel caricare i report:', e);
  }
}

document.addEventListener('DOMContentLoaded', init);
