// Il dizionario mostra testo generato dall'AI a partire dal termine cercato
// dall'utente: senza escaping, un payload HTML/script infilato nella ricerca
// (o restituito dal modello) finirebbe nel DOM.
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    if (!data.content || !data.content[0] || !data.content[0].text) {
      console.error('Errore API Claude (fase dizionario):', data.error || data);
      throw new Error('Risposta API vuota o non valida');
    }
    const raw = data.content[0].text;
    const text = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .replace(/^\s+/, '')
      .trim();
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
    .map(t => `<span class="alias-pill">${esc(t)}</span>`).join('');

  const conChiHtml = (ruolo.con_chi_lavora || [])
    .map(c => `<span class="alias-pill">${esc(c)}</span>`).join('');

  // Niente onclick inline con stringa interpolata: un titolo con un apice
  // dentro spezzerebbe la stringa JS ed eseguirebbe codice arbitrario. Il
  // titolo va invece in un data-attribute (sempre escapato) e il click si
  // aggancia dopo, via addEventListener.
  const adiacentiHtml = (ruolo.titoli_adiacenti || [])
    .map(t => `<span class="alias-pill diz-tag" style="cursor:pointer;" data-role="${esc(t)}">${esc(t)}</span>`).join('');

  el.innerHTML = `
    <h1 class="dizionario-nome">${esc(ruolo.nome)}</h1>
    <div class="dizionario-aliases">${aliasHtml}</div>
    <div class="diz-save-wrap" style="margin:4px 0 20px;">
      <button type="button" class="btn btn--ghost" id="diz-save-btn" style="padding:10px 18px;font-size:0.88rem;">☆ Salva nel tuo profilo</button>
      <span id="diz-save-msg" style="display:block;margin-top:8px;font-size:0.82rem;color:var(--text-muted);"></span>
    </div>
    <div class="dizionario-grid">
      <div class="diz-block" style="grid-column: 1 / -1;">
        <div class="diz-block-label">Cosa fa davvero</div>
        <div class="diz-block-text">${esc(ruolo.descrizione)}</div>
      </div>
      <div class="diz-block">
        <div class="diz-block-label">Giornata tipo</div>
        <div class="diz-block-text">${esc(ruolo.giornata_tipo)}</div>
      </div>
      <div class="diz-block">
        <div class="diz-block-label">Con chi lavora</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">${conChiHtml}</div>
      </div>
      <div class="diz-block">
        <div class="diz-block-label">Come si entra</div>
        <div class="diz-block-text">${esc(ruolo.come_si_entra)}</div>
      </div>
      <div class="diz-block">
        <div class="diz-block-label">Stipendio in Italia</div>
        <div class="diz-block-text"><strong>Junior:</strong> ${esc(ruolo.stipendio_junior)}<br><strong>Senior:</strong> ${esc(ruolo.stipendio_senior)}</div>
      </div>
      <div class="diz-block">
        <div class="diz-block-label">Trend</div>
        <div>
          <span class="trend-badge ${trendClass}">${trendEmoji} ${esc(ruolo.trend)}</span>
          <div class="diz-block-text" style="margin-top:6px;">${esc(ruolo.trend_descrizione) || ''}</div>
        </div>
      </div>
      <div class="diz-block">
        <div class="diz-block-label">Una cosa che non sai</div>
        <div class="diz-block-text">${esc(ruolo.cosa_non_sai)}</div>
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

  setupSaveButton(ruolo);

  el.querySelectorAll('.diz-tag').forEach((tag) => {
    tag.addEventListener('click', () => searchFromTag(tag.dataset.role));
  });

  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Salva il ruolo tra i "Ruoli salvati" del profilo. Il modulo Supabase si
// carica solo al click (questa pagina funziona anche senza login): chi non
// ha fatto l'accesso riceve l'invito ad accedere invece di un errore.
function setupSaveButton(ruolo) {
  const btn = document.getElementById('diz-save-btn');
  const msg = document.getElementById('diz-save-msg');
  if (!btn || !ruolo?.nome) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    msg.style.color = 'var(--text-muted)';
    msg.textContent = '';
    try {
      const { getSession, saveRole } = await import('./supabase.js');
      const session = await getSession();
      if (!session) {
        msg.innerHTML = 'Per salvare i ruoli <a href="account.html" style="color:var(--emerald-light);">accedi al tuo profilo</a>: ti basta l\'email.';
        btn.disabled = false;
        return;
      }
      const nota = (ruolo.descrizione || '').slice(0, 300);
      await saveRole({ nome: ruolo.nome, nota, fonte: 'dizionario' });
      btn.textContent = '★ Salvato nel profilo';
      msg.innerHTML = '<a href="account.html#ruoli" style="color:var(--emerald-light);">Vedi i tuoi ruoli salvati →</a>';
    } catch (e) {
      console.error('Salvataggio ruolo dal dizionario fallito:', e);
      msg.style.color = 'var(--rose)';
      msg.textContent = 'Non sono riuscito a salvarlo. Riprova tra poco.';
      btn.disabled = false;
    }
  });
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
