// ─── STATO GLOBALE ───────────────────────────────────────────
const state = {
  conversationHistory: [],  // messaggi inviati a Claude
  answers: [],              // risposte utente con timestamp
  activityResults: {},      // risultati attività interattive
  questionCount: 0,         // totale domande (fisse + adattive)
  fixedCount: 0,            // domande fisse completate
  adaptiveCount: 0,         // domande adattive completate
  currentPhase: 'building', // building | deepening | almost | done
  lastQuestionTime: null,   // per calcolo tempo risposta
  history: [],              // stack per torna indietro
};

// ─── 7 DOMANDE FISSE ─────────────────────────────────────────
const FIXED_QUESTIONS = [
  {
    id: 'eta',
    text: 'Quanti anni hai?',
    type: 'multiple_choice',
    options: ['Meno di 22', '22–26', '27–32', '33–40', 'Più di 40']
  },
  {
    id: 'momento',
    text: 'In che momento sei della tua vita professionale?',
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
    type: 'multiple_choice',
    options: [
      'Sto risolvendo un problema complesso',
      'Sto creando qualcosa che prima non esisteva',
      'Sto spiegando o convincendo qualcuno',
      'Sto organizzando e portando ordine nel caos',
      'Sto aiutando qualcuno a stare meglio o a crescere',
      'Sto esplorando qualcosa che non conosco ancora'
    ]
  },
  {
    id: 'bisogno',
    text: 'Cosa deve esserci nel lavoro perché tu stia davvero bene?',
    type: 'multiple_choice',
    options: [
      'Vedere l\'impatto concreto di quello che faccio',
      'Avere libertà di decidere come fare le cose',
      'Sapere che sto crescendo e imparando',
      'Avere stabilità e chiarezza su cosa mi aspetta',
      'Sentire che quello che faccio conta per qualcuno',
      'Essere riconosciuto per quello che valgo'
    ]
  },
  {
    id: 'pensiero',
    text: 'Davanti a qualcosa di nuovo e complesso, qual è il tuo primo istinto?',
    type: 'multiple_choice',
    options: [
      'Cerco dati e informazioni prima di muovermi',
      'Parto subito e aggiusto mentre vado',
      'Ne parlo con qualcuno di cui mi fido',
      'Cerco un metodo o un processo da seguire',
      'Immagino come potrebbe essere e lavoro da lì'
    ]
  }
];

// ─── ATTIVITÀ INTERATTIVE ────────────────────────────────────
// Inserite dopo: domanda 3, 5, 7, metà adattive, ultima
const ACTIVITIES = {
  riunione: {
    id: 'riunione',
    title: 'Riunione o No',
    subtitle: 'È lunedì mattina. Apri il calendario e vedi queste 4 riunioni. Qual è quella che apriresti con più piacere?',
    type: 'riunione',
    items: [
      { time: '09:00', title: 'Workshop creativo — nuovi concept' },
      { time: '10:30', title: 'Review dati Q1 con il team analytics' },
      { time: '14:00', title: '1:1 con un collega in difficoltà' },
      { time: '16:00', title: 'Strategia go-to-market nuovo prodotto' }
    ]
  },
  termometro: {
    id: 'termometro',
    title: 'Il Termometro della Settimana',
    subtitle: 'Sei scenari di una settimana lavorativa. Come ti fanno sentire?',
    type: 'termometro',
    items: [
      'Passi 3 ore a costruire un\'analisi da zero con i dati grezzi',
      'Presenti una proposta a un cliente che non conosci',
      'Aiuti un collega a sbloccarsi su un problema difficile',
      'Gestisci un progetto con deadline strette e molte dipendenze',
      'Esplori un territorio nuovo senza una direzione precisa',
      'Scrivi un documento che definirà la strategia del prossimo anno'
    ]
  },
  dilemma: {
    id: 'dilemma',
    title: 'Il Dilemma Impossibile',
    subtitle: 'Quattro scelte difficili. Non esiste la risposta giusta — scegli quella che senti più tua.',
    type: 'dilemma',
    pairs: [
      { a: 'Lavoro ad alto impatto ma poca libertà', b: 'Lavoro autonomo ma impatto incerto' },
      { a: 'Crescita rapida in un contesto caotico', b: 'Crescita lenta in un contesto solido' },
      { a: 'Essere riconosciuto pubblicamente', b: 'Sapere di aver fatto la cosa giusta' },
      { a: 'Specializzarsi profondamente in un campo', b: 'Spaziare su molti ambiti diversi' }
    ]
  }
};

