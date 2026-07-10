import { getSession, signInWithMagicLink, getAccessToken, saveReport, updateReportEval, getReport, createDraft, claimDraft, deleteDraft, getProfile, uploadCv, saveCvPath, getHistoricalProfile } from './supabase.js';
import './feedback.js'; // [feedback] carica la sezione feedback (si attiva via evento 'rf-report-shown')

// id del report salvato su Supabase per la sessione corrente (null finché non salvato).
// Serve per ri-persistere le valutazioni ruolo attuale/aspirato calcolate dopo.
let currentReportId = null;

// Il testo dei report è generato dall'AI a partire anche da risposte libere
// dell'utente: senza escaping, un payload HTML/script infilato in una
// risposta aperta potrebbe finire nel DOM via innerHTML. Usata ovunque un
// campo del report entri in un template string invece che via textContent.
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Tempo massimo di attesa della chiamata di generazione: senza questo, una
// richiesta che si blocca lato server (o una rete che non risponde più)
// lascia l'utente a guardare l'animazione di caricamento all'infinito, senza
// mai vedere un errore né la possibilità di riprovare. Il valore è alto
// apposta: la generazione del report può impiegare più di un minuto quando
// il modello è più lento del solito, e in quei casi va comunque a buon
// fine — un limite troppo stretto interromperebbe generazioni che
// altrimenti sarebbero riuscite.
const GENERATE_TIMEOUT_MS = 120000;

