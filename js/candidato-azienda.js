const ASSI_FISSI = ['Analisi', 'Relazione', 'Creatività', 'Curiosità', 'Leadership', 'Metodo'];
const ASSI_COLORI = ['#5DCAA5', '#FF9FB8', '#FFD060', '#85C9EB', '#C79CF0', '#7FE0C0'];

// Il contenuto qui sotto include testo generato dall'AI e, nel Q&A, le
// risposte scritte a mano dal candidato: senza escaping, un payload HTML/script
// finirebbe nel DOM del browser dell'azienda che guarda questo profilo.
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return { jobId: p.get('job_id'), userId: p.get('user_id') };
}

function confAmount(c) { return c === 'alta' ? 1 : c === 'media' ? 0.6 : c === 'bassa' ? 0.25 : 0.6; }

// Stessa identità grafica della costellazione che il candidato vede sul
// proprio profilo (account.js) — qui in versione statica a singolo
// istantanea, senza ruoli/timeline: l'azienda guarda un solo scatto, non
// esplora nel tempo. Diverso da un radar Chart.js per restare coerente con
// il resto del prodotto invece di mostrare due linguaggi grafici diversi.
function renderRadar(assi, confidenza) {
  const canvas = document.getElementById('candidato-sky');
  if (!canvas || !assi) return;
  const conf = confidenza || {};
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

    const coreR = 6 * (1 + Math.sin(t * 0.03) * 0.06);
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreR * 6);
    g.addColorStop(0, 'rgba(93,202,165,0.5)'); g.addColorStop(1, 'rgba(93,202,165,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, coreR * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F0FFF4'; ctx.beginPath(); ctx.arc(CX, CY, coreR, 0, Math.PI * 2); ctx.fill();

    const R = Math.min(W, H) * 0.32;
    const pts = ASSI_FISSI.map((k, i) => {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const val = typeof assi[k] === 'number' ? assi[k] : 0;
      const r = 22 + (val / 100) * R;
      return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, angle: a };
    });

    ctx.strokeStyle = 'rgba(93,202,165,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(93,202,165,0.05)'; ctx.fill();

    const small = W < 420;
    pts.forEach((p, i) => {
      const k = ASSI_FISSI[i];
      const amount = confAmount(conf[k]);
      const flicker = amount < 1 ? Math.sin(t * 0.06 + i) * (1 - amount) * 0.4 : 0;
      const haloR = 11 + amount * 9 + flicker * 5;

      const hg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
      hg.addColorStop(0, ASSI_COLORI[i] + 'CC'); hg.addColorStop(1, ASSI_COLORI[i] + '00');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ASSI_COLORI[i]; ctx.globalAlpha = 0.55 + amount * 0.45 - flicker * 0.3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      const labelDist = small ? 20 : 25;
      const lx = p.x + Math.cos(p.angle) * labelDist;
      const ly = p.y + Math.sin(p.angle) * labelDist;
      ctx.font = (small ? '600 10px ' : '600 12px ') + getComputedStyle(document.body).fontFamily;
      ctx.fillStyle = 'rgba(240,255,244,0.75)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(k, lx, ly);
      ctx.font = (small ? '9px ' : '11px ') + 'ui-monospace, monospace';
      ctx.fillStyle = 'rgba(240,255,244,0.35)';
      ctx.fillText(Math.round(assi[k] ?? 0) + '', lx, ly + (small ? 12 : 14));
    });

    if (!reduceMotion) requestAnimationFrame(frame);
  }
  frame();
}

// Riepilogo pensato per l'azienda (terza persona, mai "tu" — vedi
// PROMPT_REPORT lato server): diverso dal blocco "chi sei" che il
// candidato legge di sé stesso, non va mai riusato qui.
function renderRiepilogoAziende(riepilogo) {
  const el = document.getElementById('chi-sei-text');
  if (!riepilogo) {
    el.innerHTML = '<p style="color:var(--text-muted);">Non disponibile per i test svolti prima di questo aggiornamento.</p>';
    return;
  }
  el.innerHTML = `<p>${esc(riepilogo)}</p>`;
}

function renderRuoli(ruoli) {
  const el = document.getElementById('ruoli-list');
  if (!ruoli || ruoli.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);">Non disponibile.</p>'; return; }
  el.innerHTML = ruoli.map((r) => `
    <div class="ruolo-card">
      <div class="ruolo-header">
        <div class="ruolo-nome">${esc(r.nome)}</div>
        <div class="ruolo-match">
          <span class="ruolo-match-number">${esc(r.match)}%</span>
          <span class="ruolo-match-label">dal suo report</span>
        </div>
      </div>
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Cosa fa davvero</div>
        <div class="ruolo-detail-text">${esc(r.cosa_fa) || ''}</div>
      </div>
    </div>
  `).join('');
}

function renderQa(qaLog, qaDisponibile) {
  const el = document.getElementById('qa-list');
  if (!qaDisponibile) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Non disponibile per i test svolti prima di questo aggiornamento.</p>';
    return;
  }
  if (qaLog.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Nessuna domanda non personale disponibile per questo candidato.</p>';
    return;
  }
  el.innerHTML = qaLog.map((qa) => `
    <div class="card" style="margin-bottom:10px;">
      <div style="font-size:0.86rem;color:var(--text-primary);margin-bottom:6px;">${esc(qa.domanda)}</div>
      <div style="font-size:0.86rem;color:var(--emerald-light);">${esc(qa.risposta)}</div>
    </div>
  `).join('');
}

(async function init() {
  const { jobId, userId } = getParams();
  const backLink = document.getElementById('back-link');
  if (jobId) backLink.href = `risultati-azienda.html?id=${encodeURIComponent(jobId)}`;
  else backLink.remove();

  if (!userId) {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/azienda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dettaglio_candidato', user_id: userId }),
    });
    const data = await res.json();

    if (!res.ok || data.error) throw new Error(data.error || 'Errore sconosciuto');

    document.getElementById('candidato-email').textContent = data.email || 'Candidato';

    if (data.cv_url) {
      document.getElementById('cv-link').href = data.cv_url;
      document.getElementById('section-cv').classList.remove('hidden');
    }

    const perche = document.getElementById('perche-testo');
    const percheSection = document.getElementById('section-perche');
    // Il "perché" specifico per la ricerca arriva solo passando dalla lista
    // risultati (URL ?perche=...); qui mostriamo il fallback se manca.
    // URLSearchParams decodifica già il valore da solo: niente decodeURIComponent qui,
    // altrimenti un "%" letterale nel testo (es. "80% compatibilità") romperebbe il parsing.
    const params = new URLSearchParams(window.location.search);
    const percheParam = params.get('perche');
    if (percheParam) {
      perche.textContent = percheParam;
    } else {
      percheSection.classList.add('hidden');
    }

    renderRiepilogoAziende(data.report?.riepilogo_aziende);
    renderRuoli(data.report?.ruoli);
    renderQa(data.qa_log, data.qa_disponibile);

    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('profile-content').classList.remove('hidden');
    // Il canvas va misurato SOLO dopo che il contenitore è visibile: prima
    // di questo punto è display:none e restituirebbe un riquadro 0x0.
    renderRadar(data.report?.assi, data.report?.assi_confidenza);
  } catch (e) {
    console.error('Errore caricamento profilo candidato:', e);
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
  }
})();