// Quando inserire le attività (dopo quale domanda fissa)
const ACTIVITY_AFTER_FIXED = {
  3: 'riunione',
  5: 'termometro',
  7: 'dilemma'
};

// ─── CHIAMATA API ─────────────────────────────────────────────
async function callClaude(fase = 'test') {
  const response = await fetch('/.netlify/functions/claude', {
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
    // fallback se il JSON non è pulito
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

// ─── AVANZAMENTO FASE ─────────────────────────────────────────
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
    if (active) dot.classList.add('active');
  });
}

// ─── RENDER DOMANDA ───────────────────────────────────────────
function renderQuestion(questionData) {
  state.lastQuestionTime = Date.now();

  document.getElementById('thinking-state').classList.add('hidden');
  document.getElementById('activity-area').classList.add('hidden');
  document.getElementById('active-question').classList.remove('hidden');

  // Aggiorna testo (con animazione via CSS)
  const textEl = document.getElementById('question-text');
  textEl.style.animation = 'none';
  textEl.offsetHeight; // reflow
  textEl.style.animation = '';
  textEl.textContent = questionData.text;

  // Render input
  const inputEl = document.getElementById('question-input');
  inputEl.innerHTML = '';

  if (questionData.type === 'multiple_choice') {
    const grid = document.createElement('div');
    grid.className = 'options-grid';

    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    questionData.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `
        <span class="option-letter">${letters[i]}</span>
        <span>${opt}</span>
      `;
      btn.addEventListener('click', () => selectOption(btn, opt, questionData));
      grid.appendChild(btn);
    });

    inputEl.appendChild(grid);

  } else {
    // Testo aperto
    const area = document.createElement('div');
    area.className = 'open-input-area';

    const textarea = document.createElement('textarea');
    textarea.className = 'open-input';
    textarea.placeholder = 'Scrivi qui la tua risposta...';
    textarea.id = 'open-answer';

    const actions = document.createElement('div');
    actions.className = 'open-input-actions';

    const btn = document.createElement('button');
    btn.className = 'btn btn--primary';
    btn.textContent = 'Continua';
    btn.addEventListener('click', () => {
      const val = textarea.value.trim();
      if (val) submitAnswer(val, questionData);
    });

    // Invio con Enter (Shift+Enter per andare a capo)
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
    inputEl.appendChild(area);

    setTimeout(() => textarea.focus(), 100);
  }
}

// ─── SELEZIONE OPZIONE ────────────────────────────────────────
function selectOption(btn, value, questionData) {
  // Feedback visivo immediato
  btn.closest('.options-grid').querySelectorAll('.option-btn')
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  // Piccolo delay per far vedere la selezione, poi avanza
  setTimeout(() => submitAnswer(value, questionData), 300);
}

