// ─── PROFILO LAYOUT D (magic link) ───────────────────────────
import { getSession, signInWithMagicLink, signOut, listReports, getAccessToken, getProfile, uploadCv, saveCvPath } from './supabase.js';

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

// Tiene i report caricati, per il banco di prova ruoli.
let REPORTS = [];

// ─── BANCO DI PROVA RUOLI ─────────────────────────────────────
// Costruisce un riassunto testuale del profilo da un report_json salvato,
// da passare al modello come contesto (al posto della rf_history viva).
function profiloSintesi(report_json) {
  const cs = report_json?.chi_sei || {};
  const ruoli = Array.isArray(report_json?.ruoli) ? report_json.ruoli.map(r => r?.nome).filter(Boolean) : [];
  const parti = [];
  if (cs.come_funzioni) parti.push('Come funziona: ' + cs.come_funzioni);
  if (cs.cosa_ti_alimenta) parti.push('Cosa lo alimenta: ' + cs.cosa_ti_alimenta);
  if (cs.di_cosa_hai_bisogno) parti.push('Di cosa ha bisogno: ' + cs.di_cosa_hai_bisogno);
  if (ruoli.length) parti.push('Ruoli più compatibili emersi dal test: ' + ruoli.join(', ') + '.');
  return parti.join('\n');
}

// Valuta un ruolo contro UN report salvato (una chiamata a /api/claude, fase compatibilita).
async function valutaRuoloControReport(ruoloInput, report_json) {
  const sintesi = profiloSintesi(report_json);
  const messages = [
    {
      role: 'user',
      content: `Questo è il profilo completo di un utente, emerso dal test RoleFit:\n\n${sintesi}\n\n` +
        `Valuta un ruolo di tipo ASPIRATO/DESIDERATO. L'utente vuole sapere quanto il ruolo "${ruoloInput}" è compatibile con il suo profilo. ` +
        `Basati esclusivamente sul profilo qui sopra. Rispondi nel formato JSON richiesto.`
    }
  ];

  const token = await getAccessToken();
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, fase: 'compatibilita' })
  });

  if (!response.ok) throw new Error('Risposta non ok: ' + response.status);
  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (!text) return null;
  try { return JSON.parse(text); }
  catch {
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s !== -1 && e !== -1 && e > s) { try { return JSON.parse(text.substring(s, e + 1)); } catch { return null; } }
    return null;
  }
}

