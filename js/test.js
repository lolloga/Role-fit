import { getSession, getAccessToken, getProfile, getLastTestAnswers, getHistoricalProfile } from './supabase.js';

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

// Le opzioni delle domande adattive sono generate dall'AI: senza escaping,
// un payload HTML/script infilato dal modello (o da una risposta aperta
// precedente riusata come contesto) finirebbe nel DOM.
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── STATO GLOBALE ───────────────────────────────────────────
const state = {
  conversationHistory: [],
  answers: [],
  activityResults: {},
  // Attività saltate perché il segnale era già chiaro su tutte e 3 le
  // dimensioni quando si è raggiunta la soglia: test più corto per chi è
  // "leggibile", invariato per chi resta ambiguo (vedi isSignalChiaro).
  activitySkipped: {},
  questionCount: 0,
  fixedCount: 0,
  adaptiveCount: 0,
  currentPhase: 'building',
  lastQuestionTime: null,
  history: [],
  currentQuestion: null,
  worksCurrently: false,
  _retryCount: 0,
  _aspirationAsked: false,
  aspirationRole: null,
  // Domande standard ancora da fare: di norma è una copia di STANDARD_QUESTIONS,
  // ma per chi rifà il test da loggato può avere alcune voci già rimosse (vedi
  // buildStandardQueue) perché la risposta è nota dal test precedente.
  standardQueue: [],
  // Estratto testuale del CV (se già caricato sul profilo), per agganciare
  // 1-2 domande adattive a un'esperienza reale (vedi getNextStep).
  cvContext: null,
  // Riassunto dello storico dei test precedenti (assi, ruoli, ruolo attuale
  // dichiarato) — insieme al CV, dà al motore adattivo di cosa concentrarsi
  // per sembrare che conosca davvero la persona (vedi getNextStep).
  historicalSummary: null,
  _contextInjected: false,
  _skippedLabels: [],
};

// ─── PERSISTENZA ─────────────────────────────────────────────
function saveState() {
  const toSave = {
    conversationHistory: state.conversationHistory,
    answers: state.answers,
    activityResults: state.activityResults,
    activitySkipped: state.activitySkipped,
    questionCount: state.questionCount,
    fixedCount: state.fixedCount,
    adaptiveCount: state.adaptiveCount,
    currentPhase: state.currentPhase,
    history: state.history,
    currentQuestion: state.currentQuestion,
    worksCurrently: state.worksCurrently,
    _aspirationAsked: state._aspirationAsked,
    aspirationRole: state.aspirationRole,
    standardQueue: state.standardQueue,
    cvContext: state.cvContext,
    historicalSummary: state.historicalSummary,
    _contextInjected: state._contextInjected,
  };
  localStorage.setItem('rf_state', JSON.stringify(toSave));
}

function loadState() {
  const saved = localStorage.getItem('rf_state');
  if (!saved) return false;
  try {
    const parsed = JSON.parse(saved);
    Object.assign(state, parsed);
    // Compatibilità con un test lasciato a metà prima di questa funzionalità
    // (stato salvato senza "standardQueue"): la ricostruiamo dalla vecchia
    // convenzione posizionale, altrimenti un test già in corso al momento
    // del rilascio si romperebbe passando all'AI troppo presto.
    if (!Array.isArray(parsed.standardQueue)) {
      state.standardQueue = STANDARD_QUESTIONS.slice(state.fixedCount);
    }
    return true;
  } catch {
    return false;
  }
}

function clearState() {
  localStorage.removeItem('rf_state');
}

// ─── DOMANDE STANDARD (no AI) ──────────────────────────────
// 'nome' sta apposta per prima e non è una domanda "fissa" come le altre:
// va chiesta a chiunque non l'abbia ancora data (chi fa il primissimo test,
// oppure chi torna ma non l'aveva mai detta) e mai più una volta nota — vedi
// buildStandardQueue e prepareReturningUserContext.
const STANDARD_QUESTIONS = [
  {
    id: 'nome',
    text: 'Come ti chiamiamo?',
    context: 'Solo il nome, niente cognome.',
    type: 'short_text',
  },
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
      'Sto facendo un lavoro che mi piace, ma cerco conferma'
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
  },
  {
    id: 'mondi',
    text: 'In quale settore ti incuriosirebbe di più lavorare?',
    context: 'Scegline uno o due. Non serve esserci già dentro — basta che ti attiri.',
    type: 'multi_select',
    maxSelect: 2,
    options: [
      'Tecnologia e digitale',
      'Finanza, banche e assicurazioni',
      'Sanità e farmaceutico',
      'Industria, energia e ambiente',
      'Moda, lusso e design',
      'Commercio, retail e largo consumo',
      'Media, comunicazione e marketing',
      'Arte, cultura e intrattenimento',
      'Turismo, ristorazione e ospitalità',
      'Istruzione, formazione e ricerca',
      'Pubblica amministrazione e non profit',
      'Edilizia, immobiliare e infrastrutture',
      'Difesa'
    ]
  }
];

// ─── DOMANDE RIUSABILI DA UN TEST PRECEDENTE ─────────────────
// Solo per chi rifà il test da loggato. Età e formazione sono fatti
// sostanzialmente immutabili tra un test e l'altro — non ha senso
// richiederli di nuovo. Momento professionale, attrazione naturale e
// settore d'interesse invece possono cambiare (o contano come segnale
// fresco da ricontrollare), quindi si richiedono sempre. Il nome è un
// caso a parte: non viene mai richiesto una seconda volta una volta noto,
// ma non compare nell'avviso "abbiamo già la tua..." (SKIP_LABELS) perché
// grammaticalmente non ci si accorda con età/formazione nella stessa frase
// ("la tua età e formazione" vs "il tuo nome") — salta comunque, resta solo
// silenzioso invece che annunciato.
const SKIPPABLE_STANDARD_IDS = ['nome', 'eta', 'background'];
const SKIP_LABELS = { eta: 'età', background: 'formazione' };

// Costruisce la coda delle domande standard ancora da fare: quelle il cui id
// è "saltabile" e di cui esiste già una risposta nel test precedente vengono
// riusate silenziosamente (stesso identico effetto di una risposta data ora,
// così tutta la logica a valle — conteggi, attività, worksCurrently — resta
// invariata), le altre finiscono nella coda da mostrare davvero.
function buildStandardQueue(knownAnswers) {
  const known = new Map((Array.isArray(knownAnswers) ? knownAnswers : []).map(a => [a.id, a]));
  const queue = [];
  const skippedLabels = [];

  STANDARD_QUESTIONS.forEach((q) => {
    const prev = SKIPPABLE_STANDARD_IDS.includes(q.id) ? known.get(q.id) : null;
    if (prev && prev.answer) {
      state.history.push({
        type: 'question',
        questionData: q,
        conversationLength: state.conversationHistory.length,
        questionCount: state.questionCount,
        fixedCount: state.fixedCount,
        adaptiveCount: state.adaptiveCount,
      });
      state.conversationHistory.push({
        role: 'user',
        content: `Risposta: "${prev.answer}" (già nota dal test precedente, non richiesta di nuovo)`,
      });
      state.answers.push({ id: q.id, question: q.text, answer: prev.answer, time: 0, isOpen: false, indiretta: false });
      state.questionCount++;
      state.fixedCount++;
      if (SKIP_LABELS[q.id]) skippedLabels.push(SKIP_LABELS[q.id]);
    } else {
      queue.push(q);
    }
  });

  state.standardQueue = queue;
  state._skippedLabels = skippedLabels;
}