// ─── SUBMIT RISPOSTA ──────────────────────────────────────────
async function submitAnswer(value, questionData) {
  const responseTime = Date.now() - state.lastQuestionTime;

  // Salva nello stack per torna indietro
  state.history.push({
    type: 'question',
    questionData,
    conversationLength: state.conversationHistory.length
  });

  // Aggiungi alla history di conversazione
  const userMessage = `Risposta: "${value}" (tempo: ${Math.round(responseTime / 1000)}s)`;
  state.conversationHistory.push({ role: 'user', content: userMessage });

  state.answers.push({ question: questionData.text, answer: value, time: responseTime });
  state.questionCount++;

  // Conta fisse vs adattive
  if (state.fixedCount < FIXED_QUESTIONS.length) {
    state.fixedCount++;
  } else {
    state.adaptiveCount++;
  }

  // Controlla se mostrare attività dopo questa domanda fissa
  if (ACTIVITY_AFTER_FIXED[state.fixedCount] && state.fixedCount <= 7) {
    const actId = ACTIVITY_AFTER_FIXED[state.fixedCount];
    if (!state.activityResults[actId]) {
      showActivity(ACTIVITIES[actId]);
      return;
    }
  }

  await getNextStep();
}

// ─── PROSSIMO STEP DA CLAUDE ──────────────────────────────────
async function getNextStep() {
  showThinking();

  const result = await callClaude('test');

  if (!result) {
    console.error('Risposta Claude non valida');
    return;
  }

  // Aggiorna fase
  if (result.phase) updatePhase(result.phase);

  // Aggiungi risposta Claude alla history
  state.conversationHistory.push({
    role: 'assistant',
    content: JSON.stringify(result)
  });

  if (result.action === 'report') {
    // Vai al report
    goToReport();
  } else if (result.action === 'ask' && result.question) {
    // Controlla se inserire l'attività "Costruisci la Settimana" a metà adattive
    if (state.adaptiveCount === 4 && !state.activityResults['costruisci']) {
      showActivity(buildCostruisciActivity());
    } else {
      renderQuestion(result.question);
    }
  }
}

// ─── MOSTRA THINKING ─────────────────────────────────────────
function showThinking() {
  document.getElementById('active-question').classList.add('hidden');
  document.getElementById('activity-area').classList.add('hidden');
  document.getElementById('thinking-state').classList.remove('hidden');
}

// ─── ATTIVITÀ INTERATTIVE ────────────────────────────────────
function showActivity(activity) {
  document.getElementById('active-question').classList.add('hidden');
  document.getElementById('thinking-state').classList.add('hidden');

  const area = document.getElementById('activity-area');
  area.classList.remove('hidden');
  area.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'activity-card';
  card.innerHTML = `
    <div class="activity-title">${activity.title}</div>
    <div class="activity-subtitle">${activity.subtitle}</div>
    <div id="activity-content"></div>
  `;
  area.appendChild(card);

  const content = document.getElementById('activity-content');

  switch (activity.type) {
    case 'riunione':   renderRiunione(content, activity); break;
    case 'termometro': renderTermometro(content, activity); break;
    case 'dilemma':    renderDilemma(content, activity); break;
    case 'costruisci': renderCostruisci(content, activity); break;
    case 'smonta':     renderSmonta(content, activity); break;
  }
}

