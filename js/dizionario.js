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
console.log('RAW:', JSON.stringify(text.substring(0, 500)));
    let result = null;

    try {
      result = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          result = JSON.parse(match[0]);
        } catch {
          const cleaned = match[0]
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']')
            .replace(/\n/g, ' ')
            .replace(/\r/g, ' ');
          try {
            result = JSON.parse(cleaned);
          } catch {
            result = null;
          }
        }
      }
    }

    if (result && result.ruolo) {
      renderResult(result.ruolo);
    } else {
      throw new Error('Nessun risultato');
    }

  } catch (err) {
    console.error(err);
    const el = document.getElementById('diz-result');
    el.innerHTML = '<p style="color:var(--text-muted);padding:20px 0;">Qualcosa è andato storto. Riprova con un termine diverso.</p>';
    el.classList.remove('hidden');
  } finally {
    showLoading(false);
  }
}

function renderResult(ruolo) {
  const el = document.getElementById('diz-result');
  el.innerHTML = '';

  const trendClass = ruolo.trend && ruolo.trend.includes('crescita') ? 'crescita' :
                     ruolo.trend && ruolo.trend.includes('declino') ? 'declino' : 'stabile';
  const trendEmoji = trendClass === 'crescita' ? '↑' :
                     trendClass === 'declino'  ? '↓' : '→';

  const aliasHtml = (ruolo.titoli_alternativi || [])
    .map(t => `<span class="alias-pill">${t}</span>`).join('');

  const conChiHtml = (ruolo.con_chi_lavora || [])
    .map(c => `<span class="alias-pill">${c}</span>`).join('');

  const adiacentiHtml = (ruolo.titoli_adiacenti || [])
    .map(t => `<span class="alias-pill" style="cursor:pointer;" onclick="searchFromTag('${t}')">${t}</span>`).join('');

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
        <div class="diz-block-text"><strong>Junior:</strong> ${ruolo.stipendio_junior}<br><strong>Senior:</strong> ${ruolo.stipendio_senior}</div>
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
      <a href="test.html" class="btn btn--primary">Fai il test →</a>
    </div>
  `;

  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function searchFromTag(role) {
  document.getElementById('search-input').value = role;
  searchRole();
}

function showLoading(show) {
  document.getElementById('diz-loading').classList.toggle('hidden', !show);
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('search-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchRole();
  });

  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  if (q) {
    input.value = q;
    searchRole();
  }
});