// Riassunto compatto dello storico dei test precedenti (assi, ruoli
// suggeriti, ultima narrazione "come funzioni", ruolo attuale/aspirato
// dichiarato) da passare al motore adattivo, così può decidere dove
// concentrarsi invece di ripartire da zero ogni volta. Solo dati derivati,
// mai le risposte grezze di ogni singolo test passato: resta leggero anche
// con molti test alle spalle.
function buildHistoricalSummary(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const chrono = [...history].reverse(); // dal più vecchio al più recente

  const righe = chrono.map((r) => {
    const data = new Date(r.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    const assi = r.report_json?.assi;
    const ruoli = (r.report_json?.ruoli || []).map((x) => `${x.nome} (${x.match}%)`).join(', ');
    return `- Test del ${data}: assi ${assi ? JSON.stringify(assi) : 'n/d'}. Ruoli suggeriti: ${ruoli || 'n/d'}.`;
  }).join('\n');

  const latest = chrono[chrono.length - 1];
  const comeFunzioni = latest?.report_json?.chi_sei?.come_funzioni || null;
  const ruoloAttuale = latest?.current_role_eval?._input || null;
  const aspirazione = latest?.aspiration || null;

  let extra = '';
  if (comeFunzioni) extra += `\n\nCosa avevamo capito di questa persona l'ultima volta (dal blocco "Come funzioni" del report più recente): "${comeFunzioni}"`;
  if (ruoloAttuale) extra += `\n\nRuolo attuale dichiarato dalla persona: "${ruoloAttuale}".`;
  if (aspirazione) extra += `\nRuolo a cui aspira: "${aspirazione}".`;

  return `Storico dei test precedenti di questa persona (dal più vecchio al più recente):\n${righe}${extra}`;
}

// Chi rifà il test da loggato non deve ripartire da zero: recupera prima le
// risposte "stabili" dell'ultimo test (per saltarle, vedi buildStandardQueue),
// un riassunto di tutto lo storico dei test (per rendere le domande adattive
// più personali) e, se ha già un CV caricato, un estratto testuale. Ogni
// fallimento qui è silenzioso: nel dubbio si procede come un test normale,
// non si blocca mai l'utente per questo.
async function prepareReturningUserContext() {
  let knownAnswers = null;
  let cvText = null;
  let historicalSummary = null;
  try {
    const session = await getSession();
    if (session) {
      try {
        knownAnswers = await getLastTestAnswers();
      } catch (e) {
        console.error('Recupero risposte del test precedente fallito:', e);
      }
      try {
        const history = await getHistoricalProfile();
        historicalSummary = buildHistoricalSummary(history);
      } catch (e) {
        console.error('Recupero storico dei test precedenti fallito:', e);
      }
      try {
        const profile = await getProfile();
        // Il nome è un dato di profilo, non di un singolo test: se lo
        // conosciamo già lo trattiamo come una risposta "nota" esattamente
        // come età e formazione, così buildStandardQueue lo salta con la
        // stessa identica logica, senza bisogno di un percorso separato.
        if (profile?.nome) {
          knownAnswers = [...(Array.isArray(knownAnswers) ? knownAnswers : []), { id: 'nome', answer: profile.nome }];
        }
        if (profile?.cv_path) {
          const token = await getAccessToken();
          const res = await fetch('/api/cv-context', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            cvText = data?.text || null;
          }
        }
      } catch (e) {
        console.error('Recupero contesto CV fallito:', e);
      }
    }
  } catch (e) {
    console.error('Controllo utente di ritorno fallito:', e);
  }
  return { knownAnswers, cvText, historicalSummary };
}

// ─── VARIANTI ATTIVITÀ ────────────────────────────────────────
const ACTIVITY_VARIANTS = {
  riunione: (() => {
    const pool = [
      'Workshop creativo per generare nuovi concept',
      'Review dei dati e degli indicatori con il team',
      '1:1 con un collega in difficoltà',
      'Strategia go-to-market di un nuovo prodotto',
      'Brainstorming su un problema ancora aperto',
      'Presentazione dei risultati al management',
      'Formazione su un nuovo strumento o metodo',
      'Call con un cliente importante',
      'Pianificazione settimanale con il team',
      'Deep dive tecnico su un progetto complesso',
      'Sessione di feedback con una persona junior',
      'Esplorazione di nuove opportunità di mercato',
      'Riunione per risolvere un conflitto interno',
      'Allineamento con un altro reparto',
      'Sessione di pianificazione del budget',
      'Intervista a un candidato per il team',
      'Retrospettiva su un progetto appena concluso',
      'Negoziazione con un fornitore o partner'
    ];
    const orari = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00', '16:00', '16:30', '17:00'];
    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
    const pickItems = () => {
      const titles = shuffle(pool).slice(0, 4);
      const times = shuffle(orari).slice(0, 4).sort();
      return { items: titles.map((t, i) => ({ time: times[i], title: t })) };
    };
    return [pickItems(), pickItems(), pickItems()];
  })(),
  termometro: (() => {
    const pool = [
      'Analizzi dati da zero per trovare un pattern nascosto',
      'Presenti una proposta a un cliente che non conosci',
      'Aiuti un collega a sbloccarsi su un problema difficile',
      'Gestisci un progetto con deadline strette e molte dipendenze',
      'Esplori un territorio nuovo senza una direzione precisa',
      'Scrivi un documento che definirà la strategia del prossimo anno',
      "Devi convincere qualcuno di un'idea in cui credi profondamente",
      'Lavori da solo per ore su qualcosa di tecnico e complesso',
      'Organizzi un evento con molte variabili da gestire',
      'Ricevi un feedback negativo su un lavoro che pensavi fatto bene',
      'Ti viene chiesto di improvvisare davanti a un gruppo',
      'Risolvi un bug o un problema urgente sotto pressione',
      'Crei qualcosa di visivo o narrativo da zero',
      "Fai una riunione dopo l'altra per tutto il giorno",
      'Scrivi un testo lungo e complesso che richiede rigore',
      'Negozi qualcosa di importante con qualcuno che non vuole cedere',
      'Impari qualcosa di completamente nuovo in poco tempo',
      'Ti occupi di attività routinarie ma necessarie per il team',
      'Coordini persone con caratteri e priorità molto diverse',
      'Analizzi un problema che nessuno è riuscito a risolvere prima',
      'Fai una presentazione davanti al management',
      'Supporti qualcuno che sta attraversando un momento difficile',
      'Pianifichi qualcosa di complesso con molte variabili',
      'Esegui compiti ripetitivi ma precisi per ore',
      'Costruisci una relazione con qualcuno di diffidente',
      'Prendi una decisione importante con poche informazioni',
      'Insegni qualcosa a qualcuno che parte da zero',
      'Gestisci un conflitto tra due persone del tuo team',
      'Lavori su un progetto creativo senza vincoli precisi',
      'Monitori numeri e indicatori per settimane senza risultati visibili',
      'Scrivi codice o lavori su qualcosa di altamente tecnico',
      "Conduci un colloquio o un'intervista con qualcuno",
      "Gestisci l'imprevisto che manda all'aria un piano ben fatto",
      'Rappresenti la tua azienda in un evento esterno',
      'Lavori su qualcosa che ha un impatto diretto sulla vita delle persone',
      'Ti vengono assegnate responsabilità nuove senza una guida chiara',
      'Collabori con persone di culture o background molto diversi dal tuo',
      'Lavori su un progetto che sai che non andrà da nessuna parte',
      'Ricevi un riconoscimento pubblico per un lavoro fatto bene',
      'Devi spiegare qualcosa di complesso a chi non capisce il settore'
    ];
    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
    const shuffled = shuffle(pool);
    return [shuffled.slice(0, 6), shuffled.slice(6, 12), shuffled.slice(12, 18)];
  })(),
  dilemma: (() => {
    const pool = [
      { a: 'Lavoro ad alto impatto ma poca libertà', b: 'Lavoro autonomo ma impatto incerto' },
      { a: 'Crescita rapida in un contesto caotico', b: 'Crescita lenta in un contesto solido' },
      { a: 'Essere riconosciuto pubblicamente', b: 'Sapere di aver fatto la cosa giusta' },
      { a: 'Specializzarsi profondamente', b: 'Spaziare su molti ambiti diversi' },
      { a: 'Persone brillanti, settore che non ti appassiona', b: 'Lavoro da solo in qualcosa che ami' },
      { a: 'Stipendio alto, poco tempo libero', b: 'Stipendio medio, molta flessibilità' },
      { a: 'Ruolo con responsabilità chiare', b: 'Ruolo ambiguo dove costruisci tutto' },
      { a: 'Fare bene una cosa sola', b: 'Fare molte cose abbastanza bene' },
      { a: 'Rischio alto, ricompensa alta', b: 'Stabilità e crescita graduale' },
      { a: 'Cambiare settore ogni pochi anni', b: 'Diventare il migliore in un settore' },
      { a: 'Sapere sempre cosa ti aspetta', b: 'Essere sorpreso da dove ti porta il lavoro' },
      { a: 'Lavorare per la missione', b: 'Lavorare per i soldi e usarli per la missione' },
      { a: 'Un capo che ti sfida sempre', b: 'Un capo che ti lascia in pace' },
      { a: 'Lavorare con i dati', b: 'Lavorare con le persone' },
      { a: 'Costruire qualcosa di nuovo', b: 'Migliorare qualcosa che esiste' },
      { a: 'Tante regole chiare', b: 'Massima libertà di interpretazione' }
    ];
    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
    const pick = () => shuffle(pool).slice(0, 4);
    return [pick(), pick(), pick()];
  })()
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

  // Se l'API ha risposto con un errore (modello non valido, rate limit, sovraccarico...),
  // non c'è data.content — logghiamo l'errore vero invece di crashare su content[0].
  if (!data.content || !data.content[0] || !data.content[0].text) {
    console.error('Errore API Claude (fase ' + fase + '):', data.error || data);
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

// ─── PROGRESS BAR ─────────────────────────────────────────────
// Il test ha una lunghezza variabile (tra le standard, le adattive e le
// attività il totale cambia da persona a persona): una percentuale precisa
// sul numero di domande sarebbe disonesta e rischierebbe di sembrare
// "bloccata" vicino alla fine dei test più lunghi. Mostriamo invece
// l'avanzamento reale per fase — "Passo X di 4" — che è sempre vero.
const PHASE_ORDER = ['building', 'deepening', 'almost', 'done'];

function updateProgress() {
  const idx = PHASE_ORDER.indexOf(state.currentPhase);
  const step = idx === -1 ? 1 : idx + 1;
  document.getElementById('progress-bar').style.width = (step / PHASE_ORDER.length * 100) + '%';
  const stepEl = document.getElementById('phase-step');
  if (stepEl) stepEl.textContent = `Passo ${step} di ${PHASE_ORDER.length}`;
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
  updateProgress();

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
  state.currentQuestion = questionData;
  saveState();

  stopThinking();
  document.getElementById('thinking-state').classList.add('hidden');
  document.getElementById('activity-area').classList.add('hidden');
  document.getElementById('active-question').classList.remove('hidden');

  const textEl = document.getElementById('question-text');
  textEl.style.animation = 'none';
  textEl.offsetHeight;
  textEl.style.animation = '';
  textEl.textContent = questionData.text;

  const ctxEl = document.getElementById('question-context');
  if (questionData.context) {
    ctxEl.textContent = questionData.context;
    ctxEl.classList.remove('hidden');
  } else {
    ctxEl.classList.add('hidden');
  }

  const inputEl = document.getElementById('question-input');
  inputEl.innerHTML = '';

  if (questionData.type === 'multiple_choice') {
    renderMultipleChoice(inputEl, questionData);
  } else if (questionData.type === 'multi_select') {
    renderMultiSelect(inputEl, questionData);
  } else if (questionData.type === 'short_text') {
    renderNomeInput(inputEl, questionData);
  } else {
    renderOpenInput(inputEl, questionData);
  }

  updateProgress();
}

function renderMultipleChoice(container, questionData) {
  const grid = document.createElement('div');
  grid.className = 'options-grid';

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  questionData.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    const lettera = letters[i] || String(i + 1);
    btn.innerHTML = `<span class="option-letter">${esc(lettera)}</span><span>${esc(opt)}</span>`;
    btn.addEventListener('click', () => selectOption(btn, opt, questionData));
    grid.appendChild(btn);
  });

  container.appendChild(grid);

// Link per risposta libera — solo testo, colore rosa della palette
  const openLink = document.createElement('button');
  openLink.className = 'open-toggle';
  openLink.textContent = 'Preferisco rispondere con parole mie';
  openLink.style.color = 'var(--rose)';
  openLink.addEventListener('click', () => {
    container.innerHTML = '';
    renderOpenInput(container, questionData);
  });
  container.appendChild(openLink);
}

// Domanda del nome: campo su una riga sola (non la textarea di
// renderOpenInput, qui sarebbe sproporzionata) con un modo esplicito di non
// rispondere — se lo salta, il nome resta sconosciuto e verrà richiesto di
// nuovo al prossimo test, esattamente come se non l'avesse mai dato.
function renderNomeInput(container, questionData) {
  const area = document.createElement('div');
  area.className = 'open-input-area';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'open-input';
  input.style.minHeight = 'auto';
  input.placeholder = 'Il tuo nome';
  input.maxLength = 40;

  const actions = document.createElement('div');
  actions.className = 'open-input-actions';

  const skip = document.createElement('button');
  skip.className = 'open-toggle';
  skip.textContent = 'Preferisco non dirlo';
  skip.style.marginRight = 'auto';
  skip.addEventListener('click', () => submitAnswer('', questionData));

  const btn = document.createElement('button');
  btn.className = 'btn btn--primary';
  btn.textContent = 'Continua';
  const go = () => {
    const val = input.value.trim();
    if (val) submitAnswer(val, questionData);
  };
  btn.addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

  actions.appendChild(skip);
  actions.appendChild(btn);
  area.appendChild(input);
  area.appendChild(actions);
  container.appendChild(area);
  setTimeout(() => input.focus(), 50);
}

function renderOpenInput(container, questionData) {
  const area = document.createElement('div');
  area.className = 'open-input-area';

  const textarea = document.createElement('textarea');
  textarea.className = 'open-input';
  textarea.placeholder = 'Scrivi qui la tua risposta...';

  const actions = document.createElement('div');
  actions.className = 'open-input-actions';

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
    if (val) {
      questionData._isOpen = true;
      submitAnswer(val, questionData);
    }
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = textarea.value.trim();
      if (val) {
        questionData._isOpen = true;
        submitAnswer(val, questionData);
      }
    }
  });

  actions.appendChild(btn);
  area.appendChild(textarea);
  area.appendChild(actions);
  container.appendChild(area);

  setTimeout(() => textarea.focus(), 100);
}