// Riassunto compatto dello storico dei test precedenti (assi, ruoli
// suggeriti, ultima narrazione "come funzioni", ruolo attuale/aspirato
// dichiarato) da passare al modello per il report — stessa logica usata in
// test.js per le domande adattive, qui per rendere il report stesso più
// preciso e personale a partire dal secondo test. Solo dati derivati, mai
// le risposte grezze di ogni test passato: resta leggero anche con molti
// test alle spalle.
function buildHistoricalSummary(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const chrono = [...history].reverse(); // dal più vecchio al più recente

  const righe = chrono.map((r) => {
    const data = new Date(r.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    const assi = r.report_json?.assi;
    const ruoli = (r.report_json?.ruoli || []).map((x) => `${x.nome} (${x.match}%)`).join(', ');
    return `- Test del ${data}: assi ${assi ? JSON.stringify(assi) : 'n/d'}. Ruoli suggeriti: ${ruoli || 'n/d'}.`;
  }).join('\n');

  const latest = chrono[chrono.length - 1];
  const comeFunzioni = latest?.report_json?.chi_sei?.come_funzioni || null;
  const ruoloAttuale = latest?.current_role_eval?._input || null;
  const aspirazione = latest?.aspiration || null;

  let extra = '';
  if (comeFunzioni) extra += `\n\nCosa avevamo capito di questa persona l'ultima volta (dal blocco "Come funzioni" del report più recente): "${comeFunzioni}"`;
  if (ruoloAttuale) extra += `\n\nRuolo attuale dichiarato dalla persona: "${ruoloAttuale}".`;
  if (aspirazione) extra += `\nRuolo a cui aspira: "${aspirazione}".`;

  return `Storico dei test precedenti di questa persona (dal più vecchio al più recente):\n${righe}${extra}`;
}

// Recupera lo storico dei test precedenti (per il confronto longitudinale
// e la personalizzazione crescente del report) e, se già caricato, un
// estratto del CV. Nessun errore qui deve mai bloccare la generazione del
// nuovo report — in caso di dubbio, niente contesto extra, il report si
// genera comunque come sempre.
async function fetchCumulativeContext() {
  let summary = null;
  let cvText = null;
  try {
    const session = await getSession();
    if (!session) return { summary, cvText };
    try {
      const history = await getHistoricalProfile();
      summary = buildHistoricalSummary(history);
    } catch (e) {
      console.error('Recupero storico dei test precedenti fallito:', e);
    }
    try {
      const profile = await getProfile();
      if (profile?.cv_path) {
        const token = await getAccessToken();
        const res = await fetch('/api/cv-context', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          cvText = data?.text || null;
        }
      }
    } catch (e) {
      console.error('Recupero contesto CV fallito:', e);
    }
  } catch (e) {
    console.error('Controllo storico/CV fallito:', e);
  }
  return { summary, cvText };
}

// ─── GENERA REPORT ───────────────────────────────────────────
async function generateReport(cumulativeContext) {
  const history = JSON.parse(localStorage.getItem('rf_history') || '[]');
  const activities = JSON.parse(localStorage.getItem('rf_activities') || '{}');

  const activitiesSummary = Object.entries(activities)
    .map(([k, v]) => `Attività "${k}": ${JSON.stringify(v)}`)
    .join('\n');

  const priorParts = [];
  if (cumulativeContext?.summary) {
    priorParts.push(`${cumulativeContext.summary}\n\nUsa questo storico secondo le istruzioni già ricevute sul confronto longitudinale e sulla personalizzazione crescente del report.`);
  }
  if (cumulativeContext?.cvText) {
    priorParts.push(`Il candidato ha già caricato il proprio CV sul profilo RoleFit. Ecco un estratto testuale (possibili imperfezioni di formattazione dovute all'estrazione automatica):\n\n"""\n${cumulativeContext.cvText}\n"""\n\nUsalo secondo le istruzioni già ricevute su come trattare il CV nel report.`);
  }
  const priorBlock = priorParts.length ? `\n\n${priorParts.join('\n\n---\n\n')}` : '';

  const messages = [
    ...history,
    {
      role: 'user',
      content: `Il test è completato. Genera il report finale.\n\nRiepilogo attività interattive:\n${activitiesSummary}${priorBlock}\n\nGenera il report completo in JSON.`
    }
  ];

  const token = await getAccessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch('/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages, fase: 'report' }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('La generazione sta impiegando troppo tempo. Ricarica la pagina per riprovare.');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json();

  if (!data.content || !data.content[0] || !data.content[0].text) {
    throw new Error('Risposta API vuota o non valida');
  }

  const text = data.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.substring(start, end + 1));
      } catch {
        const cleaned = text.substring(start, end + 1)
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        try {
          return JSON.parse(cleaned);
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}

// ─── VALUTA RUOLO ATTUALE ─────────────────────────────────────
async function valutaRuoloAttuale(ruoloInput) {
  const report = JSON.parse(sessionStorage.getItem('rf_report') || '{}');
  const history = JSON.parse(localStorage.getItem('rf_history') || '[]');

  const messages = [
    ...history,
    {
      role: 'user',
      content: `Valuta un ruolo di tipo ATTUALE. L'utente lavora attualmente come: "${ruoloInput}".

Basandoti sul profilo emerso dal test e sui 3 ruoli suggeriti nel report (${report.ruoli?.map(r => r.nome).join(', ')}), valuta la compatibilità tra il ruolo attuale e il profilo dell'utente.

Ricorda: è il ruolo che ricopre ORA. Sii onesto e concreto su cosa funziona, cosa manca o logora, dove potrebbe portare.`
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

  const data = await response.json();

  if (!data.content || !data.content[0] || !data.content[0].text) {
    return null;
  }

  const text = data.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.substring(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── VALUTA RUOLO ASPIRATO ────────────────────────────────────
async function valutaRuoloAspirato(ruoloInput) {
  const report = JSON.parse(sessionStorage.getItem('rf_report') || '{}');
  const history = JSON.parse(localStorage.getItem('rf_history') || '[]');

  const messages = [
    ...history,
    {
      role: 'user',
      content: `Valuta un ruolo di tipo ASPIRATO. L'utente, alla fine del test, ha dichiarato che con la sua esperienza aspira a questo ruolo: "${ruoloInput}".

Basandoti sul profilo emerso dal test e sui 3 ruoli suggeriti nel report (${report.ruoli?.map(r => r.nome).join(', ')}), valuta quanto questo ruolo aspirato è compatibile con il profilo dell'utente.

Ricorda: è un SOGNO/ASPIRAZIONE della persona. Non sminuirlo mai. Se il match è alto, conferma con entusiasmo che la sua intuizione su se stesso è validata dal test. Se è medio o basso, spiega con cura cosa di lui si rispecchia in quel ruolo e cosa invece potrebbe frustrarlo, senza mai farlo sentire in errore per averlo desiderato.`
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

  const data = await response.json();

  if (!data.content || !data.content[0] || !data.content[0].text) {
    return null;
  }

  const text = data.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.substring(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── RENDER BLOCCO RUOLO ASPIRATO ─────────────────────────────
function renderRuoloAspirato(ruoloInput, data) {
  const container = document.getElementById('ruolo-aspirato-container');
  if (!container || !data) return;

  const altaPrecisione = data.alta_precisione === true || data.match >= 80;

  const matchColor = data.match >= 80 ? 'var(--emerald-light)' :
                     data.match >= 55 ? 'var(--emerald-light)' :
                     data.match >= 35 ? '#FFD060' : 'var(--rose)';

  const wrapper = document.createElement('div');
  wrapper.className = 'card';
  wrapper.style.marginTop = '12px';

  if (altaPrecisione) {
    wrapper.style.border = '1px solid rgba(29,158,117,0.5)';
    wrapper.style.background = 'rgba(29,158,117,0.06)';
  }

  const badgeHtml = altaPrecisione
    ? `<div style="display:inline-flex;align-items:center;gap:6px;font-size:0.72rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--emerald-light);background:rgba(29,158,117,0.14);border:1px solid rgba(29,158,117,0.35);border-radius:999px;padding:4px 12px;margin-bottom:14px;">✓ Il test ha colto la tua direzione</div>`
    : '';

  wrapper.innerHTML = `
    ${badgeHtml}
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px;">
      <div>
        <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Il ruolo a cui aspiri</div>
        <div style="font-family:var(--font-display);font-size:1.3rem;color:var(--text-primary);">${esc(ruoloInput)}</div>
        <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:4px;">${esc(data.titolo) || ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:var(--font-display);font-size:2.4rem;font-weight:300;color:${matchColor};line-height:1;">${esc(data.match)}%</div>
        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">compatibilità</div>
      </div>
    </div>
    <div style="font-size:0.92rem;color:var(--text-secondary);line-height:1.75;border-top:1px solid var(--card-border);padding-top:14px;">${esc(data.descrizione) || ''}</div>
    ${altaPrecisione ? `<div style="font-size:0.82rem;color:var(--emerald-light);line-height:1.6;margin-top:14px;font-style:italic;">Avevi già in mente la direzione giusta: il profilo emerso dal test e il ruolo a cui aspiri combaciano in modo netto. È la conferma che ti conosci bene.</div>` : ''}
  `;

  container.appendChild(wrapper);
}

// ─── RENDER REPORT ───────────────────────────────────────────
function renderReport(data, { savedView = false } = {}) {
  const report = data.report;

  const chiSeiEl = document.getElementById('chi-sei-text');
  ['come_funzioni', 'cosa_ti_alimenta', 'di_cosa_hai_bisogno'].forEach(key => {
    if (report.chi_sei[key]) {
      const p = document.createElement('p');
      p.textContent = report.chi_sei[key];
      chiSeiEl.appendChild(p);
    }
  });

  const ruoliEl = document.getElementById('ruoli-list');
  report.ruoli.forEach((ruolo) => {
    const card = document.createElement('div');
    card.className = 'ruolo-card';

    let settoriHtml = '';
    if (Array.isArray(ruolo.settori) && ruolo.settori.length > 0) {
      const items = ruolo.settori
        .filter(s => s && s.nome)
        .map(s => {
          let aziendeHtml = '';
          if (Array.isArray(s.aziende) && s.aziende.length > 0) {
            const tags = s.aziende
              .filter(a => a && a.trim())
              .map(a => `<span style="display:inline-block;font-size:0.74rem;color:var(--text-secondary);background:var(--deep);border:1px solid var(--card-border);border-radius:6px;padding:2px 9px;margin:3px 4px 0 0;">${esc(a)}</span>`)
              .join('');
            if (tags) {
              aziendeHtml = `<div style="margin-top:6px;"><span style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Esempi di realtà</span><div style="margin-top:3px;">${tags}</div></div>`;
            }
          }
          return `
          <div style="margin-bottom:12px;">
            <span style="display:inline-block;font-size:0.78rem;font-weight:600;color:var(--emerald-light);background:rgba(29,158,117,0.12);border:1px solid rgba(29,158,117,0.3);border-radius:999px;padding:3px 12px;margin-bottom:6px;">${esc(s.nome)}</span>
            <div class="ruolo-detail-text" style="margin-top:2px;">${esc(s.declinazione) || ''}</div>
            ${aziendeHtml}
          </div>`;
        })
        .join('');
      if (items) {
        settoriHtml = `
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Dove brilla per te</div>
        ${items}
        <div style="font-size:0.72rem;color:var(--text-muted);font-style:italic;margin-top:8px;">Esempi orientativi per darti un punto di partenza — verifica sempre le posizioni effettivamente aperte.</div>
      </div>`;
      }
    }

    card.innerHTML = `
      <div class="ruolo-header">
        <div class="ruolo-nome">${esc(ruolo.nome)}</div>
        <div class="ruolo-match">
          <span class="ruolo-match-number">${esc(ruolo.match)}%</span>
          <span class="ruolo-match-label">compatibilità</span>
        </div>
      </div>
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Perché ti si addice</div>
        <div class="ruolo-detail-text">${esc(ruolo.perche)}</div>
      </div>
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Cosa fa davvero</div>
        <div class="ruolo-detail-text">${esc(ruolo.cosa_fa)}</div>
      </div>${settoriHtml}
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Come si entra</div>
        <div class="ruolo-detail-text">${esc(ruolo.come_si_entra)}</div>
      </div>
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Una cosa che non ti aspetti</div>
        <div class="ruolo-detail-text">${esc(ruolo.sorpresa)}</div>
      </div>
    `;
    ruoliEl.appendChild(card);
  });

  const bonusEl = document.getElementById('bonus-card');
  bonusEl.innerHTML = `
    <div class="bonus-eyebrow">Il ruolo che non ti aspetti</div>
    <div class="bonus-nome">${esc(report.bonus.nome)}</div>
    <div class="bonus-testo">${esc(report.bonus.testo)}</div>
  `;

  if (report.ruoli_mismatch && report.ruoli_mismatch.length > 0) {
    const mismatchSection = document.getElementById('section-mismatch');
    if (mismatchSection) {
      mismatchSection.classList.remove('hidden');
      const mismatchList = document.getElementById('mismatch-list');
      report.ruoli_mismatch.forEach(ruolo => {
        const card = document.createElement('div');
        card.className = 'ruolo-card';
        card.innerHTML = `
          <div class="ruolo-header">
            <div class="ruolo-nome">${esc(ruolo.nome)}</div>
            <div class="ruolo-match">
              <span class="ruolo-match-number" style="color:var(--text-muted);">${esc(ruolo.match)}%</span>
              <span class="ruolo-match-label">compatibilità</span>
            </div>
          </div>
          <div class="ruolo-detail">
            <div class="ruolo-detail-label" style="color:var(--rose);opacity:1;">Perché non fa per te</div>
            <div class="ruolo-detail-text">${esc(ruolo.perche_no)}</div>
          </div>
        `;
        mismatchList.appendChild(card);
      });
    }
  }

  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('report-content').classList.remove('hidden');

  sessionStorage.setItem('rf_report', JSON.stringify(report));

  if (report.assi) renderNextSky(report.assi);
  setupNextCv();

  if (savedView) return;

  const worksCurrently = checkWorksCurrently();
  const aspirato = (localStorage.getItem('rf_aspiration') || '').trim();

  const section = document.getElementById('section-ruolo-attuale');
  const formWrapper = document.getElementById('ruolo-attuale-wrapper');
  const titolo = document.getElementById('ruolo-attuale-titolo');
  const intro = document.getElementById('ruolo-attuale-intro');

  if (section) {
    if (worksCurrently || aspirato) {
      section.classList.remove('hidden');

      if (worksCurrently) {
        if (formWrapper) formWrapper.classList.remove('hidden');
      } else {
        if (formWrapper) formWrapper.classList.add('hidden');
        if (titolo) titolo.textContent = 'Il ruolo a cui aspiri';
        if (intro) intro.textContent = 'Hai indicato un ruolo a cui aspiri. Ecco quanto è compatibile con il profilo emerso dal test.';
      }
    }
  }

  if (aspirato) {
    mostraRuoloAspirato(aspirato);
  }
}

// ─── PROSSIMI PASSI: mini costellazione + upload CV rapido ───────
// Stessa idea grafica della costellazione di account.js, in scala ridotta:
// qui l'obiettivo non è esplorare, solo far intuire che il profilo esiste
// ed è vivo, nel punto della pagina dove l'attenzione è già.
const ASSI_FISSI_MINI = ['Analisi', 'Relazione', 'Creatività', 'Curiosità', 'Leadership', 'Metodo'];
const ASSI_COLORI_MINI = ['#5DCAA5', '#FF9FB8', '#FFD060', '#85C9EB', '#C79CF0', '#7FE0C0'];

function renderNextSky(assi) {
  const canvas = document.getElementById('next-sky');
  if (!canvas || !assi || canvas.dataset.started) return;
  canvas.dataset.started = '1';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  let t = 0;
  function frame() {
    const W = canvas.width / dpr, H = canvas.height / dpr;
    const CX = W / 2, CY = H / 2;
    ctx.clearRect(0, 0, W, H);
    t += 1;

    const coreR = 4 * (1 + Math.sin(t * 0.03) * 0.08);
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreR * 6);
    g.addColorStop(0, 'rgba(93,202,165,0.5)'); g.addColorStop(1, 'rgba(93,202,165,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, coreR * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F0FFF4'; ctx.beginPath(); ctx.arc(CX, CY, coreR, 0, Math.PI * 2); ctx.fill();

    const R = Math.min(W, H) * 0.36;
    const pts = ASSI_FISSI_MINI.map((k, i) => {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const val = (typeof assi[k] === 'number') ? assi[k] : 0;
      const r = 8 + (val / 100) * R;
      return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r };
    });
    ctx.strokeStyle = 'rgba(93,202,165,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(93,202,165,0.05)'; ctx.fill();

    pts.forEach((p, i) => {
      const pulse = reduceMotion ? 0 : Math.sin(t * 0.05 + i) * 0.5 + 0.5;
      const haloR = 4 + pulse * 2.5;
      const hg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
      hg.addColorStop(0, ASSI_COLORI_MINI[i] + 'CC'); hg.addColorStop(1, ASSI_COLORI_MINI[i] + '00');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ASSI_COLORI_MINI[i]; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
    });

    if (!reduceMotion) requestAnimationFrame(frame);
  }
  frame();
}

// Upload del CV direttamente dal report, così chi legge il report può
// caricarlo senza prima dover scoprire che esiste una sezione profilo.
// Stessa logica di setupCv() in account.js (carica + rigenera il report
// alla luce del CV), ma senza portare via l'utente dalla pagina: il report
// aggiornato resta un link cliccabile quando vuole, non una redirezione forzata.
async function setupNextCv() {
  const btn = document.getElementById('next-cv-btn');
  const input = document.getElementById('next-cv-input');
  const errEl = document.getElementById('next-cv-error');
  const doneEl = document.getElementById('next-cv-done');
  const doneLink = document.getElementById('next-cv-done-link');
  const statusEl = document.getElementById('next-cv-status');
  const heading = document.getElementById('next-cv-heading');
  const body = document.getElementById('next-cv-body');
  if (!btn || !input || btn.dataset.bound) return;
  btn.dataset.bound = '1';

  try {
    const profile = await getProfile();
    if (profile?.cv_path) {
      btn.textContent = 'Aggiorna il CV';
      if (heading) heading.textContent = 'Hai già un CV su RoleFit.';
      if (body) body.textContent = 'Puoi caricarne uno nuovo in qualsiasi momento: rigeneriamo il report tenendo conto anche di quello.';
      if (statusEl) statusEl.textContent = '';
    }
  } catch (e) {
    console.error('Errore nel leggere lo stato del CV:', e);
  }

  btn.addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    errEl.classList.add('hidden');
    doneEl.classList.add('hidden');

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
    if (statusEl) statusEl.textContent = 'Sto caricando il CV...';

    try {
      const path = await uploadCv(file);
      await saveCvPath(path);

      if (statusEl) statusEl.textContent = 'Sto rileggendo il tuo profilo alla luce del CV...';

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

      if (statusEl) statusEl.textContent = '';
      doneLink.href = 'report.html?id=' + data.report_id;
      doneEl.classList.remove('hidden');
      btn.textContent = 'Aggiorna il CV';
    } catch (e) {
      console.error('Errore caricamento CV:', e);
      if (statusEl) statusEl.textContent = '';
      errEl.textContent = 'Qualcosa è andato storto. Riprova tra poco.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });
}

// ─── ORCHESTRA IL BLOCCO ASPIRATO (async, non blocca il report) ──
async function mostraRuoloAspirato(ruoloInput) {
  const container = document.getElementById('ruolo-aspirato-container');
  if (!container) return;

  const loader = document.createElement('div');
  loader.className = 'card';
  loader.style.marginTop = '12px';
  loader.id = 'aspirato-loader';
  loader.innerHTML = `
    <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Il ruolo a cui aspiri</div>
    <div style="font-family:var(--font-display);font-size:1.3rem;color:var(--text-primary);">${esc(ruoloInput)}</div>
    <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:10px;font-style:italic;">Sto confrontando questo ruolo con il tuo profilo...</div>
  `;
  container.appendChild(loader);

  try {
    const data = await valutaRuoloAspirato(ruoloInput);
    loader.remove();
    if (data) {
      renderRuoloAspirato(ruoloInput, data);
      if (currentReportId) {
        updateReportEval(currentReportId, { aspired_role_eval: data }).catch(() => {});
      }
    }
  } catch (err) {
    const l = document.getElementById('aspirato-loader');
    if (l) l.remove();
  }
}

// ─── CONTROLLA SE LAVORA ──────────────────────────────────────
function checkWorksCurrently() {
  const history = JSON.parse(localStorage.getItem('rf_history') || '[]');
  const opzioniLavoro = [
    'Ho iniziato a lavorare ma non sono sicuro che sia la strada giusta',
    'Lavoro da anni ma sento che qualcosa non torna',
    'Sto facendo un lavoro che mi piace, ma cerco conferma'
  ];
  return history.some(msg =>
    msg.role === 'user' &&
    typeof msg.content === 'string' &&
    opzioniLavoro.some(opt => msg.content.includes(`Risposta: "${opt}`))
  );
}

// ─── RENDER RISULTATO RUOLO ATTUALE ───────────────────────────
function renderRuoloAttualeResult(val, data) {
  const risultato = document.getElementById('ruolo-attuale-risultato');
  if (!risultato) return;

  const matchColor = data.match >= 70 ? 'var(--emerald-light)' :
                     data.match >= 45 ? '#FFD060' : 'var(--rose)';

  risultato.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px;">
      <div>
        <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Il tuo ruolo attuale</div>
        <div style="font-family:var(--font-display);font-size:1.3rem;color:var(--text-primary);">${esc(val)}</div>
        <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:4px;">${esc(data.titolo) || ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:var(--font-display);font-size:2.4rem;font-weight:300;color:${matchColor};line-height:1;">${esc(data.match)}%</div>
        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">compatibilità</div>
      </div>
    </div>
    <div style="font-size:0.92rem;color:var(--text-secondary);line-height:1.75;border-top:1px solid var(--card-border);padding-top:14px;">${esc(data.descrizione) || ''}</div>
  `;
  risultato.classList.remove('hidden');
}

// ─── SUBMIT RUOLO ATTUALE ─────────────────────────────────────
async function submitRuoloAttuale() {
  const input = document.getElementById('ruolo-attuale-input');
  const val = input?.value.trim();
  if (!val) return;

  const btn = document.getElementById('ruolo-attuale-btn');

  btn.textContent = 'Analizzo...';
  btn.disabled = true;

  try {
    const data = await valutaRuoloAttuale(val);
    if (!data) throw new Error('Nessun risultato');

    if (currentReportId) {
      updateReportEval(currentReportId, { current_role_eval: { ...data, _input: val } }).catch(() => {});
    }

    renderRuoloAttualeResult(val, data);

    document.getElementById('ruolo-attuale-form').classList.add('hidden');

  } catch (err) {
    btn.textContent = 'Riprova';
    btn.disabled = false;
  }
}

// ─── CONDIVIDI ────────────────────────────────────────────────
function shareReport() {
  const report = JSON.parse(sessionStorage.getItem('rf_report') || '{}');
  if (!report.ruoli) return;

  const text = `Ho fatto il test RoleFit 🎯\n\nI miei 3 ruoli:\n${report.ruoli.map(r => `• ${r.nome} (${r.match}%)`).join('\n')}\n\nRuolo bonus: ${report.bonus?.nome}\n\nScopri il tuo → role-fit-beta.vercel.app`;

  if (navigator.share) {
    navigator.share({ text });
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert('Testo copiato! Incollalo dove vuoi condividerlo.');
    });
  }
}

// ─── RESTART ─────────────────────────────────────────────────
function restartTest() {
  localStorage.removeItem('rf_state');
  localStorage.removeItem('rf_history');
  localStorage.removeItem('rf_activities');
  localStorage.removeItem('rf_aspiration');
  localStorage.removeItem('rf_report_saved');
  sessionStorage.removeItem('rf_report');
  window.location.href = 'test.html';
}

// ─── GATE MAGIC LINK ──────────────────────────────────────────
function showAuthGate() {
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('auth-gate').classList.remove('hidden');

  const btn = document.getElementById('auth-btn');
  const emailInput = document.getElementById('auth-email');
  const errEl = document.getElementById('auth-error');
  const form = document.getElementById('auth-form');
  const sent = document.getElementById('auth-sent');

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

    const fail = () => {
      btn.disabled = false;
      btn.textContent = 'Inviami il link →';
      errEl.textContent = 'Qualcosa è andato storto. Riprova tra poco.';
      errEl.classList.remove('hidden');
    };

    // Salviamo gli input del test come bozza: il suo id va nel link, così i dati
    // tornano anche se il magic link si apre in un'altra scheda/browser.
    let draftId = null;
    try {
      const history = JSON.parse(localStorage.getItem('rf_history') || 'null');
      const activities = JSON.parse(localStorage.getItem('rf_activities') || 'null');
      const aspiration = (localStorage.getItem('rf_aspiration') || '').trim() || null;
      if (history) {
        const draft = await createDraft({ history, activities, aspiration });
        draftId = draft.id;
      }
    } catch (e) {
      console.error('Creazione bozza fallita:', e);
      return fail();
    }

    const { error } = await signInWithMagicLink(email, 'report.html', draftId);
    if (error) return fail();

    form.classList.add('hidden');
    sent.classList.remove('hidden');
  };

  btn.addEventListener('click', submit);
  emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => emailInput.focus(), 100);
}

function showLoadingError(msg) {
  stopLoadingTimer();
  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('loading-state').classList.remove('hidden');
  const p = document.getElementById('loading-text');
  if (p) p.textContent = msg;
}

// ─── RIVEDI UN REPORT SALVATO (report.html?id=...) ────────────
function renderSavedReport(row) {
  renderReport({ report: row.report_json }, { savedView: true });

  const cur = row.current_role_eval;
  const asp = row.aspired_role_eval;
  const aspInput = (row.aspiration || '').trim();

  if (!cur && !(asp && aspInput)) return;

  const section = document.getElementById('section-ruolo-attuale');
  const formWrapper = document.getElementById('ruolo-attuale-wrapper');
  const form = document.getElementById('ruolo-attuale-form');
  const titolo = document.getElementById('ruolo-attuale-titolo');
  const intro = document.getElementById('ruolo-attuale-intro');

  if (section) section.classList.remove('hidden');

  if (cur) {
    if (formWrapper) formWrapper.classList.remove('hidden');
    if (form) form.classList.add('hidden');
    renderRuoloAttualeResult(cur._input || 'Il tuo ruolo attuale', cur);
  } else {
    if (formWrapper) formWrapper.classList.add('hidden');
    if (titolo) titolo.textContent = 'Il ruolo a cui aspiri';
    if (intro) intro.textContent = 'Ecco quanto il ruolo a cui aspiri è compatibile con il profilo emerso dal test.';
  }

  if (asp && aspInput) renderRuoloAspirato(aspInput, asp);
}

// ─── INIT ─────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Il salvataggio del report può fallire per un intoppo momentaneo (rete che
// va e viene, sessione non ancora del tutto assestata subito dopo il magic
// link): invece di arrendersi al primo tentativo, ritenta un paio di volte
// con una breve pausa prima di considerarlo davvero fallito.
async function saveReportWithRetry(payload, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await saveReport(payload);
    } catch (e) {
      lastError = e;
      console.error(`Salvataggio report fallito (tentativo ${i + 1}/${attempts}):`, e);
      if (i < attempts - 1) await sleep(1000 * (i + 1)); // 1s, poi 2s
    }
  }
  throw lastError;
}

function showSaveErrorBanner() {
  const banner = document.getElementById('save-error-banner');
  if (banner) banner.classList.remove('hidden');
}

// Un contatore reale + frasi che cambiano in base a quanto tempo è passato,
// invece di una rotazione vaga senza riferimenti: l'utente sa sempre se
// l'attesa è nella norma o se sta durando più del solito, senza dover
// indovinare se qualcosa si è bloccato.
let loadingTimerInterval = null;

function startLoadingTimer() {
  const elapsedEl = document.getElementById('loading-elapsed');
  const textEl = document.getElementById('loading-text');
  if (!elapsedEl || !textEl) return;
  stopLoadingTimer();
  let seconds = 0;
  elapsedEl.textContent = '';
  textEl.textContent = 'Sto leggendo le tue risposte...';

  loadingTimerInterval = setInterval(() => {
    seconds += 1;
    elapsedEl.textContent = seconds + 's';
    if (seconds === 10) {
      textEl.textContent = 'Sto costruendo il tuo profilo...';
    } else if (seconds === 30) {
      textEl.textContent = 'Ci vuole di solito tra 30 e 90 secondi.';
    } else if (seconds === 60) {
      textEl.textContent = 'Ancora un po\' — il tuo profilo ha diversi segnali da mettere insieme.';
    } else if (seconds === 100) {
      textEl.textContent = 'Sta impiegando più del solito, ma sta ancora lavorando: capita con i profili più ricchi.';
    }
  }, 1000);
}

function stopLoadingTimer() {
  if (loadingTimerInterval) {
    clearInterval(loadingTimerInterval);
    loadingTimerInterval = null;
  }
}

// Genera il report dagli input in localStorage, lo mostra e lo salva su Supabase.
// Marca l'handoff come consumato per evitare doppi salvataggi al reload. NON
// cancella rf_history: la valutazione asincrona del ruolo aspirato lo legge dopo.
// Restituisce true SOLO se il report è stato generato E salvato con successo:
// chi chiama usa questo per decidere se è sicuro cancellare la bozza del test
// (vedi init()) — se il salvataggio fallisce, la bozza resta per poter riprovare.
async function generateAndSave() {
  try {
    startLoadingTimer();
    const cumulativeContext = await fetchCumulativeContext();
    const data = await generateReport(cumulativeContext);
    stopLoadingTimer();
    if (!data) throw new Error('Report non valido');
    renderReport(data);

    try {
      const aspiration = (localStorage.getItem('rf_aspiration') || '').trim() || null;
      // Conversazione completa del test (domande + risposte + attività interattive):
      // serve per valutazioni future basate sulle risposte grezze.
      const test_history = {
        history: JSON.parse(localStorage.getItem('rf_history') || '[]'),
        activities: JSON.parse(localStorage.getItem('rf_activities') || '{}'),
        // answers: elenco pulito domanda/risposta con il flag "indiretta" —
        // usato per mostrare alle aziende solo le domande non personali.
        answers: JSON.parse(localStorage.getItem('rf_answers') || '[]'),
        savedAt: new Date().toISOString(),
      };
      const saved = await saveReportWithRetry({ report_json: data.report, aspiration, test_history });
      currentReportId = saved.id;
      localStorage.setItem('rf_report_saved', '1');
      // [feedback] report appena generato e salvato: attiva la sezione feedback per questo report
      window.dispatchEvent(new CustomEvent('rf-report-shown', { detail: { reportId: saved.id } }));
      return true;
    } catch (e) {
      console.error('Salvataggio report fallito:', e);
      // Il report è visibile ma NON è stato salvato sul profilo: se lasciassimo
      // questo errore silenzioso, l'utente vedrebbe il report una volta sola e
      // lo ritroverebbe sparito nello storico, senza nessuna spiegazione.
      showSaveErrorBanner();
      return false;
    }
  } catch (err) {
    stopLoadingTimer();
    console.error('Errore generazione report:', err);
    document.getElementById('loading-text').textContent =
      err?.message && err.message.includes('Ricarica la pagina')
        ? err.message
        : 'Qualcosa è andato storto. Ricarica la pagina per riprovare.';
    return false;
  }
}

async function init() {
  const params = new URLSearchParams(location.search);
  const viewId = params.get('id');
  const draftId = params.get('draft');
  const session = await getSession();

  // Modalità "rivedi report salvato"
  if (viewId) {
    if (!session) { showAuthGate(); return; }
    try {
      const row = await getReport(viewId);
      currentReportId = row.id;
      renderSavedReport(row);
      // [feedback] report salvato mostrato: attiva la sezione feedback per questo report
      window.dispatchEvent(new CustomEvent('rf-report-shown', { detail: { reportId: row.id } }));
    } catch (e) {
      console.error('Report non trovato:', e);
      showLoadingError('Report non trovato o non accessibile.');
    }
    return;
  }

  // Ritorno dal magic link con bozza (?draft=): recuperiamo gli input del test dal
  // server, non dal localStorage — che potrebbe essere di un altro browser/scheda.
  if (draftId) {
    if (!session) {
      showLoadingError('Link non valido o scaduto. Torna al test e richiedi di nuovo l\'accesso.');
      return;
    }
    let draft;
    try {
      draft = await claimDraft(draftId);
    } catch (e) {
      console.error('Recupero bozza fallito:', e);
      showLoadingError('Non riesco a recuperare il tuo test. Riprova.');
      return;
    }
    // Bozza non trovata: link scaduto, mai creato, o già ripulito dalla manutenzione.
    if (!draft) { showLoadingError('Link non valido o scaduto. Torna al test e richiedi di nuovo l\'accesso.'); return; }

    localStorage.setItem('rf_history', JSON.stringify(draft.history));
    localStorage.setItem('rf_activities', JSON.stringify(draft.activities || {}));
    localStorage.setItem('rf_aspiration', draft.aspiration || '');
    localStorage.removeItem('rf_report_saved');
    const ok = await generateAndSave();
    // La bozza si cancella SOLO ora, a salvataggio confermato: se qualcosa è
    // andato storto (timeout, errore di rete, salvataggio fallito), il link
    // resta valido e ricaricare la pagina recupera di nuovo la stessa bozza,
    // invece di perdere per sempre le risposte del test.
    if (ok) deleteDraft(draftId).catch((e) => console.error('Pulizia bozza fallita (non bloccante):', e));
    return;
  }

  // Modalità "genera nuovo report" dal test appena fatto.
  const hasHandoff = !!localStorage.getItem('rf_history') &&
                     localStorage.getItem('rf_report_saved') !== '1';

  if (!session) {
    if (!hasHandoff) { window.location.href = 'test.html'; return; }
    showAuthGate();
    return;
  }

  if (!hasHandoff) { window.location.href = 'account.html'; return; }

  await generateAndSave();
}

document.addEventListener('DOMContentLoaded', init);

// Esposizione per gli handler inline in report.html (onclick=...)
window.submitRuoloAttuale = submitRuoloAttuale;
window.shareReport = shareReport;
window.restartTest = restartTest;
