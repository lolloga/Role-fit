const ASSI_FISSI = ['Analisi', 'Relazione', 'Creatività', 'Curiosità', 'Leadership', 'Metodo'];

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

function renderRadar(assi) {
  const canvas = document.getElementById('candidato-radar');
  if (!canvas || typeof Chart === 'undefined' || !assi) return;
  new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ASSI_FISSI,
      datasets: [{
        data: ASSI_FISSI.map((k) => (typeof assi[k] === 'number' ? assi[k] : 0)),
        borderColor: '#5DCAA5',
        backgroundColor: 'rgba(93,202,165,0.18)',
        pointBackgroundColor: '#5DCAA5',
        borderWidth: 2,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          suggestedMin: 0, suggestedMax: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: 'rgba(240,255,244,0.12)' },
          angleLines: { color: 'rgba(240,255,244,0.12)' },
          pointLabels: { color: 'rgba(240,255,244,0.65)', font: { size: 12 } },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderChiSei(chiSei) {
  const el = document.getElementById('chi-sei-text');
  if (!chiSei) { el.innerHTML = '<p>Non disponibile.</p>'; return; }
  const parti = [chiSei.come_funziona, chiSei.cosa_ti_alimenta, chiSei.di_cosa_hai_bisogno].filter(Boolean);
  el.innerHTML = parti.map((p) => `<p>${esc(p)}</p>`).join('');
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
    renderRadar(data.report?.assi);

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

    renderChiSei(data.report?.chi_sei);
    renderRuoli(data.report?.ruoli);
    renderQa(data.qa_log, data.qa_disponibile);

    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('profile-content').classList.remove('hidden');
  } catch (e) {
    console.error('Errore caricamento profilo candidato:', e);
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
  }
})();
