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

// ─── VALUTA RUOLO ATTUALE ─────────────────────────────────────
async function valutaRuoloAttuale(ruoloInput) {
  const report = JSON.parse(sessionStorage.getItem('rf_report') || '{}');
  const history = JSON.parse(sessionStorage.getItem('rf_history') || '[]');

  const messages = [
    ...history,
    {
      role: 'user',
      content: `L'utente lavora attualmente come: "${ruoloInput}".

Basandoti sul profilo emerso dal test e sui 3 ruoli suggeriti nel report (${report.ruoli?.map(r => r.nome).join(', ')}), valuta la compatibilità tra il ruolo attuale e il profilo dell'utente.

Rispondi SOLO con JSON valido:
{
  "match": 72,
  "titolo": "frase breve di sintesi (es. 'Un buon punto di partenza' o 'Distante dal tuo profilo')",
  "descrizione": "2-3 frasi oneste e specifiche: cosa funziona in questo ruolo rispetto al profilo, cosa manca o logora, e in che direzione potrebbe evolvere"
}`
    }
  ];

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, fase: 'compatibilita' })
  });

  const data = await response.json();
  const text = data.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
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
  report.ruoli.forEach((ruolo) => {
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
        mismatchList.appendChild(card);
      });
    }
  }

  // Box ruolo attuale — solo se l'utente ha detto che lavora
  const worksCurrently = checkWorksCurrently();
  if (worksCurrently) {
    const section = document.getElementById('section-ruolo-attuale');
    if (section) section.classList.remove('hidden');
  }

  // Mostra tutto
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('report-content').classList.remove('hidden');

  // Salva per condivisione
  sessionStorage.setItem('rf_report', JSON.stringify(report));
}

// ─── CONTROLLA SE LAVORA ──────────────────────────────────────
function checkWorksCurrently() {
  const history = JSON.parse(sessionStorage.getItem('rf_history') || '[]');
  return history.some(msg =>
    msg.role === 'user' &&
    typeof msg.content === 'string' &&
    msg.content.includes('Risposta:') &&
    msg.content.includes('Sì')
  );
}

// ─── SUBMIT RUOLO ATTUALE ─────────────────────────────────────
async function submitRuoloAttuale() {
  const input = document.getElementById('ruolo-attuale-input');
  const val = input?.value.trim();
  if (!val) return;

  const btn = document.getElementById('ruolo-attuale-btn');
  const risultato = document.getElementById('ruolo-attuale-risultato');

  btn.textContent = 'Analizzo...';
  btn.disabled = true;

  try {
    const data = await valutaRuoloAttuale(val);
    if (!data) throw new Error('Nessun risultato');

    const matchColor = data.match >= 70 ? 'var(--emerald-light)' :
                       data.match >= 45 ? '#FFD060' : 'var(--rose)';

    risultato.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px;">
        <div>
          <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Il tuo ruolo attuale</div>
          <div style="font-family:var(--font-display);font-size:1.3rem;color:var(--text-primary);">${val}</div>
          <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:4px;">${data.titolo}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-family:var(--font-display);font-size:2.4rem;font-weight:300;color:${matchColor};line-height:1;">${data.match}%</div>
          <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">compatibilità</div>
        </div>
      </div>
      <div style="font-size:0.92rem;color:var(--text-secondary);line-height:1.75;border-top:1px solid var(--card-border);padding-top:14px;">${data.descrizione}</div>
    `;
    risultato.classList.remove('hidden');

    // Nascondi il form
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
  sessionStorage.removeItem('rf_history');
  sessionStorage.removeItem('rf_activities');
  sessionStorage.removeItem('rf_report');
  window.location.href = 'test.html';
}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
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
