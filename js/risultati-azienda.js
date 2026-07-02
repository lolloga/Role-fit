const ASSI_KEYS = ['Analisi', 'Relazione', 'Creatività', 'Curiosità', 'Leadership', 'Metodo'];

function getJobId() {
  return new URLSearchParams(window.location.search).get('id');
}

function renderAssi(assi) {
  const container = document.getElementById('target-assi');
  container.innerHTML = ASSI_KEYS.map((key) => {
    const value = assi[key] ?? 0;
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--text-secondary);margin-bottom:4px;">
          <span>${key}</span><span>${value}</span>
        </div>
        <div style="height:6px;background:var(--deep);border-radius:99px;overflow:hidden;">
          <div style="height:100%;width:${value}%;background:var(--emerald-light);border-radius:99px;"></div>
        </div>
      </div>`;
  }).join('');
}

function renderCandidati(candidates) {
  const list = document.getElementById('candidati-list');
  if (candidates.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">Nessun candidato sopra la soglia di compatibilità (75%) al momento — il pool di profili su RoleFit è ancora piccolo, riprova più avanti.</p>';
    return;
  }

  list.innerHTML = candidates.map((c) => `
    <div class="ruolo-card">
      <div class="ruolo-header">
        <div class="ruolo-nome">${c.email || 'Candidato'}</div>
        <div class="ruolo-match">
          <span class="ruolo-match-number">${c.match}%</span>
          <span class="ruolo-match-label">compatibilità</span>
        </div>
      </div>
      ${c.perche_azienda ? `
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Perché può fare al caso vostro</div>
        <div class="ruolo-detail-text">${c.perche_azienda}</div>
      </div>` : ''}
      ${c.ruoli && c.ruoli.length > 0 ? `
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">I suoi ruoli compatibili su RoleFit</div>
        <div class="ruolo-detail-text">${c.ruoli.join(', ')}</div>
      </div>` : ''}
    </div>
  `).join('');
}

(async function init() {
  const jobId = getJobId();
  if (!jobId) {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/azienda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'match', job_id: jobId }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || 'Errore sconosciuto');
    }

    document.getElementById('ruolo-titolo').innerHTML = `${data.job.role_title},<br><em>tradotto in numeri.</em>`;
    document.getElementById('target-sintesi').innerHTML = `<p>${data.job.target_profile.sintesi}</p>`;
    renderAssi(data.job.target_profile.assi);
    renderCandidati(data.candidates);

    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('results-content').classList.remove('hidden');
  } catch (e) {
    console.error('Errore caricamento risultati azienda:', e);
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
  }
})();
