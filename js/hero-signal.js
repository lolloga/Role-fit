// Hero "segnale": un nucleo centrale (l'utente) con nodi che rappresentano
// ruoli/aziende, che periodicamente si connettono al nucleo con un impulso
// rosa — la metafora letterale del matching di RoleFit, non un'animazione
// decorativa generica.
//
// I raggi dei nodi sono proporzionali allo spazio disponibile (non pixel
// fissi), così su schermi stretti (mobile) l'animazione resta sempre
// contenuta nei bordi invece di essere tagliata.
(function () {
  const canvas = document.getElementById('hero-signal');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, DPR, CX, CY, safeR;

  function resize() {
    const hero = canvas.parentElement;
    W = hero.clientWidth; H = hero.clientHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Su schermi stretti il testo occupa tutta la larghezza e sta in alto:
    // il nucleo scende sotto ai pulsanti invece di stare dietro al testo,
    // altrimenti resta illeggibile. Su desktop resta spostato a destra.
    const mobile = W < 700;
    CX = W * (mobile ? 0.5 : 0.76);
    CY = H * (mobile ? 0.8 : 0.42);

    // Raggio massimo che tiene ogni nodo dentro i bordi, margine di 20px,
    // tenendo conto che l'ellisse dei nodi è schiacciata verticalmente (×0.62).
    const marginX = Math.min(CX, W - CX);
    const marginY = Math.min(CY, H - CY) / 0.62;
    safeR = Math.max(60, Math.min(marginX, marginY) - 20);
  }
  window.addEventListener('resize', resize);
  resize();

  const NODE_COUNT = 13;
  const nodes = Array.from({ length: NODE_COUNT }, () => ({
    angle: Math.random() * Math.PI * 2,
    radiusFrac: 0.4 + Math.random() * 0.6,
    speed: (Math.random() * 0.4 + 0.15) * (Math.random() < 0.5 ? 1 : -1) * 0.15,
    r: Math.random() * 1.6 + 1.2,
    pulsePhase: Math.random() * Math.PI * 2,
    connectPhase: Math.random() * Math.PI * 2,
    connectSpeed: 0.006 + Math.random() * 0.006,
  }));

  let t = 0;
  function frame() {
    t += 1;
    ctx.clearRect(0, 0, W, H);

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
      const radius = n.radiusFrac * safeR;
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
      ctx.beginPath(); ctx.arc(x, y, n.r * nodePulse, 0, Math.PI * 2); ctx.fill();
    });

    if (!reduceMotion) requestAnimationFrame(frame);
  }
  frame();
})();
