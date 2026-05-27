// ─── FRASI AI THINKING ───────────────────────────────────────
const THINKING_PHRASES = [
  "Sto leggendo tra le righe...",
  "Connettendo i punti...",
  "Costruendo il tuo profilo...",
  "Questo è interessante...",
  "Elaborando le tue risposte...",
  "Quasi ci sono...",
  "Sto capendo chi sei...",
  "Un momento, sto ragionando...",
  "Qualcosa sta emergendo...",
  "Le cose si fanno chiare..."
];

let thinkingInterval = null;

function startThinking() {
  const el = document.getElementById('thinking-phrase');
  let i = Math.floor(Math.random() * THINKING_PHRASES.length);
  el.textContent = THINKING_PHRASES[i];

  thinkingInterval = setInterval(() => {
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'phraseChange 0.5s ease';
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

// ─── STATO GLOBALE ───────────────────────────────────────────
const state = {
  conversationHistory: [],
  answers: [],
  activityResults: {},
  questionCount: 0,
  fixedCount: 0,
  adaptiveCount: 0,
  currentPhase: 'building',
  lastQuestionTime: null,
  history: [],
  currentQuestion: null,
  worksCurrently: false,
};

// ─── PERSISTENZA ─────────────────────────────────────────────
function saveState() {
  const toSave = {
    conversationHistory: state.conversationHistory,
    answers: state.answers,
    activityResults: state.activityResults,
    questionCount: state.questionCount,
    fixedCount: state.fixedCount,
    adaptiveCount: state.adaptiveCount,
    currentPhase: state.currentPhase,
    history: state.history,
    currentQuestion: state.currentQuestion,
    worksCurrently: state.worksCurrently,
  };
  localStorage.setItem('rf_state', JSON.stringify(toSave));
}

function loadState() {
  const saved = localStorage.getItem('rf_state');
  if (!saved) return false;
  try {
    const parsed = JSON.parse(saved);
    Object.assign(state, parsed);
    return true;
  } catch {
    return false;
  }
}

function clearState() {
  localStorage.removeItem('rf_state');
}

// ─── 5 DOMANDE STANDARD (no AI) ──────────────────────────────
const STANDARD_QUESTIONS = [
  {
    id: 'eta',
    text: 'Quanti anni hai?',
    context: 'Ci aiuta a calibrare il report sulla tua fase di vita.',
    type: 'multiple_choice',
    options: ['Meno di 22', '22–26', '27–32', '33–40', 'Più di 40']
  },
  {
    id: 'momento',
    text: 'In che momento sei della tua vita professionale?',
    context: null,
    type: 'multiple_choice',
    options: [
      'Ho appena finito gli studi e sto capendo cosa fare',
      'Ho iniziato a lavorare ma non sono sicuro che sia la strada giusta',
      'Lavoro da anni ma sento che qualcosa non torna',
      'So già cosa voglio, cerco conferma'
    ]
  },
  {
    id: 'background',
    text: 'Qual è il tuo background formativo?',
    context: null,
    type: 'multiple_choice',
    options: [
      'Umanistico, comunicazione, lingue',
      'Economico, gestionale, aziendale',
      'Scientifico, tecnico, ingegneristico',
      'Giuridico, politico, relazioni internazionali',
      'Artistico, creativo, design',
      'Sanitario, biologico, psicologico',
      'Nessun percorso formale specifico'
    ]
  },
  {
    id: 'lavoro',
    text: 'Hai già esperienza lavorativa?',
    context: null,
    type: 'multiple_choice',
    options: [
      'No, sono ancora in formazione',
      'Sì, ho fatto qualcosa ma non è la mia strada',
      'Sì, e mi piace ma voglio capire dove può portarmi',
      'Sì, ma voglio cambiare completamente direzione'
    ]
  },
  {
    id: 'attrazione',
    text: 'Quando sei completamente preso da qualcosa, cosa stai facendo?',
    context: 'Pensa all\'ultima volta che il tempo è volato.',
    type: 'multiple_choice',
    options: [
      'Sto risolvendo un problema complesso',
      'Sto creando qualcosa che prima non esisteva',
      'Sto spiegando o convincendo qualcuno',
      'Sto organizzando e portando ordine nel caos',
      'Sto aiutando qualcuno a stare meglio o a crescere',
      'Sto esplorando qualcosa che non conosco ancora'
    ]
  }
];

// Domanda sul ruolo lavorativo (se lavora)
const WORK_ROLE_QUESTION = {
  id: 'ruolo_attuale',
  text: 'Descrivimi il tuo lavoro attuale.',
  context: 'Scrivi il tuo ruolo, il tipo di attività che fai e il settore. Ci aiuterà a capire se il report rispecchia davvero la tua situazione.',
  type: 'open'
};

// ─── VARIANTI ATTIVITÀ ────────────────────────────────────────
const ACTIVITY_VARIANTS = {
  riunione: [
    {
      items: [
        { time: '09:00', title: 'Workshop creativo — nuovi concept' },
        { time: '10:30', title: 'Review dati Q1 con il team analytics' },
        { time: '14:00', title: '1:1 con un collega in difficoltà' },
        { time: '16:00', title: 'Strategia go-to-market nuovo prodotto' }
      ]
    },
    {
      items: [
        { time: '09:30', title: 'Brainstorming con il team su un problema aperto' },
        { time: '11:00', title: 'Presentazione risultati al management' },
        { time: '14:30', title: 'Formazione su un nuovo strumento' },
        { time: '16:30', title: 'Call con un cliente importante' }
      ]
    },
    {
      items: [
        { time: '08:30', title: 'Pianificazione settimanale con il team' },
        { time: '10:00', title: 'Deep dive su un progetto complesso' },
        { time: '15:00', title: 'Sessione di feedback con un junior' },
        { time: '17:00', title: 'Esplorazione di nuove opportunità di mercato' }
      ]
    }
  ],
  termometro: [
    [
      'Analizzi dati da zero per trovare un pattern nascosto',
      'Presenti una proposta a un cliente che non conosci',
      'Aiuti un collega a sbloccarsi su un problema difficile',
      'Gestisci un progetto con deadline strette e molte dipendenze',
      'Esplori un territorio nuovo senza una direzione precisa',
      'Scrivi un documento che definirà la strategia del prossimo anno'
    ],
    [
      'Devi convincere qualcuno di un\'idea in cui credi',
      'Lavori da solo per ore su qualcosa di tecnico',
      'Organizzi un evento con molte variabili',
      'Ricevi un feedback negativo su un lavoro fatto bene',
      'Ti viene chiesto di improvvisare davanti a un gruppo',
      'Risolvi un bug o un problema urgente sotto pressione'
    ],
    [
      'Crei qualcosa di visivo da zero',
      'Fai una riunione dopo l\'altra per tutto il giorno',
      'Scrivi un testo lungo e complesso',
      'Negozi qualcosa di importante',
      'Impari qualcosa che non sapevi nulla il giorno prima',
      'Ti occupi di qualcosa di routinario ma necessario'
    ]
  ],
  dilemma: [
    [
      { a: 'Lavoro ad alto impatto ma poca libertà', b: 'Lavoro autonomo ma impatto incerto' },
      { a: 'Crescita rapida in un contesto caotico', b: 'Crescita lenta in un contesto solido' },
      { a: 'Essere riconosciuto pubblicamente', b: 'Sapere di aver fatto la cosa giusta' },
      { a: 'Specializzarsi profondamente in un campo', b: 'Spaziare su molti ambiti diversi' }
    ],
    [
      { a: 'Lavorare con persone brillanti in un settore che non ti appassiona', b: 'Lavorare da solo in qualcosa che ami' },
      { a: 'Stipendio alto con poco tempo libero', b: 'Stipendio medio con molta flessibilità' },
      { a: 'Ruolo con responsabilità chiare e processi definiti', b: 'Ruolo ambiguo dove costruisci tutto da zero' },
      { a: 'Fare bene una cosa', b: 'Fare molte cose abbastanza bene' }
    ],
    [
      { a: 'Rischio alto, ricompensa alta', b: 'Stabilità, crescita graduale' },
      { a: 'Cambiare settore ogni 3 anni', b: 'Diventare il migliore in un settore' },
      { a: 'Sapere sempre cosa ti aspetta', b: 'Essere sorpreso da dove ti porta il lavoro' },
      { a: 'Lavorare per la missione, non per i soldi', b: 'Lavorare per i soldi e usarli per la missione' }
    ]
  ]
};

function getRandomVariant(key) {
  const variants = ACTIVITY_VARIANTS[key];
  return variants[Math.floor(Math.random() * variants.length)];
}

// ─── CHIAMATA API ─────────────────────────────────────────────
async function callClaude(fase = 'test') {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: state.conversationHistory,
      fase
    })
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
    return null;
  }
}

