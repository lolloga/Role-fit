// ─── PROFILO LAYOUT D (magic link) ───────────────────────────
import { getSession, signInWithMagicLink, signOut, listReports, getAccessToken, getProfile, uploadCv, saveCvPath } from './supabase.js';

// Il banco di prova mostra sia testo scritto dall'utente (il ruolo cercato)
// sia testo generato dall'AI: senza escaping, un payload HTML/script
// finirebbe nel DOM.
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
// settore è facoltativo: se presente, la valutazione deve giudicare il ruolo
// così come si vive IN QUEL settore (richiede livelli diversi delle stesse
// dimensioni), non filtrare in base a quali settori l'utente aveva indicato
// come "di interesse" nel test — sono due cose diverse, vedi PROMPT_COMPATIBILITA.
async function valutaRuoloControReport(ruoloInput, settore, report_json) {
  const sintesi = profiloSintesi(report_json);
  const settoreBlock = settore
    ? `Valuta il ruolo specificamente nel settore "${settore}" — lo stesso ruolo richiede pesi diversi sulle dimensioni a seconda del settore in cui si vive, non è lo stesso lavoro ovunque.`
    : '';
  const messages = [
    {
      role: 'user',
      content: `Questo è il profilo completo di un utente, emerso dal test RoleFit:\n\n${sintesi}\n\n` +
        `Valuta un ruolo di tipo ASPIRATO/DESIDERATO. L'utente vuole sapere quanto il ruolo "${ruoloInput}" è compatibile con il suo profilo. ${settoreBlock}\n` +
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
  const settoreSel = document.getElementById('banco-settore');
  const out = document.getElementById('banco-result');
  if (!btn || !input) return;

  const run = async () => {
    const ruolo = (input.value || '').trim();
    const settore = (settoreSel?.value || '').trim();
    if (!ruolo) return;
    if (!REPORTS.length) {
      out.innerHTML = '<p class="pcard-sub">Fai prima un test: serve almeno un profilo per valutare un ruolo.</p>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Valuto…';
    out.innerHTML = '<p class="pcard-sub" style="font-style:italic;">Sto confrontando "' + esc(ruolo) + '" con il tuo profilo…</p>';

    try {
      // Valuta sull'ultimo report (il più attuale) — risultato principale
      const last = REPORTS[0];
      const valLast = await valutaRuoloControReport(ruolo, settore, last.report_json);
      if (!valLast) throw new Error('Nessun risultato');

      const matchColor = valLast.match >= 80 ? '#5DCAA5' : valLast.match >= 55 ? '#5DCAA5' :
                         valLast.match >= 35 ? '#FFD060' : '#FF6496';

      let html =
        '<div class="pcard" style="margin-bottom:12px;">' +
          '<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">' +
            '<div><p class="pcard-label">Ruolo valutato</p>' +
            '<p class="pcard-title" style="font-size:19px;">' + esc(ruolo) + (settore ? ' <span style="font-size:13px; font-weight:normal; color:rgba(240,255,244,0.5);">— ' + esc(settore) + '</span>' : '') + '</p>' +
            '<p class="pcard-sub" style="color:#5DCAA5;">' + esc(valLast.titolo) + '</p></div>' +
            '<div style="text-align:right; flex-shrink:0;">' +
            '<p style="font-family:var(--font-display,Georgia),serif; font-size:34px; font-weight:300; color:' + matchColor + '; line-height:1; margin:0;">' + esc(valLast.match) + '%</p>' +
            '<p style="font-size:10px; color:rgba(240,255,244,0.35); text-transform:uppercase; letter-spacing:0.06em; margin:2px 0 0;">sull\'ultimo test</p></div>' +
          '</div>' +
          '<p class="pcard-sub" style="border-top:1px solid rgba(93,202,165,0.2); padding-top:12px; margin-top:14px;">' + esc(valLast.descrizione) + '</p>' +
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
          const v = await valutaRuoloControReport(ruolo, settore, REPORTS[i].report_json);
          if (v) righe.push({ data: REPORTS[i].created_at, match: v.match });
        }

        let trendHtml = '<p class="pcard-label" style="color:#F0FFF4; text-transform:none; font-size:13px; margin-bottom:10px;">Andamento nel tempo</p>';
        righe.forEach((r) => {
          trendHtml += '<div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.06);">' +
            '<span class="pcard-sub">' + esc(formatDate(r.data)) + '</span>' +
            '<span style="font-weight:bold; color:#5DCAA5;">' + esc(r.match) + '%</span></div>';
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

  // Storico (dentro la sezione)
  renderStorico(reports);

  // Panoramica: la costellazione sostituisce ultimo risultato + grafico nel
  // tempo + radar, tutto in un'unica visualizzazione.
  renderConstellation(reports);
}

const ASSI_FISSI = ['Analisi', 'Relazione', 'Creatività', 'Curiosità', 'Leadership', 'Metodo'];
const ASSI_COLORI = ['#5DCAA5', '#FF9FB8', '#FFD060', '#85C9EB', '#C79CF0', '#7FE0C0'];
const RUOLO_ANGOLI = [30, 150, 270];

// "bassa" pulsa/si affievolisce, "media" resta ferma ma più tenue, "alta" (o
// assente, per i report più vecchi salvati prima di questo campo) resta piena.
function confAmount(c) {
  return c === 'alta' ? 1 : c === 'media' ? 0.6 : c === 'bassa' ? 0.28 : 1;
}

// ─── COSTELLAZIONE (Panoramica) ────────────────────────────────
// Sostituisce il vecchio radar Chart.js + il grafico a barre "nel tempo":
// un unico cielo generativo, disegnato dai dati reali del profilo. Lo stato
// del canvas vive qui a livello di modulo perché renderConstellation() può
// essere richiamata più volte nella stessa sessione (es. dopo la
// rigenerazione via CV) — l'animazione e gli ascoltatori si avviano una
// sola volta, solo i dati si aggiornano.
const sky = {
  canvas: null, ctx: null,
  W: 0, H: 0, CX: 0, CY: 0,
  current: {}, currentConf: {}, target: {}, targetConf: {},
  morphFrom: {}, morphStart: 0,
  snapshots: [], activeSnapshot: -1,
  roles: [],
  hoveredRole: -1, openRole: -1,
  t: 0,
  started: false,
  reduceMotion: false,
};

function isMobileLayout() {
  return window.matchMedia('(max-width: 700px)').matches;
}

function skyResize() {
  const wrap = sky.canvas.parentElement;
  sky.W = wrap.clientWidth; sky.H = wrap.clientHeight;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  sky.canvas.width = sky.W * DPR; sky.canvas.height = sky.H * DPR;
  sky.canvas.style.width = sky.W + 'px'; sky.canvas.style.height = sky.H + 'px';
  sky.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  sky.CX = sky.W / 2; sky.CY = sky.H / 2;
}

function skyRadiusScale() { return Math.min(sky.W, sky.H) * 0.28; }
function skyRoleRadius() { return Math.min(sky.W, sky.H) * 0.44; }

function starPos(i, value) {
  const angle = (Math.PI * 2 * i) / ASSI_FISSI.length - Math.PI / 2;
  const r = 26 + (value / 100) * skyRadiusScale();
  return { x: sky.CX + Math.cos(angle) * r, y: sky.CY + Math.sin(angle) * r, angle };
}

function rolePos(angleDeg) {
  const angle = (angleDeg * Math.PI) / 180 - Math.PI / 2;
  const r = skyRoleRadius();
  return { x: sky.CX + Math.cos(angle) * r, y: sky.CY + Math.sin(angle) * r };
}

function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

// Il testo è centrato sul nodo, ma su schermi stretti i nodi vicini al bordo
// spingerebbero metà etichetta fuori dal canvas (il canvas taglia tutto ciò
// che è fuori dai suoi confini). Spostiamo l'ancora orizzontale quel tanto
// che basta perché l'etichetta resti sempre interamente visibile.
function fillClampedText(ctx, text, x, y, W, pad = 4) {
  const half = ctx.measureText(text).width / 2;
  let cx = x;
  if (cx - half < pad) cx = pad + half;
  if (cx + half > W - pad) cx = W - pad - half;
  ctx.fillText(text, cx, y);
}

function goToSnapshot(i) {
  if (i === sky.activeSnapshot || !sky.snapshots[i]) return;
  sky.activeSnapshot = i;
  sky.morphFrom = { ...sky.current };
  sky.target = { ...sky.snapshots[i].assi };
  sky.targetConf = { ...sky.snapshots[i].conf };
  sky.morphStart = performance.now();
  document.querySelectorAll('.timeline-point').forEach((el, idx) => el.classList.toggle('active', idx === i));
}

function skyFrame(now) {
  const { ctx, W, H, CX, CY } = sky;
  sky.t += 1;
  ctx.clearRect(0, 0, W, H);

  const p = sky.morphStart ? Math.min(1, (now - sky.morphStart) / 700) : 1;
  const e = easeOutCubic(p);
  ASSI_FISSI.forEach((k) => {
    sky.current[k] = (sky.morphFrom[k] ?? 0) + ((sky.target[k] ?? 0) - (sky.morphFrom[k] ?? 0)) * e;
    sky.currentConf[k] = sky.targetConf[k];
  });

  const corePulse = 1 + Math.sin(sky.t * 0.03) * 0.06;
  const coreR = 7 * corePulse;
  const grad = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreR * 6);
  grad.addColorStop(0, 'rgba(93,202,165,0.5)');
  grad.addColorStop(1, 'rgba(93,202,165,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(CX, CY, coreR * 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F0FFF4';
  ctx.beginPath(); ctx.arc(CX, CY, coreR, 0, Math.PI * 2); ctx.fill();

  const starPositions = ASSI_FISSI.map((k, i) => starPos(i, sky.current[k] ?? 0));
  ctx.strokeStyle = 'rgba(93,202,165,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  starPositions.forEach((pos, i) => { i === 0 ? ctx.moveTo(pos.x, pos.y) : ctx.lineTo(pos.x, pos.y); });
  ctx.closePath(); ctx.stroke();
  ctx.fillStyle = 'rgba(93,202,165,0.04)';
  ctx.fill();

  starPositions.forEach((pos) => {
    ctx.strokeStyle = 'rgba(93,202,165,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(pos.x, pos.y); ctx.stroke();
  });

  const small = W < 420;
  ASSI_FISSI.forEach((k, i) => {
    const pos = starPositions[i];
    const conf = confAmount(sky.currentConf[k]);
    const flicker = conf < 1 ? Math.sin(sky.t * 0.06 + i) * (1 - conf) * 0.4 : 0;
    const haloR = 11 + conf * 9 + flicker * 5;

    const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, haloR);
    g.addColorStop(0, ASSI_COLORI[i] + 'CC');
    g.addColorStop(1, ASSI_COLORI[i] + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, haloR, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = ASSI_COLORI[i];
    ctx.globalAlpha = 0.55 + conf * 0.45 - flicker * 0.3;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    const labelDist = small ? 20 : 25;
    const lx = pos.x + Math.cos(pos.angle) * labelDist;
    const ly = pos.y + Math.sin(pos.angle) * labelDist;
    ctx.font = (small ? '600 10px ' : '600 12px ') + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = 'rgba(240,255,244,0.75)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fillClampedText(ctx, k, lx, ly, W);
    ctx.font = (small ? '9px ' : '11px ') + 'ui-monospace, monospace';
    ctx.fillStyle = 'rgba(240,255,244,0.35)';
    fillClampedText(ctx, Math.round(sky.current[k] ?? 0) + '', lx, ly + (small ? 12 : 14), W);
  });

  sky.roles.forEach((r, i) => {
    const pos = rolePos(r.angle);
    const isHover = sky.hoveredRole === i || sky.openRole === i;
    const pulse = (Math.sin(sky.t * 0.025 + i * 2) + 1) / 2;
    const lineAlpha = (0.14 + pulse * 0.22) * (r.match / 100) + (isHover ? 0.35 : 0);

    ctx.strokeStyle = `rgba(255,100,150,${lineAlpha})`;
    ctx.lineWidth = isHover ? 2 : 1.2;
    ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(pos.x, pos.y); ctx.stroke();

    const rr = isHover ? 8 : 5.5;
    const g2 = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, rr * 3);
    g2.addColorStop(0, `rgba(255,100,150,${isHover ? 0.55 : 0.35})`);
    g2.addColorStop(1, 'rgba(255,100,150,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, rr * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFB8C6';
    ctx.beginPath(); ctx.arc(pos.x, pos.y, rr * 0.4, 0, Math.PI * 2); ctx.fill();

    ctx.font = (isHover ? '600 ' : '') + (small ? '10px ' : '12px ') + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = isHover ? '#FFB8C6' : 'rgba(240,255,244,0.55)';
    ctx.textAlign = 'center';
    const below = Math.sin((r.angle * Math.PI) / 180) >= 0;
    const labelY = pos.y + (below ? (small ? 18 : 22) : (small ? -13 : -16));
    fillClampedText(ctx, r.nome, pos.x, labelY, W);
    ctx.font = (small ? '9px ' : '11px ') + 'ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,100,150,0.7)';
    fillClampedText(ctx, r.match + '%', pos.x, labelY + (below ? (small ? 12 : 15) : (small ? -12 : -15)), W);
  });

  sky.canvas._roleHitboxes = sky.roles.map((r, i) => ({ ...rolePos(r.angle), i }));

  if (!sky.reduceMotion) requestAnimationFrame(skyFrame);
}

function skyPointFromEvent(e) {
  const rect = sky.canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function skyNearestRole(pt) {
  const boxes = sky.canvas._roleHitboxes || [];
  // Su touch il bersaglio deve essere più grande: un dito è molto meno
  // preciso di un cursore, senza questo toccare un ruolo su mobile sarebbe frustrante.
  const threshold = isMobileLayout() ? 40 : 24;
  let best = -1, bestD = threshold;
  boxes.forEach((b) => {
    const d = Math.hypot(b.x - pt.x, b.y - pt.y);
    if (d < bestD) { bestD = d; best = b.i; }
  });
  return best;
}

function openRolePanel(i) {
  sky.openRole = i;
  const r = sky.roles[i];
  if (!r) return;
  const panel = document.getElementById('rolePanel');
  const hint = document.getElementById('skyHint');

  document.getElementById('rpName').textContent = r.nome;
  document.getElementById('rpPct').textContent = (typeof r.match === 'number') ? r.match + '%' : '—';
  document.getElementById('rpPerche').textContent = r.perche || '—';
  document.getElementById('rpSorpresa').textContent = r.sorpresa || '—';

  if (isMobileLayout()) {
    panel.classList.add('mobile-sheet');
    panel.style.left = ''; panel.style.top = ''; panel.style.right = ''; panel.style.bottom = '';
  } else {
    panel.classList.remove('mobile-sheet');
    const pos = rolePos(r.angle);
    let left = pos.x + 24, top = pos.y - 20;
    if (left + 320 > sky.W) left = pos.x - 344;
    if (left < 0) left = 8;
    if (top + 190 > sky.H) top = sky.H - 200;
    if (top < 0) top = 10;
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }
  panel.classList.add('show');
  if (hint) hint.style.opacity = '0';
}

function closeRolePanel() {
  sky.openRole = -1;
  const panel = document.getElementById('rolePanel');
  const hint = document.getElementById('skyHint');
  if (panel) panel.classList.remove('show');
  if (hint) hint.style.opacity = '0.8';
}

// Ascoltatori e animazione si avviano una sola volta per pagina.
function startSkyOnce() {
  if (sky.started) return;
  sky.canvas = document.getElementById('sky');
  if (!sky.canvas) return;
  sky.ctx = sky.canvas.getContext('2d');
  sky.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  sky.started = true;

  window.addEventListener('resize', skyResize);
  skyResize();

  sky.canvas.addEventListener('mousemove', (e) => {
    const pt = skyPointFromEvent(e);
    sky.hoveredRole = skyNearestRole(pt);
    sky.canvas.style.cursor = sky.hoveredRole >= 0 ? 'pointer' : 'default';
  });
  sky.canvas.addEventListener('click', (e) => {
    const pt = skyPointFromEvent(e);
    const hit = skyNearestRole(pt);
    if (hit >= 0) openRolePanel(hit); else closeRolePanel();
  });

  const closeBtn = document.getElementById('rpClose');
  if (closeBtn) closeBtn.addEventListener('click', closeRolePanel);

  requestAnimationFrame(skyFrame);
  if (sky.reduceMotion) setTimeout(() => skyFrame(performance.now()), 30);
}

function renderConstellation(reports) {
  const emptyEl = document.getElementById('pf-empty');
  const wrapEl = document.getElementById('pf-constellation');
  if (!emptyEl || !wrapEl) return;

  const conAssi = reports
    .filter(r => r.report_json && r.report_json.assi && typeof r.report_json.assi === 'object')
    .slice(0, 3)
    .reverse(); // dal più vecchio al più recente

  if (conAssi.length < 1) {
    emptyEl.classList.remove('hidden');
    wrapEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  wrapEl.classList.remove('hidden');

  startSkyOnce();
  if (!sky.canvas) return;

  sky.snapshots = conAssi.map((r) => ({
    data: formatShort(r.created_at),
    assi: r.report_json.assi,
    conf: r.report_json.assi_confidenza || {},
  }));

  const latest = conAssi[conAssi.length - 1].report_json;
  sky.roles = (Array.isArray(latest.ruoli) ? latest.ruoli.slice(0, 3) : []).map((r, i) => ({
    nome: r?.nome || 'Ruolo', match: (typeof r?.match === 'number') ? r.match : 0,
    perche: r?.perche || '', sorpresa: r?.sorpresa || '',
    angle: RUOLO_ANGOLI[i] ?? (i * 40),
  }));

  const subEl = document.getElementById('cnst-sub');
  if (subEl) {
    subEl.textContent = conAssi.length === 1
      ? 'Questa è la tua prima fotografia. Rifai il test per iniziare a viaggiare nel tempo.'
      : 'Ogni punto è una dimensione di come funzioni. Tocca un ruolo, o viaggia nel tempo.';
  }

  const haBassa = sky.snapshots.some((s) => ASSI_FISSI.some((k) => s.conf[k] === 'bassa'));
  const nota = document.getElementById('cnst-nota');
  if (nota) nota.classList.toggle('hidden', !haBassa);

  const legend = document.getElementById('cnst-legend');
  if (legend) {
    legend.innerHTML = ASSI_FISSI.map((k, i) =>
      `<span><span class="legend-dot" style="background:${ASSI_COLORI[i]};"></span>${k}</span>`
    ).join('');
  }

  const timelineEl = document.getElementById('cnst-timeline');
  if (timelineEl) {
    timelineEl.innerHTML = '';
    sky.activeSnapshot = -1;
    sky.snapshots.forEach((s, i) => {
      if (i > 0) {
        const track = document.createElement('div');
        track.className = 'timeline-track';
        timelineEl.appendChild(track);
      }
      const btn = document.createElement('button');
      btn.className = 'timeline-point';
      btn.innerHTML = `<span class="timeline-dot"></span><span class="timeline-label">${esc(s.data)}${i === sky.snapshots.length - 1 ? ' (oggi)' : ''}</span>`;
      btn.addEventListener('click', () => goToSnapshot(i));
      timelineEl.appendChild(btn);
    });
  }

  // Parte già "posizionata" sull'ultimo snapshot, senza animazione di morph
  // al primo caricamento (il morph si vede solo quando l'utente naviga nel
  // tempo, non quando la pagina si apre).
  const lastIdx = sky.snapshots.length - 1;
  sky.current = { ...sky.snapshots[lastIdx].assi };
  sky.currentConf = { ...sky.snapshots[lastIdx].conf };
  sky.target = { ...sky.current };
  sky.targetConf = { ...sky.currentConf };
  sky.morphFrom = { ...sky.current };
  sky.morphStart = 0;
  sky.activeSnapshot = lastIdx;
  document.querySelectorAll('.timeline-point').forEach((el, idx) => el.classList.toggle('active', idx === lastIdx));
  closeRolePanel();
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
      '<div class="st-card-top"><p class="st-date">' + esc(formatDate(r.created_at)) + '</p>' + badge + '</div>' +
      '<p class="st-roles">' + esc(rolesLine(r.report_json)) + '</p>' +
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