// ─── MULTI-SELECT (max 2) ─────────────────────────────────────
function renderMultiSelect(container, questionData) {
  const maxSelect = questionData.maxSelect || 2;
  const selected = new Set();
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  const counter = document.createElement('div');
  counter.style.cssText = 'font-size:0.82rem;color:var(--text-muted);margin-bottom:14px;';
  counter.textContent = `0 / ${maxSelect} — puoi sceglierne anche solo uno`;

  const grid = document.createElement('div');
  grid.className = 'options-grid';

  const buttons = [];

  const refresh = () => {
    counter.textContent = selected.size === 0
      ? `0 / ${maxSelect} — puoi sceglierne anche solo uno`
      : `${selected.size} / ${maxSelect} selezionati`;
    const full = selected.size >= maxSelect;
    buttons.forEach((b, i) => {
      const isSel = selected.has(i);
      b.classList.toggle('selected', isSel);
      b.disabled = full && !isSel;
      b.style.opacity = (full && !isSel) ? '0.4' : '1';
    });
    confirmBtn.disabled = selected.size === 0;
    confirmBtn.style.opacity = selected.size === 0 ? '0.5' : '1';
  };

  questionData.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    const lettera = letters[i] || String(i + 1);
    btn.innerHTML = `<span class="option-letter">${esc(lettera)}</span><span>${esc(opt)}</span>`;
    btn.addEventListener('click', () => {
      if (selected.has(i)) {
        selected.delete(i);
      } else if (selected.size < maxSelect) {
        selected.add(i);
      }
      refresh();
    });
    buttons.push(btn);
    grid.appendChild(btn);
  });

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn--primary mt-16';
  confirmBtn.textContent = 'Continua';
  confirmBtn.addEventListener('click', () => {
    if (selected.size === 0) return;
    const values = [...selected].sort((a, b) => a - b).map(i => questionData.options[i]);
    submitAnswer(values.join(' + '), questionData);
  });

  container.appendChild(counter);
  container.appendChild(grid);
  container.appendChild(confirmBtn);
  refresh();
}


