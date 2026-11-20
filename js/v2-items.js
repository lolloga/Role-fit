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
//
// L'AI può riscrivere carte, scene e dilemmi nel mondo della persona (così
// il test è diverso ogni volta), ma non decide mai su quale dimensione pesa
// una scelta: quello resta scritto qui.

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

// ─── PERSONAGGI E AMBIENTAZIONE ─────────────────────────────────
// A ogni test si pescano i colleghi della giornata (sempre diversi) e uno
// spunto per l'ambientazione: le stesse persone tornano in tutte le scene,
// sia in quelle scritte dall'AI sia in quelle standard.
export const NOMI_CAST = [
  'Luca', 'Sara', 'Marco', 'Chiara', 'Andrea', 'Elena', 'Paolo', 'Marta',
  'Davide', 'Anna', 'Matteo', 'Laura', 'Simone', 'Irene', 'Federico', 'Giorgia',
  'Stefano', 'Valentina', 'Nicola', 'Francesca', 'Tommaso', 'Alice', 'Lorenzo', 'Beatrice',
];
export const RUOLI_CAST = ['collega', 'capo', 'cliente'];

export const SPUNTI = [
  'una realtà piccola, dove tutti si conoscono',
  'una grande organizzazione con sedi in più città',
  'una realtà giovane che sta crescendo in fretta',
  'una settimana importante: si chiude un progetto atteso da mesi',
  'un periodo di cambiamento: arrivano persone e strumenti nuovi',
  'una sede appena rinnovata, con un gruppo misto di esperti e nuovi arrivati',
  'una giornata in cui un cliente importante è in visita',
  'un gruppo che lavora in parte da remoto e in parte in sede',
];

// ─── CAPITOLO 1 · COSA TI ACCENDE ───────────────────────────────
// 8 carte per dimensione: a ogni test se ne pescano 4 per dimensione, così
// il mazzo cambia ogni volta. "sec" = una seconda dimensione toccata in parte.
// L'AI può riambientare il testo nel mondo della persona, ma l'attività e la
// dimensione restano quelle scritte qui.
export const CARTE_PER_ASSE = 4;
export const CARD_QUESTION = 'Ti piacerebbe una giornata così?';

