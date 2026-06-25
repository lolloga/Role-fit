// ─── AREA PERSONALE — PROFILO (magic link) ───────────────────
import { getSession, signInWithMagicLink, signOut, listReports } from './supabase.js';

// ─── Gate magic link (redirect verso il profilo) ───
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
    // Login dalla home/profilo → si torna su account.html (non sul report)
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
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
}
function formatShort(iso) {
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}
function topRole(report_json) {
  const r = report_json?.ruoli?.[0];
  return {
    nome: r?.nome || 'Report RoleFit',
    match: (typeof r?.match === 'number') ? r.match : null,
  };
}
function initials(email) {
  const base = (email || '').split('@')[0] || '';
  const parts = base.split(/[.\-_]/).filter(Boolean);
  const txt = (parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '');
  return (txt || '··').toUpperCase().slice(0, 2);
}

function mostRecurringRole(reports) {
  const counts = {};
  reports.forEach((r) => {
    const n = topRole(r.report_json).nome;
    counts[n] = (counts[n] || 0) + 1;
  });
  let best = null, bestN = 0;
  for (const k in counts) { if (counts[k] > bestN) { best = k; bestN = counts[k]; } }
  return best;
}

// ─── Render profilo ───
function renderProfile(session, reports) {
  document.getElementById('account-loading').classList.add('hidden');
  document.getElementById('account-content').classList.remove('hidden');

  const email = session.user?.email || '';
  document.getElementById('pf-email').textContent = email || '—';
  document.getElementById('pf-avatar').textContent = initials(email);

  const since = session.user?.created_at;
  document.getElementById('pf-since').textContent =
    since ? 'Membro da ' + new Date(since).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : '';

  if (!reports.length) {
    document.getElementById('pf-last-role').textContent = 'Nessun test ancora';
    document.getElementById('pf-last-pct').textContent = '';
    document.getElementById('pf-last-sub').textContent = 'Fai il test per scoprire i ruoli più adatti a te.';
    document.getElementById('pf-time-invite').classList.remove('hidden');
    return;
  }

  const last = reports[0];
  const lastTop = topRole(last.report_json);
  document.getElementById('pf-last-role').textContent = lastTop.nome;
  document.getElementById('pf-last-pct').textContent = (lastTop.match != null) ? '· ' + lastTop.match + '%' : '';

  if (reports.length === 1) {
    document.getElementById('pf-last-sub').textContent = 'Hai fatto il test il ' + formatDate(last.created_at) + '.';
  } else {
    const ricorrente = mostRecurringRole(reports);
    document.getElementById('pf-last-sub').textContent =
      'Hai fatto il test ' + reports.length + ' volte. ' +
      (ricorrente ? 'Il ruolo che torna più spesso è ' + ricorrente + '.' : '');
  }

  if (reports.length >= 2) {
    renderChart(reports);
    document.getElementById('pf-time-chart').classList.remove('hidden');
  } else {
    document.getElementById('pf-time-invite').classList.remove('hidden');
  }
}

function renderChart(reports) {
  const recent = reports.slice(0, 3).reverse();
  const bars = document.getElementById('pf-chart-bars');
  const axis = document.getElementById('pf-chart-axis');
  bars.innerHTML = '';
  axis.innerHTML = '';

  recent.forEach((r, i) => {
    const t = topRole(r.report_json);
    const pct = (t.match != null) ? t.match : 0;
    const isLast = (i === recent.length - 1);

    const col = document.createElement('div');
    col.className = 'pf-bar-col';
    const bar = document.createElement('div');
    bar.className = 'pf-bar' + (isLast ? ' last' : '');
    bar.style.height = Math.max(8, pct) + '%';
    col.appendChild(bar);
    bars.appendChild(col);

    const cell = document.createElement('div');
    cell.className = 'pf-xcell' + (isLast ? ' last' : '');
    cell.innerHTML =
      '<p class="pf-xdate">' + formatShort(r.created_at) + '</p>' +
      '<p class="pf-xrole">' + (t.nome || '') + '</p>' +
      '<p class="pf-xpct">' + (t.match != null ? t.match + '%' : '—') + '</p>';
    axis.appendChild(cell);
  });
}

// ─── Init ───
async function init() {
  const session = await getSession();
  if (!session) { showGate(); return; }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    await signOut();
    window.location.reload();
  });

  const pwBtn = document.getElementById('pf-pw-btn');
  if (pwBtn) pwBtn.addEventListener('click', async () => {
    await signOut();
    window.location.reload();
  });

  try {
    const reports = await listReports();
    renderProfile(session, reports);
  } catch (e) {
    console.error('Errore nel caricare i report:', e);
    const l = document.getElementById('account-loading');
    if (l && l.querySelector('p')) l.querySelector('p').textContent = 'Non riesco a caricare il tuo profilo. Riprova.';
  }
}

document.addEventListener('DOMContentLoaded', init);