function selectOption(btn, value, questionData) {
  const grid = btn.closest('.options-grid');
  // Disabilita subito tutte le opzioni: senza questo, un doppio tocco veloce
  // su due opzioni diverse (facile su mobile) invia due risposte alla stessa
  // domanda, con due chiamate a getNextStep() in corsa tra loro.
  if (grid.dataset.locked === '1') return;
  grid.dataset.locked = '1';
  grid.querySelectorAll('.option-btn').forEach((b) => { b.disabled = true; });
  grid.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  setTimeout(() => submitAnswer(value, questionData), 280);
}

// ─── SUBMIT ───────────────────────────────────────────────────
async function submitAnswer(value, questionData) {
  const responseTime = Date.now() - state.lastQuestionTime;

  state.history.push({
    type: 'question',
    questionData,
    conversationLength: state.conversationHistory.length,
    questionCount: state.questionCount,
    fixedCount: state.fixedCount,
    adaptiveCount: state.adaptiveCount
  });

  // Rileva se l'utente sta lavorando — ora sulla domanda 'momento'.
  // Tutte le opzioni indicano un lavoro in corso TRANNE "Ho appena finito gli studi...".
  if (questionData.id === 'momento') {
    state.worksCurrently = !value.startsWith('Ho appena finito gli studi');
  }

  state.conversationHistory.push({
    role: 'user',
    content: `Risposta: "${value}" (tempo: ${Math.round(responseTime / 1000)}s)`
  });

  const isStandard = STANDARD_QUESTIONS.some(q => q.id === questionData.id);
  // Le domande standard non sono mai personali. Per le adattive, ci fidiamo
  // solo di un "indiretta: false" esplicito dell'AI — qualunque altra cosa
  // (true, o il campo mancante) viene trattata come domanda da non esporre
  // a terzi (es. aziende), per non rischiare di rivelare risposte personali.
  state.answers.push({
    id: questionData.id,
    question: questionData.text,
    answer: value,
    time: responseTime,
    isOpen: false,
    indiretta: isStandard ? false : questionData.indiretta !== false
  });

  state.questionCount++;

  if (isStandard) {
    state.fixedCount++;
    state.standardQueue.shift();
  } else {
    state.adaptiveCount++;
  }

  saveState();

  // Attività dopo domanda 3
  if (state.fixedCount === 3 && !state.activityResults['riunione']) {
    showActivity('riunione');
    return;
  }

  // Attività dopo domanda 5
  if (state.fixedCount === 5 && !state.activityResults['termometro']) {
    showActivity('termometro');
    return;
  }

  await getNextStep();
}

// Vero solo se il modello segna tutte e 3 le dimensioni come CHIARO nel suo
// ultimo giudizio interno — non basta "PROBABILE", il test resta lungo in
// quel caso.
function isSignalChiaro(internal) {
  return !!internal && internal.dim1 === 'CHIARO' && internal.dim2 === 'CHIARO' && internal.dim3 === 'CHIARO';
}

// ─── PROSSIMO STEP ────────────────────────────────────────────
async function getNextStep() {
  showThinking();

  // Ancora nelle domande standard rimaste (alcune possono essere già state
  // saltate all'avvio, vedi buildStandardQueue).
  if (state.standardQueue.length > 0) {
    stopThinking();
    renderQuestion(state.standardQueue[0]);
    return;
  }

  // Prima domanda adattiva: se questa persona ha già uno storico (test
  // precedenti e/o un CV caricato) lo agganciamo qui alla conversazione, una
  // volta sola. Resta poi disponibile a ogni chiamata successiva, dato che
  // la history viene sempre reinviata per intero.
  if ((state.historicalSummary || state.cvContext) && !state._contextInjected) {
    state._contextInjected = true;
    const parts = [];
    if (state.historicalSummary) {
      parts.push(`${state.historicalSummary}\n\nUsa questo storico secondo le istruzioni già ricevute: per decidere dove concentrare le domande di oggi, non per dare per scontato senza verificarlo di nuovo cosa emergerà.`);
    }
    if (state.cvContext) {
      parts.push(`Il candidato ha già caricato il proprio CV sul profilo RoleFit. Ecco un estratto testuale (possibili imperfezioni di formattazione dovute all'estrazione automatica):\n\n"""\n${state.cvContext}\n"""\n\nUsalo per rendere 1, al massimo 2, delle tue domande adattive più mirate e concrete: agganciale esplicitamente a un'esperienza reale già emersa dal CV (un progetto, un ruolo, un settore, uno strumento), nominandola nella domanda stessa, invece di restare generiche. Resta comunque nel formato a scelta multipla con 4 opzioni concrete richiesto da tutte le regole già ricevute. NON usare il CV per dedurre le 3 dimensioni al posto delle risposte del test: il CV racconta cosa questa persona ha fatto, non necessariamente cosa la energizza per natura.`);
    }
    state.conversationHistory.push({ role: 'user', content: parts.join('\n\n---\n\n') });
  }

  const result = await callClaude('test');

  if (!result) {
    console.error('Risposta Claude non valida');
    stopThinking();
    // Senza questo, l'utente restava a guardare l'animazione di pensiero
    // all'infinito, senza nessun errore né modo di riprovare: la risposta
    // dell'utente era già salvata in conversationHistory, quindi un retry
    // pulito è semplicemente rifare la stessa chiamata.
    showTestError();
    return;
  }

  if (result.phase) updatePhase(result.phase);

  state.conversationHistory.push({
    role: 'assistant',
    content: JSON.stringify(result)
  });

  saveState();

  if (result.action === 'report') {
    // Prima del report: domanda finale sull'aspirazione (una sola volta)
    if (!state._aspirationAsked) {
      stopThinking();
      showAspirationQuestion();
      return;
    }
    goToReport();
  } else if (result.action === 'ask' && result.question) {
    // Segnale già chiaro su tutte e 3 le dimensioni: le attività sotto
    // servono a raccogliere segnale extra, non ha senso infliggerle a chi
    // il modello ha già "letto" bene. Il test resta lungo per chi è ambiguo,
    // si accorcia per chi è leggibile — non è un taglio arbitrario.
    const segnaliChiari = isSignalChiaro(result.internal);

    // Attività Dilemma dopo 7 domande totali
    if (state.questionCount >= 7 && !state.activityResults['dilemma'] && !state.activitySkipped['dilemma']) {
      if (segnaliChiari) {
        state.activitySkipped['dilemma'] = true;
        saveState();
      } else {
        showActivity('dilemma');
        return;
      }
    }
    // Attività Costruisci a metà adattive (Smonta l'Annuncio segue sempre
    // Costruisci: se si salta la prima si salta anche la seconda).
    if (state.adaptiveCount >= 4 && !state.activityResults['costruisci'] && !state.activitySkipped['costruisci']) {
      if (segnaliChiari) {
        state.activitySkipped['costruisci'] = true;
        state.activitySkipped['smonta'] = true;
        saveState();
      } else {
        showActivity('costruisci');
        return;
      }
    }

    // VALIDAZIONE DOMANDA — una domanda valida deve avere 4 opzioni concrete
    const q = result.question;
    const opzioniGeneriche = ['sì, decisamente', 'in parte', 'non proprio', 'no, per niente'];

    // Controlla typo evidenti: 3+ consonanti uguali consecutive (es. "Abbzzo" → "bb"+"zz"
    // o sequenze tipo "sss"), che in italiano non esistono e tradiscono un errore di generazione.
    const haTypo = (testo) => /([bcdfghjklmnpqrstvwxyz])\1\1/i.test(testo || '');

    const haOpzioniValide = q.options &&
      q.options.length >= 3 &&
      !q.options.every((o, i) => opzioniGeneriche.includes((o || '').toLowerCase().trim())) &&
      !q.options.some((o) => haTypo(o));

    if (!haOpzioniValide && state._retryCount < 2) {
      // Domanda malfatta: chiediamo a Claude di rigenerarla
      state._retryCount = (state._retryCount || 0) + 1;
      state.conversationHistory.push({
        role: 'user',
        content: 'La domanda precedente non aveva 4 opzioni concrete e specifiche. Rigenera SUBITO una domanda a scelta multipla con esattamente 4 opzioni che descrivono azioni o situazioni concrete, mai opzioni generiche tipo Sì/In parte/No.'
      });
      await getNextStep();
      return;
    }

    state._retryCount = 0;

    // Se ancora non valida dopo i retry, usiamo opzioni di emergenza coerenti
    if (!haOpzioniValide) {
      q.options = ['Mi rappresenta molto', 'Mi rappresenta in parte', 'Non mi rappresenta', 'Non saprei dire'];
    }

    q.type = 'multiple_choice';
    stopThinking();
    renderQuestion(q);
  }
}

