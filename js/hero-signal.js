// Hero "segnale": un nucleo centrale (l'utente) con nodi che rappresentano
// ruoli/aziende, che periodicamente si connettono al nucleo con un impulso
// rosa — la metafora letterale del matching di RoleFit, non un'animazione
// decorativa generica.
(function () {
  const canvas = document.getElementById('hero-signal');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Da mobile il grafico non deve più coprire l'intera hero (finiva dietro al
  // testo): questo slot vuoto, visibile solo sotto i 760px (vedi style.css),
  // riserva lo spazio esatto tra il titolo e la descrizione. Il canvas resta
  // un elemento unico: qui lo ridimensioniamo/riposizioniamo su quello slot
  // invece che sull'intera hero, senza toccare nulla del comportamento desktop.
  const mobileSlot = document.querySelector('.hero-signal-slot');
  let W, H, DPR, scale = 1;

  function resize() {
    const hero = canvas.parentElement;
    const isMobileLayout = mobileSlot && getComputedStyle(mobileSlot).display !== 'none';

    if (isMobileLayout) {
      const heroRect = hero.getBoundingClientRect();
      const slotRect = mobileSlot.getBoundingClientRect();
      W = slotRect.width; H = slotRect.height;
      canvas.style.top = (slotRect.top - heroRect.top) + 'px';
      canvas.style.left = (slotRect.left - heroRect.left) + 'px';
      // L'animazione è pensata per l'ampio spazio della hero desktop: in uno
      // slot piccolo scaliamo il raggio delle orbite, altrimenti i nodi
      // uscirebbero quasi subito dal riquadro.
      scale = Math.max(0.25, Math.min(1, H / 420));
    } else {
      W = hero.clientWidth; H = hero.clientHeight;
      canvas.style.top = '0px';
      canvas.style.left = '0px';
      scale = 1;
    }

    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const cx = () => W * 0.76, cy = () => H * 0.42;
  const NODE_COUNT = 13;
  const nodes = Array.from({ length: NODE_COUNT }, () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 90 + Math.random() * 150;
    return {
      angle, radius,
      speed: (Math.random() * 0.4 + 0.15) * (Math.random() < 0.5 ? 1 : -1) * 0.15,
      r: Math.random() * 1.6 + 1.2,
      pulsePhase: Math.random() * Math.PI * 2,
      connectPhase: Math.random() * Math.PI * 2,
      connectSpeed: 0.006 + Math.random() * 0.006,
    };
  });

  let t = 0;
  function frame() {
    t += 1;
    ctx.clearRect(0, 0, W, H);
    const CX = cx(), CY = cy();

    const corePulse = 1 + Math.sin(t * 0.03) * 0.08;
    const coreR = 7 * corePulse;
    const grad = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreR * 5);
    grad.addColorStop(0, 'rgba(93,202,165,0.55)');
    grad.addColorStop(1, 'rgba(93,202,165,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(CX, CY, coreR * 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5DCAA5';
    ctx.beginPath(); ctx.arc(CX, CY, coreR, 0, Math.PI * 2); ctx.fill();

    const ringPulse = (Math.sin(t * 0.02) + 1) / 2;
    ctx.strokeStyle = `rgba(255,100,150,${0.12 + ringPulse * 0.18})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(CX, CY, coreR * 2.6 + ringPulse * 6, 0, Math.PI * 2); ctx.stroke();

    nodes.forEach((n) => {
      n.angle += n.speed * 0.02;
      const radius = n.radius * scale;
      const x = CX + Math.cos(n.angle) * radius;
      const y = CY + Math.sin(n.angle) * radius * 0.62;

      const connectVal = (Math.sin(n.connectPhase + t * n.connectSpeed) + 1) / 2;
      if (connectVal > 0.68) {
        const lineAlpha = (connectVal - 0.68) / 0.32;
        ctx.strokeStyle = `rgba(255,100,150,${lineAlpha * 0.6})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(x, y); ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(93,202,165,0.09)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(x, y); ctx.stroke();
      }

      const nodePulse = 1 + Math.sin(t * 0.04 + n.pulsePhase) * 0.35;
      ctx.fillStyle = 'rgba(240,255,244,0.55)';
      ctx.beginPath(); ctx.arc(x, y, n.r * nodePulse * scale, 0, Math.PI * 2); ctx.fill();
    });

    if (!reduceMotion) requestAnimationFrame(frame);
  }
  frame();
})();
