/* =========================================================
   scenes.js — illustrative animated canvases
   - sky banner on the Overview page (follows simulated time)
   - street demo on the About page (shows motion dimming)
   ========================================================= */
(function () {
  const SC = window.SC;
  const S = SC.state;
  const Sc = (SC.scenes = { lightSky: false });

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function fit(cv) {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return null;
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr;
      cv.height = h * dpr;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  // seeded content
  let seed = 77;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stars = Array.from({ length: 90 }, () => ({ x: rnd(), y: rnd() * 0.75, r: 0.4 + rnd() * 1.1, p: rnd() * 6 }));
  const skyline = [];
  for (let x = 0; x < 1; ) {
    const w = 0.018 + rnd() * 0.04;
    const h = 0.18 + rnd() * 0.4;
    const wins = [];
    for (let k = 0; k < 14; k++) wins.push({ u: rnd(), v: rnd(), on: rnd() < 0.45 });
    skyline.push({ x, w, h, wins });
    x += w + 0.004;
  }
  const clouds = Array.from({ length: 6 }, () => ({ x: rnd(), y: 0.1 + rnd() * 0.35, s: 0.6 + rnd() * 0.8, v: 0.004 + rnd() * 0.006 }));

  const C = {
    nightTop: hex('#0b1530'), nightBot: hex('#22305a'),
    dayTop: hex('#4f9be6'), dayBot: hex('#cfe6fb'),
    warm: hex('#f4a36f'), grey: hex('#8b97a8'),
  };

  function lamp(ctx, x, groundY, poleH, level, night, size = 1) {
    const k = level / 100;
    const headX = x + 14 * size, headY = groundY - poleH;
    if (k > 0.01 && night > 0.05) {
      const a = k * night;
      const g = ctx.createLinearGradient(0, headY, 0, groundY);
      g.addColorStop(0, `rgba(255,211,107,${0.55 * a})`);
      g.addColorStop(1, 'rgba(255,211,107,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(headX - 4 * size, headY + 3 * size);
      ctx.lineTo(headX - (16 + 26 * k) * size, groundY);
      ctx.lineTo(headX + (16 + 26 * k) * size, groundY);
      ctx.lineTo(headX + 4 * size, headY + 3 * size);
      ctx.fill();
      const pg = ctx.createRadialGradient(headX, groundY, 0, headX, groundY, (22 + 30 * k) * size);
      pg.addColorStop(0, `rgba(255,211,107,${0.45 * a})`);
      pg.addColorStop(1, 'rgba(255,211,107,0)');
      ctx.fillStyle = pg;
      ctx.fillRect(headX - 60 * size, groundY - 10 * size, 120 * size, 20 * size);
      const hg = ctx.createRadialGradient(headX, headY + 2, 0, headX, headY + 2, 14 * size);
      hg.addColorStop(0, `rgba(255,236,180,${0.9 * a})`);
      hg.addColorStop(1, 'rgba(255,236,180,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(headX - 14 * size, headY - 12 * size, 28 * size, 28 * size);
    }
    ctx.strokeStyle = night > 0.5 ? '#4b5568' : '#7d889a';
    ctx.lineWidth = 2.2 * size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, headY + 4 * size);
    ctx.quadraticCurveTo(x, headY, x + 4 * size, headY);
    ctx.lineTo(headX + 4 * size, headY);
    ctx.stroke();
    ctx.fillStyle = k > 0.01 && night > 0.05 ? `rgb(255,${210 + 40 * k},${120 + 100 * k})` : '#9aa4b2';
    ctx.beginPath();
    ctx.ellipse(headX, headY + 1.5 * size, 6 * size, 2.2 * size, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function car(ctx, x, y, dir, night, size = 1, color = '#e9edf3') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir * size, size);
    if (night > 0.1) {
      const g = ctx.createLinearGradient(14, 0, 70, 0);
      g.addColorStop(0, `rgba(230,240,255,${0.5 * night})`);
      g.addColorStop(1, 'rgba(230,240,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(14, -6);
      ctx.lineTo(70, -14);
      ctx.lineTo(70, 4);
      ctx.lineTo(14, -2);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-16, -11, 32, 9, 3) : ctx.rect(-16, -11, 32, 9);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-8, -17, 16, 7, 3) : ctx.rect(-8, -17, 16, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(16,24,40,.45)';
    ctx.fillRect(-6, -15.5, 5, 4);
    ctx.fillRect(1, -15.5, 5, 4);
    ctx.fillStyle = '#1b2232';
    ctx.beginPath(); ctx.arc(-9, -2, 3.2, 0, Math.PI * 2); ctx.arc(9, -2, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = night > 0.2 ? '#ff5a5a' : '#c24141';
    ctx.fillRect(-16, -9, 2, 3);
    ctx.fillStyle = night > 0.2 ? '#fff5d6' : '#e6e1cf';
    ctx.fillRect(14, -9, 2, 3);
    ctx.restore();
  }

  // ---------- Sky banner ----------
  let carX = 0;
  const bannerLamps = [];
  Sc.sky = (cv, dt, now) => {
    const f = fit(cv);
    if (!f) return;
    const { ctx, w, h } = f;
    const hr = S.minute / 60;
    const s = Math.sin((Math.PI * (hr - 6)) / 12.5);
    const day = clamp((s + 0.05) / 0.35, 0, 1);
    const night = 1 - clamp((s + 0.12) / 0.32, 0, 1);
    const bad = S.weather !== 'clear' ? (S.weather === 'cloudy' ? 0.35 : 0.5) : 0;

    let top = mixc(C.nightTop, C.dayTop, day);
    let bot = mixc(C.nightBot, C.dayBot, day);
    bot = mixc(bot, C.warm, S.dusk * 0.75);
    top = mixc(top, C.grey, bad * day);
    bot = mixc(bot, C.grey, bad * day * 0.8);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgb(top));
    g.addColorStop(1, rgb(bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    Sc.lightSky = day > 0.55;

    // stars
    if (night > 0.05) {
      for (const st of stars) {
        const a = night * (0.4 + 0.6 * Math.abs(Math.sin(now * 1.2 + st.p))) * (1 - bad * 0.8);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.arc(st.x * w, st.y * h * 0.8, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // sun & moon on an arc
    const horizon = h * 0.78;
    const arc = (t) => ({ x: w * (0.06 + 0.88 * t), y: horizon - Math.sin(Math.PI * t) * h * 0.62 });
    const sunT = (hr - 6) / 12.5;
    if (sunT > -0.05 && sunT < 1.05) {
      const p = arc(clamp(sunT, 0, 1));
      const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 60);
      gl.addColorStop(0, `rgba(255,230,150,${0.55 * (1 - bad)})`);
      gl.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(p.x - 60, p.y - 60, 120, 120);
      ctx.fillStyle = S.dusk > 0.3 ? '#ffb36b' : '#ffd66b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    const moonT = (((hr - 18.5) % 24) + 24) % 24 / 11.5;
    if (moonT >= 0 && moonT <= 1) {
      const p = arc(moonT);
      const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 40);
      gl.addColorStop(0, `rgba(220,230,255,${0.35 * night})`);
      gl.addColorStop(1, 'rgba(220,230,255,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(p.x - 40, p.y - 40, 80, 80);
      ctx.fillStyle = `rgba(240,244,255,${0.3 + 0.7 * night})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgb(top);
      ctx.beginPath();
      ctx.arc(p.x + 5, p.y - 3, 9.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // clouds
    const cloudA = (0.25 + bad * 0.6) * (day * 0.8 + 0.2);
    for (const c of clouds) {
      if (S.speed > 0) c.x += c.v * dt * (1 + bad);
      if (c.x > 1.2) c.x = -0.2;
      const cx = c.x * w, cy = c.y * h, r = 26 * c.s;
      ctx.fillStyle = day > 0.4 ? `rgba(255,255,255,${cloudA})` : `rgba(160,175,200,${cloudA * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.6, r * 0.55, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - r * 0.6, cy - r * 0.3, r * 0.8, r * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + r * 0.5, cy - r * 0.35, r * 0.7, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // skyline
    const bcol = mixc(hex('#141d35'), hex('#a3b4c8'), day);
    for (const b of skyline) {
      const bx = b.x * w, bw = b.w * w, bh = b.h * h * 0.55;
      ctx.fillStyle = rgb(bcol);
      ctx.fillRect(bx, horizon - bh, bw, bh + 2);
      if (night > 0.1) {
        for (const wn of b.wins) {
          if (!wn.on) continue;
          ctx.fillStyle = `rgba(255,214,130,${0.85 * night})`;
          ctx.fillRect(bx + 2 + wn.u * (bw - 6), horizon - bh + 4 + wn.v * (bh - 10), 2, 2.5);
        }
      }
    }

    // street
    const roadY = h;
    ctx.fillStyle = rgb(mixc(hex('#1a2236'), hex('#8794a7'), day));
    ctx.fillRect(0, horizon, w, h - horizon);
    const spacing = 120;
    const count = Math.ceil(w / spacing) + 1;
    while (bannerLamps.length < count) bannerLamps.push({ level: 0 });
    if (S.speed > 0) carX += dt * (110 + 30 * Math.sin(now * 0.3));
    if (carX > w + 120) carX = -120;
    const avg = SC.lights.reduce((a, l) => a + l.level, 0) / SC.lights.length;
    for (let i = 0; i < count; i++) {
      const x = 40 + i * spacing;
      const lm = bannerLamps[i];
      const near = Math.abs(carX - (x + 14)) < 90;
      const target = S.darkness < 0.02 ? 0 : near ? 100 : Math.min(100, avg * 0.6 + 10);
      lm.level += (target - lm.level) * Math.min(1, dt * (target > lm.level ? 6 : 1.5));
      lamp(ctx, x, roadY, h - horizon + 26, lm.level, Math.max(night, S.darkness * 0.8), 0.9);
    }
    car(ctx, carX, roadY - 2, 1, night, 0.8, night > 0.5 ? '#cdd5e1' : '#3d6fb6');

    // soft scrim behind the headline for legibility
    const scrim = ctx.createLinearGradient(0, 0, w * 0.6, 0);
    scrim.addColorStop(0, rgb(top, day > 0.55 ? 0.55 : 0.7));
    scrim.addColorStop(1, rgb(top, 0));
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w * 0.6, h * 0.72);
  };

  // ---------- About demo street ----------
  const demo = { lamps: [0, 0, 0, 0], carX: -60, pedX: 1.1 };
  Sc.about = (cv, dt, now) => {
    const f = fit(cv);
    if (!f) return;
    const { ctx, w, h } = f;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0c1631');
    g.addColorStop(1, '#25335c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (const st of stars.slice(0, 50)) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(now + st.p))})`;
      ctx.beginPath();
      ctx.arc(st.x * w, st.y * h * 0.45, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    const horizon = h * 0.62;
    for (const b of skyline) {
      const bx = b.x * w, bw = b.w * w, bh = b.h * h * 0.4;
      ctx.fillStyle = '#121a30';
      ctx.fillRect(bx, horizon - bh, bw, bh + 1);
      for (const wn of b.wins) if (wn.on) { ctx.fillStyle = 'rgba(255,214,130,.7)'; ctx.fillRect(bx + 2 + wn.u * (bw - 6), horizon - bh + 4 + wn.v * (bh - 10), 2, 2.5); }
    }
    ctx.fillStyle = '#1b2336';
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.strokeStyle = 'rgba(233,237,243,.35)';
    ctx.setLineDash([16, 14]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.86);
    ctx.lineTo(w, h * 0.86);
    ctx.stroke();
    ctx.setLineDash([]);

    demo.carX += dt * w * 0.18;
    if (demo.carX > w + 80) demo.carX = -80;
    demo.pedX -= dt * 0.035;
    if (demo.pedX < -0.1) demo.pedX = 1.1;
    const ground = h * 0.8;
    const n = demo.lamps.length;
    ctx.font = '600 11px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const x = w * (0.1 + (i * 0.8) / (n - 1)) - 14;
      const near = Math.abs(demo.carX - (x + 14)) < w * 0.15 || Math.abs(demo.pedX * w - (x + 14)) < w * 0.07;
      const target = near ? 100 : 30;
      demo.lamps[i] += (target - demo.lamps[i]) * Math.min(1, dt * (target > demo.lamps[i] ? 6 : 1.4));
      lamp(ctx, x, ground, h * 0.5, demo.lamps[i], 1, Math.max(0.8, w / 520));
      const lv = Math.round(demo.lamps[i]);
      const lx = x + 14 * Math.max(0.8, w / 520), ly = ground - h * 0.5 - 16;
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(lx - 20, ly - 10, 40, 18, 9) : ctx.rect(lx - 20, ly - 10, 40, 18);
      ctx.fill();
      ctx.fillStyle = lv > 60 ? '#ffd36b' : '#cdd5e1';
      ctx.fillText(lv + '%', lx, ly + 3);
    }
    // pedestrian
    const px = demo.pedX * w, py = h * 0.78;
    ctx.strokeStyle = '#e4e7ec';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py - 22, 3.5, 0, Math.PI * 2);
    ctx.moveTo(px, py - 18);
    ctx.lineTo(px, py - 8);
    const sw = Math.sin(now * 8) * 4;
    ctx.moveTo(px, py - 8); ctx.lineTo(px - sw, py);
    ctx.moveTo(px, py - 8); ctx.lineTo(px + sw, py);
    ctx.moveTo(px, py - 15); ctx.lineTo(px + sw * 0.8, py - 10);
    ctx.stroke();
    car(ctx, demo.carX, h * 0.93, 1, 1, Math.max(1, w / 420), '#cdd5e1');
    ctx.textAlign = 'start';
  };
})();