// Errore recuperabile durante la generazione della domanda successiva: mostra
// un messaggio chiaro al posto della frase di pensiero e un pulsante che
// riprova la stessa chiamata, senza perdere la risposta già data.
function showTestError() {
  const phraseEl = document.getElementById('thinking-phrase');
  phraseEl.textContent = 'Qualcosa è andato storto.';
  phraseEl.style.color = 'var(--rose)';

  const thinkingState = document.getElementById('thinking-state');
  if (document.getElementById('test-retry-btn')) return;

  const retryBtn = document.createElement('button');
  retryBtn.id = 'test-retry-btn';
  retryBtn.className = 'btn btn--primary mt-16';
  retryBtn.textContent = 'Riprova';
  retryBtn.addEventListener('click', () => {
    retryBtn.remove();
    phraseEl.style.color = '';
    getNextStep();
  });
  thinkingState.appendChild(retryBtn);
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
      subtitle: 'È lunedì mattina. Quale di queste riunioni apriresti con più piacere?',
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
        const wasSelected = reactionBtns.querySelector('.reaction-btn.selected');
        reactionBtns.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        results[i] = { scenario, reaction: emoji, value: r };
        if (!wasSelected) completed++;
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

// ─── DILEMMA ──────────────────────────────────────────────────
// Le due opzioni vengono forzate AFFIANCATE anche su mobile, con stili inline,
// così la coppia resta sempre leggibile come "A | o | B" e non si impila
// verticalmente creando confusione su schermi stretti.
function renderDilemma(container, pairs) {
  const results = {};
  let completed = 0;

  // Mini-istruzione per chiarire l'azione su mobile
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin-bottom:14px;line-height:1.5;';
  hint.textContent = 'Per ogni coppia, tocca l\'opzione che senti più tua. Le due scelte sono affiancate.';
  container.appendChild(hint);

  pairs.forEach((pair, i) => {
    const pairEl = document.createElement('div');
    pairEl.className = 'dilemma-pair';
    // Layout forzato affiancato (anche su mobile): le due card occupano metà larghezza
    pairEl.style.cssText = 'display:flex;align-items:stretch;justify-content:center;gap:8px;margin-bottom:14px;width:100%;';

    const optStyle = 'flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:14px 10px;font-size:0.82rem;line-height:1.35;border-radius:var(--radius-md);hyphens:auto;overflow-wrap:anywhere;';

    const optA = document.createElement('button');
    optA.className = 'dilemma-option';
    optA.textContent = pair.a;
    optA.style.cssText = optStyle;

    const vs = document.createElement('span');
    vs.className = 'dilemma-vs';
    vs.textContent = 'o';
    // "o" centrale compatto, non si stringe
    vs.style.cssText = 'flex:0 0 auto;align-self:center;font-size:0.8rem;color:var(--text-muted);padding:0 2px;';

    const optB = document.createElement('button');
    optB.className = 'dilemma-option';
    optB.textContent = pair.b;
    optB.style.cssText = optStyle;

    const select = (chosen, other, value) => {
      const wasSelected = chosen.classList.contains('selected');
      chosen.classList.add('selected');
      other.classList.remove('selected');
      if (!results[i]) completed++;
      results[i] = { a: pair.a, b: pair.b, scelta: value };
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

// ─── COSTRUISCI LA SETTIMANA ──────────────────────────────────
// L'ORDINE di selezione conta: la prima scelta = priorità 1 (più istintiva),
// la quinta = priorità 5. Il badge di ogni card selezionata mostra il numero
// di priorità (1-5) invece della lettera/numero dell'item, ed è evidenziato in
// emerald. Un hint in rosa comunica esplicitamente che l'ordine influisce sul
// risultato. Il salvataggio include { attivita, priorita } per ogni scelta.
function renderCostruisci(container) {
  const maxSelect = 5;
  const selectedOrder = []; // array ordinato di indici → l'ordine È il segnale
  const pool = [
    'Analizzare dati e trovare pattern',
    'Incontrare clienti o partner nuovi',
    'Scrivere un documento strategico',
    'Lavorare in autonomia su un progetto',
    'Fare formazione e imparare qualcosa di nuovo',
    'Coordinare il lavoro di un team',
    'Creare qualcosa da zero',
    'Risolvere un problema urgente e complesso',
    'Fare presentazioni o pitching',
    'Tempo libero non strutturato per esplorare',
    'Dare feedback e far crescere qualcuno',
    'Organizzare e mettere ordine in un progetto',
    'Negoziare un accordo importante',
    'Approfondire un tema tecnico complesso',
    'Costruire relazioni con nuove persone',
    'Migliorare un processo che non funziona',
    'Lavorare a contatto con il pubblico',
    'Riflettere e definire una strategia di lungo periodo'
  ];
  const items = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);

  // Hint esplicito: l'ordine conta
  const orderHint = document.createElement('div');
  orderHint.style.cssText = 'font-size:0.8rem;color:var(--rose);font-weight:500;margin-bottom:10px;line-height:1.5;';
  orderHint.textContent = 'L\'ordine in cui scegli conta: la prima attività è la tua priorità n.1, l\'ultima la n.5. Influisce sul risultato.';

  const counter = document.createElement('div');
  counter.style.cssText = 'font-size:0.82rem;color:var(--text-muted);margin-bottom:14px;';
  counter.textContent = `0 / ${maxSelect} selezionate`;

  const grid = document.createElement('div');
  grid.className = 'options-grid';

  const buttons = []; // riferimento ai bottoni per indice item

  // Ridisegna badge e stato di tutte le card in base a selectedOrder
  const refresh = () => {
    buttons.forEach((btn, i) => {
      const pos = selectedOrder.indexOf(i); // -1 se non selezionata
      const text = items[i];
      if (pos >= 0) {
        btn.classList.add('selected');
        // badge = numero di priorità (pos+1), evidenziato
        btn.innerHTML = `<span class="option-letter" style="background:var(--emerald);color:#fff;">${pos + 1}</span><span>${text}</span>`;
      } else {
        btn.classList.remove('selected');
        // badge di default = numero progressivo dell'item
        btn.innerHTML = `<span class="option-letter">${i + 1}</span><span>${text}</span>`;
      }
    });
    counter.textContent = `${selectedOrder.length} / ${maxSelect} selezionate`;
  };

  items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="option-letter">${i + 1}</span><span>${item}</span>`;

    btn.addEventListener('click', () => {
      const pos = selectedOrder.indexOf(i);
      if (pos >= 0) {
        // deseleziona: rimuovi e ri-numera le rimanenti
        selectedOrder.splice(pos, 1);
      } else if (selectedOrder.length < maxSelect) {
        selectedOrder.push(i);
      }

      refresh();

      if (selectedOrder.length === maxSelect) {
        const result = selectedOrder.map((idx, order) => ({
          attivita: items[idx],
          priorita: order + 1
        }));
        setTimeout(() => completeActivity('costruisci', { scelte: result }), 400);
      }
    });

    buttons.push(btn);
    grid.appendChild(btn);
  });

  container.appendChild(orderHint);
  container.appendChild(counter);
  container.appendChild(grid);
}

// ─── COMPLETA ATTIVITÀ ────────────────────────────────────────
async function completeActivity(activityId, result) {
  // Anti doppio-trigger: se l'attività è già stata completata, esci
  if (state.activityResults[activityId]) return;

  state.activityResults[activityId] = result;
  state.conversationHistory.push({
    role: 'user',
    content: `[Attività: ${activityId}] ${JSON.stringify(result)}`
  });
  state.questionCount++;
  saveState();

  if (activityId === 'costruisci' && !state.activityResults['smonta']) {
    showSmonta();
    return;
  }

  await getNextStep();
}

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

  const annunci = [
    `Account Manager — Zona Roma
Siamo una realtà in forte crescita nel settore dei servizi digitali B2B. Cerchiamo una persona che costruisca relazioni durature con i clienti.
Cosa farai:
• Gestire e sviluppare un portafoglio clienti esistente
• Identificare nuove opportunità di crescita
• Lavorare con il team marketing e prodotto
• Partecipare a fiere ed eventi di settore
Cosa cerchiamo:
• 2-4 anni di esperienza in ruoli commerciali
• Ottima capacità di ascolto e orientamento alla relazione
• Autonomia e spirito d'iniziativa
• Disponibilità a trasferte nella zona assegnata`,

    `UX Designer — Milano (Ibrido)
Studio di design cerca un designer che metta le persone al centro di ogni progetto. Lavorerai su prodotti digitali usati da milioni di persone.
Cosa farai:
• Condurre ricerche utenti e trasformarle in insight
• Progettare wireframe, prototipi e interfacce
• Collaborare con sviluppatori e product manager
• Presentare il tuo lavoro a stakeholder interni
Cosa cerchiamo:
• Portfolio con almeno 3 case study completi
• Padronanza di Figma
• Curiosità genuina per il comportamento umano
• Capacità di argomentare le tue scelte di design`,

    `Policy Officer — Roma
Ente istituzionale cerca un profilo analitico per supportare lo sviluppo di politiche pubbliche su temi di innovazione e digitale.
Cosa farai:
• Analizzare normative e scenari di policy
• Redigere documenti di posizione e briefing
• Partecipare a tavoli di lavoro istituzionali
• Monitorare l'evoluzione del quadro regolatorio europeo
Cosa cerchiamo:
• Laurea in scienze politiche, giurisprudenza o economia
• Capacità di sintesi e scrittura chiara
• Interesse per il funzionamento delle istituzioni
• Inglese professionale`,

    `Content Strategist — Remote
Startup cerca qualcuno che sappia raccontare storie complesse in modo semplice e costruire una presenza editoriale distintiva.
Cosa farai:
• Definire la strategia editoriale e il tono di voce
• Produrre contenuti per blog, newsletter e social
• Analizzare le performance e ottimizzare i formati
• Coordinare freelance e collaboratori esterni
Cosa cerchiamo:
• Esperienza in content marketing o giornalismo digitale
• Ossessione per la chiarezza e la precisione
• Autonomia nella gestione delle priorità
• Capacità di lavorare su più progetti in parallelo`,

    `Data Analyst — Milano
Azienda retail cerca un profilo che trasformi i dati in decisioni concrete.
Cosa farai:
• Estrarre e analizzare dati da fonti multiple
• Costruire dashboard e report per il management
• Identificare trend e opportunità nascoste nei dati
• Supportare decisioni strategiche con analisi ad hoc
Cosa cerchiamo:
• Padronanza di SQL e Excel avanzato
• Esperienza con strumenti di BI (Power BI, Tableau)
• Mentalità analitica e attenzione al dettaglio
• Capacità di comunicare insight a un pubblico non tecnico`,

    `HR Business Partner — Torino
Azienda manifatturiera cerca un HRBP che affianchi i manager nei momenti che contano davvero.
Cosa farai:
• Supportare i manager su performance, sviluppo e conflitti
• Gestire i processi di valutazione e feedback
• Contribuire alla costruzione di una cultura aziendale sana
• Collaborare con il team HR su progetti trasversali
Cosa cerchiamo:
• Esperienza in ruoli HR generalisti o come HRBP
• Capacità di ascolto profondo e gestione dei conflitti
• Orientamento alle persone senza perdere di vista il business
• Laurea in psicologia, scienze della formazione o economia`,

    `Product Manager — Milano
Scale-up B2B cerca un PM che bilanci visione di prodotto e pragmatismo operativo.
Cosa farai:
• Definire la roadmap e prioritizzare le funzionalità
• Intervistare utenti e trasformare i feedback in requisiti
• Allineare engineering, design e business sulle priorità
• Misurare l'impatto delle release e iterare
Cosa cerchiamo:
• 2+ anni di esperienza in product management
• Capacità di prendere decisioni con dati incompleti
• Comunicazione chiara con profili tecnici e non tecnici
• Ossessione per il problema dell'utente, non per la soluzione`,

    `Sustainability Specialist — Roma
Gruppo assicurativo cerca un profilo che trasformi la sostenibilità da obbligo normativo a leva competitiva.
Cosa farai:
• Sviluppare e implementare la strategia ESG
• Redigere il bilancio di sostenibilità
• Formare i colleghi su temi ESG
• Relazionarti con investitori e stakeholder esterni
Cosa cerchiamo:
• Conoscenza del framework GRI e delle normative ESG
• Capacità di lavorare in modo trasversale con tutti i reparti
• Passione genuina per i temi ambientali e sociali
• Laurea in economia, ingegneria o scienze ambientali`,

    `Software Engineer Backend — Full Remote
Fintech cerca uno sviluppatore che costruisca infrastrutture che reggano milioni di transazioni.
Cosa farai:
• Progettare e sviluppare API e microservizi
• Ottimizzare le performance e la scalabilità del sistema
• Partecipare alle code review e migliorare la qualità del codice
• Collaborare con il team prodotto su nuove funzionalità
Cosa cerchiamo:
• Solida esperienza in Python o Go
• Familiarità con architetture a microservizi e cloud (AWS/GCP)
• Mentalità orientata alla qualità e alla manutenibilità
• Capacità di lavorare in autonomia in un contesto distribuito`,

    `Talent Acquisition Specialist — Milano
Agenzia di headhunting cerca un recruiter che ami le persone quanto i numeri.
Cosa farai:
• Gestire end-to-end i processi di selezione
• Fare sourcing su LinkedIn e altri canali
• Costruire relazioni durature con candidati e hiring manager
• Contribuire all'employer branding dell'agenzia
Cosa cerchiamo:
• Esperienza in selezione del personale (agenzia o in-house)
• Capacità di leggere le persone oltre il CV
• Energia, proattività e resistenza allo stress
• Orientamento ai risultati con un tocco umano`,

    `Giornalista Digitale — Roma
Testata online cerca un giornalista curioso e veloce, capace di raccontare temi complessi a un pubblico largo.
Cosa farai:
• Scrivere articoli di approfondimento e breaking news
• Intervistare fonti istituzionali e non convenzionali
• Gestire i canali social della testata
• Collaborare con la redazione su inchieste e speciali
Cosa cerchiamo:
• Iscrizione all'Ordine dei Giornalisti o praticantato in corso
• Velocità di scrittura senza sacrificare la qualità
• Fiuto per le notizie e capacità di verificare le fonti
• Conoscenza dei principali CMS editoriali`,

    `NGO Program Officer — Roma
ONG internazionale cerca un profilo operativo per gestire programmi di cooperazione in Africa subsahariana.
Cosa farai:
• Gestire il ciclo di progetto dalla proposta al rendiconto
• Coordinare i partner locali nei paesi di intervento
• Redigere report per i donatori istituzionali
• Supportare lo sviluppo di nuove proposte progettuali
Cosa cerchiamo:
• Esperienza in gestione di progetti di cooperazione internazionale
• Conoscenza dei framework di rendicontazione UE o AICS
• Inglese e francese fluenti
• Disponibilità a missioni sul campo`,

    `Compliance Specialist — Milano
Banca digitale cerca un profilo che garantisca il rispetto delle normative in un contesto in rapida evoluzione.
Cosa farai:
• Monitorare l'evoluzione normativa e aggiornare le procedure
• Condurre audit interni e gestire le ispezioni
• Formare i colleghi sulle policy di compliance
• Collaborare con il team legale su temi regolatori
Cosa cerchiamo:
• Conoscenza della normativa bancaria e finanziaria italiana ed europea
• Capacità di tradurre la complessità normativa in processi pratici
• Rigore metodologico e attenzione ai dettagli
• Laurea in giurisprudenza o economia`,

    `Graphic Designer — Studio Creativo
Studio cerca un designer con una voce visiva riconoscibile, capace di lavorare su brand identity e comunicazione integrata.
Cosa farai:
• Progettare identità visive per brand in settori diversi
• Sviluppare materiali di comunicazione print e digital
• Collaborare con copywriter e strategist per campagne integrate
• Presentare i concept ai clienti e gestire i feedback
Cosa cerchiamo:
• Portfolio che dimostri versatilità e punto di vista estetico preciso
• Padronanza della Adobe Suite
• Capacità di rispettare i brief senza perdere la creatività
• Attitudine alla collaborazione e alla contaminazione`,

    `Psicologo Clinico — Studio Privato Roma
Studio di psicoterapia cerca uno psicologo per presa in carico di pazienti adulti con disturbi d'ansia e dell'umore.
Cosa farai:
• Condurre colloqui di valutazione e presa in carico
• Seguire pazienti in percorsi individuali di psicoterapia
• Partecipare alle supervisioni di gruppo settimanali
• Contribuire alle attività di ricerca dello studio
Cosa cerchiamo:
• Laurea in psicologia e abilitazione all'esercizio della professione
• Specializzazione in psicoterapia (cognitivo-comportamentale o sistemica)
• Capacità di costruire alleanza terapeutica solida
• Orientamento alla crescita professionale continua`
  ];

  const testo = annunci[Math.floor(Math.random() * annunci.length)];

  const result = { verde: [], rosso: [], giallo: [] };

  const intro = document.createElement('p');
  intro.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin-bottom:14px;';
  intro.textContent = 'Tocca le righe dell\'annuncio per ciclarle: verde → rosso → giallo → nessuno. Titolo e intestazioni non sono valutabili.';

  const annuncio = document.createElement('div');
  annuncio.style.cssText = 'background:var(--deep);border:1px solid var(--card-border);border-radius:var(--radius-md);padding:18px;';

    testo.split('\n').filter(r => r.trim()).forEach((riga, idx) => {
    const isTitolo = idx === 0;
    const isIntestazione = riga.trim().endsWith(':');

    const row = document.createElement('div');

    // Titolo e intestazioni di sezione: visibili ma NON selezionabili (non portano segnale)
    if (isTitolo || isIntestazione) {
      row.style.cssText = isTitolo
        ? 'padding:6px 8px;font-size:0.95rem;font-weight:600;color:var(--text-primary);line-height:1.5;margin-bottom:8px;cursor:default;'
        : 'padding:6px 8px;font-size:0.82rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;line-height:1.5;margin-top:10px;margin-bottom:4px;cursor:default;';
      row.textContent = riga;
      annuncio.appendChild(row);
      return;
    }

    row.style.cssText = 'padding:6px 8px;border-radius:6px;cursor:pointer;font-size:0.88rem;color:var(--text-secondary);line-height:1.5;margin-bottom:4px;transition:background 0.15s,color 0.15s;';
    row.textContent = riga;
    row.dataset.stato = '';

    row.addEventListener('click', () => {
      if (row.dataset.stato === '') row.dataset.stato = 'verde';
      else if (row.dataset.stato === 'verde') row.dataset.stato = 'rosso';
      else if (row.dataset.stato === 'rosso') row.dataset.stato = 'giallo';
      else row.dataset.stato = '';

      const s = row.dataset.stato;
      row.style.background = s === 'verde' ? 'rgba(29,158,117,0.15)' :
                              s === 'rosso' ? 'rgba(255,100,150,0.15)' :
                              s === 'giallo' ? 'rgba(255,200,50,0.1)' : 'transparent';
      row.style.color = s === 'verde' ? 'var(--emerald-light)' :
                        s === 'rosso' ? 'var(--rose-light)' :
                        s === 'giallo' ? '#FFD060' : 'var(--text-secondary)';
    });

    annuncio.appendChild(row);
  });

  const btn = document.createElement('button');
  btn.className = 'btn btn--primary mt-16';
  btn.textContent = 'Conferma e continua';
  btn.addEventListener('click', () => {
    result.verde = [];
    result.rosso = [];
    result.giallo = [];
    annuncio.querySelectorAll('div[data-stato]').forEach(row => {
      const s = row.dataset.stato;
      if (s === 'verde') result.verde.push(row.textContent);
      else if (s === 'rosso') result.rosso.push(row.textContent);
      else if (s === 'giallo') result.giallo.push(row.textContent);
    });
    const total = result.verde.length + result.rosso.length + result.giallo.length;
    if (total < 3) {
      btn.textContent = 'Valuta almeno 3 righe per continuare';
      btn.style.opacity = '0.6';
      setTimeout(() => { btn.textContent = 'Conferma e continua'; btn.style.opacity = '1'; }, 2000);
      return;
    }
    completeActivity('smonta', result);
  });

  content.appendChild(intro);
  content.appendChild(annuncio);
  content.appendChild(btn);
}

// ─── DOMANDA FINALE: ASPIRAZIONE ──────────────────────────────
// Ultima domanda per tutti, dopo che Claude ha deciso di chiudere il test.
// "Sì" apre un campo libero dove l'utente scrive il ruolo a cui aspira.
// "No" va dritto al report. L'aspirazione viene passata a report.js.
function showAspirationQuestion() {
  state._aspirationAsked = true;
  saveState();

  updatePhase('done');

  document.getElementById('thinking-state').classList.add('hidden');
  document.getElementById('activity-area').classList.add('hidden');
  const qArea = document.getElementById('active-question');
  qArea.classList.remove('hidden');

  // Rimuove eventuali avvisi di ripristino residui
  qArea.querySelectorAll('.restore-notice').forEach(n => n.remove());

  document.getElementById('question-text').textContent =
    'Hai un ruolo a cui aspiri con la tua esperienza?';

  const ctxEl = document.getElementById('question-context');
  ctxEl.textContent = 'Ultima domanda. Se ce l\'hai, lo confronteremo col tuo profilo.';
  ctxEl.classList.remove('hidden');

  const inputEl = document.getElementById('question-input');
  inputEl.innerHTML = '';

  // Due scelte iniziali: Sì (apre il campo) / No (va al report)
  const grid = document.createElement('div');
  grid.className = 'options-grid';

  const siBtn = document.createElement('button');
  siBtn.className = 'option-btn';
  siBtn.innerHTML = '<span class="option-letter">A</span><span>Sì, c\'è un ruolo a cui aspiro</span>';
  siBtn.addEventListener('click', () => {
    grid.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
    siBtn.classList.add('selected');
    setTimeout(renderAspirationInput, 220);
  });

  const noBtn = document.createElement('button');
  noBtn.className = 'option-btn';
  noBtn.innerHTML = '<span class="option-letter">B</span><span>No, non in particolare</span>';
  noBtn.addEventListener('click', () => {
    grid.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
    noBtn.classList.add('selected');
    state.aspirationRole = null;
    saveState();
    setTimeout(goToReport, 300);
  });

  grid.appendChild(siBtn);
  grid.appendChild(noBtn);
  inputEl.appendChild(grid);
}

function renderAspirationInput() {
  const ctxEl = document.getElementById('question-context');
  ctxEl.textContent = 'Scrivilo come lo diresti tu — anche solo il titolo del ruolo.';

  const inputEl = document.getElementById('question-input');
  inputEl.innerHTML = '';

  const area = document.createElement('div');
  area.className = 'open-input-area';

  const textarea = document.createElement('textarea');
  textarea.className = 'open-input';
  textarea.placeholder = 'Es. Product Manager, Direttore creativo, Consulente ambientale...';

  const actions = document.createElement('div');
  actions.className = 'open-input-actions';

  // Link per tornare alle due scelte Sì/No
  const backLink = document.createElement('button');
  backLink.className = 'open-toggle';
  backLink.textContent = '← Indietro';
  backLink.style.marginRight = 'auto';
  backLink.addEventListener('click', showAspirationQuestion);
  actions.appendChild(backLink);

  const btn = document.createElement('button');
  btn.className = 'btn btn--primary';
  btn.textContent = 'Vedi il mio report';

  let submitting = false;
  const submit = () => {
    if (submitting) return; // anti doppio-click
    const val = textarea.value.trim();
    if (!val) return;
    submitting = true;
    btn.style.opacity = '0.6';
    state.aspirationRole = val;
    saveState();
    goToReport();
  };

  btn.addEventListener('click', submit);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });

  actions.appendChild(btn);
  area.appendChild(textarea);
  area.appendChild(actions);
  inputEl.appendChild(area);

  setTimeout(() => textarea.focus(), 100);
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

  // Handoff verso report.html in localStorage (non sessionStorage): il magic link
  // di Supabase può aprire una nuova scheda, e sessionStorage è per-scheda — questi
  // dati andrebbero persi. localStorage sopravvive al cambio di scheda.
  localStorage.setItem('rf_history', JSON.stringify(state.conversationHistory));
  localStorage.setItem('rf_activities', JSON.stringify(state.activityResults));
  localStorage.setItem('rf_answers', JSON.stringify(state.answers));
  localStorage.setItem('rf_aspiration', state.aspirationRole || '');
  // Nuovo handoff non ancora salvato su Supabase: azzera il flag "consumato"
  // così report.js sa che deve generare e salvare questo report.
  localStorage.removeItem('rf_report_saved');

  clearState();

  setTimeout(() => {
    window.location.href = 'report.html';
  }, 600);
}

// Mostra una volta sola, prima della prima domanda vera, un avviso di cosa
// non verrà richiesto perché già noto dal test precedente (vedi
// buildStandardQueue). Stessa vetrina del "restore-notice": persiste finché
// non si arriva alla domanda sull'aspirazione, che ripulisce entrambi.
function showSkipNotice() {
  const notice = document.createElement('div');
  notice.className = 'restore-notice';
  notice.style.cssText = 'font-size:0.82rem;color:var(--emerald-light);margin-bottom:16px;opacity:0.8;';
  notice.textContent = `✓ Abbiamo già la tua ${state._skippedLabels.join(' e ')} dal test precedente — non te le richiediamo di nuovo.`;
  document.getElementById('active-question').prepend(notice);
}

// Avvio di un test da zero (primo test, oppure ripristino di uno stato
// non recuperabile): per chi rifà il test da loggato, recupera prima le
// risposte riusabili e il contesto CV, così la prima domanda mostrata è già
// quella giusta invece di dover sempre partire da "Quanti anni hai?".
async function startFreshTest() {
  clearState();
  state.conversationHistory = [{ role: 'user', content: 'Inizia il test. Sono pronto.' }];
  state.standardQueue = [...STANDARD_QUESTIONS];

  const ctx = await prepareReturningUserContext();
  buildStandardQueue(ctx.knownAnswers);
  state.cvContext = ctx.cvText;
  state.historicalSummary = ctx.historicalSummary;
  if (state._skippedLabels.length) showSkipNotice();

  await getNextStep();
}

// ─── INIT ─────────────────────────────────────────────────────
async function init() {
  const restored = loadState();

  if (restored && state.currentQuestion && state.questionCount > 0) {
    const isStandardQuestion = STANDARD_QUESTIONS.some(q => q.id === state.currentQuestion.id);
    const isWorkQuestion = state.currentQuestion.id === 'ruolo_attuale';

    if (!isStandardQuestion && !isWorkQuestion) {
      await startFreshTest();
      return;
    }

    updatePhase(state.currentPhase);
    updateProgress();

    const notice = document.createElement('div');
    notice.className = 'restore-notice';
    notice.style.cssText = 'font-size:0.82rem;color:var(--emerald-light);margin-bottom:16px;opacity:0.8;';
    notice.textContent = '✓ Progressi ripristinati — sei al punto dove ti eri fermato.';

    document.getElementById('active-question').classList.remove('hidden');
    document.getElementById('active-question').prepend(notice);

    renderQuestion(state.currentQuestion);
    return;
  }

  await startFreshTest();
}

document.addEventListener('DOMContentLoaded', init);

// Esposizione per l'handler inline in test.html (onclick="goBack()") — ora
// che il file è un modulo ES, le funzioni top-level non sono più globali.
window.goBack = goBack;