// Riunione o No
function renderRiunione(container, activity) {
  const grid = document.createElement('div');
  grid.className = 'riunione-grid';

  let selected = null;

  activity.items.forEach((item, i) => {
    const card = document.createElement('button');
    card.className = 'riunione-card';
    card.innerHTML = `
      <div class="riunione-time">${item.time}</div>
      <div class="riunione-title">${item.title}</div>
    `;
    card.addEventListener('click', () => {
      grid.querySelectorAll('.riunione-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selected = item.title;
      setTimeout(() => completeActivity('riunione', { scelta: selected, indice: i }), 400);
    });
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// Termometro della Settimana
function renderTermometro(container, activity) {
  const reactions = ['😩', '😐', '😍'];
  const results = {};
  let completed = 0;

  const grid = document.createElement('div');
  grid.className = 'termometro-grid';

  activity.items.forEach((scenario, i) => {
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
        if (completed === activity.items.length) {
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

// Dilemma Impossibile
function renderDilemma(container, activity) {
  const results = {};
  let completed = 0;

  activity.pairs.forEach((pair, i) => {
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

    const selectDilemma = (chosen, other, value) => {
      chosen.classList.add('selected');
      other.classList.remove('selected');
      results[i] = { a: pair.a, b: pair.b, scelta: value };
      completed++;
      if (completed === activity.pairs.length) {
        setTimeout(() => completeActivity('dilemma', results), 500);
      }
    };

    optA.addEventListener('click', () => selectDilemma(optA, optB, 'a'));
    optB.addEventListener('click', () => selectDilemma(optB, optA, 'b'));

    pairEl.appendChild(optA);
    pairEl.appendChild(vs);
    pairEl.appendChild(optB);
    container.appendChild(pairEl);
  });
}

// Costruisci la Settimana (drag semplificato: click per selezionare/deselezionare)
function buildCostruisciActivity() {
  return {
    id: 'costruisci',
    title: 'Costruisci la tua Settimana',
    subtitle: 'Scegli 5 attività tra queste 10 per costruire la tua settimana ideale.',
    type: 'costruisci',
    items: [
      'Analizzare dati e costruire report',
      'Incontrare clienti o partner nuovi',
      'Scrivere un documento strategico',
      'Lavorare in autonomia su un progetto',
      'Fare formazione e imparare qualcosa di nuovo',
      'Coordinare il lavoro di un team',
      'Creare qualcosa da zero',
      'Risolvere un problema urgente e complesso',
      'Fare presentazioni o pitching',
      'Avere tempo non strutturato per esplorare'
    ]
  };
}

function renderCostruisci(container, activity) {
  const maxSelect = 5;
  const selected = new Set();

  const counter = document.createElement('div');
  counter.className = 'text-muted mt-8';
  counter.style.fontSize = '0.85rem';
  counter.style.marginBottom = '16px';
  counter.textContent = `0 / ${maxSelect} selezionate`;

  const grid = document.createElement('div');
  grid.className = 'options-grid';

  activity.items.forEach((item, i) => {
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
        const result = [...selected].map(idx => activity.items[idx]);
        setTimeout(() => completeActivity('costruisci', { scelte: result }), 400);
      }
    });

    grid.appendChild(btn);
  });

  container.appendChild(counter);
  container.appendChild(grid);
}

// Smonta l'Annuncio — ultima attività
function buildSmontaActivity() {
  return {
    id: 'smonta',
    title: "Smonta l'Annuncio",
    subtitle: 'Leggi questo annuncio. Evidenzia in verde quello che ti attrae, in rosso quello che ti spaventa o respinge.',
    type: 'smonta',
    testo: `Account Manager — Zona Roma

Siamo una realtà in forte crescita nel settore dei servizi digitali B2B. Cerchiamo una persona che voglia costruire relazioni durature con i clienti e contribuire attivamente allo sviluppo commerciale.

Cosa farai:
• Gestire e sviluppare un portafoglio clienti esistente
• Identificare nuove opportunità di crescita all'interno dei clienti attuali
• Lavorare a stretto contatto con il team marketing e prodotto
• Partecipare a fiere ed eventi di settore

Cosa cerchiamo:
• 2-4 anni di esperienza in ruoli commerciali o di account management
• Ottima capacità di ascolto e orientamento alla relazione
• Autonomia e spirito d'iniziativa
• Disponibilità a trasferte nella zona assegnata`
  };
}

function renderSmonta(container, activity) {
  const result = { verde: [], rosso: [], giallo: [] };

  const intro = document.createElement('p');
  intro.style.cssText = 'font-size:0.85rem;color:var(--muted);margin-bottom:16px;';
  intro.textContent = 'Tocca una riga per valutarla: verde = mi piace, rosso = mi spaventa, giallo = non so.';

  const annuncio = document.createElement('div');
  annuncio.style.cssText = 'background:var(--white);border:1px solid var(--sand);border-radius:var(--radius-md);padding:20px;';

  const righe = activity.testo.split('\n').filter(r => r.trim());
  righe.forEach((riga) => {
    const row = document.createElement('div');
    row.style.cssText = 'padding:6px 8px;border-radius:6px;cursor:pointer;font-size:0.9rem;color:var(--bark);line-height:1.5;margin-bottom:4px;transition:background 0.15s;';
    row.textContent = riga;

    let stato = null; // null | 'verde' | 'rosso' | 'giallo'

    row.addEventListener('click', () => {
      if (stato === null) stato = 'verde';
      else if (stato === 'verde') stato = 'rosso';
      else if (stato === 'rosso') stato = 'giallo';
      else stato = null;

      row.style.background = stato === 'verde' ? '#E8F5E9' :
                              stato === 'rosso' ? '#FFEBEE' :
                              stato === 'giallo' ? '#FFFDE7' : 'transparent';
      row.style.color = stato === 'verde' ? '#2E7D32' :
                        stato === 'rosso' ? '#C62828' :
                        stato === 'giallo' ? '#E65100' : 'var(--bark)';
    });

    annuncio.appendChild(row);
  });

  // Bottone conferma
  const btn = document.createElement('button');
  btn.className = 'btn btn--primary mt-16';
  btn.textContent = 'Conferma valutazione';
  btn.addEventListener('click', () => {
    annuncio.querySelectorAll('div').forEach(row => {
      const bg = row.style.background;
      if (bg.includes('E8F5E9')) result.verde.push(row.textContent);
      else if (bg.includes('FFEBEE')) result.rosso.push(row.textContent);
      else if (bg.includes('FFFDE7')) result.giallo.push(row.textContent);
    });
    completeActivity('smonta', result);
  });

  container.appendChild(intro);
  container.appendChild(annuncio);
  container.appendChild(btn);
}

// ─── COMPLETA ATTIVITÀ ────────────────────────────────────────
async function completeActivity(activityId, result) {
  state.activityResults[activityId] = result;

  // Aggiungi alla conversation history
  const summary = `[Attività: ${activityId}] Risultati: ${JSON.stringify(result)}`;
  state.conversationHistory.push({ role: 'user', content: summary });

  // Controlla se mostrare Smonta l'Annuncio prima del report
  // (viene mostrato come ultima attività, dopo le adattive)
  if (activityId === 'costruisci' && !state.activityResults['smonta']) {
    showActivity(buildSmontaActivity());
    return;
  }

  await getNextStep();
}

// ─── TORNA INDIETRO ───────────────────────────────────────────
function goBack() {
  if (state.history.length === 0) return;

  const prev = state.history.pop();

  if (prev.type === 'question') {
    // Ripristina conversation history
    state.conversationHistory = state.conversationHistory.slice(0, prev.conversationLength);
    state.questionCount = Math.max(0, state.questionCount - 1);

    if (state.fixedCount > 0 && state.fixedCount <= FIXED_QUESTIONS.length) {
      state.fixedCount--;
    } else {
      state.adaptiveCount = Math.max(0, state.adaptiveCount - 1);
    }

    renderQuestion(prev.questionData);
  }
}

// ─── VAI AL REPORT ────────────────────────────────────────────
function goToReport() {
  updatePhase('done');

  // Salva la conversation history per il report
  sessionStorage.setItem('rf_history', JSON.stringify(state.conversationHistory));
  sessionStorage.setItem('rf_activities', JSON.stringify(state.activityResults));

  setTimeout(() => {
    window.location.href = 'report.html';
  }, 800);
}

// ─── INIZIALIZZAZIONE ─────────────────────────────────────────
function init() {
  // Mostra prima domanda fissa
  renderQuestion(FIXED_QUESTIONS[0]);

  // Aggiungi messaggio di sistema iniziale alla history
  state.conversationHistory.push({
    role: 'user',
    content: 'Inizia il test. Sono pronto a rispondere alle domande.'
  });
}

// Avvia
document.addEventListener('DOMContentLoaded', init);