export const CARDS = [
  { id: 'c01', icona: '📊', testo: 'Scoprire nei dati perché le vendite sono calate', asse: 'Analisi' },
  { id: 'c02', icona: '🧮', testo: 'Confrontare tre offerte con una tabella di pro, contro e costi', asse: 'Analisi', sec: { asse: 'Metodo', peso: 0.4 } },
  { id: 'c03', icona: '📈', testo: 'Misurare se una campagna ha funzionato davvero', asse: 'Analisi' },
  { id: 'c04', icona: '🧩', testo: 'Risolvere un problema logico che nessuno ha ancora capito', asse: 'Analisi', sec: { asse: 'Curiosità', peso: 0.3 } },
  { id: 'c29', icona: '🔎', testo: 'Ricostruire, indizio dopo indizio, da dove nasce un errore', asse: 'Analisi' },
  { id: 'c30', icona: '📉', testo: 'Prevedere con i numeri come andrà il prossimo trimestre', asse: 'Analisi' },
  { id: 'c31', icona: '🪜', testo: 'Scomporre un problema enorme in pezzi più piccoli e risolvibili', asse: 'Analisi', sec: { asse: 'Metodo', peso: 0.3 } },
  { id: 'c32', icona: '⚖️', testo: 'Valutare con i fatti se una decisione conviene davvero', asse: 'Analisi' },

  { id: 'c05', icona: '🤝', testo: 'Ascoltare un cliente per capire di cosa ha davvero bisogno', asse: 'Relazione' },
  { id: 'c06', icona: '👋', testo: 'Aiutare un collega nuovo a sentirsi parte del team', asse: 'Relazione' },
  { id: 'c07', icona: '💬', testo: 'Convincere una persona scettica che un\'idea vale', asse: 'Relazione', sec: { asse: 'Leadership', peso: 0.3 } },
  { id: 'c08', icona: '🌉', testo: 'Fare da ponte tra due persone che non si capiscono', asse: 'Relazione' },
  { id: 'c33', icona: '☕', testo: 'Passare la mattina a conoscere le persone di un nuovo progetto', asse: 'Relazione' },
  { id: 'c34', icona: '🫶', testo: 'Stare accanto a qualcuno in un momento difficile', asse: 'Relazione' },
  { id: 'c35', icona: '🎯', testo: 'Capire al volo cosa preoccupa davvero chi hai davanti', asse: 'Relazione' },
  { id: 'c36', icona: '🙂', testo: 'Calmare un cliente arrabbiato e salutarlo soddisfatto', asse: 'Relazione' },

  { id: 'c09', icona: '💡', testo: 'Inventare il nome e l\'immagine di un prodotto nuovo', asse: 'Creatività' },
  { id: 'c10', icona: '✍️', testo: 'Scrivere un testo che emozioni chi lo legge', asse: 'Creatività' },
  { id: 'c11', icona: '🎨', testo: 'Trovare un modo originale per presentare un tema noioso', asse: 'Creatività' },
  { id: 'c12', icona: '📐', testo: 'Progettare qualcosa partendo da un foglio bianco', asse: 'Creatività', sec: { asse: 'Concretezza', peso: 0.3 } },
  { id: 'c37', icona: '🎬', testo: 'Inventare una storia per far conoscere un progetto', asse: 'Creatività' },
  { id: 'c38', icona: '🖌️', testo: 'Immaginare l\'aspetto di uno spazio, di un oggetto o di un sito', asse: 'Creatività' },
  { id: 'c39', icona: '💭', testo: 'Buttare giù cento idee per trovarne una davvero buona', asse: 'Creatività' },
  { id: 'c40', icona: '🪄', testo: 'Dare un tocco personale a qualcosa che tutti fanno uguale', asse: 'Creatività' },

  { id: 'c13', icona: '🧭', testo: 'Imparare da zero uno strumento che non hai mai usato', asse: 'Curiosità' },
  { id: 'c14', icona: '🔭', testo: 'Esplorare un settore che non conosci per capirne le regole', asse: 'Curiosità' },
  { id: 'c15', icona: '📚', testo: 'Approfondire un tema solo perché ti incuriosisce', asse: 'Curiosità' },
  { id: 'c16', icona: '🧪', testo: 'Provare un approccio mai tentato, anche a rischio di sbagliare', asse: 'Curiosità', sec: { asse: 'Creatività', peso: 0.3 } },
  { id: 'c41', icona: '🌍', testo: 'Passare una settimana altrove per vedere come lavorano lì', asse: 'Curiosità' },
  { id: 'c42', icona: '❓', testo: 'Fare domande a un esperto finché non hai capito tutto', asse: 'Curiosità' },
  { id: 'c43', icona: '🛰️', testo: 'Seguire le novità di un campo che cambia ogni mese', asse: 'Curiosità' },
  { id: 'c44', icona: '🧬', testo: 'Capire come funziona davvero qualcosa che usi ogni giorno', asse: 'Curiosità', sec: { asse: 'Analisi', peso: 0.3 } },

  { id: 'c17', icona: '🚩', testo: 'Decidere la direzione di un progetto per tutto il gruppo', asse: 'Leadership' },
  { id: 'c18', icona: '🎙️', testo: 'Guidare una riunione e portarla a una decisione', asse: 'Leadership' },
  { id: 'c19', icona: '🚀', testo: 'Lanciare un progetto tuo e trovare chi ti segua', asse: 'Leadership', sec: { asse: 'Creatività', peso: 0.3 } },
  { id: 'c20', icona: '🌱', testo: 'Far crescere una piccola squadra di persone', asse: 'Leadership', sec: { asse: 'Relazione', peso: 0.3 } },
  { id: 'c45', icona: '🧯', testo: 'Prendere in mano una situazione in cui nessuno sa cosa fare', asse: 'Leadership' },
  { id: 'c46', icona: '📣', testo: 'Presentare una proposta tua davanti ai responsabili', asse: 'Leadership', sec: { asse: 'Relazione', peso: 0.3 } },
  { id: 'c47', icona: '🏁', testo: 'Fissare gli obiettivi di un gruppo e tenerlo sulla rotta', asse: 'Leadership' },
  { id: 'c48', icona: '🔑', testo: 'Avere l\'ultima parola su una decisione importante', asse: 'Leadership' },

  { id: 'c21', icona: '🗂️', testo: 'Mettere ordine in un processo confuso e renderlo chiaro', asse: 'Metodo' },
  { id: 'c22', icona: '🗓️', testo: 'Pianificare un progetto passo per passo, con scadenze precise', asse: 'Metodo' },
  { id: 'c23', icona: '🔍', testo: 'Controllare che ogni dettaglio di un lavoro sia corretto', asse: 'Metodo' },
  { id: 'c24', icona: '📋', testo: 'Creare un sistema per tenere tutto sotto controllo', asse: 'Metodo' },
  { id: 'c49', icona: '✅', testo: 'Scrivere una procedura chiara che chiunque possa seguire', asse: 'Metodo' },
  { id: 'c50', icona: '📦', testo: 'Organizzare un evento perché ogni cosa arrivi al momento giusto', asse: 'Metodo' },
  { id: 'c51', icona: '🧾', testo: 'Tenere i conti di un progetto in perfetto ordine', asse: 'Metodo', sec: { asse: 'Analisi', peso: 0.3 } },
  { id: 'c52', icona: '🔁', testo: 'Rendere più scorrevole un lavoro che si ripete ogni giorno', asse: 'Metodo' },

  { id: 'c25', icona: '🔧', testo: 'Montare, aggiustare o far funzionare qualcosa con le mani', asse: 'Concretezza' },
  { id: 'c26', icona: '🥾', testo: 'Lavorare sul campo invece che dietro una scrivania', asse: 'Concretezza' },
  { id: 'c27', icona: '🧱', testo: 'Vedere a fine giornata un risultato che si può toccare', asse: 'Concretezza' },
  { id: 'c28', icona: '⚙️', testo: 'Usare strumenti o macchinari per realizzare qualcosa', asse: 'Concretezza' },
  { id: 'c53', icona: '🏗️', testo: 'Seguire di persona un cantiere o un allestimento', asse: 'Concretezza' },
  { id: 'c54', icona: '🍳', testo: 'Preparare qualcosa con le mani, dall\'inizio alla fine', asse: 'Concretezza' },
  { id: 'c55', icona: '🧰', testo: 'Risolvere sul posto un problema pratico, tra persone e attrezzi', asse: 'Concretezza' },
  { id: 'c56', icona: '🌿', testo: 'Passare la giornata all\'aperto e in movimento', asse: 'Concretezza' },
];

