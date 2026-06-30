// js/feedback.js — Sezione feedback RoleFit
// Caricato da report.js tramite `import './feedback.js'`.
// Si attiva quando report.js comunica che un report è mostrato, con l'evento
// 'rf-report-shown' (detail.reportId). Funziona sia dopo il test sia dallo
// storico (report.html?id=...).
// Inserisce un promemoria in cima a #report-content e il form in fondo.
// Salva su Supabase (tabella public.feedback), legato a quel report. Nessuna email.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Credenziali pubbliche per design (gia' presenti nel frontend)
const SUPABASE_URL = 'https://tywckwehbitvxjxhldiv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UDvK7F8-b_30X4QYyRsnEQ_3rmvPJrI';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DOMANDE = [
  { key: 'q1_rispecchio',     testo: 'Quanto ti rispecchi nel report generato?' },
  { key: 'q2_ruoli',          testo: 'Quanto ti rivedi nei ruoli a te assegnati?' },
  { key: 'q3_domande',        testo: 'Credi che le domande del test siano state utili a capire chi sei?' },
  { key: 'q4_coinvolgimento', testo: 'Quanto ti sei sentito coinvolto facendo il test?' },
  { key: 'q5_fiducia',        testo: 'Quanto il sito ti ha trasmesso fiducia e professionalità?' },
  { key: 'q6_consiglio',      testo: 'Quanto consiglieresti RoleFit ad un amico?' },
];

const risposte = {};
let mounted = false;

function injectStyles() {
  if (document.getElementById('rf-fb-style')) return;
  const s = document.createElement('style');
  s.id = 'rf-fb-style';
  s.textContent = `
    .rf-fb-promemoria{
      display:flex; align-items:center; gap:8px;
      font-size:.9rem; color:var(--text-secondary,#cbd5d0);
      border-left:3px solid var(--rose,#FF6496);
      background:rgba(255,100,150,.08);
      padding:10px 14px; margin:0 0 20px; border-radius:0 10px 10px 0; cursor:pointer;
      transition:background .2s;
    }
    .rf-fb-promemoria:hover{ background:rgba(255,100,150,.14); }
    .rf-fb-card{ margin-top:32px; }
    .rf-fb-card h3{ margin:0 0 4px; font-family:var(--font-display,inherit); font-size:1.3rem; color:var(--text-primary,#fff); }
    .rf-fb-sub{ margin:0 0 22px; font-size:.88rem; color:var(--text-muted,#9aa8a2); }
    .rf-fb-q{ margin:0 0 22px; }
    .rf-fb-q .rf-fb-label{ display:block; font-size:.95rem; margin-bottom:10px; color:var(--text-primary,#eef2f0); }
    .rf-fb-scale{ display:flex; flex-wrap:wrap; gap:6px; }
    .rf-fb-scale button{
      width:34px; height:34px; border-radius:9px; cursor:pointer;
      border:1px solid var(--card-border,rgba(255,255,255,.18));
      background:transparent; font-size:.9rem; color:var(--text-secondary,#cbd5d0);
      transition:all .12s;
    }
    .rf-fb-scale button:hover{ border-color:var(--emerald-light,#2dd4a7); }
    .rf-fb-scale button.sel{
      background:var(--emerald-light,#2dd4a7); border-color:var(--emerald-light,#2dd4a7);
      color:var(--night,#030F0A); font-weight:700;
    }
    .rf-fb-ends{ display:flex; justify-content:space-between; font-size:.72rem; color:var(--text-muted,#9aa8a2); margin-top:6px; }
    .rf-fb-suggest{
      border:2px solid var(--rose,#FF6496); border-radius:14px;
      padding:14px; background:rgba(255,100,150,.05); margin-top:6px;
    }
    .rf-fb-suggest label{ display:block; font-size:.95rem; margin-bottom:8px; color:var(--text-primary,#eef2f0); }
    .rf-fb-suggest textarea{
      width:100%; min-height:84px; box-sizing:border-box; resize:vertical; font:inherit;
      border:1px solid var(--card-border,rgba(255,255,255,.18)); border-radius:10px;
      padding:10px; background:rgba(255,255,255,.04); color:var(--text-primary,#fff);
    }
    .rf-fb-suggest .rf-fb-opt{ font-size:.72rem; color:var(--text-muted,#9aa8a2); margin-top:6px; }
    .rf-fb-send{
      margin-top:22px; width:100%; padding:13px; border:none; border-radius:12px;
      background:var(--rose,#FF6496); color:#fff; font-size:1rem; font-weight:600; cursor:pointer;
      transition:filter .15s;
    }
    .rf-fb-send:hover{ filter:brightness(.95); }
    .rf-fb-send:disabled{ opacity:.6; cursor:default; }
    .rf-fb-msg{ margin-top:14px; font-size:.88rem; text-align:center; min-height:1.2em; color:var(--text-secondary,#cbd5d0); }
    .rf-fb-msg.err{ color:var(--rose,#FF6496); }
    .rf-fb-grazie{ margin-top:32px; text-align:center; padding:32px 24px;
      border:1px solid rgba(29,158,117,.4); border-radius:18px; background:rgba(29,158,117,.08); }
    .rf-fb-grazie h3{ margin:0 0 6px; font-family:var(--font-display,inherit); color:var(--emerald-light,#2dd4a7); }
    .rf-fb-grazie p{ margin:0; color:var(--text-secondary,#cbd5d0); font-size:.92rem; }
  `;
  document.head.appendChild(s);
}