// ─── PROGRESS BAR ─────────────────────────────────────────────
function updateProgress() {
  const total = 22; // stima domande totali
  const done = state.questionCount;
  const pct = Math.min(95, Math.round((done / total) * 100));
  document.getElementById('progress-bar').style.width = pct + '%';
}

// ─── FASE ─────────────────────────────────────────────────────
function updatePhase(phase) {
  state.currentPhase = phase;
  const phases = {
    building:  { label: 'Stiamo costruendo il tuo profilo', dots: [1, 0, 0, 0] },
    deepening: { label: 'Stiamo approfondendo',             dots: [1, 1, 0, 0] },
    almost:    { label: 'Quasi fatto',                       dots: [1, 1, 1, 0] },
    done:      { label: 'Abbiamo quello che ci serve',       dots: [1, 1, 1, 1] }
  };

  const p = phases[phase] || phases.building;
  document.getElementById('phase-label').textContent = p.label;

  p.dots.forEach((active, i) => {
    const dot = document.getElementById(`dot-${i + 1}`);
    if (!dot) return;
    dot.className = 'phase-dot';
    if (active) dot.classList.add(i < p.dots.indexOf(1, p.dots.lastIndexOf(1)) ? 'done' : 'active');
    if (i === p.dots.lastIndexOf(1)) dot.classList.add('active');
  });
}

