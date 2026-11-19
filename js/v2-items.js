// RoleFit — contenuti del test a capitoli (versione 2).
//
// Ogni elemento qui sotto ha un punteggio deciso in anticipo: dice su quale
// dimensione pesa la scelta. È questo che rende il risultato ripetibile —
// le stesse risposte danno sempre gli stessi numeri — invece di lasciare
// all'AI il compito di interpretare tutto a fine test (vedi v2-engine.js).
//
// Regola di scrittura: tutte le opzioni di una stessa domanda devono essere
// ugualmente desiderabili. Se una suona "più giusta" delle altre, la gente
// sceglie quella invece di quella che sente sua, e la misura si rovina.

export const AXES = ['Analisi', 'Relazione', 'Creatività', 'Curiosità', 'Leadership', 'Metodo', 'Concretezza'];

// I primi 6 colori sono gli stessi già usati per le costellazioni del sito.
export const AXIS_COLORS = {
  Analisi: '#5DCAA5',
  Relazione: '#FF9FB8',
  Creatività: '#FFD060',
  Curiosità: '#85C9EB',
  Leadership: '#C79CF0',
  Metodo: '#7FE0C0',
  Concretezza: '#F2A65A',
};

// Descrizioni brevi, usate nel report e nel prompt dell'AI.
export const AXIS_INFO = {
  Analisi: 'ragionare su dati e logica, scomporre i problemi',
  Relazione: 'funzionare attraverso le persone: capire, convincere, prendersi cura',
  Creatività: 'generare idee nuove, dare forma, esprimere',
  Curiosità: 'cercare il nuovo, imparare, esplorare territori sconosciuti',
  Leadership: 'prendere l\'iniziativa e indicare la strada agli altri (una propensione, non un giudizio)',
  Metodo: 'ordine, struttura, pianificazione, cura del dettaglio',
  Concretezza: 'fare con le mani, stare sul campo, vedere risultati tangibili',
};

// ─── PROLOGO ────────────────────────────────────────────────────
// Gli id e i testi di "background" sono identici a quelli del test
// precedente: così chi passa da una versione all'altra non se li vede
// richiedere.
export const MOMENTI = [
  { id: 'studio', testo: 'Sto ancora studiando' },
  { id: 'neolaureato', testo: 'Ho appena finito gli studi e sto capendo cosa fare' },
  { id: 'incerto', testo: 'Ho iniziato a lavorare ma non sono sicuro che sia la strada giusta' },
  { id: 'anni', testo: 'Lavoro da anni ma sento che qualcosa non torna' },
  { id: 'conferma', testo: 'Sto facendo un lavoro che mi piace, ma cerco conferma' },
  { id: 'cambio', testo: 'Voglio cambiare strada' },
];
// Chi lavora già: il report gli propone di confrontare il ruolo attuale.
export const MOMENTI_LAVORO = ['incerto', 'anni', 'conferma', 'cambio'];

export const MONDI = [
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
  'Difesa',
];
export const MONDO_NON_SO = 'Non lo so ancora';

export const BACKGROUND = [
  'Umanistico, comunicazione, lingue',
  'Economico, gestionale, aziendale',
  'Scientifico, tecnico, ingegneristico',
  'Giuridico, politico, relazioni internazionali',
  'Artistico, creativo, design',
  'Sanitario, biologico, psicologico',
  'Nessun percorso formale specifico',
];

// ─── CAPITOLO 1 · COSA TI ACCENDE ───────────────────────────────
// 4 carte per dimensione. "sec" = una seconda dimensione toccata in parte.
export const CARD_QUESTION = 'Ti piacerebbe una giornata così?';

