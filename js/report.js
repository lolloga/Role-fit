import { getSession, signInWithMagicLink, getAccessToken, saveReport, updateReportEval, getReport } from './supabase.js';

// id del report salvato su Supabase per la sessione corrente (null finché non salvato).
// Serve per ri-persistere le valutazioni ruolo attuale/aspirato calcolate dopo.
let currentReportId = null;

// ─── GENERA REPORT ───────────────────────────────────────────
async function generateReport() {
  const history = JSON.parse(localStorage.getItem('rf_history') || '[]');
  const activities = JSON.parse(localStorage.getItem('rf_activities') || '{}');

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

  const token = await getAccessToken();
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
// Chiamata solo se l'utente, nell'ultima domanda del test, ha scritto un ruolo
// a cui aspira. Usa la stessa fase 'compatibilita' ma dichiara che è ASPIRATO.
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
// Inserisce il risultato della compatibilità del ruolo aspirato nel report,
// dentro il contenitore #ruolo-aspirato-container (sotto il ruolo attuale).
// Enfasi sulla precisione se match >= 80.
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

  container.appendChild(wrapper);
}

// ─── RENDER REPORT ───────────────────────────────────────────
// savedView=true quando si rivede un report salvato (report.html?id=...): in quel
// caso NON tocchiamo la sezione ruolo attuale/aspirato basandoci su localStorage
// (sarebbe stale) — la gestisce renderSavedReport con i dati salvati su Supabase.
function renderReport(data, { savedView = false } = {}) {
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

  // Mostra tutto
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('report-content').classList.remove('hidden');

  // Salva per condivisione
  sessionStorage.setItem('rf_report', JSON.stringify(report));

  // In modalità "rivedi report salvato" la sezione ruolo attuale/aspirato è
  // gestita da renderSavedReport con i dati di Supabase: qui ci fermiamo.
  if (savedView) return;

  // ─── SEZIONE RUOLO ATTUALE + ASPIRATO ───────────────────────
  // La sezione è unica e contiene entrambi i box. La rendiamo visibile se:
  //  - l'utente lavora (mostra il form ruolo attuale), OPPURE
  //  - l'utente ha dichiarato un'aspirazione (mostra solo il box aspirato).
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
        // Mostra il form del ruolo attuale (comportamento normale)
        if (formWrapper) formWrapper.classList.remove('hidden');
      } else {
        // Non lavora: nascondiamo il form attuale e adattiamo il titolo all'aspirazione
        if (formWrapper) formWrapper.classList.add('hidden');
        if (titolo) titolo.textContent = 'Il ruolo a cui aspiri';
        if (intro) intro.textContent = 'Hai indicato un ruolo a cui aspiri. Ecco quanto è compatibile con il profilo emerso dal test.';
      }
    }
  }

  // Avvia il calcolo della compatibilità del ruolo aspirato (se presente).
  // Non blocca il render: il report è già a schermo.
  if (aspirato) {
    mostraRuoloAspirato(aspirato);
  }
}

