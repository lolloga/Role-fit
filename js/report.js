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
  const history = JSON.parse(sessionStorage.getItem('rf_history') || '[]');

  const messages = [
    ...history,
    {
      role: 'user',
      content: `Valuta un ruolo di tipo ATTUALE. L'utente lavora attualmente come: "${ruoloInput}".

Basandoti sul profilo emerso dal test e sui 3 ruoli suggeriti nel report (${report.ruoli?.map(r => r.nome).join(', ')}), valuta la compatibilità tra il ruolo attuale e il profilo dell'utente.

Ricorda: è il ruolo che ricopre ORA. Sii onesto e concreto su cosa funziona, cosa manca o logora, dove potrebbe portare.`
    }
  ];

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
// Chiamata solo se l'utente, nell'ultima domanda del test, ha scritto un ruolo
// a cui aspira. Usa la stessa fase 'compatibilita' ma dichiara che è ASPIRATO.
async function valutaRuoloAspirato(ruoloInput) {
  const report = JSON.parse(sessionStorage.getItem('rf_report') || '{}');
  const history = JSON.parse(sessionStorage.getItem('rf_history') || '[]');

  const messages = [
    ...history,
    {
      role: 'user',
      content: `Valuta un ruolo di tipo ASPIRATO. L'utente, alla fine del test, ha dichiarato che con la sua esperienza aspira a questo ruolo: "${ruoloInput}".

Basandoti sul profilo emerso dal test e sui 3 ruoli suggeriti nel report (${report.ruoli?.map(r => r.nome).join(', ')}), valuta quanto questo ruolo aspirato è compatibile con il profilo dell'utente.

Ricorda: è un SOGNO/ASPIRAZIONE della persona. Non sminuirlo mai. Se il match è alto, conferma con entusiasmo che la sua intuizione su se stesso è validata dal test. Se è medio o basso, spiega con cura cosa di lui si rispecchia in quel ruolo e cosa invece potrebbe frustrarlo, senza mai farlo sentire in errore per averlo desiderato.`
    }
  ];

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
// Inserisce il risultato della compatibilità del ruolo aspirato nel report,
// subito dopo la lista dei 3 ruoli. Enfasi sulla precisione se match >= 80.
function renderRuoloAspirato(ruoloInput, data) {
  const ruoliEl = document.getElementById('ruoli-list');
  if (!ruoliEl || !data) return;

  const altaPrecisione = data.alta_precisione === true || data.match >= 80;

  const matchColor = data.match >= 80 ? 'var(--emerald-light)' :
                     data.match >= 55 ? 'var(--emerald-light)' :
                     data.match >= 35 ? '#FFD060' : 'var(--rose)';

  const wrapper = document.createElement('div');
  wrapper.className = 'ruolo-card';
  wrapper.style.marginTop = '20px';

  // Quando la precisione è alta, la card si distingue con bordo e sfondo smeraldo
  if (altaPrecisione) {
    wrapper.style.border = '1px solid rgba(29,158,117,0.5)';
    wrapper.style.background = 'rgba(29,158,117,0.06)';
  }

  // Badge di precisione (solo se match >= 80)
  const badgeHtml = altaPrecisione
    ? `<div style="display:inline-flex;align-items:center;gap:6px;font-size:0.72rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--emerald-light);background:rgba(29,158,117,0.14);border:1px solid rgba(29,158,117,0.35);border-radius:999px;padding:4px 12px;margin-bottom:14px;">✓ Il test ha colto la tua direzione</div>`
    : '';

  wrapper.innerHTML = `
    ${badgeHtml}
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px;">
      <div>
        <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Il ruolo a cui aspiri</div>
        <div style="font-family:var(--font-display);font-size:1.3rem;color:var(--text-primary);">${ruoloInput}</div>
        <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:4px;">${data.titolo || ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:var(--font-display);font-size:2.4rem;font-weight:300;color:${matchColor};line-height:1;">${data.match}%</div>
        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">compatibilità</div>
      </div>
    </div>
    <div style="font-size:0.92rem;color:var(--text-secondary);line-height:1.75;border-top:1px solid var(--card-border);padding-top:14px;">${data.descrizione || ''}</div>
    ${altaPrecisione ? `<div style="font-size:0.82rem;color:var(--emerald-light);line-height:1.6;margin-top:14px;font-style:italic;">Avevi già in mente la direzione giusta: il profilo emerso dal test e il ruolo a cui aspiri combaciano in modo netto. È la conferma che ti conosci bene.</div>` : ''}
  `;

  ruoliEl.appendChild(wrapper);
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

    // Settori — "Dove brilla per te" (guard: presente solo se l'API li ha restituiti)
    let settoriHtml = '';
    if (Array.isArray(ruolo.settori) && ruolo.settori.length > 0) {
      const items = ruolo.settori
        .filter(s => s && s.nome)
        .map(s => {
          // Aziende esempio (guard: solo se presenti)
          let aziendeHtml = '';
          if (Array.isArray(s.aziende) && s.aziende.length > 0) {
            const tags = s.aziende
              .filter(a => a && a.trim())
              .map(a => `<span style="display:inline-block;font-size:0.74rem;color:var(--text-secondary);background:var(--deep);border:1px solid var(--card-border);border-radius:6px;padding:2px 9px;margin:3px 4px 0 0;">${a}</span>`)
              .join('');
            if (tags) {
              aziendeHtml = `<div style="margin-top:6px;"><span style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">Esempi di realtà</span><div style="margin-top:3px;">${tags}</div></div>`;
            }
          }
          return `
          <div style="margin-bottom:12px;">
            <span style="display:inline-block;font-size:0.78rem;font-weight:600;color:var(--emerald-light);background:rgba(29,158,117,0.12);border:1px solid rgba(29,158,117,0.3);border-radius:999px;padding:3px 12px;margin-bottom:6px;">${s.nome}</span>
            <div class="ruolo-detail-text" style="margin-top:2px;">${s.declinazione || ''}</div>
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
      </div>${settoriHtml}
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

  // Ruolo aspirato — se l'utente ne ha scritto uno nell'ultima domanda del test.
  // Parte DOPO aver mostrato il report (il salvataggio di rf_report sopra è il
  // prerequisito perché valutaRuoloAspirato legga i 3 ruoli). Non blocca il render.
  const aspirato = (sessionStorage.getItem('rf_aspiration') || '').trim();
  if (aspirato) {
    mostraRuoloAspirato(aspirato);
  }
}

// ─── ORCHESTRA IL BLOCCO ASPIRATO (async, non blocca il report) ──
async function mostraRuoloAspirato(ruoloInput) {
  // Placeholder di caricamento nel flusso dei ruoli
  const ruoliEl = document.getElementById('ruoli-list');
  if (!ruoliEl) return;

  const loader = document.createElement('div');
  loader.className = 'ruolo-card';
  loader.style.marginTop = '20px';
  loader.id = 'aspirato-loader';
  loader.innerHTML = `
    <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Il ruolo a cui aspiri</div>
    <div style="font-family:var(--font-display);font-size:1.3rem;color:var(--text-primary);">${ruoloInput}</div>
    <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:10px;font-style:italic;">Sto confrontando questo ruolo con il tuo profilo...</div>
  `;
  ruoliEl.appendChild(loader);

  try {
    const data = await valutaRuoloAspirato(ruoloInput);
    loader.remove();
    if (data) {
      renderRuoloAspirato(ruoloInput, data);
    }
  } catch (err) {
    // In caso di errore non mostriamo nulla di tecnico: rimuoviamo il loader e basta
    const l = document.getElementById('aspirato-loader');
    if (l) l.remove();
  }
}

// ─── CONTROLLA SE LAVORA ──────────────────────────────────────
function checkWorksCurrently() {
  const history = JSON.parse(sessionStorage.getItem('rf_history') || '[]');
  // Il segnale ora viene dalla domanda 'momento'. Tutte le sue opzioni indicano
  // un lavoro in corso TRANNE "Ho appena finito gli studi...".
  // Le risposte sono loggate come: Risposta: "testo..."
  // Quindi: lavora se esiste una risposta-momento che NON inizia con "Ho appena finito gli studi".
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
  sessionStorage.removeItem('rf_aspiration');
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
    else throw new Error('Report non valido');
  } catch (err) {
    console.error('Errore generazione report:', err);
    document.querySelector('#loading-state p').textContent = 'Qualcosa è andato storto. Riprova.';
  }
});