function setupBanco() {
  const btn = document.getElementById('banco-btn');
  const input = document.getElementById('banco-input');
  const out = document.getElementById('banco-result');
  if (!btn || !input) return;

  const run = async () => {
    const ruolo = (input.value || '').trim();
    if (!ruolo) return;
    if (!REPORTS.length) {
      out.innerHTML = '<p class="pcard-sub">Fai prima un test: serve almeno un profilo per valutare un ruolo.</p>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Valuto…';
    out.innerHTML = '<p class="pcard-sub" style="font-style:italic;">Sto confrontando "' + ruolo + '" con il tuo profilo…</p>';

    try {
      // Valuta sull'ultimo report (il più attuale) — risultato principale
      const last = REPORTS[0];
      const valLast = await valutaRuoloControReport(ruolo, last.report_json);
      if (!valLast) throw new Error('Nessun risultato');

      const matchColor = valLast.match >= 80 ? '#5DCAA5' : valLast.match >= 55 ? '#5DCAA5' :
                         valLast.match >= 35 ? '#FFD060' : '#FF6496';

      let html =
        '<div class="pcard" style="margin-bottom:12px;">' +
          '<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">' +
            '<div><p class="pcard-label">Ruolo valutato</p>' +
            '<p class="pcard-title" style="font-size:19px;">' + ruolo + '</p>' +
            '<p class="pcard-sub" style="color:#5DCAA5;">' + (valLast.titolo || '') + '</p></div>' +
            '<div style="text-align:right; flex-shrink:0;">' +
            '<p style="font-family:var(--font-display,Georgia),serif; font-size:34px; font-weight:300; color:' + matchColor + '; line-height:1; margin:0;">' + valLast.match + '%</p>' +
            '<p style="font-size:10px; color:rgba(240,255,244,0.35); text-transform:uppercase; letter-spacing:0.06em; margin:2px 0 0;">sull\'ultimo test</p></div>' +
          '</div>' +
          '<p class="pcard-sub" style="border-top:1px solid rgba(93,202,165,0.2); padding-top:12px; margin-top:14px;">' + (valLast.descrizione || '') + '</p>' +
        '</div>';

      out.innerHTML = html;

      // Se ci sono più report, valuta anche sui precedenti per l'andamento
      if (REPORTS.length >= 2) {
        const trend = document.createElement('div');
        trend.className = 'pcard';
        trend.innerHTML = '<p class="pcard-label" style="color:#F0FFF4; text-transform:none; font-size:13px;">Andamento nel tempo</p>' +
          '<p class="pcard-sub" style="font-style:italic;">Calcolo come questo ruolo combaciava nei test precedenti…</p>';
        out.appendChild(trend);

        const righe = [];
        // Già calcolato l'ultimo; calcola i precedenti (max altri 2)
        righe.push({ data: last.created_at, match: valLast.match });
        for (let i = 1; i < Math.min(REPORTS.length, 3); i++) {
          const v = await valutaRuoloControReport(ruolo, REPORTS[i].report_json);
          if (v) righe.push({ data: REPORTS[i].created_at, match: v.match });
        }

        let trendHtml = '<p class="pcard-label" style="color:#F0FFF4; text-transform:none; font-size:13px; margin-bottom:10px;">Andamento nel tempo</p>';
        righe.forEach((r) => {
          trendHtml += '<div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.06);">' +
            '<span class="pcard-sub">' + formatDate(r.data) + '</span>' +
            '<span style="font-weight:bold; color:#5DCAA5;">' + r.match + '%</span></div>';
        });
        // Lettura della tendenza (primo = più recente, ultimo = più vecchio)
        if (righe.length >= 2) {
          const recente = righe[0].match, vecchio = righe[righe.length - 1].match;
          let lettura = '';
          if (recente - vecchio >= 8) lettura = 'La tua compatibilità con questo ruolo è cresciuta nel tempo: ti ci stai avvicinando.';
          else if (vecchio - recente >= 8) lettura = 'La tua compatibilità con questo ruolo è calata nel tempo: il tuo profilo si sta muovendo altrove.';
          else lettura = 'La tua compatibilità con questo ruolo è rimasta stabile nel tempo.';
          trendHtml += '<p class="pcard-sub" style="margin-top:12px; font-style:italic;">' + lettura + '</p>';
        }
        trend.innerHTML = trendHtml;
      }

    } catch (e) {
      console.error('Banco di prova fallito:', e);
      out.innerHTML = '<p class="pcard-sub" style="color:#FF6496;">Non sono riuscito a valutare il ruolo. Riprova tra poco.</p>';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Valuta ruolo';
    }
  };

  btn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}

// ─── CV ─────────────────────────────────────────────────────────
async function renderCvCurrent() {
  const box = document.getElementById('cv-current');
  const status = document.getElementById('cv-status');
  if (!box || !status) return;
  try {
    const profile = await getProfile();
    if (!profile?.cv_path) {
      box.classList.add('hidden');
      return;
    }
    status.textContent = profile.cv_updated_at
      ? 'Il tuo profilo è stato rigenerato con il CV il ' + formatDate(profile.cv_updated_at) + '.'
      : 'CV caricato, in attesa di elaborazione.';
    box.classList.remove('hidden');
  } catch (e) {
    console.error('Errore nel leggere lo stato del CV:', e);
  }
}

function setupCv() {
  const btn = document.getElementById('cv-upload-btn');
  const input = document.getElementById('cv-file-input');
  const errEl = document.getElementById('cv-error');
  const progress = document.getElementById('cv-progress');
  const progressText = document.getElementById('cv-progress-text');
  const done = document.getElementById('cv-done');
  const doneLink = document.getElementById('cv-done-link');
  if (!btn || !input) return;

  renderCvCurrent();

  btn.addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    errEl.classList.add('hidden');
    done.classList.add('hidden');

    if (file.type !== 'application/pdf') {
      errEl.textContent = 'Il file deve essere un PDF.';
      errEl.classList.remove('hidden');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      errEl.textContent = 'Il file supera i 10 MB.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    progress.classList.remove('hidden');
    progressText.textContent = 'Sto caricando il CV...';

    try {
      const path = await uploadCv(file);
      await saveCvPath(path);

      progressText.textContent = 'Sto rileggendo il tuo profilo alla luce del CV...';

      const token = await getAccessToken();
      const response = await fetch('/api/cv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Errore rigenerazione');

      progress.classList.add('hidden');
      done.classList.remove('hidden');
      doneLink.href = 'report.html?id=' + data.report_id;

      renderCvCurrent();

      try {
        const reports = await listReports();
        REPORTS = reports;
        const session = await getSession();
        renderProfile(session, reports);
      } catch { /* la card CV è già aggiornata, il resto si aggiornerà al prossimo giro */ }

    } catch (e) {
      console.error('Errore caricamento CV:', e);
      progress.classList.add('hidden');
      errEl.textContent = 'Qualcosa è andato storto. Riprova tra poco.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });
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

  // Radar 6 dimensioni (visibile da 1 test con assi) + invito a fare 3 test
  renderRadar(reports);
}

const ASSI_FISSI = ['Analisi', 'Relazione', 'Creatività', 'Curiosità', 'Leadership', 'Metodo'];
const RADAR_COLORS = [
  { border: '#b4b2a9', bg: 'rgba(180,178,169,0.06)', dash: [4, 3] },
  { border: '#85b7eb', bg: 'rgba(133,183,235,0.06)', dash: [6, 3] },
  { border: '#e87ba4', bg: 'rgba(232,123,164,0.14)', dash: [] }
];

// [precisione-radar] Invito a fare più test, finché non se ne hanno 3 con assi.
// Sparisce automaticamente al raggiungimento dei 3 test (richiesta esplicita).
function renderRadarInvite(conAssiCount) {
  const box = document.getElementById('pf-radar-invite');
  if (!box) return;

  if (conAssiCount >= 3) {
    box.classList.add('hidden');
    return;
  }

  const mancanti = 3 - conAssiCount;
  const testo = (mancanti === 1)
    ? 'Ti manca solo 1 test per avere il grafico delle competenze più preciso.'
    : 'Fai il test almeno 3 volte per avere il grafico delle competenze più preciso: te ne mancano ancora ' + mancanti + '.';

  box.querySelector('.pcard-sub').textContent = testo;
  box.classList.remove('hidden');
}

function renderRadar(reports) {
  const card = document.getElementById('pf-radar-card');
  if (!card) return;

  const conAssi = reports
    .filter(r => r.report_json && r.report_json.assi && typeof r.report_json.assi === 'object')
    .slice(0, 3)
    .reverse();

  // [precisione-radar] invito a fare più test, indipendente dalla soglia del radar sotto
  renderRadarInvite(conAssi.length);

  // Mostriamo il radar già da 1 test con assi (1 linea = fotografia, poi evoluzione)
  if (conAssi.length < 1) return;
  card.classList.remove('hidden');

  const sub = document.getElementById('pf-radar-sub');
  if (sub) {
    sub.textContent =
      (conAssi.length === 1) ? 'Questa è la tua prima fotografia. Rifai il test per vedere come evolvi nel tempo.' :
      (conAssi.length === 2) ? 'Confronto tra i tuoi ultimi 2 test. Con un altro test vedrai la traiettoria completa.' :
      'Come il tuo profilo si è mosso nei tuoi ultimi 3 test.';
  }

  const canvas = document.getElementById('pf-radar');
  if (!canvas || typeof Chart === 'undefined') return;

  const datasets = conAssi.map((r, i) => {
    const a = r.report_json.assi;
    const c = RADAR_COLORS[i] || RADAR_COLORS[RADAR_COLORS.length - 1];
    return {
      data: ASSI_FISSI.map(k => (typeof a[k] === 'number' ? a[k] : 0)),
      borderColor: c.border,
      backgroundColor: c.bg,
      pointBackgroundColor: c.border,
      borderWidth: 2,
      borderDash: c.dash,
      pointRadius: 2
    };
  });

  new Chart(canvas, {
    type: 'radar',
    data: { labels: ASSI_FISSI, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          suggestedMin: 0, suggestedMax: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: '#2c2c2a' },
          angleLines: { color: '#2c2c2a' },
          pointLabels: { color: '#A9C6B8', font: { size: 12 } }
        }
      },
      plugins: { legend: { display: false } }
    }
  });

  const legend = document.getElementById('pf-radar-legend');
  if (legend) {
    legend.innerHTML = conAssi.map((r, i) => {
      const c = RADAR_COLORS[i] || RADAR_COLORS[RADAR_COLORS.length - 1];
      const stile = c.dash.length ? 'dashed' : 'solid';
      const etichetta = (i === conAssi.length - 1) ? formatShort(r.created_at) + ' (attuale)' : formatShort(r.created_at);
      return '<span style="display:flex; align-items:center; gap:5px;">' +
        '<span style="width:14px; height:0; border-top:2px ' + stile + ' ' + c.border + ';"></span>' + etichetta + '</span>';
    }).join('');
  }
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
    REPORTS = reports;
    renderProfile(session, reports);
    setupBanco();
    setupCv();
  } catch (e) {
    console.error('Errore nel caricare i report:', e);
  }
}

document.addEventListener('DOMContentLoaded', init);
