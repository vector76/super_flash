// Sounds and animations. Sounds are synthesized with Web Audio, so there are
// no audio files to host.

const Effects = (() => {
  let ctx = null;
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Browsers only allow audio after a user gesture; call this from one.
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(ac, freq, start, dur, vol) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  function play(notes, step, dur, vol) {
    const ac = unlock();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    notes.forEach((f, i) => tone(ac, f, t + i * step, i === notes.length - 1 ? dur * 2 : dur, vol));
  }

  // C6 E6 G6: short and bright.
  const chime = () => play([1047, 1319, 1568], 0.07, 0.18, 0.12);
  // A single E6.
  const ding = () => play([1319], 0, 0.3, 0.1);
  // C5 E5 G5 C6 E6 G6 C7: rising fanfare.
  const fanfare = () => play([523, 659, 784, 1047, 1319, 1568, 2093], 0.09, 0.22, 0.1);

  const STAR_PATH = "M12 1.8l3.1 6.4 7 1-5.1 4.9 1.2 7L12 17.8l-6.2 3.3 1.2-7L1.9 9.2l7-1z";
  const starSvg = (fill, stroke) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="${fill}"
    stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" d="${STAR_PATH}"/></svg>`;

  // Gold: big pop with a spin. Silver: smaller, plain pop.
  const STARS = {
    gold: {
      svg: starSvg("#ffc81a", "#d99a00"),
      duration: 1000,
      frames: (dx, dy) => [
        { transform: "translate(-50%,-50%) scale(0) rotate(-40deg)", opacity: 0 },
        { transform: "translate(-50%,-50%) scale(1.3) rotate(12deg)", opacity: 1, offset: 0.2 },
        { transform: "translate(-50%,-50%) scale(1) rotate(0deg)", offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.25) rotate(200deg)`, opacity: 0.9 },
      ],
    },
    silver: {
      svg: starSvg("#e4e8ed", "#8a949f"),
      duration: 750,
      frames: (dx, dy) => [
        { transform: "translate(-50%,-50%) scale(0.4)", opacity: 0 },
        { transform: "translate(-50%,-50%) scale(0.8)", opacity: 1, offset: 0.25 },
        { transform: "translate(-50%,-50%) scale(0.8)", offset: 0.4 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.25)`, opacity: 0.9 },
      ],
    },
  };

  // Pops a star ("gold" or "silver") beside `from` (an element) and flies it into `to`.
  function star(kind, from, to, onLand) {
    if (reduceMotion() || !from || !to) { if (onLand) onLand(); return; }
    const spec = STARS[kind];
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const x0 = a.right + 34, y0 = a.top + a.height / 2;
    const dx = b.left + b.width / 2 - x0, dy = b.top + b.height / 2 - y0;
    const el = document.createElement("div");
    el.className = `flying-star ${kind}`;
    el.innerHTML = spec.svg;
    el.style.left = x0 + "px";
    el.style.top = y0 + "px";
    document.body.appendChild(el);
    const anim = el.animate(spec.frames(dx, dy), { duration: spec.duration, easing: "ease-in-out" });
    anim.onfinish = () => { el.remove(); if (onLand) onLand(); };
  }

  function confetti() {
    if (reduceMotion()) return;
    const canvas = document.createElement("canvas");
    canvas.className = "confetti";
    document.body.appendChild(canvas);
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);

    const colors = ["#ff6b6b", "#ffd43b", "#69db7c", "#4dabf7", "#b197fc", "#ff922b", "#f783ac"];
    const parts = Array.from({ length: 200 }, (_, i) => {
      const left = i % 2 === 0;
      return {
        x: left ? -10 : w + 10,
        y: h * (0.7 + Math.random() * 0.2),
        vx: (left ? 1 : -1) * (3 + Math.random() * 11),
        vy: -(9 + Math.random() * 13),
        size: 6 + Math.random() * 6,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.35,
        tilt: Math.random() * Math.PI * 2,
        color: colors[i % colors.length],
      };
    });

    const DURATION = 4000;
    const start = performance.now();
    function frame(now) {
      const t = now - start;
      g.clearRect(0, 0, w, h);
      g.globalAlpha = t > DURATION - 1000 ? Math.max(0, (DURATION - t) / 1000) : 1;
      for (const p of parts) {
        p.vy = Math.min(p.vy + 0.3, 5);
        p.vx *= 0.985;
        p.x += p.vx + Math.sin(p.tilt) * 0.6;
        p.y += p.vy;
        p.rot += p.vr;
        p.tilt += 0.08;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        g.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.tilt)) + 1);
        g.restore();
      }
      if (t < DURATION) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  return { unlock, chime, ding, fanfare, star, confetti };
})();
