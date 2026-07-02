// ─── FRASI AI THINKING ───────────────────────────────────────
const THINKING_PHRASES = [
  "Sto leggendo il contesto...",
  "Traducendo in un profilo...",
  "Confrontando con gli scenari giusti...",
  "Quasi ci sono...",
  "Sto capendo chi vi serve..."
];

let thinkingInterval = null;

function startThinking() {
  const el = document.getElementById('thinking-phrase');
  let i = Math.floor(Math.random() * THINKING_PHRASES.length);
  el.textContent = THINKING_PHRASES[i];
  thinkingInterval = setInterval(() => {
    i = (i + 1) % THINKING_PHRASES.length;
    el.textContent = THINKING_PHRASES[i];
  }, 2500);
}

function stopThinking() {
  if (thinkingInterval) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;
  }
}

// ─── STATO ────────────────────────────────────────────────────
const state = {
  step: 'company_name', // company_name → contact_email → role_title → settore → seniority → adaptive → report
  company_name: null,
  contact_email: null,
  role_title: null,
  settore: null,
  seniority: null,
  conversationHistory: [],
  adaptiveCount: 0,
};

function saveState() {
  localStorage.setItem('rf_azienda_state', JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem('rf_azienda_state');
  if (!saved) return false;
  try {
    Object.assign(state, JSON.parse(saved));
    return true;
  } catch {
    return false;
  }
}

// ─── DOMANDE STANDARD (no AI) ──────────────────────────────────
const STANDARD_STEPS = [
  { step: 'company_name', text: 'Come si chiama la tua azienda?', type: 'text', placeholder: 'Nome azienda' },
  { step: 'contact_email', text: 'A quale email vi mandiamo i risultati?', type: 'email', placeholder: 'latua@azienda.com' },
  { step: 'role_title', text: 'Per quale ruolo state cercando questa persona?', type: 'text', placeholder: 'Es. Account Manager, Data Analyst...' },
  {
    step: 'settore', text: 'In che area si inserisce questo ruolo?', type: 'multiple_choice',
    options: [
      'Tecnologia e digitale', 'Finanza, banche e assicurazioni', 'Sanità e farmaceutico',
      'Industria, energia e ambiente', 'Moda, lusso e design', 'Commercio, retail e largo consumo',
      'Media, comunicazione e marketing', 'Arte, cultura e intrattenimento', 'Turismo, ristorazione e ospitalità',
      'Istruzione, formazione e ricerca', 'Pubblica amministrazione e non profit', 'Edilizia, immobiliare e infrastrutture'
    ]
  },
  {
    step: 'seniority', text: 'Che livello di seniority cercate?', type: 'multiple_choice',
    options: ['Junior', 'Mid-level', 'Senior', 'Executive / management']
  },
];

function nextStandardStep(currentStep) {
  const idx = STANDARD_STEPS.findIndex((s) => s.step === currentStep);
  return STANDARD_STEPS[idx + 1] || null;
}

// ─── API ────────────────────────────────────────────────────────
async function callClaude(fase) {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: state.conversationHistory, fase }),
  });
  const data = await response.json();
  if (!data.content || !data.content[0] || !data.content[0].text) {
    console.error('Errore API Claude (fase ' + fase + '):', data.error || data);
    return null;
  }
  try {
    return JSON.parse(data.content[0].text);
  } catch {
    return null;
  }
}

async function callAzienda(action, payload) {
  const response = await fetch('/api/azienda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  return response.json();
}

// ─── PROGRESS / FASE ──────────────────────────────────────────
function updateProgress() {
  const total = 5 + 8; // 5 standard + ~8 adattive attese
  const done = STANDARD_STEPS.findIndex((s) => s.step === state.step) >= 0
    ? STANDARD_STEPS.findIndex((s) => s.step === state.step)
    : 5 + state.adaptiveCount;
  document.getElementById('progress-bar').style.width = Math.min(95, Math.round((done / total) * 100)) + '%';
}

function updatePhaseLabel(text, dots) {
  document.getElementById('phase-label').textContent = text;
  dots.forEach((active, i) => {
    const dot = document.getElementById(`dot-${i + 1}`);
    if (!dot) return;
    dot.className = 'phase-dot';
    if (active) dot.classList.add('active');
  });
}

// ─── RENDER ─────────────────────────────────────────────────────
function showThinking() {
  document.getElementById('active-question').classList.add('hidden');
  document.getElementById('thinking-state').classList.remove('hidden');
  startThinking();
}

function renderQuestion({ text, context, type, options, placeholder }) {
  stopThinking();
  document.getElementById('thinking-state').classList.add('hidden');
  document.getElementById('active-question').classList.remove('hidden');

  document.getElementById('question-text').textContent = text;
  const ctxEl = document.getElementById('question-context');
  if (context) {
    ctxEl.textContent = context;
    ctxEl.classList.remove('hidden');
  } else {
    ctxEl.classList.add('hidden');
  }

  const input = document.getElementById('question-input');
  input.innerHTML = '';

  if (type === 'multiple_choice') {
    const grid = document.createElement('div');
    grid.className = 'options-grid';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `<span class="option-letter">${letters[i] || i + 1}</span><span>${opt}</span>`;
      btn.addEventListener('click', () => handleAnswer(opt));
      grid.appendChild(btn);
    });
    input.appendChild(grid);
  } else {
    const wrap = document.createElement('div');
    const field = document.createElement('input');
    field.type = type === 'email' ? 'email' : 'text';
    field.placeholder = placeholder || '';
    field.style.cssText = 'width:100%;padding:14px 18px;background:var(--deep);border:1px solid var(--card-border);border-radius:var(--radius-md);font-family:var(--font-body);font-size:1rem;color:var(--text-primary);outline:none;margin-bottom:16px;';
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && field.value.trim()) handleAnswer(field.value.trim());
    });
    const btn = document.createElement('button');
    btn.className = 'btn btn--primary';
    btn.textContent = 'Continua →';
    btn.addEventListener('click', () => {
      if (field.value.trim()) handleAnswer(field.value.trim());
    });
    wrap.appendChild(field);
    wrap.appendChild(btn);
    input.appendChild(wrap);
    field.focus();
  }

  updateProgress();
}