function renderPromemoria(host) {
  const div = document.createElement('div');
  div.className = 'rf-fb-promemoria';
  div.textContent = 'Il tuo feedback ci aiuta a migliorare RoleFit — lo trovi in fondo alla pagina ↓';
  div.addEventListener('click', () => {
    document.getElementById('rf-feedback-form')?.scrollIntoView({ behavior: 'smooth' });
  });
  host.insertBefore(div, host.firstChild); // in alto, sopra i risultati
}

function renderGrazie(host) {
  const g = document.createElement('div');
  g.className = 'rf-fb-grazie';
  g.id = 'rf-feedback-form';
  g.innerHTML = `<h3>Grazie!</h3><p>Hai già lasciato un feedback per questo report. Lo apprezziamo molto.</p>`;
  host.appendChild(g);
}

function renderForm(host, reportId, userId) {
  const righe = DOMANDE.map(d => `
    <div class="rf-fb-q" data-key="${d.key}">
      <span class="rf-fb-label">${d.testo}</span>
      <div class="rf-fb-scale">
        ${Array.from({ length: 10 }, (_, i) => `<button type="button" data-val="${i + 1}">${i + 1}</button>`).join('')}
      </div>
      <div class="rf-fb-ends"><span>Per niente</span><span>Moltissimo</span></div>
    </div>
  `).join('');

  const card = document.createElement('div');
  card.className = 'card rf-fb-card';
  card.id = 'rf-feedback-form';
  card.innerHTML = `
    <h3>Lasciaci un feedback</h3>
    <p class="rf-fb-sub">Sei domande veloci (da 1 a 10) per aiutarci a migliorare.</p>
    ${righe}
    <div class="rf-fb-suggest">
      <label>Se hai suggerimenti, scrivili qui sotto</label>
      <textarea id="rf-fb-text" placeholder="Scrivi a parole tue cosa miglioreresti, cosa ti è piaciuto…"></textarea>
      <div class="rf-fb-opt">Campo facoltativo</div>
    </div>
    <button type="button" class="rf-fb-send" id="rf-fb-send">Invia feedback</button>
    <div class="rf-fb-msg" id="rf-fb-msg"></div>
  `;
  host.appendChild(card);

  card.querySelectorAll('.rf-fb-q').forEach(q => {
    const key = q.dataset.key;
    q.querySelectorAll('.rf-fb-scale button').forEach(b => {
      b.addEventListener('click', () => {
        risposte[key] = parseInt(b.dataset.val, 10);
        q.querySelectorAll('.rf-fb-scale button').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
      });
    });
  });

  const msg = card.querySelector('#rf-fb-msg');
  const btn = card.querySelector('#rf-fb-send');

  btn.addEventListener('click', async () => {
    msg.className = 'rf-fb-msg';
    const mancanti = DOMANDE.filter(d => !risposte[d.key]);
    if (mancanti.length) {
      msg.classList.add('err');
      msg.textContent = 'Rispondi a tutte le domande prima di inviare.';
      return;
    }
    btn.disabled = true;
    msg.textContent = 'Invio in corso…';

    const testo = card.querySelector('#rf-fb-text').value.trim();
    const riga = { user_id: userId, report_id: reportId, suggerimenti: testo || null, ...risposte };

    const { error } = await sb.from('feedback').insert(riga);
    if (error) {
      if (error.code === '23505') { card.replaceWith(grazieEl()); return; } // già inviato
      btn.disabled = false;
      msg.classList.add('err');
      msg.textContent = 'Qualcosa è andato storto, riprova tra poco.';
      console.error('Feedback insert error:', error);
      return;
    }
    card.replaceWith(grazieEl());
  });
}

function grazieEl() {
  const g = document.createElement('div');
  g.className = 'rf-fb-grazie';
  g.id = 'rf-feedback-form';
  g.innerHTML = `<h3>Grazie!</h3><p>Il tuo feedback è stato registrato. Ci aiuta tantissimo.</p>`;
  return g;
}

async function mount(reportId) {
  if (mounted) return;
  const host = document.getElementById('report-content');
  if (!host || !reportId) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) return;

  mounted = true;
  injectStyles();
  renderPromemoria(host);

  // già inviato per questo report?
  const { data: esistenti } = await sb
    .from('feedback').select('id').eq('report_id', reportId).limit(1);

  if (esistenti && esistenti.length) {
    renderGrazie(host);
  } else {
    renderForm(host, reportId, session.user.id);
  }
}

window.addEventListener('rf-report-shown', (e) => {
  const id = e?.detail?.reportId;
  if (id) mount(id);
});
