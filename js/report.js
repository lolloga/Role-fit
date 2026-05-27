// ─── GENERA REPORT ───────────────────────────────────────────
async function generateReport() {
  const history = JSON.parse(sessionStorage.getItem('rf_history') || '[]');
  const activities = JSON.parse(sessionStorage.getItem('rf_activities') || '{}');

  const activitiesSummary = Object.entries(activities)
    .map(([k, v]) => `Attività "${k}": ${JSON.stringify(v)}`)
    .join('\n');

  const messages = [
    ...history,
    {
      role: 'user',
      content: `Il test è completato. Genera il report finale.\n\nRiepilogo attività interattive:\n${activitiesSummary}\n\nGenera il report completo in JSON.`
    }
  ];

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, fase: 'report' })
  });

  const data = await response.json();
  const text = data.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        const cleaned = match[0]
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        return JSON.parse(cleaned);
      }
    }
    throw new Error('JSON non valido');
  }
}

// ─── RENDER REPORT ───────────────────────────────────────────
function renderReport(data) {
  const report = data.report;

  // Chi sei
  const chiSeiEl = document.getElementById('chi-sei-text');
  ['come_funzioni', 'cosa_ti_alimenta', 'di_cosa_hai_bisogno'].forEach(key => {
    if (report.chi_sei[key]) {
      const p = document.createElement('p');
      p.textContent = report.chi_sei[key];
      chiSeiEl.appendChild(p);
    }
  });

  // Ruoli
  const ruoliEl = document.getElementById('ruoli-list');
  report.ruoli.forEach((ruolo, i) => {
    const card = document.createElement('div');
    card.className = 'ruolo-card';
    card.innerHTML = `
      <div class="ruolo-header">
        <div class="ruolo-nome">${ruolo.nome}</div>
        <div class="ruolo-match">
          <span class="ruolo-match-number">${ruolo.match}%</span>
          <span class="ruolo-match-label">compatibilità</span>
        </div>
      </div>
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Perché ti si addice</div>
        <div class="ruolo-detail-text">${ruolo.perche}</div>
      </div>
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Cosa fa davvero</div>
        <div class="ruolo-detail-text">${ruolo.cosa_fa}</div>
      </div>
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Come si entra</div>
        <div class="ruolo-detail-text">${ruolo.come_si_entra}</div>
      </div>
      <div class="ruolo-detail">
        <div class="ruolo-detail-label">Una cosa che non ti aspetti</div>
        <div class="ruolo-detail-text">${ruolo.sorpresa}</div>
      </div>
    `;
    ruoliEl.appendChild(card);
  });

  // Bonus
  const bonusEl = document.getElementById('bonus-card');
  bonusEl.innerHTML = `
    <div class="bonus-eyebrow">Il ruolo che non ti aspetti</div>
    <div class="bonus-nome">${report.bonus.nome}</div>
    <div class="bonus-testo">${report.bonus.testo}</div>
  `;

  // Ruoli mismatch
  if (report.ruoli_mismatch && report.ruoli_mismatch.length > 0) {
    const mismatchSection = document.getElementById('section-mismatch');
    if (mismatchSection) {
      mismatchSection.classList.remove('hidden');
      const mismatchList = document.getElementById('mismatch-list');
      report.ruoli_mismatch.forEach(ruolo => {
        const card = document.createElement('div');
        card.className = 'ruolo-card';
        card.style.cssText = '--card-accent: var(--rose);';
        card.innerHTML = `
          <div class="ruolo-header">
            <div class="ruolo-nome">${ruolo.nome}</div>
            <div class="ruolo-match">
              <span class="ruolo-match-number" style="color:var(--text-muted);">${ruolo.match}%</span>
              <span class="ruolo-match-label">compatibilità</span>
            </div>
          </div>
          <div class="ruolo-detail">
            <div class="ruolo-detail-label" style="color:var(--rose);opacity:1;">Perché non fa per te</div>
            <div class="ruolo-detail-text">${ruolo.perche_no}</div>
          </div>
        `;
        card.querySelector('::before');
        card.style.setProperty('--before-bg', 'var(--rose)');
        mismatchList.appendChild(card);
      });
    }
  }

  // Mostra tutto
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('report-content').classList.remove('hidden');

  // Salva per condivisione
  sessionStorage.setItem('rf_report', JSON.stringify(report));
}

// ─── CONDIVIDI ────────────────────────────────────────────────
function shareReport() {
  const report = JSON.parse(sessionStorage.getItem('rf_report') || '{}');
  if (!report.ruoli) return;

  const text = `Ho fatto il test RoleFit 🎯\n\nI miei 3 ruoli:\n${report.ruoli.map(r => `• ${r.nome} (${r.match}%)`).join('\n')}\n\nRuolo bonus: ${report.bonus?.nome}\n\nScopri il tuo → rolefit.netlify.app`;

  if (navigator.share) {
    navigator.share({ text });
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert('Testo copiato! Incollalo dove vuoi condividerlo.');
    });
  }
}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Se non c'è history, torna al test
  const history = sessionStorage.getItem('rf_history');
  if (!history) {
    window.location.href = 'test.html';
    return;
  }

  try {
    const data = await generateReport();
    if (data) renderReport(data);
  } catch (err) {
    console.error('Errore generazione report:', err);
    document.querySelector('#loading-state p').textContent = 'Qualcosa è andato storto. Riprova.';
  }
});