export const CARDS = [
  { id: 'c01', icona: '📊', testo: 'Scoprire nei dati perché le vendite sono calate', asse: 'Analisi' },
  { id: 'c02', icona: '🧮', testo: 'Confrontare tre offerte con una tabella di pro, contro e costi', asse: 'Analisi', sec: { asse: 'Metodo', peso: 0.4 } },
  { id: 'c03', icona: '📈', testo: 'Misurare se una campagna ha funzionato davvero', asse: 'Analisi' },
  { id: 'c04', icona: '🧩', testo: 'Risolvere un problema logico che nessuno ha ancora capito', asse: 'Analisi', sec: { asse: 'Curiosità', peso: 0.3 } },

  { id: 'c05', icona: '🤝', testo: 'Ascoltare un cliente per capire di cosa ha davvero bisogno', asse: 'Relazione' },
  { id: 'c06', icona: '👋', testo: 'Aiutare un collega nuovo a sentirsi parte del team', asse: 'Relazione' },
  { id: 'c07', icona: '💬', testo: 'Convincere una persona scettica che un\'idea vale', asse: 'Relazione', sec: { asse: 'Leadership', peso: 0.3 } },
  { id: 'c08', icona: '🌉', testo: 'Fare da ponte tra due persone che non si capiscono', asse: 'Relazione' },

  { id: 'c09', icona: '💡', testo: 'Inventare il nome e l\'immagine di un prodotto nuovo', asse: 'Creatività' },
  { id: 'c10', icona: '✍️', testo: 'Scrivere un testo che emozioni chi lo legge', asse: 'Creatività' },
  { id: 'c11', icona: '🎨', testo: 'Trovare un modo originale per presentare un tema noioso', asse: 'Creatività' },
  { id: 'c12', icona: '📐', testo: 'Progettare qualcosa partendo da un foglio bianco', asse: 'Creatività', sec: { asse: 'Concretezza', peso: 0.3 } },

  { id: 'c13', icona: '🧭', testo: 'Imparare da zero uno strumento che non hai mai usato', asse: 'Curiosità' },
  { id: 'c14', icona: '🔭', testo: 'Esplorare un settore che non conosci per capirne le regole', asse: 'Curiosità' },
  { id: 'c15', icona: '📚', testo: 'Approfondire un tema solo perché ti incuriosisce', asse: 'Curiosità' },
  { id: 'c16', icona: '🧪', testo: 'Provare un approccio mai tentato, anche a rischio di sbagliare', asse: 'Curiosità', sec: { asse: 'Creatività', peso: 0.3 } },

  { id: 'c17', icona: '🚩', testo: 'Decidere la direzione di un progetto per tutto il gruppo', asse: 'Leadership' },
  { id: 'c18', icona: '🎙️', testo: 'Guidare una riunione e portarla a una decisione', asse: 'Leadership' },
  { id: 'c19', icona: '🚀', testo: 'Lanciare un progetto tuo e trovare chi ti segua', asse: 'Leadership', sec: { asse: 'Creatività', peso: 0.3 } },
  { id: 'c20', icona: '🌱', testo: 'Far crescere una piccola squadra di persone', asse: 'Leadership', sec: { asse: 'Relazione', peso: 0.3 } },

  { id: 'c21', icona: '🗂️', testo: 'Mettere ordine in un processo confuso e renderlo chiaro', asse: 'Metodo' },
  { id: 'c22', icona: '🗓️', testo: 'Pianificare un progetto passo per passo, con scadenze precise', asse: 'Metodo' },
  { id: 'c23', icona: '🔍', testo: 'Controllare che ogni dettaglio di un lavoro sia corretto', asse: 'Metodo' },
  { id: 'c24', icona: '📋', testo: 'Creare un sistema per tenere tutto sotto controllo', asse: 'Metodo' },

  { id: 'c25', icona: '🔧', testo: 'Montare, aggiustare o far funzionare qualcosa con le mani', asse: 'Concretezza' },
  { id: 'c26', icona: '🥾', testo: 'Lavorare sul campo invece che dietro una scrivania', asse: 'Concretezza' },
  { id: 'c27', icona: '🧱', testo: 'Vedere a fine giornata un risultato che si può toccare', asse: 'Concretezza' },
  { id: 'c28', icona: '⚙️', testo: 'Usare strumenti o macchinari per realizzare qualcosa', asse: 'Concretezza' },
];