// ─── RENDER DOMANDA ───────────────────────────────────────────
function renderQuestion(questionData) {
  state.lastQuestionTime = Date.now();
  state.currentQuestion = questionData;
  saveState();

  stopThinking();
  document.getElementById('thinking-state').classList.add('hidden');
  document.getElementById('activity-area').classList.add('hidden');
  document.getElementById('active-question').classList.remove('hidden');

  // Animazione testo
  const textEl = document.getElementById('question-text');
  textEl.style.animation = 'none';
  textEl.offsetHeight;
  textEl.style.animation = '';
  textEl.textContent = questionData.text;

  // Contesto
  const ctxEl = document.getElementById('question-context');
  if (questionData.context) {
    ctxEl.textContent = questionData.context;
    ctxEl.classList.remove('hidden');
  } else {
    ctxEl.classList.add('hidden');
  }

  // Input
  const inputEl = document.getElementById('question-input');
  inputEl.innerHTML = '';

  if (questionData.type === 'multiple_choice') {
    renderMultipleChoice(inputEl, questionData);
  } else {
    renderOpenInput(inputEl, questionData);
  }

  updateProgress();
}

function renderMultipleChoice(container, questionData) {
  const grid = document.createElement('div');
  grid.className = 'options-grid';

  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  questionData.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="option-letter">${letters[i]}</span><span>${opt}</span>`;
    btn.addEventListener('click', () => selectOption(btn, opt, questionData));
    grid.appendChild(btn);
  });

  container.appendChild(grid);

  // Link per risposta aperta
  const openLink = document.createElement('button');
  openLink.className = 'open-toggle';
  openLink.textContent = 'Preferisci rispondere con parole tue →';
  openLink.addEventListener('click', () => {
    container.innerHTML = '';
    renderOpenInput(container, questionData);
  });
  container.appendChild(openLink);
}

function renderOpenInput(container, questionData) {
  const area = document.createElement('div');
  area.className = 'open-input-area';

  const textarea = document.createElement('textarea');
  textarea.className = 'open-input';
  textarea.placeholder = 'Scrivi qui la tua risposta...';

  const actions = document.createElement('div');
  actions.className = 'open-input-actions';

  // Torna alle opzioni (se disponibili)
  if (questionData.options) {
    const backLink = document.createElement('button');
    backLink.className = 'open-toggle';
    backLink.textContent = '← Torna alle opzioni';
    backLink.style.marginRight = 'auto';
    backLink.addEventListener('click', () => {
      container.innerHTML = '';
      renderMultipleChoice(container, questionData);
    });
    actions.appendChild(backLink);
  }

  const btn = document.createElement('button');
  btn.className = 'btn btn--primary';
  btn.textContent = 'Continua';
  btn.addEventListener('click', () => {
    const val = textarea.value.trim();
    if (val) submitAnswer(val, questionData);
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = textarea.value.trim();
      if (val) submitAnswer(val, questionData);
    }
  });

  actions.appendChild(btn);
  area.appendChild(textarea);
  area.appendChild(actions);
  container.appendChild(area);

  setTimeout(() => textarea.focus(), 100);
}

// ─── SELEZIONE OPZIONE ────────────────────────────────────────
function selectOption(btn, value, questionData) {
  btn.closest('.options-grid').querySelectorAll('.option-btn')
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  setTimeout(() => submitAnswer(value, questionData), 280);
}

// ─── SUBMIT ───────────────────────────────────────────────────
async function submitAnswer(value, questionData) {
  const responseTime = Date.now() - state.lastQuestionTime;

  // Salva nello stack
  state.history.push({
    type: 'question',
    questionData,
    conversationLength: state.conversationHistory.length,
    questionCount: state.questionCount,
    fixedCount: state.fixedCount,
    adaptiveCount: state.adaptiveCount
  });

  // Controlla se lavora (per domanda sul ruolo)
  if (questionData.id === 'lavoro') {
    const worksOptions = [
      'Sì, ho fatto qualcosa ma non è la mia strada',
      'Sì, e mi piace ma voglio capire dove può portarmi',
      'Sì, ma voglio cambiare completamente direzione'
    ];
    state.worksCurrently = worksOptions.some(o => value.startsWith(o.substring(0, 15)));
  }

  state.conversationHistory.push({
    role: 'user',
    content: `Risposta: "${value}" (tempo: ${Math.round(responseTime / 1000)}s)`
  });

  state.answers.push({ id: questionData.id, question: questionData.text, answer: value, time: responseTime });
  state.questionCount++;

  if (state.fixedCount < STANDARD_QUESTIONS.length) {
    state.fixedCount++;
  } else {
    state.adaptiveCount++;
  }

  saveState();

  // Dopo la 5a domanda standard, chiedi il ruolo se lavora
  if (state.fixedCount === 5 && state.worksCurrently && !state.answers.find(a => a.id === 'ruolo_attuale')) {
    renderQuestion(WORK_ROLE_QUESTION);
    return;
  }

  // Attività dopo domanda 3
  if (state.fixedCount === 3 && !state.activityResults['riunione']) {
    showActivity('riunione');
    return;
  }

  // Attività dopo domanda 5 (o dopo ruolo_attuale)
  if ((state.fixedCount === 5 || questionData.id === 'ruolo_attuale') && !state.activityResults['termometro']) {
    showActivity('termometro');
    return;
  }

  await getNextStep();
}

// ─── PROSSIMO STEP ────────────────────────────────────────────
async function getNextStep() {
  showThinking();

  // Dopo le 5 standard inizia Claude
  if (state.fixedCount < STANDARD_QUESTIONS.length) {
    renderQuestion(STANDARD_QUESTIONS[state.fixedCount]);
    return;
  }

  const result = await callClaude('test');

  if (!result) {
    console.error('Risposta Claude non valida');
    stopThinking();
    return;
  }

  if (result.phase) updatePhase(result.phase);

  state.conversationHistory.push({
    role: 'assistant',
    content: JSON.stringify(result)
  });

  saveState();

  if (result.action === 'report') {
    goToReport();
  } else if (result.action === 'ask' && result.question) {
    // Attività Dilemma dopo 7 domande totali
    if (state.questionCount >= 7 && !state.activityResults['dilemma']) {
      showActivity('dilemma');
      return;
    }
    // Attività Costruisci a metà adattive
    if (state.adaptiveCount >= 4 && !state.activityResults['costruisci']) {
      showActivity('costruisci');
      return;
    }
    stopThinking();
    renderQuestion(result.question);
  }
}

// ─── THINKING ─────────────────────────────────────────────────
function showThinking() {
  document.getElementById('active-question').classList.add('hidden');
  document.getElementById('activity-area').classList.add('hidden');
  document.getElementById('thinking-state').classList.remove('hidden');
  startThinking();
}

// ─── ATTIVITÀ ─────────────────────────────────────────────────
function showActivity(activityId) {
  stopThinking();
  document.getElementById('active-question').classList.add('hidden');
  document.getElementById('thinking-state').classList.add('hidden');

  const area = document.getElementById('activity-area');
  area.classList.remove('hidden');
  area.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'activity-card';

  const activities = {
    riunione: {
      eyebrow: 'Attività 1 di 4',
      title: 'Riunione o No',
      subtitle: 'È lunedì mattina. Apri il calendario — quale di queste riunioni apriresti con più piacere?',
      render: (c) => renderRiunione(c, getRandomVariant('riunione'))
    },
    termometro: {
      eyebrow: 'Attività 2 di 4',
      title: 'Il Termometro',
      subtitle: 'Sei scenari lavorativi. Come ti fanno sentire?',
      render: (c) => renderTermometro(c, getRandomVariant('termometro'))
    },
    dilemma: {
      eyebrow: 'Attività 3 di 4',
      title: 'Il Dilemma Impossibile',
      subtitle: 'Scelte difficili. Non esiste la risposta giusta — scegli quella che senti più tua.',
      render: (c) => renderDilemma(c, getRandomVariant('dilemma'))
    },
    costruisci: {
      eyebrow: 'Attività 4 di 4',
      title: 'Costruisci la Settimana',
      subtitle: 'Scegli 5 attività su 10 per costruire la tua settimana ideale.',
      render: (c) => renderCostruisci(c)
    }
  };

  const act = activities[activityId];
  card.innerHTML = `
    <div class="activity-eyebrow">${act.eyebrow}</div>
    <div class="activity-title">${act.title}</div>
    <div class="activity-subtitle">${act.subtitle}</div>
    <div id="activity-content"></div>
  `;
  area.appendChild(card);
  act.render(document.getElementById('activity-content'));
}

// Riunione
function renderRiunione(container, variant) {
  const grid = document.createElement('div');
  grid.className = 'riunione-grid';

  variant.items.forEach((item, i) => {
    const card = document.createElement('button');
    card.className = 'riunione-card';
    card.innerHTML = `<div class="riunione-time">${item.time}</div><div class="riunione-title">${item.title}</div>`;
    card.addEventListener('click', () => {
      grid.querySelectorAll('.riunione-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setTimeout(() => completeActivity('riunione', { scelta: item.title, indice: i }), 400);
    });
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// Termometro
function renderTermometro(container, scenarios) {
  const reactions = ['😩', '😐', '😍'];
  const results = {};
  let completed = 0;

  const grid = document.createElement('div');
  grid.className = 'termometro-grid';

  scenarios.forEach((scenario, i) => {
    const row = document.createElement('div');
    row.className = 'termometro-row';

    const reactionBtns = document.createElement('div');
    reactionBtns.className = 'termometro-reactions';

    reactions.forEach((emoji, r) => {
      const btn = document.createElement('button');
      btn.className = 'reaction-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', () => {
        reactionBtns.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        results[i] = { scenario, reaction: emoji, value: r };
        completed++;
        if (completed === scenarios.length) {
          setTimeout(() => completeActivity('termometro', results), 500);
        }
      });
      reactionBtns.appendChild(btn);
    });

    row.innerHTML = `<span class="termometro-scenario">${scenario}</span>`;
    row.appendChild(reactionBtns);
    grid.appendChild(row);
  });

  container.appendChild(grid);
}

// Dilemma
function renderDilemma(container, pairs) {
  const results = {};
  let completed = 0;

  pairs.forEach((pair, i) => {
    const pairEl = document.createElement('div');
    pairEl.className = 'dilemma-pair';

    const optA = document.createElement('button');
    optA.className = 'dilemma-option';
    optA.textContent = pair.a;

    const vs = document.createElement('span');
    vs.className = 'dilemma-vs';
    vs.textContent = 'o';

    const optB = document.createElement('button');
    optB.className = 'dilemma-option';
    optB.textContent = pair.b;

    const select = (chosen, other, value) => {
      chosen.classList.add('selected');
      other.classList.remove('selected');
      results[i] = { a: pair.a, b: pair.b, scelta: value };
      completed++;
      if (completed === pairs.length) {
        setTimeout(() => completeActivity('dilemma', results), 500);
      }
    };

    optA.addEventListener('click', () => select(optA, optB, 'a'));
    optB.addEventListener('click', () => select(optB, optA, 'b'));

    pairEl.appendChild(optA);
    pairEl.appendChild(vs);
    pairEl.appendChild(optB);
    container.appendChild(pairEl);
  });
}

// Costruisci la settimana
function renderCostruisci(container) {
  const maxSelect = 5;
  const selected = new Set();
  const items = [
    'Analizzare dati e trovare pattern',
    'Incontrare clienti o partner nuovi',
    'Scrivere un documento strategico',
    'Lavorare in autonomia su un progetto',
    'Fare formazione e imparare qualcosa di nuovo',
    'Coordinare il lavoro di un team',
    'Creare qualcosa da zero',
    'Risolvere un problema urgente e complesso',
    'Fare presentazioni o pitching',
    'Tempo libero non strutturato per esplorare'
  ];

  const counter = document.createElement('div');
  counter.style.cssText = 'font-size:0.82rem;color:var(--text-muted);margin-bottom:14px;';
  counter.textContent = `0 / ${maxSelect} selezionate`;

  const grid = document.createElement('div');
  grid.className = 'options-grid';

  items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="option-letter">${i + 1}</span><span>${item}</span>`;

    btn.addEventListener('click', () => {
      if (selected.has(i)) {
        selected.delete(i);
        btn.classList.remove('selected');
      } else if (selected.size < maxSelect) {
        selected.add(i);
        btn.classList.add('selected');
      }

      counter.textContent = `${selected.size} / ${maxSelect} selezionate`;

      if (selected.size === maxSelect) {
        const result = [...selected].map(idx => items[idx]);
        setTimeout(() => completeActivity('costruisci', { scelte: result }), 400);
      }
    });

    grid.appendChild(btn);
  });

  container.appendChild(counter);
  container.appendChild(grid);
}