// ─── ORCHESTRA IL BLOCCO ASPIRATO (async, non blocca il report) ──
async function mostraRuoloAspirato(ruoloInput) {
  const container = document.getElementById('ruolo-aspirato-container');
  if (!container) return;

  // Placeholder di caricamento
  const loader = document.createElement('div');
  loader.className = 'card';
  loader.style.marginTop = '12px';
  loader.id = 'aspirato-loader';
  loader.innerHTML = `
    <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Il ruolo a cui aspiri</div>
    <div style="font-family:var(--font-display);font-size:1.3rem;color:var(--text-primary);">${ruoloInput}</div>
    <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:10px;font-style:italic;">Sto confrontando questo ruolo con il tuo profilo...</div>
  `;
  container.appendChild(loader);

  try {
    const data = await valutaRuoloAspirato(ruoloInput);
    loader.remove();
    if (data) {
      renderRuoloAspirato(ruoloInput, data);
      // Persisti la valutazione nel report salvato (best effort)
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

// ─── RENDER RISULTATO RUOLO ATTUALE ───────────────────────────
// Estratto da submitRuoloAttuale per essere riusato anche alla riapertura
// di un report salvato (report.html?id=...).
function renderRuoloAttualeResult(val, data) {
  const risultato = document.getElementById('ruolo-attuale-risultato');
  if (!risultato) return;

  const matchColor = data.match >= 70 ? 'var(--emerald-light)' :
                     data.match >= 45 ? '#FFD060' : 'var(--rose)';

  risultato.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px;">
      <div>
        <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Il tuo ruolo attuale</div>
        <div style="font-family:var(--font-display);font-size:1.3rem;color:var(--text-primary);">${val}</div>
        <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:4px;">${data.titolo || ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:var(--font-display);font-size:2.4rem;font-weight:300;color:${matchColor};line-height:1;">${data.match}%</div>
        <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;">compatibilità</div>
      </div>
    </div>
    <div style="font-size:0.92rem;color:var(--text-secondary);line-height:1.75;border-top:1px solid var(--card-border);padding-top:14px;">${data.descrizione || ''}</div>
  `;
  risultato.classList.remove('hidden');
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

    // Persisti la valutazione nel report salvato (best effort, non blocca la UI).
    // Salviamo anche il ruolo digitato (_input) per poterlo rimostrare alla riapertura.
    if (currentReportId) {
      updateReportEval(currentReportId, { current_role_eval: { ...data, _input: val } }).catch(() => {});
    }

    renderRuoloAttualeResult(val, data);

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
    const { error } = await signInWithMagicLink(email);
    if (error) {
      btn.disabled = false;
      btn.textContent = 'Inviami il link →';
      errEl.textContent = 'Qualcosa è andato storto. Riprova tra poco.';
      errEl.classList.remove('hidden');
      return;
    }
    form.classList.add('hidden');
    sent.classList.remove('hidden');
  };

  btn.addEventListener('click', submit);
  emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => emailInput.focus(), 100);
}

function showLoadingError(msg) {
  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('loading-state').classList.remove('hidden');
  const p = document.querySelector('#loading-state p');
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
    if (form) form.classList.add('hidden'); // non riproponiamo il form in sola lettura
    renderRuoloAttualeResult(cur._input || 'Il tuo ruolo attuale', cur);
  } else {
    if (formWrapper) formWrapper.classList.add('hidden');
    if (titolo) titolo.textContent = 'Il ruolo a cui aspiri';
    if (intro) intro.textContent = 'Ecco quanto il ruolo a cui aspiri è compatibile con il profilo emerso dal test.';
  }

  if (asp && aspInput) renderRuoloAspirato(aspInput, asp);
}

// ─── INIT ─────────────────────────────────────────────────────
async function init() {
  const viewId = new URLSearchParams(location.search).get('id');
  const session = await getSession();

  // Modalità "rivedi report salvato"
  if (viewId) {
    if (!session) { showAuthGate(); return; }
    try {
      const row = await getReport(viewId);
      currentReportId = row.id;
      renderSavedReport(row);
    } catch (e) {
      console.error('Report non trovato:', e);
      showLoadingError('Report non trovato o non accessibile.');
    }
    return;
  }

  // Modalità "genera nuovo report" dal test appena fatto.
  // hasHandoff è vero solo se c'è un test non ancora salvato (flag rf_report_saved).
  const hasHandoff = !!localStorage.getItem('rf_history') &&
                     localStorage.getItem('rf_report_saved') !== '1';

  if (!session) {
    if (!hasHandoff) { window.location.href = 'test.html'; return; }
    showAuthGate();
    return;
  }

  // Loggato ma senza un test fresco da elaborare → area personale
  if (!hasHandoff) { window.location.href = 'account.html'; return; }

  try {
    const data = await generateReport();
    if (!data) throw new Error('Report non valido');
    renderReport(data);

    // Salva su Supabase, poi marca l'handoff come consumato (evita salvataggi
    // doppi se la pagina viene ricaricata). NON cancelliamo rf_history qui: la
    // valutazione asincrona del ruolo aspirato lo legge ancora dopo questo punto.
    try {
      const aspiration = (localStorage.getItem('rf_aspiration') || '').trim() || null;
      const saved = await saveReport({ report_json: data.report, aspiration });
      currentReportId = saved.id;
      localStorage.setItem('rf_report_saved', '1');
    } catch (e) {
      console.error('Salvataggio report fallito:', e);
    }
  } catch (err) {
    console.error('Errore generazione report:', err);
    document.querySelector('#loading-state p').textContent = 'Qualcosa è andato storto. Riprova.';
  }
}

document.addEventListener('DOMContentLoaded', init);

// Esposizione per gli handler inline in report.html (onclick=...): necessaria
// perché questo file è ora un modulo ESM e non popola lo scope globale.
window.submitRuoloAttuale = submitRuoloAttuale;
window.shareReport = shareReport;
window.restartTest = restartTest;