// ─── CAPITOLO 2 · LA TUA GIORNATA ───────────────────────────────
// Tipi: rank (scegli N in ordine), pick (una tra 4), twostep (prima e
// seconda mossa), budget (gettoni da distribuire), energia (cosa dà e cosa
// toglie energia). Le scene "personalizzata" vengono riscritte dall'AI per
// i mondi scelti dalla persona, ma sempre sulle stesse 4 dimensioni indicate
// in "assi": la misura resta la stessa, cambia solo l'ambientazione. Se
// l'AI non risponde in tempo si usa "fallback", che ha la stessa struttura.
export const SCENES = [
  {
    id: 'posta', ora: '09:00', tipo: 'rank', scegli: 3,
    titolo: 'La posta del mattino',
    testo: 'Apri la casella: sette messaggi nuovi e il tempo per leggerne solo alcuni.',
    domanda: 'Quali apri per primi? Toccane tre, in ordine.',
    opzioni: [
      { id: 'a', mittente: 'Report mensile', testo: 'I numeri del mese sono arrivati: qualcosa non torna', asse: 'Analisi' },
      { id: 'b', mittente: 'Luca, collega', testo: 'Sono bloccato da ieri, mi daresti una mano?', asse: 'Relazione' },
      { id: 'c', mittente: 'Cliente', testo: 'Ci serve un\'idea nuova per il lancio di primavera', asse: 'Creatività' },
      { id: 'd', mittente: 'Academy', testo: 'Si è liberato un posto nel corso sulla nuova tecnologia', asse: 'Curiosità' },
      { id: 'e', mittente: 'Direzione', testo: 'Cerchiamo qualcuno che guidi il nuovo progetto', asse: 'Leadership' },
      { id: 'f', mittente: 'Pianificazione', testo: 'Il calendario delle consegne va riorganizzato entro oggi', asse: 'Metodo' },
      { id: 'g', mittente: 'Magazzino', testo: 'Il tecnico ti aspetta per provare il nuovo macchinario', asse: 'Concretezza' },
    ],
  },
  {
    id: 'riunione', ora: '10:30', tipo: 'pick',
    titolo: 'Una sola riunione',
    testo: 'In agenda ci sono quattro incontri alla stessa ora. Puoi andare a uno solo.',
    domanda: 'Quale scegli?',
    opzioni: [
      { id: 'a', testo: 'La revisione dei numeri del trimestre', asse: 'Analisi' },
      { id: 'b', testo: 'Il brainstorming per la nuova campagna', asse: 'Creatività' },
      { id: 'c', testo: 'L\'esperto che presenta una tecnologia appena uscita', asse: 'Curiosità' },
      { id: 'd', testo: 'La prova del prototipo in laboratorio', asse: 'Concretezza' },
    ],
  },
  {
    id: 'ai1', ora: '11:30', tipo: 'pick', personalizzata: true,
    assi: ['Relazione', 'Metodo', 'Curiosità', 'Concretezza'],
    fallback: {
      titolo: 'Il progetto mai fatto',
      testo: 'Ti affidano un progetto che nessuno, dove lavori, ha mai fatto prima. Hai la mattinata per partire.',
      domanda: 'Da dove cominci?',
      opzioni: [
        { testo: 'Parlo con chi lo userà per capire cosa gli serve', asse: 'Relazione' },
        { testo: 'Divido il lavoro in fasi con scadenze chiare', asse: 'Metodo' },
        { testo: 'Studio come l\'hanno fatto altrove', asse: 'Curiosità' },
        { testo: 'Faccio subito una prova pratica per vedere cosa succede', asse: 'Concretezza' },
      ],
    },
  },
  {
    id: 'imprevisto', ora: '13:00', tipo: 'twostep',
    titolo: 'L\'imprevisto',
    testo: 'Rientri dalla pausa e arriva la notizia: il cliente più importante ha anticipato la consegna a domani mattina.',
    domanda: 'Qual è la tua prima mossa?',
    domanda2: 'E subito dopo?',
    opzioni: [
      { id: 'a', testo: 'Guardo i numeri: cosa è davvero indispensabile per domani', asse: 'Analisi' },
      { id: 'b', testo: 'Chiamo il cliente per capire cosa conta di più per lui', asse: 'Relazione' },
      { id: 'c', testo: 'Riunisco il team e divido i compiti in cinque minuti', asse: 'Leadership' },
      { id: 'd', testo: 'Rifaccio il piano ora per ora e lo condivido', asse: 'Metodo' },
    ],
  },
  {
    id: 'budget', ora: '15:00', tipo: 'budget', gettoni: 10, max: 5,
    titolo: 'Il progetto nuovo',
    testo: 'Ti affidano un progetto da far partire. Il tempo è poco: hai 10 gettoni da distribuire.',
    domanda: 'Dove li metti?',
    opzioni: [
      { id: 'a', testo: 'Studiare i dati prima di decidere', asse: 'Analisi' },
      { id: 'b', testo: 'Parlare con le persone coinvolte', asse: 'Relazione' },
      { id: 'c', testo: 'Inventare idee e prototipi', asse: 'Creatività' },
      { id: 'd', testo: 'Esplorare soluzioni mai provate', asse: 'Curiosità' },
      { id: 'e', testo: 'Guidare il gruppo e decidere', asse: 'Leadership' },
      { id: 'f', testo: 'Un piano preciso, con tappe e controlli', asse: 'Metodo' },
      { id: 'g', testo: 'Provare subito sul campo', asse: 'Concretezza' },
    ],
  },
  {
    id: 'ai2', ora: '16:30', tipo: 'pick', personalizzata: true,
    assi: ['Creatività', 'Leadership', 'Curiosità', 'Metodo'],
    fallback: {
      titolo: 'Due ore libere',
      testo: 'Una riunione salta e ti ritrovi con due ore libere prima di sera.',
      domanda: 'Come le usi?',
      opzioni: [
        { testo: 'Lavoro a un\'idea mia che mi gira in testa da giorni', asse: 'Creatività' },
        { testo: 'Preparo una proposta da portare al capo domani', asse: 'Leadership' },
        { testo: 'Seguo un corso su qualcosa che non conosco', asse: 'Curiosità' },
        { testo: 'Metto in ordine file e scadenze della settimana', asse: 'Metodo' },
      ],
    },
  },
  {
    id: 'fine', ora: '18:00', tipo: 'energia', max: 2,
    titolo: 'Fine giornata',
    testo: 'La giornata è finita. Ripensi a com\'è andata.',
    domanda: 'Quali momenti ti hanno dato più energia? Scegline fino a due.',
    domanda2: 'E cosa te ne ha tolta di più?',
    opzioni: [
      { id: 'a', testo: 'Quando i numeri hanno finalmente avuto senso', asse: 'Analisi' },
      { id: 'b', testo: 'Una conversazione vera con qualcuno', asse: 'Relazione' },
      { id: 'c', testo: 'Quando ti è venuta un\'idea nuova', asse: 'Creatività' },
      { id: 'd', testo: 'Quando hai scoperto qualcosa che non sapevi', asse: 'Curiosità' },
      { id: 'e', testo: 'Quando il gruppo ha seguito la tua proposta', asse: 'Leadership' },
      { id: 'f', testo: 'Quando tutto è andato secondo i piani', asse: 'Metodo' },
      { id: 'g', testo: 'Quando hai visto il risultato concreto del lavoro', asse: 'Concretezza' },
    ],
    opzioni2: [
      { id: 'a', testo: 'Ore passate su un foglio di calcolo', asse: 'Analisi' },
      { id: 'b', testo: 'Una riunione dopo l\'altra, sempre tra persone', asse: 'Relazione' },
      { id: 'c', testo: 'Dover inventare qualcosa da zero, senza indicazioni', asse: 'Creatività' },
      { id: 'd', testo: 'Dover imparare in fretta una cosa nuova', asse: 'Curiosità' },
      { id: 'e', testo: 'Dover decidere per tutti', asse: 'Leadership' },
      { id: 'f', testo: 'Seguire procedure rigide, passo per passo', asse: 'Metodo' },
      { id: 'g', testo: 'Stare in piedi e in movimento tutto il giorno', asse: 'Concretezza' },
    ],
  },
];