// ─── CAPITOLO 2 · LA TUA GIORNATA ───────────────────────────────
// Tipi: rank (scegli N in ordine), pick (una tra 4), twostep (prima e
// seconda mossa), budget (gettoni da distribuire), energia (cosa dà e cosa
// toglie energia).
//
// Ogni opzione misura sempre la stessa dimensione ("asse"). L'AI riscrive
// le scene nel mondo della persona, con gli stessi colleghi dall'inizio alla
// fine, ma deve restituire le stesse opzioni con le stesse dimensioni: cambia
// la storia, non la misura. Se l'AI non risponde in tempo si usano i testi
// qui sotto.
//
// Segnaposto: {nome} = la persona (se non l'ha detto, la frase si adatta),
// {collega}, {capo}, {cliente} = i colleghi pescati per questo test.
// "eco" = la frase che apre la scena successiva quando la persona sceglie
// quell'opzione: la giornata risponde alle sue scelte.
export const SCENES = [
  {
    id: 'posta', ora: '09:00', tipo: 'rank', scegli: 3,
    titolo: 'La posta del mattino',
    testo: 'Apri la casella: sette messaggi nuovi e il tempo per leggerne solo alcuni.',
    domanda: 'Quali apri per primi? Toccane tre, in ordine.',
    opzioni: [
      { id: 'a', mittente: 'Report mensile', testo: 'I numeri del mese sono arrivati: qualcosa non torna', asse: 'Analisi', eco: 'Hai cominciato dai numeri del mese: adesso sai dove guardare.' },
      { id: 'b', mittente: '{collega}, collega', testo: '{nome}, da ieri non riesco ad andare avanti: mi daresti una mano?', asse: 'Relazione', eco: '{collega} ti scrive di nuovo: «Grazie, mi hai salvato la mattinata».' },
      { id: 'c', mittente: '{cliente}, cliente', testo: 'Ci serve un\'idea nuova per il lancio di primavera', asse: 'Creatività', eco: 'Ti gira già in testa un\'idea per il lancio di {cliente}.' },
      { id: 'd', mittente: 'Formazione', testo: 'Si è liberato un posto nel corso sulla nuova tecnologia', asse: 'Curiosità', eco: 'Il posto nel corso è tuo: si comincia la settimana prossima.' },
      { id: 'e', mittente: '{capo}, responsabile', testo: 'Cerchiamo qualcuno che guidi il nuovo progetto', asse: 'Leadership', eco: '{capo} aspetta di sentire la tua idea per il nuovo progetto.' },
      { id: 'f', mittente: 'Pianificazione', testo: 'Il calendario delle consegne va riorganizzato entro oggi', asse: 'Metodo', eco: 'Il calendario delle consegne adesso ha un ordine: una cosa in meno.' },
      { id: 'g', mittente: 'Laboratorio', testo: 'Il tecnico ti aspetta per provare il nuovo macchinario', asse: 'Concretezza', eco: 'Il tecnico ti tiene da parte il macchinario per la prova.' },
    ],
  },
  {
    id: 'riunione', ora: '10:30', tipo: 'pick',
    titolo: 'Una sola riunione',
    testo: 'In agenda ci sono quattro incontri alla stessa ora. Puoi andare a uno solo.',
    domanda: 'Quale scegli?',
    opzioni: [
      { id: 'a', testo: 'La revisione dei numeri del trimestre', asse: 'Analisi', eco: 'La revisione dei numeri ti ha lasciato due domande da approfondire.' },
      { id: 'b', testo: 'Il brainstorming per la nuova campagna', asse: 'Creatività', eco: 'Al brainstorming una delle tue idee è finita sulla lavagna.' },
      { id: 'c', testo: 'L\'esperto che presenta una tecnologia appena uscita', asse: 'Curiosità', eco: 'Hai ancora in testa la tecnologia presentata dall\'esperto.' },
      { id: 'd', testo: 'La prova del prototipo in laboratorio', asse: 'Concretezza', eco: 'Il prototipo l\'hai provato con le tue mani: funziona, quasi.' },
    ],
  },
  {
    id: 'avvio', ora: '11:30', tipo: 'pick',
    titolo: 'Il progetto mai fatto',
    testo: '{capo} ti affida un progetto che nessuno, dove lavori, ha mai fatto prima. Hai la mattinata per partire.',
    domanda: 'Da dove cominci?',
    opzioni: [
      { id: 'a', testo: 'Parlo con chi lo userà per capire cosa gli serve', asse: 'Relazione', eco: 'Chi userà il progetto ti ha raccontato cosa gli manca davvero.' },
      { id: 'b', testo: 'Divido il lavoro in fasi con scadenze chiare', asse: 'Metodo', eco: 'Il progetto nuovo ha già le sue fasi e le sue scadenze.' },
      { id: 'c', testo: 'Studio come l\'hanno fatto altrove', asse: 'Curiosità', eco: 'Hai trovato due esempi di come l\'hanno fatto altrove.' },
      { id: 'd', testo: 'Faccio subito una prova pratica per vedere cosa succede', asse: 'Concretezza', eco: 'La prima prova pratica è fatta: adesso sai cosa regge e cosa no.' },
    ],
  },
  {
    id: 'imprevisto', ora: '13:00', tipo: 'twostep',
    titolo: 'L\'imprevisto',
    testo: 'Rientri dalla pausa e {capo} ti ferma: «{nome}, {cliente} ha anticipato la consegna a domani mattina».',
    domanda: 'Qual è la tua prima mossa?',
    domanda2: 'E subito dopo?',
    opzioni: [
      { id: 'a', testo: 'Guardo i numeri: cosa è davvero indispensabile per domani', asse: 'Analisi', eco: 'Hai capito cosa è davvero indispensabile per domani.' },
      { id: 'b', testo: 'Chiamo {cliente} per capire cosa conta di più', asse: 'Relazione', eco: '{cliente} ti ha detto cosa conta davvero: il resto può aspettare.' },
      { id: 'c', testo: 'Riunisco il team e divido i compiti in cinque minuti', asse: 'Leadership', eco: 'Il team si è diviso i compiti in cinque minuti, come avevi proposto.' },
      { id: 'd', testo: 'Rifaccio il piano ora per ora e lo condivido', asse: 'Metodo', eco: 'Il nuovo piano, ora per ora, è già nella casella di tutti.' },
    ],
  },
  {
    id: 'budget', ora: '15:00', tipo: 'budget', gettoni: 10, max: 5,
    titolo: 'Carta bianca',
    testo: '{capo} ti dà carta bianca sul progetto: decidi tu dove mettere le energie del gruppo. Hai 10 gettoni da distribuire.',
    domanda: 'Dove li metti?',
    opzioni: [
      { id: 'a', testo: 'Studiare i dati prima di decidere', asse: 'Analisi', eco: 'Hai deciso di partire dai dati: il progetto avrà basi solide.' },
      { id: 'b', testo: 'Parlare con le persone coinvolte', asse: 'Relazione', eco: 'Le persone coinvolte sanno che le ascolterai prima di decidere.' },
      { id: 'c', testo: 'Inventare idee e prototipi', asse: 'Creatività', eco: 'Le idee per il progetto hanno già riempito una pagina.' },
      { id: 'd', testo: 'Esplorare soluzioni mai provate', asse: 'Curiosità', eco: 'Hai tre soluzioni mai provate da esplorare.' },
      { id: 'e', testo: 'Guidare il gruppo e decidere', asse: 'Leadership', eco: 'Il gruppo sa che sul progetto la direzione la dai tu.' },
      { id: 'f', testo: 'Un piano preciso, con tappe e controlli', asse: 'Metodo', eco: 'Il piano del progetto ha tappe e controlli precisi.' },
      { id: 'g', testo: 'Provare subito sul campo', asse: 'Concretezza', eco: 'Domani si prova sul campo: hai già preparato tutto.' },
    ],
  },
  {
    id: 'libere', ora: '16:30', tipo: 'pick',
    titolo: 'Due ore libere',
    testo: 'Una riunione salta e ti ritrovi con due ore libere prima di sera.',
    domanda: 'Come le usi?',
    opzioni: [
      { id: 'a', testo: 'Lavoro a un\'idea mia che mi gira in testa da giorni', asse: 'Creatività', eco: 'L\'idea che ti girava in testa adesso è su carta.' },
      { id: 'b', testo: 'Preparo una proposta da portare a {capo} domani', asse: 'Leadership', eco: 'La proposta per {capo} è pronta per domani.' },
      { id: 'c', testo: 'Seguo un corso su qualcosa che non conosco', asse: 'Curiosità', eco: 'In due ore hai imparato qualcosa che stamattina non sapevi.' },
      { id: 'd', testo: 'Metto in ordine file e scadenze della settimana', asse: 'Metodo', eco: 'File e scadenze della settimana sono finalmente in ordine.' },
    ],
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

// La giornata viene scritta dall'AI in due metà, in parallelo: la mattina
// serve per prima, il pomeriggio ha più tempo per arrivare.
export const GIORNATA = {
  mattina: ['posta', 'riunione', 'avvio'],
  pomeriggio: ['imprevisto', 'budget', 'libere', 'fine'],
};

// ─── CAPITOLO 3 · SCELTE DIFFICILI ──────────────────────────────
// Un dilemma per ogni coppia di dimensioni (21). Il motore ne propone 4-6,
// scegliendo le coppie dove il profilo è ancora più incerto. L'AI li
// riambienta nel mondo della persona, come il seguito della sua giornata.
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
