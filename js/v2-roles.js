// RoleFit — libreria dei ruoli del test a capitoli (versione 2).
//
// Ogni ruolo ha un profilo sulle 7 dimensioni del test (0-100), nell'ordine
// di AXES: Analisi, Relazione, Creatività, Curiosità, Leadership, Metodo,
// Concretezza. Il profilo descrive cosa il lavoro chiede e premia ogni
// giorno, non chi lo fa oggi. 85+ = centrale, 65-75 = importante,
// 45-55 = indifferente, sotto 35 = quasi assente.
//
// I ruoli suggeriti escono da un calcolo su questa libreria (v2-engine.js),
// non dalla fantasia dell'AI: stesse risposte, stessi ruoli. I valori sono
// una prima stima ragionata: vanno rivisti con i dati dei test reali (chi fa
// davvero quel lavoro e ci sta bene).
//
// "bonus": ruoli insoliti, mai tra i 3 principali, usati solo per "il ruolo
// che non ti aspetti".

function r(id, nome, area, desc, assi, bonus = false) {
  return { id, nome, area, desc, assi, bonus };
}

export const ROLES = [
  // ─── Dati e analisi ───────────────────────────────────────────
  r('data-analyst', 'Data Analyst', 'dati', 'Trasforma dati grezzi in risposte chiare per chi deve decidere.', [90, 35, 35, 60, 30, 70, 25]),
  r('data-scientist', 'Data Scientist', 'dati', 'Costruisce modelli che prevedono comportamenti e risultati a partire dai dati.', [92, 30, 50, 78, 30, 60, 25]),
  r('business-analyst', 'Business Analyst', 'dati', 'Traduce i bisogni di un\'azienda in soluzioni concrete, con i numeri alla mano.', [80, 62, 40, 55, 42, 70, 30]),
  r('analista-finanziario', 'Analista finanziario', 'dati', 'Valuta conti, investimenti e scenari per capire dove conviene puntare.', [88, 40, 30, 52, 40, 75, 20]),
  r('controller', 'Controller di gestione', 'dati', 'Tiene sotto controllo costi, budget e risultati di un\'azienda.', [82, 45, 25, 40, 42, 86, 25]),
  r('ricercatore-mercato', 'Ricercatore di mercato', 'dati', 'Studia clienti e mercati con sondaggi, interviste e dati.', [76, 58, 45, 75, 30, 60, 30]),
  r('risk-analyst', 'Risk analyst', 'dati', 'Individua e misura i rischi prima che diventino problemi.', [86, 35, 25, 45, 35, 85, 20]),
  r('attuario', 'Attuario', 'dati', 'Calcola probabilità e rischi per assicurazioni e fondi pensione.', [92, 25, 22, 45, 25, 86, 15]),
  r('analista-gis', 'Analista territoriale (GIS)', 'dati', 'Trasforma dati geografici in mappe che aiutano a decidere dove e come intervenire.', [85, 30, 50, 65, 25, 78, 55], true),

  // ─── Tecnologia ───────────────────────────────────────────────
  r('sviluppatore-software', 'Sviluppatore software', 'tecnologia', 'Scrive e migliora il codice che fa funzionare app e servizi.', [80, 30, 58, 72, 30, 65, 45]),
  r('sviluppatore-frontend', 'Sviluppatore front-end', 'tecnologia', 'Costruisce le interfacce di siti e app che le persone usano ogni giorno.', [65, 35, 72, 65, 30, 60, 45]),
  r('devops', 'Cloud e DevOps engineer', 'tecnologia', 'Fa girare sistemi e servizi in modo stabile, automatico e sicuro.', [78, 30, 35, 65, 35, 82, 50]),
  r('cybersecurity', 'Esperto di cybersecurity', 'tecnologia', 'Protegge sistemi e dati da attacchi e falle.', [85, 30, 40, 78, 35, 76, 35]),
  r('tecnico-it', 'Tecnico IT', 'tecnologia', 'Risolve sul momento i problemi di computer, reti e strumenti dei colleghi.', [55, 68, 25, 45, 28, 65, 75]),
  r('qa-tester', 'Software tester (QA)', 'tecnologia', 'Mette alla prova software e prodotti per scovare gli errori prima dei clienti.', [72, 35, 30, 45, 25, 88, 40]),
  r('solution-architect', 'Solution architect', 'tecnologia', 'Progetta come sistemi e tecnologie diverse devono lavorare insieme.', [80, 55, 58, 68, 60, 70, 35]),
  r('ai-engineer', 'AI engineer', 'tecnologia', 'Addestra e mette in funzione sistemi di intelligenza artificiale.', [90, 30, 58, 88, 35, 60, 30]),

  // ─── Prodotto e design ────────────────────────────────────────
  r('product-manager', 'Product Manager', 'prodotto', 'Decide cosa costruire e perché, mettendo d\'accordo utenti, tecnici e business.', [70, 72, 62, 65, 78, 58, 35]),
  r('product-owner', 'Product Owner', 'prodotto', 'Trasforma la visione di un prodotto in priorità chiare per il team.', [65, 65, 45, 50, 60, 76, 35]),
  r('ux-designer', 'UX Designer', 'prodotto', 'Progetta come deve funzionare un prodotto digitale perché sia semplice da usare.', [55, 62, 85, 66, 35, 55, 40]),
  r('ux-researcher', 'UX Researcher', 'prodotto', 'Osserva e intervista le persone per capire come usano davvero prodotti e servizi.', [72, 72, 55, 86, 30, 55, 30]),
  r('ui-designer', 'Graphic e UI designer', 'prodotto', 'Dà forma visiva a marchi, interfacce e comunicazioni.', [30, 40, 92, 55, 25, 55, 55]),
  r('service-designer', 'Service designer', 'prodotto', 'Ripensa servizi interi, dal primo contatto all\'ultimo, mettendo le persone al centro.', [55, 72, 80, 72, 50, 55, 35]),
  r('game-designer', 'Game designer', 'prodotto', 'Inventa regole, mondi ed esperienze dei videogiochi.', [60, 40, 92, 82, 40, 55, 30], true),

  // ─── Comunicazione e contenuti ────────────────────────────────
  r('copywriter', 'Copywriter', 'comunicazione', 'Scrive i testi che fanno conoscere e scegliere un prodotto o un\'idea.', [35, 45, 92, 62, 25, 45, 20]),
  r('content-strategist', 'Content strategist', 'comunicazione', 'Decide quali contenuti creare, per chi e con quale obiettivo.', [55, 52, 80, 72, 45, 60, 20]),
  r('social-media-manager', 'Social media manager', 'comunicazione', 'Gestisce la voce di un marchio sui social e la sua community.', [50, 68, 78, 66, 40, 55, 25]),
  r('giornalista', 'Giornalista', 'comunicazione', 'Cerca notizie, verifica le fonti e racconta i fatti.', [60, 66, 70, 90, 40, 45, 45]),
  r('ufficio-stampa', 'Addetto stampa e PR', 'comunicazione', 'Cura i rapporti con i media e la reputazione di un\'organizzazione.', [35, 86, 62, 55, 50, 55, 30]),
  r('art-director', 'Art director', 'comunicazione', 'Guida l\'idea visiva di campagne e progetti creativi.', [35, 55, 92, 60, 66, 45, 45]),
  r('videomaker', 'Videomaker e fotografo', 'comunicazione', 'Racconta storie con immagini e video, dallo scatto al montaggio.', [30, 45, 88, 60, 35, 45, 82]),
  r('divulgatore', 'Divulgatore scientifico', 'comunicazione', 'Racconta in modo semplice e appassionante temi complessi.', [62, 70, 80, 90, 45, 45, 30], true),

  // ─── Marketing ────────────────────────────────────────────────
  r('marketing-specialist', 'Marketing specialist', 'marketing', 'Pianifica e realizza campagne per far crescere un marchio o un prodotto.', [60, 56, 72, 60, 40, 60, 25]),
  r('performance-marketing', 'Performance marketing specialist', 'marketing', 'Migliora le campagne online numeri alla mano, euro dopo euro.', [86, 35, 50, 60, 35, 70, 20]),
  r('brand-manager', 'Brand manager', 'marketing', 'Costruisce nel tempo l\'identità e la strategia di un marchio.', [60, 66, 76, 60, 66, 55, 30]),
  r('event-manager', 'Event manager', 'marketing', 'Organizza eventi dall\'idea al giorno stesso, tenendo insieme mille dettagli.', [40, 80, 62, 50, 70, 76, 70]),

  // ─── Vendite e clienti ────────────────────────────────────────
  r('account-manager', 'Account manager', 'vendite', 'Segue i clienti nel tempo e fa crescere il loro rapporto con l\'azienda.', [45, 88, 40, 45, 50, 62, 35]),
  r('commerciale', 'Commerciale', 'vendite', 'Trova nuovi clienti e chiude accordi.', [40, 86, 40, 45, 66, 45, 50]),
  r('business-developer', 'Business developer', 'vendite', 'Apre nuovi mercati, partnership e occasioni di crescita.', [55, 80, 56, 72, 76, 45, 35]),
  r('customer-success', 'Customer success manager', 'vendite', 'Aiuta i clienti a ottenere risultati con un prodotto, perché restino.', [50, 86, 40, 45, 40, 66, 30]),
  r('buyer', 'Buyer e category manager', 'vendite', 'Sceglie cosa comprare e da chi, trattando prezzi e condizioni.', [76, 66, 35, 45, 56, 66, 45]),
  r('store-manager', 'Store manager', 'vendite', 'Guida un punto vendita: persone, clienti, numeri e allestimento.', [45, 76, 30, 35, 80, 70, 75]),

  // ─── Consulenza e gestione ────────────────────────────────────
  r('consulente-management', 'Consulente di management', 'consulenza', 'Aiuta le aziende a risolvere problemi complessi di strategia e organizzazione.', [80, 70, 52, 72, 66, 66, 25]),
  r('project-manager', 'Project manager', 'consulenza', 'Porta un progetto dall\'inizio alla fine, nei tempi e nel budget.', [55, 70, 35, 40, 82, 88, 40]),
  r('consulente-innovazione', 'Consulente di innovazione', 'consulenza', 'Aiuta le organizzazioni a sperimentare idee e tecnologie nuove.', [60, 66, 80, 88, 56, 45, 30]),
  r('operations-manager', 'Operations manager', 'consulenza', 'Fa funzionare ogni giorno processi, persone e risorse di un\'azienda.', [65, 60, 30, 35, 76, 86, 62]),
  r('founder', 'Imprenditore', 'consulenza', 'Crea un\'impresa da zero e se ne prende rischi e decisioni.', [55, 70, 80, 86, 92, 40, 50]),
  r('consulente-esg', 'Consulente di sostenibilità (ESG)', 'consulenza', 'Aiuta le aziende a misurare e ridurre il loro impatto ambientale e sociale.', [66, 60, 50, 72, 45, 70, 40]),

  // ─── Persone e organizzazione ─────────────────────────────────
  r('hr-generalist', 'HR generalist', 'persone', 'Si occupa delle persone in azienda: inserimenti, contratti, benessere, crescita.', [40, 86, 35, 40, 50, 72, 25]),
  r('recruiter', 'Recruiter', 'persone', 'Trova e seleziona le persone giuste per ogni posizione.', [40, 90, 40, 55, 45, 60, 30]),
  r('formatore', 'Formatore', 'persone', 'Progetta e conduce percorsi per far crescere le competenze delle persone.', [45, 86, 66, 66, 60, 55, 35]),
  r('career-coach', 'Orientatore e career coach', 'persone', 'Accompagna le persone a capire e scegliere la propria strada.', [45, 92, 50, 62, 45, 45, 20]),
  r('office-manager', 'Office manager', 'persone', 'Fa funzionare l\'ufficio: spazi, fornitori, agende, organizzazione.', [40, 70, 25, 30, 55, 90, 55]),
  r('fundraiser', 'Fundraiser', 'persone', 'Trova risorse e sostenitori per cause e organizzazioni non profit.', [50, 90, 60, 50, 66, 60, 30]),
  r('mediatore-culturale', 'Mediatore culturale e interprete', 'persone', 'Fa da ponte tra lingue e culture diverse.', [55, 90, 55, 76, 35, 60, 40], true),

  // ─── Finanza e amministrazione ────────────────────────────────
  r('contabile', 'Impiegato amministrativo e contabile', 'finanza', 'Gestisce fatture, pagamenti e conti con precisione.', [66, 35, 15, 25, 20, 92, 35]),
  r('commercialista', 'Commercialista', 'finanza', 'Segue fisco, bilanci e adempimenti di aziende e professionisti.', [80, 62, 25, 35, 45, 88, 20]),
  r('auditor', 'Revisore contabile (auditor)', 'finanza', 'Controlla che i conti di un\'azienda siano corretti e trasparenti.', [82, 50, 20, 45, 40, 90, 30]),
  r('consulente-finanziario', 'Consulente finanziario', 'finanza', 'Aiuta persone e famiglie a gestire e investire i propri risparmi.', [65, 86, 30, 45, 55, 65, 20]),
  r('perito-assicurativo', 'Perito assicurativo', 'finanza', 'Ricostruisce cosa è successo davvero in un sinistro, sul posto e nei documenti.', [80, 60, 35, 66, 35, 76, 72], true),

  // ─── Diritto e istituzioni ────────────────────────────────────
  r('avvocato', 'Avvocato', 'istituzioni', 'Assiste e difende persone e aziende davanti alla legge.', [80, 72, 50, 56, 66, 70, 20]),
  r('compliance', 'Compliance officer', 'istituzioni', 'Fa sì che un\'organizzazione rispetti leggi e regole del suo settore.', [76, 45, 20, 45, 40, 92, 20]),
  r('funzionario-pubblico', 'Funzionario pubblico', 'istituzioni', 'Prepara e applica le decisioni pubbliche su temi concreti.', [70, 60, 35, 55, 45, 82, 30]),
  r('europrogettista', 'Europrogettista', 'istituzioni', 'Scrive progetti per ottenere fondi europei e pubblici, e li porta a termine.', [60, 65, 60, 70, 50, 82, 25]),

  // ─── Educazione e ricerca ─────────────────────────────────────
  r('insegnante', 'Insegnante', 'educazione', 'Fa crescere i suoi studenti, trasmettendo conoscenze e metodo.', [50, 90, 66, 66, 66, 60, 40]),
  r('ricercatore', 'Ricercatore scientifico', 'educazione', 'Fa esperimenti e studi per scoprire cose che ancora non sappiamo.', [86, 35, 60, 95, 35, 76, 58]),
  r('educatore', 'Educatore', 'educazione', 'Accompagna bambini, ragazzi o adulti in percorsi di crescita e inclusione.', [30, 92, 60, 50, 56, 45, 66]),

  // ─── Salute e cura ────────────────────────────────────────────
  r('infermiere', 'Infermiere', 'salute', 'Si prende cura dei pazienti ogni giorno, con competenza tecnica e umanità.', [50, 86, 25, 40, 50, 80, 88]),
  r('medico', 'Medico', 'salute', 'Fa diagnosi e cura le persone, prendendo decisioni importanti.', [80, 80, 35, 72, 66, 76, 76]),
  r('psicologo', 'Psicologo', 'salute', 'Ascolta e aiuta le persone ad affrontare difficoltà e cambiamenti.', [66, 92, 45, 72, 35, 50, 20]),
  r('fisioterapista', 'Fisioterapista', 'salute', 'Aiuta le persone a recuperare movimento e benessere, con le mani e l\'esercizio.', [50, 80, 30, 45, 40, 66, 92]),
  r('farmacista', 'Farmacista', 'salute', 'Consiglia e prepara farmaci: un punto di riferimento per la salute del quartiere.', [66, 76, 20, 45, 40, 86, 55]),
  r('assistente-sociale', 'Assistente sociale', 'salute', 'Aiuta persone e famiglie in difficoltà a trovare risposte e diritti.', [45, 90, 35, 45, 56, 60, 55]),
  r('nutrizionista', 'Nutrizionista', 'salute', 'Costruisce piani alimentari su misura e accompagna i cambiamenti.', [66, 80, 40, 62, 40, 66, 50]),

  // ─── Tecnica, ingegneria e produzione ─────────────────────────
  r('ingegnere-produzione', 'Ingegnere di produzione', 'tecnica', 'Migliora come si producono le cose: tempi, costi e qualità.', [80, 40, 45, 55, 52, 80, 82]),
  r('ingegnere-progettista', 'Ingegnere progettista', 'tecnica', 'Progetta macchine, componenti o impianti, dal calcolo al prototipo.', [82, 35, 70, 66, 35, 76, 76]),
  r('tecnico-laboratorio', 'Tecnico di laboratorio', 'tecnica', 'Esegue analisi e prove in laboratorio con strumenti e protocolli precisi.', [70, 30, 25, 55, 20, 88, 86]),
  r('manutentore', 'Tecnico manutentore', 'tecnica', 'Tiene in funzione macchinari e impianti e interviene quando qualcosa si guasta.', [55, 40, 30, 45, 30, 70, 95]),
  r('elettricista', 'Elettricista e impiantista', 'tecnica', 'Installa e ripara impianti elettrici e tecnici in case e aziende.', [55, 45, 30, 40, 40, 70, 95]),
  r('responsabile-qualita', 'Responsabile qualità', 'tecnica', 'Verifica che prodotti e processi rispettino gli standard.', [76, 50, 25, 40, 50, 92, 56]),
  r('logistica', 'Specialista di logistica', 'tecnica', 'Fa arrivare le merci giuste nel posto giusto al momento giusto.', [76, 56, 30, 40, 56, 86, 60]),
  r('architetto', 'Architetto', 'tecnica', 'Progetta spazi ed edifici, dall\'idea al cantiere.', [55, 60, 90, 66, 56, 66, 70]),
  r('tecnico-cantiere', 'Geometra e tecnico di cantiere', 'tecnica', 'Segue misure, pratiche e lavori in cantiere.', [60, 60, 35, 35, 62, 80, 90]),
  r('tecnico-rinnovabili', 'Tecnico delle energie rinnovabili', 'tecnica', 'Installa e cura impianti solari, eolici e di efficienza energetica.', [66, 40, 35, 62, 35, 70, 90]),
  r('agronomo', 'Agronomo', 'tecnica', 'Consiglia come coltivare meglio, tra campi, dati e sostenibilità.', [66, 56, 40, 66, 45, 66, 88]),
  r('pilota-droni', 'Pilota di droni per rilievi', 'tecnica', 'Rileva terreni, edifici e campi dall\'alto con droni e sensori.', [66, 30, 45, 72, 35, 70, 92], true),
  r('restauratore', 'Restauratore', 'tecnica', 'Riporta in vita opere e oggetti, con pazienza e tecnica.', [55, 25, 76, 66, 20, 90, 95], true),

  // ─── Ospitalità e turismo ─────────────────────────────────────
  r('chef', 'Chef', 'ospitalita', 'Inventa e prepara piatti, guidando il ritmo della cucina.', [30, 50, 86, 56, 72, 70, 95]),
  r('hotel-manager', 'Hotel manager', 'ospitalita', 'Fa sentire accolti gli ospiti e tiene in piedi l\'organizzazione di una struttura.', [45, 88, 35, 45, 72, 76, 60]),
  r('travel-designer', 'Travel designer', 'ospitalita', 'Crea viaggi ed esperienze su misura.', [45, 76, 76, 82, 45, 60, 45]),
  r('sommelier', 'Sommelier', 'ospitalita', 'Conosce, sceglie e racconta i vini, a tavola e in cantina.', [50, 80, 60, 82, 40, 56, 86], true),
  r('guida-naturalistica', 'Guida naturalistica', 'ospitalita', 'Accompagna gruppi nella natura raccontando ciò che vedono.', [35, 80, 50, 76, 60, 40, 95], true),

  // ─── Cultura e spettacolo ─────────────────────────────────────
  r('curatore-museale', 'Curatore museale', 'cultura', 'Sceglie opere e storie per mostre e collezioni.', [66, 56, 80, 90, 45, 66, 45], true),
  r('organizzatore-festival', 'Organizzatore di festival', 'cultura', 'Inventa e realizza festival e rassegne, dalla prima idea all\'ultimo ospite.', [40, 80, 80, 76, 82, 60, 66], true),
  r('producer-musicale', 'Producer musicale', 'cultura', 'Costruisce il suono di brani, podcast e video.', [55, 50, 90, 72, 45, 55, 76], true),
];