// ─── COMPLETA ATTIVITÀ ────────────────────────────────────────
async function completeActivity(activityId, result) {
  state.activityResults[activityId] = result;
  state.conversationHistory.push({
    role: 'user',
    content: `[Attività: ${activityId}] ${JSON.stringify(result)}`
  });
  state.questionCount++;
  saveState();

  // Smonta l'annuncio come ultima attività
  if (activityId === 'costruisci' && !state.activityResults['smonta']) {
    showSmonta();
    return;
  }

  await getNextStep();
}

// Smonta l'annuncio
function showSmonta() {
  stopThinking();
  const area = document.getElementById('activity-area');
  area.classList.remove('hidden');
  area.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'activity-card';
  card.innerHTML = `
    <div class="activity-eyebrow">Ultima attività</div>
    <div class="activity-title">Smonta l'Annuncio</div>
    <div class="activity-subtitle">Tocca ogni riga: verde = mi attira, rosso = mi spaventa, giallo = non so.</div>
    <div id="activity-content"></div>
  `;
  area.appendChild(card);

  const content = document.getElementById('activity-content');
  const testo = `Account Manager — Zona Roma

Siamo una realtà in forte crescita nel settore dei servizi digitali B2B. Cerchiamo una persona che voglia costruire relazioni durature con i clienti e contribuire allo sviluppo commerciale.

Cosa farai:
• Gestire e sviluppare un portafoglio clienti esistente
• Identificare nuove opportunità di crescita
• Lavorare con il team marketing e prodotto
• Partecipare a fiere ed eventi di settore

Cosa cerchiamo:
• 2-4 anni di esperienza in ruoli commerciali
• Ottima capacità di ascolto e orientamento alla relazione
• Autonomia e spirito d'iniziativa
• Disponibilità a trasferte nella zona assegnata`;

  const result = { verde: [], rosso: [], giallo: [] };
  const intro = document.createElement('p');
  intro.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin-bottom:14px;';
  intro.textContent = 'Tocca una riga per ciclarla: verde → rosso → giallo → nessuno.';

  const annuncio = document.createElement('div');
  annuncio.style.cssText = 'background:var(--deep);border:1px solid var(--card-border);border-radius:var(--radius-md);padding:18px;';

  testo.split('\n').filter(r => r.trim()).forEach(riga => {
    const row = document.createElement('div');
    row.style.cssText = 'padding:6px 8px;border-radius:6px;cursor:pointer;font-size:0.88rem;color:var(--text-secondary);line-height:1.5;margin-bottom:4px;transition:background 0.15s,color 0.15s;';
    row.textContent = riga;
    let stato = null;

    row.addEventListener('click', () => {
      if (stato === null) stato = 'verde';
      else if (stato === 'verde') stato = 'rosso';
      else if (stato === 'rosso') stato = 'giallo';
      else stato = null;

      row.style.background = stato === 'verde' ? 'rgba(29,158,117,0.15)' :
                              stato === 'rosso' ? 'rgba(255,100,150,0.15)' :
                              stato === 'giallo' ? 'rgba(255,200,50,0.1)' : 'transparent';
      row.style.color = stato === 'verde' ? 'var(--emerald-light)' :
                        stato === 'rosso' ? 'var(--rose-light)' :
                        stato === 'giallo' ? '#FFD060' : 'var(--text-secondary)';
    });

    annuncio.appendChild(row);
  });

  const btn = document.createElement('button');
  btn.className = 'btn btn--primary mt-16';
  btn.textContent = 'Conferma e continua';
  btn.addEventListener('click', () => {
    annuncio.querySelectorAll('div').forEach(row => {
      const bg = row.style.background;
      if (bg.includes('1D9E75') || bg.includes('29,158,117')) result.verde.push(row.textContent);
      else if (bg.includes('FF6496') || bg.includes('255,100,150')) result.rosso.push(row.textContent);
      else if (bg.includes('FFD060') || bg.includes('255,200,50')) result.giallo.push(row.textContent);
    });
    completeActivity('smonta', result);
  });

  content.appendChild(intro);
  content.appendChild(annuncio);
  content.appendChild(btn);
}

