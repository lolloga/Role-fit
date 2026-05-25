// ─── CERCA RUOLO ─────────────────────────────────────────────
async function searchRole() {
  const input = document.getElementById('search-input').value.trim();
  if (!input) return;

  showLoading(true);
  document.getElementById('diz-result').classList.add('hidden');

  try {
    const response = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: input }],
        fase: 'dizionario'
      })
    });

    const data = await response.json();
    const text = data.content[0].text;

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : null;
    }

    if (result?.ruolo) renderResult(result.ruolo);

  } catch (err) {
    console.error(err);
  } finally {
    showLoading(false);
  }
}

// ─── RENDER RISULTATO ─────────────────────────────────────────
function renderResult(ruolo) {
  const el = document.getElementById('diz-result');
  el.innerHTML = '';

  // Trend badge
  const trendClass = ruolo.trend?.includes('crescita') ? 'crescita' :
                     ruolo.trend?.includes('declino')  ? 'declino'  : 'stabile';
  const trendEmoji = trendClass === 'crescita' ? '↑' :
                     trendClass === 'declino'  ? '↓' : '→';

  // Alias pills
  const aliasHtml = (ruolo.titoli_alternativi || [])
    .map(t => `<span class="alias-pill">${t}</span>`)
    .join('');

  // Chi lavora list
  const conChiHtml = (ruolo.con_chi_lavora || [])
    .map(c => `<span class="alias-pill">${c}</span>`)
    .join('');

  // Titoli adiacenti
  const adiacentiHtml = (ruolo.titoli_adiacenti || [])
    .map(t => `<span class="alias-pill" style="cursor:pointer;" onclick="searchFromTag('${t}')">${t}</span>`)
    .join('');

  el.innerHTML = `
    <h1 class="dizionario-nome">${ruolo.nome}</h1>

    <div class="dizionario-aliases">${aliasHtml}</div>

    <div class="dizionario-grid">

      <div class="diz-block" style="grid-column: 1 / -1;">
        <div class="diz-block-label">Cosa fa davvero</div>
        <div class="diz-block-text">${ruolo.descrizione}</div>
      </div>

      <div class="diz-block">
        <div class="diz-block-label">Giornata tipo</div>
        <div class="diz-block-text">${ruolo.giornata_tipo}</div>
      </div>

      <div class="diz-block">
        <div class="diz-block-label">Con chi lavora</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">${conChiHtml}</div>
      </div>

      <div class="diz-block">
        <div class="diz-block-label">Come si entra</div>
        <div class="diz-block-text">${ruolo.come_si_entra}</div>
      </div>

      <div class="diz-block">
        <div class="diz-block-label">Stipendio in Italia</div>
        <div class="diz-block-text">
          <strong>Junior:</strong> ${ruolo.stipendio_junior}<br>
          <strong>Senior:</strong> ${ruolo.stipendio_senior}
        </div>
      </div>

      <div class="diz-block">
        <div class="diz-block-label">Trend</div>
        <div>
          <span class="trend-badge ${trendClass}">${trendEmoji} ${ruolo.trend}</span>
          <div class="diz-block-text" style="margin-top:6px;">${ruolo.trend_descrizione || ''}</div>
        </div>
      </div>

      <div class="diz-block">
        <div class="diz-block-label">Una cosa che non sai</div>
        <div class="diz-block-text">${ruolo.cosa_non_sai}</div>
      </div>

    </div>

    <div style="margin-top:16px;">
      <div class="diz-block-label" style="margin-bottom:10px;">Ruoli simili da esplorare</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">${adiacentiHtml}</div>
    </div>

    <div class="dizionario-cta">
      <p>Vuoi scoprire se questo ruolo fa davvero per te? Fai il test RoleFit.</p>
      <a href="test.html" class="btn btn--accent">Fai il test →</a>
    </div>
  `;

  el.classList.remove('hidden');

  // Scroll al risultato
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── CERCA DA TAG ─────────────────────────────────────────────
function searchFromTag(role) {
  document.getElementById('search-input').value = role;
  searchRole();
}

// ─── LOADING ──────────────────────────────────────────────────
function showLoading(show) {
  document.getElementById('diz-loading').classList.toggle('hidden', !show);
}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('search-input');

  // Cerca con invio
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchRole();
  });

  // Cerca da URL param (es. dizionario.html?q=product+manager)
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  if (q) {
    input.value = q;
    searchRole();
  }
});