// ─── CAPITOLO 3 · SCELTE DIFFICILI ──────────────────────────────
// Un dilemma per ogni coppia di dimensioni (21). Il motore ne propone 4-6,
// scegliendo le coppie dove il profilo è ancora più incerto.
export const DILEMMAS = [
  { id: 'd01', a: { testo: 'Un pomeriggio a scoprire cosa raccontano i dati', asse: 'Analisi' }, b: { testo: 'Un pomeriggio a capire cosa pensano le persone', asse: 'Relazione' } },
  { id: 'd02', a: { testo: 'Trovare la risposta giusta con un ragionamento rigoroso', asse: 'Analisi' }, b: { testo: 'Trovare una risposta che nessuno aveva immaginato', asse: 'Creatività' } },
  { id: 'd03', a: { testo: 'Capire alla perfezione come funziona una cosa', asse: 'Analisi' }, b: { testo: 'Scoprire tante cose nuove, anche solo in superficie', asse: 'Curiosità' } },
  { id: 'd04', a: { testo: 'Essere chi trova la soluzione', asse: 'Analisi' }, b: { testo: 'Essere chi decide quale soluzione adottare', asse: 'Leadership' } },
  { id: 'd05', a: { testo: 'Analizzare un problema mai visto prima', asse: 'Analisi' }, b: { testo: 'Far funzionare alla perfezione un processo che già esiste', asse: 'Metodo' } },
  { id: 'd06', a: { testo: 'Lavorare su modelli e numeri', asse: 'Analisi' }, b: { testo: 'Lavorare su oggetti che puoi toccare e costruire', asse: 'Concretezza' } },
  { id: 'd07', a: { testo: 'Una giornata di incontri e conversazioni', asse: 'Relazione' }, b: { testo: 'Una giornata da solo a creare qualcosa di tuo', asse: 'Creatività' } },
  { id: 'd08', a: { testo: 'Un lavoro che ti fa conoscere tante persone', asse: 'Relazione' }, b: { testo: 'Un lavoro che ti fa imparare sempre cose nuove', asse: 'Curiosità' } },
  { id: 'd09', a: { testo: 'Essere la persona su cui tutti possono contare', asse: 'Relazione' }, b: { testo: 'Essere la persona che indica la strada', asse: 'Leadership' } },
  { id: 'd10', a: { testo: 'Risolvere un problema parlando con chi è coinvolto', asse: 'Relazione' }, b: { testo: 'Risolvere un problema rimettendo ordine nelle regole', asse: 'Metodo' } },
  { id: 'd11', a: { testo: 'Aiutare qualcuno ascoltandolo davvero', asse: 'Relazione' }, b: { testo: 'Aiutare qualcuno sistemando ciò che non funziona', asse: 'Concretezza' } },
  { id: 'd12', a: { testo: 'Inventare qualcosa che ancora non esiste', asse: 'Creatività' }, b: { testo: 'Scoprire qualcosa che esiste ma non conoscevi', asse: 'Curiosità' } },
  { id: 'd13', a: { testo: 'Avere l\'idea', asse: 'Creatività' }, b: { testo: 'Convincere tutti a realizzarla', asse: 'Leadership' } },
  { id: 'd14', a: { testo: 'Massima libertà, nessuna regola', asse: 'Creatività' }, b: { testo: 'Regole chiare, risultato garantito', asse: 'Metodo' } },
  { id: 'd15', a: { testo: 'Immaginare come potrebbe essere', asse: 'Creatività' }, b: { testo: 'Realizzarlo davvero, pezzo per pezzo', asse: 'Concretezza' } },
  { id: 'd16', a: { testo: 'Esplorare da solo una strada nuova', asse: 'Curiosità' }, b: { testo: 'Guidare un gruppo su una strada già tracciata', asse: 'Leadership' } },
  { id: 'd17', a: { testo: 'Una settimana sempre diversa, tutta da inventare', asse: 'Curiosità' }, b: { testo: 'Una settimana ben pianificata, senza sorprese', asse: 'Metodo' } },
  { id: 'd18', a: { testo: 'Un corso su un tema affascinante', asse: 'Curiosità' }, b: { testo: 'Una giornata sul campo a fare', asse: 'Concretezza' } },
  { id: 'd19', a: { testo: 'Decidere in fretta con poche informazioni', asse: 'Leadership' }, b: { testo: 'Prendersi il tempo per fare tutto per bene', asse: 'Metodo' } },
  { id: 'd20', a: { testo: 'Coordinare il lavoro degli altri', asse: 'Leadership' }, b: { testo: 'Fare tu il lavoro, con le tue mani', asse: 'Concretezza' } },
  { id: 'd21', a: { testo: 'Un piano perfetto sulla carta', asse: 'Metodo' }, b: { testo: 'Un risultato concreto, anche se imperfetto', asse: 'Concretezza' } },
];

export const DILEMMI_MIN = 4;
export const DILEMMI_MAX = 6;