// ─── FLUSSO ─────────────────────────────────────────────────────
async function handleAnswer(value) {
  const standardStep = STANDARD_STEPS.find((s) => s.step === state.step);

  if (standardStep) {
    state[state.step] = value;
    const next = nextStandardStep(state.step);
    saveState();
    if (next) {
      state.step = next.step;
      saveState();
      renderQuestion(next);
    } else {
      // Fine domande standard → passa all'adattivo
      state.step = 'adaptive';
      state.conversationHistory.push({
        role: 'user',
        content: `Ruolo da ricoprire: ${state.role_title}. Area: ${state.settore}. Seniority: ${state.seniority}. Azienda: ${state.company_name}.`,
      });
      saveState();
      await askAdaptive();
    }
    return;
  }

  if (state.step === 'adaptive') {
    state.conversationHistory.push({ role: 'assistant', content: JSON.stringify({ question: state._lastQuestion }) });
    state.conversationHistory.push({ role: 'user', content: value });
    state.adaptiveCount++;
    saveState();
    await askAdaptive();
  }
}

async function askAdaptive() {
  showThinking();
  const result = await callClaude('azienda_test');
  if (!result) {
    renderQuestion({ text: 'Qualcosa è andato storto. Ricarica la pagina e riprova.', type: 'text', placeholder: '' });
    return;
  }
  if (result.action === 'report') {
    updatePhaseLabel('Costruiamo il profilo', [1, 1, 0]);
    await generateReport();
    return;
  }
  state._lastQuestion = result.question;
  updatePhaseLabel(state.adaptiveCount < 4 ? 'Stiamo entrando nel dettaglio' : 'Quasi fatto', [1, state.adaptiveCount >= 2 ? 1 : 0, 0]);
  renderQuestion(result.question);
}

async function generateReport() {
  showThinking();
  document.getElementById('phase-label').textContent = 'Sto costruendo il profilo target';

  const reportResult = await callClaude('azienda_report');
  if (!reportResult || !reportResult.target_profile) {
    renderQuestion({ text: 'Non sono riuscito a generare il profilo. Ricarica la pagina e riprova.', type: 'text', placeholder: '' });
    return;
  }

  const aziendaRes = await callAzienda('crea_azienda', {
    company_name: state.company_name,
    contact_email: state.contact_email,
  });
  if (aziendaRes.error) {
    renderQuestion({ text: 'Errore nel salvataggio. Riprova tra poco.', type: 'text', placeholder: '' });
    return;
  }

  const jobRes = await callAzienda('crea_job', {
    company_id: aziendaRes.id,
    role_title: state.role_title,
    test_history: state.conversationHistory,
    target_profile: reportResult.target_profile,
  });
  if (jobRes.error) {
    renderQuestion({ text: 'Errore nel salvataggio della ricerca. Riprova tra poco.', type: 'text', placeholder: '' });
    return;
  }

  localStorage.removeItem('rf_azienda_state');
  window.location.href = `risultati-azienda.html?id=${jobRes.id}`;
}

// ─── AVVIO ────────────────────────────────────────────────────
(function init() {
  if (!loadState()) {
    state.step = 'company_name';
  }
  const standardStep = STANDARD_STEPS.find((s) => s.step === state.step);
  if (standardStep) {
    renderQuestion(standardStep);
  } else if (state.step === 'adaptive') {
    askAdaptive();
  }
})();