// ─── TORNA INDIETRO ───────────────────────────────────────────
function goBack() {
  if (state.history.length === 0) return;
  const prev = state.history.pop();

  state.conversationHistory = state.conversationHistory.slice(0, prev.conversationLength);
  state.questionCount = prev.questionCount;
  state.fixedCount = prev.fixedCount;
  state.adaptiveCount = prev.adaptiveCount;

  saveState();
  renderQuestion(prev.questionData);
}

// ─── VAI AL REPORT ────────────────────────────────────────────
function goToReport() {
  stopThinking();
  updatePhase('done');
  document.getElementById('progress-bar').style.width = '100%';

  sessionStorage.setItem('rf_history', JSON.stringify(state.conversationHistory));
  sessionStorage.setItem('rf_activities', JSON.stringify(state.activityResults));

  clearState();

  setTimeout(() => {
    window.location.href = 'report.html';
  }, 600);
}

// ─── INIT ─────────────────────────────────────────────────────
function init() {
  // Prova a ripristinare sessione salvata
  const restored = loadState();

  if (restored && state.currentQuestion && state.questionCount > 0) {
    // Ripristina fase
    updatePhase(state.currentPhase);
    updateProgress();

    // Mostra messaggio di ripristino
    const area = document.getElementById('question-area');
    const notice = document.createElement('div');
    notice.style.cssText = 'font-size:0.82rem;color:var(--emerald-light);margin-bottom:16px;opacity:0.8;';
    notice.textContent = '✓ Progressi ripristinati — sei al punto dove ti eri fermato.';

    document.getElementById('active-question').classList.remove('hidden');
    document.getElementById('active-question').prepend(notice);

    renderQuestion(state.currentQuestion);
    return;
  }

  // Inizia da zero
  clearState();
  state.conversationHistory.push({
    role: 'user',
    content: 'Inizia il test. Sono pronto.'
  });

  renderQuestion(STANDARD_QUESTIONS[0]);
}

document.addEventListener('DOMContentLoaded', init);
