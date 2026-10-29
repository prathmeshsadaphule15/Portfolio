/* =========================================================
   map.js — animated city map (Canvas 2D)
   Draws in logical city units (SC.W x SC.H), with zoom and pan.
   ========================================================= */
(function () {
  const SC = window.SC;
  const S = SC.state;
  const M = (SC.map = {
    selected: null,
    hover: null,
    layers: { traffic: true, network: true, sensors: false, labels: true },
  });

  let canvas, ctx, wrap, tip;
  let dpr = 1, scale = 1, base = 1, ox = 0, oy = 0, cw = 0, ch = 0;
  let staticLayer, windowLayer, glowSprite, coneSprite, dirty = true;
  const view = { z: 1, px: 0, py: 0 };
  const buildings = [];
  const trees = [];
  const rain = [];
  const clouds = [];
  const packets = [];
  const acks = [];
  const GW = { x: 620, y: 260 }; // control centre / gateway junction

  // deterministic random so the city looks the same every load
  let seed = 20240334;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rr = (a, b) => a + rnd() * (b - a);

  const PALETTE = {
    downtown: ['#d6deea', '#cdd7e5', '#dfe6ef', '#c7d2e2'],
    residential: ['#eddccf', '#e6d2c2', '#f1e3d7', '#e3cbb9'],
    industrial: ['#dcdcd5', '#d2d3cb', '#e3e3dd'],
    market: ['#f0dae2', '#e9cdd8', '#f4e2e8', '#e4c3d0'],
  };

  // ---------- City generation ----------
  function genCity() {
    SC.blocks.forEach((b) => {
      if (b.zone === 'park') {
        for (let i = 0; i < 80; i++) {
          const x = rr(b.x + 8, b.x + b.w - 8), y = rr(b.y + 8, b.y + b.h - 8);
          const pond = ((x - (b.x + b.w * 0.62)) / 60) ** 2 + ((y - (b.y + b.h * 0.55)) / 40) ** 2 < 1.3;
          const path = Math.abs(y - (b.y + b.h * 0.3 + Math.sin((x - b.x) / 40) * 14)) < 9;
          if (!pond && !path) trees.push({ x, y, r: rr(5, 10), c: rnd() < 0.5 ? '#7fc493' : '#69b47f' });
        }
        return;
      }
      const style = {
        downtown: { min: 34, max: 70, gap: 8, tall: 1 },
        residential: { min: 20, max: 34, gap: 7, tall: 0.35 },
        industrial: { min: 60, max: 110, gap: 12, tall: 0.5 },
        market: { min: 26, max: 46, gap: 7, tall: 0.55 },
      }[b.zone];
      const colors = PALETTE[b.zone];
      let y = b.y + 6;
      while (y < b.y + b.h - style.min * 0.6) {
        const rowH = Math.min(rr(style.min, style.max), b.y + b.h - 6 - y);
        let x = b.x + 6;
        while (x < b.x + b.w - style.min * 0.6) {
          const w = Math.min(rr(style.min, style.max), b.x + b.w - 6 - x);
          if (w > 12 && rowH > 12 && rnd() > 0.06) {
            const bd = { x, y, w, h: rowH, color: colors[Math.floor(rnd() * colors.length)], tall: style.tall * rr(0.6, 1.4), zone: b.zone, wins: [] };
            const step = b.zone === 'industrial' ? 14 : 8;
            for (let wy = y + 5; wy < y + rowH - 5; wy += step)
              for (let wx = x + 5; wx < x + w - 5; wx += step)
                if (rnd() < (b.zone === 'industrial' ? 0.15 : 0.4)) bd.wins.push({ x: wx, y: wy, c: rnd() < 0.8 ? '#ffd98a' : '#cfe6ff' });
            buildings.push(bd);
          }
          x += w + style.gap;
        }
        y += rowH + style.gap;
      }
    });
    for (let i = 0; i < 240; i++) rain.push({ x: rnd() * SC.W, y: rnd() * SC.H, s: rr(500, 800), l: rr(8, 16) });
    for (let i = 0; i < 8; i++) clouds.push({ x: rnd() * SC.W, y: rnd() * SC.H, r: rr(150, 260), v: rr(10, 22) });
  }

  function makeSprites() {
    glowSprite = document.createElement('canvas');
    glowSprite.width = glowSprite.height = 128;
    let g = glowSprite.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,236,180,0.95)');
    grad.addColorStop(0.18, 'rgba(255,214,130,0.55)');
    grad.addColorStop(0.5, 'rgba(255,190,90,0.16)');
    grad.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);

    // headlight beam: a soft cone pointing right
    coneSprite = document.createElement('canvas');
    coneSprite.width = 80;
    coneSprite.height = 48;
    g = coneSprite.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 80, 0);
    lg.addColorStop(0, 'rgba(230,240,255,0.75)');
    lg.addColorStop(1, 'rgba(230,240,255,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(0, 20);
    g.lineTo(80, 0);
    g.lineTo(80, 48);
    g.lineTo(0, 28);
    g.closePath();
    g.fill();
  }

  // ---------- Static layer (ground, roads, buildings) ----------
  function renderStatic() {
    dirty = false;
    staticLayer = staticLayer || document.createElement('canvas');
    staticLayer.width = cw * dpr;
    staticLayer.height = ch * dpr;
    const g = staticLayer.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#e6eaef';
    g.fillRect(0, 0, staticLayer.width, staticLayer.height);
    g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

    g.fillStyle = '#e9edf1';
    g.fillRect(-40, -40, SC.W + 80, SC.H + 80);

    SC.blocks.forEach((b) => {
      const z = SC.zoneById(b.zone);
      g.fillStyle = b.zone === 'park' ? '#cfe8d4' : '#f2f4f6';
      roundRect(g, b.x - 4, b.y - 4, b.w + 8, b.h + 8, 6);
      g.fill();
      if (b.zone !== 'park') {
        g.fillStyle = hexA(z.color, 0.07);
        g.fill();
      }
      if (b.zone === 'park') {
        g.strokeStyle = '#e3d9c4';
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        for (let x = b.x; x <= b.x + b.w; x += 6) {
          const y = b.y + b.h * 0.3 + Math.sin((x - b.x) / 40) * 14;
          x === b.x ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
        g.fillStyle = '#a7d3f2';
        g.beginPath();
        g.ellipse(b.x + b.w * 0.62, b.y + b.h * 0.55, 54, 33, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#86bfe6';
        g.lineWidth = 1.5;
        g.stroke();
      }
    });

    // roads: grey casing, white surface (map style)
    const L = SC.ROADS_V[0], R = SC.ROADS_V[SC.ROADS_V.length - 1];
    const T = SC.ROADS_H[0], B = SC.ROADS_H[SC.ROADS_H.length - 1];
    const rw = SC.ROAD_W;
    g.fillStyle = '#d3d9e1';
    SC.ROADS_H.forEach((y) => g.fillRect(L - rw - 2, y - rw / 2 - 2, R - L + rw * 2 + 4, rw + 4));
    SC.ROADS_V.forEach((x) => g.fillRect(x - rw / 2 - 2, T - rw - 2, rw + 4, B - T + rw * 2 + 4));
    g.fillStyle = '#ffffff';
    SC.ROADS_H.forEach((y) => g.fillRect(L - rw, y - rw / 2, R - L + rw * 2, rw));
    SC.ROADS_V.forEach((x) => g.fillRect(x - rw / 2, T - rw, rw, B - T + rw * 2));

    g.strokeStyle = '#d6dbe2';
    g.lineWidth = 1.2;
    g.setLineDash([8, 9]);
    SC.ROADS_H.forEach((y) => { g.beginPath(); g.moveTo(L - rw, y); g.lineTo(R + rw, y); g.stroke(); });
    SC.ROADS_V.forEach((x) => { g.beginPath(); g.moveTo(x, T - rw); g.lineTo(x, B + rw); g.stroke(); });
    g.setLineDash([]);

    SC.ROADS_V.forEach((x) => SC.ROADS_H.forEach((y) => {
      g.fillStyle = '#ffffff';
      g.fillRect(x - rw / 2, y - rw / 2, rw, rw);
      g.fillStyle = '#d6dbe2';
      for (let k = -rw / 2 + 3; k < rw / 2 - 2; k += 5) {
        g.fillRect(x + k, y - rw / 2 - 7, 2.5, 6);
        g.fillRect(x + k, y + rw / 2 + 1, 2.5, 6);
        g.fillRect(x - rw / 2 - 7, y + k, 6, 2.5);
        g.fillRect(x + rw / 2 + 1, y + k, 6, 2.5);
      }
    }));

    // depot
    const d = SC.DEPOT;
    g.fillStyle = '#fff5dc';
    roundRect(g, d.x - 52, d.y + 18, 44, 26, 4);
    g.fill();
    g.strokeStyle = '#eab308';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#93590a';
    g.font = '600 9px Inter, Segoe UI, sans-serif';
    g.fillText('DEPOT', d.x - 46, d.y + 34);

    buildings.forEach((bd) => {
      const sh = 2 + bd.tall * 5;
      g.fillStyle = 'rgba(16,24,40,.10)';
      g.fillRect(bd.x + sh, bd.y + sh, bd.w, bd.h);
      g.fillStyle = bd.color;
      g.fillRect(bd.x, bd.y, bd.w, bd.h);
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.fillRect(bd.x, bd.y, bd.w, 2);
      g.strokeStyle = 'rgba(16,24,40,.12)';
      g.lineWidth = 1;
      g.strokeRect(bd.x + 0.5, bd.y + 0.5, bd.w - 1, bd.h - 1);
      if (bd.zone === 'industrial') {
        g.fillStyle = 'rgba(16,24,40,.05)';
        for (let k = bd.x + 6; k < bd.x + bd.w - 4; k += 10) g.fillRect(k, bd.y + 4, 4, bd.h - 8);
      }
    });

    trees.forEach((t) => {
      g.fillStyle = 'rgba(16,24,40,.10)';
      g.beginPath(); g.arc(t.x + 2.5, t.y + 2.5, t.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = t.c;
      g.beginPath(); g.arc(t.x, t.y, t.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.22)';
      g.beginPath(); g.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2); g.fill();
    });

    // control centre building marker
    g.fillStyle = '#1f5fbf';
    roundRect(g, GW.x + 22, GW.y + 22, 30, 22, 4);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '700 8px Inter, Segoe UI, sans-serif';
    g.fillText('CTRL', GW.x + 26, GW.y + 36);

    windowLayer = windowLayer || document.createElement('canvas');
    windowLayer.width = cw * dpr;
    windowLayer.height = ch * dpr;
    const wg = windowLayer.getContext('2d');
    wg.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    buildings.forEach((bd) => bd.wins.forEach((w) => {
      wg.fillStyle = w.c;
      wg.fillRect(w.x, w.y, 2.6, 2.6);
    }));
  }

  // ---------- Helpers ----------
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  M.hexA = hexA;
  function mix(a, b, k) {
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
  }

  // ---------- View (zoom / pan) ----------
  function applyView() {
    scale = base * view.z;
    const mw = SC.W * scale, mh = SC.H * scale;
    const maxX = Math.max(0, (mw - cw) / 2), maxY = Math.max(0, (mh - ch) / 2);
    view.px = Math.max(-maxX, Math.min(maxX, view.px));
    view.py = Math.max(-maxY, Math.min(maxY, view.py));
    ox = (cw - mw) / 2 + view.px;
    oy = (ch - mh) / 2 + view.py;
    dirty = true;
  }
  function zoomAt(z, mx, my) {
    z = Math.max(1, Math.min(3.5, z));
    const wx = (mx - ox) / scale, wy = (my - oy) / scale;
    view.z = z;
    const ns = base * z;
    view.px = mx - wx * ns - (cw - SC.W * ns) / 2;
    view.py = my - wy * ns - (ch - SC.H * ns) / 2;
    applyView();
  }
  M.zoom = (f) => zoomAt(view.z * f, cw / 2, ch / 2);
  M.resetView = () => { view.z = 1; view.px = 0; view.py = 0; applyView(); };
  M.focus = (l) => {
    if (view.z < 1.8) view.z = 1.8;
    const ns = base * view.z;
    view.px = cw / 2 - l.x * ns - (cw - SC.W * ns) / 2;
    view.py = ch / 2 - l.y * ns - (ch - SC.H * ns) / 2;
    applyView();
  };

  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = r.width;
    ch = r.height;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    base = Math.min(cw / SC.W, ch / SC.H);
    applyView();
  }

  // ---------- Network packets ----------
  function routeFromGW(l) {
    if (l.axis === 'h') return [{ x: GW.x, y: GW.y }, { x: GW.x, y: l.road }, { x: l.x, y: l.road }, { x: l.x, y: l.y }];
    return [{ x: GW.x, y: GW.y }, { x: l.road, y: GW.y }, { x: l.road, y: l.y }, { x: l.x, y: l.y }];
  }
  function sendPacket(l, up) {
    let path = routeFromGW(l);
    if (up) path = path.slice().reverse();
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    packets.push({ path, len, s: 0, light: l, up, color: up ? '#f04438' : '#2a9df4' });
  }
  function pointAt(p, s) {
    s = Math.max(0, Math.min(p.len, s));
    for (let i = 1; i < p.path.length; i++) {
      const a = p.path[i - 1], b = p.path[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (s <= d) return { x: a.x + ((b.x - a.x) * s) / (d || 1), y: a.y + ((b.y - a.y) * s) / (d || 1) };
      s -= d;
    }
    return p.path[p.path.length - 1];
  }
  let packetClock = 0;
  function updatePackets(dt, now) {
    if (S.speed > 0 && M.layers.network) {
      packetClock += dt;
      while (packetClock > 0.22) {
        packetClock -= 0.22;
        const ok = SC.lights.filter((l) => l.status === 'ok');
        if (ok.length) sendPacket(ok[Math.floor(Math.random() * ok.length)], false);
      }
    }
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      if (S.speed > 0) p.s += 430 * dt;
      if (p.s >= p.len) {
        if (!p.up) acks.push({ x: p.light.x, y: p.light.y, t: now });
        packets.splice(i, 1);
      }
    }
    while (acks.length && now - acks[0].t > 0.6) acks.shift();
  }
  SC.on('fault', (a) => sendPacket(SC.lights.find((l) => l.id === a.lightId), true));

  // ---------- Per-frame drawing ----------
  M.draw = (now, dt) => {
    if (!canvas || !canvas.offsetParent) return;
    if (!cw || !ch) { resize(); if (!cw || !ch) return; }
    if (dirty) renderStatic();
    updatePackets(dt, now);

    const night = S.night;
    const wdim = SC.WEATHER[S.weather].dim;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(staticLayer, 0, 0);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

    // cloud shadows drift across the city by day
    if ((S.weather === 'cloudy' || S.weather === 'rain') && night < 0.9) {
      for (const c of clouds) {
        if (S.speed > 0) { c.x += c.v * dt; if (c.x - c.r > SC.W) c.x = -c.r; }
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
        g.addColorStop(0, `rgba(30,40,60,${0.13 * (1 - night)})`);
        g.addColorStop(1, 'rgba(30,40,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (S.dusk > 0) {
      ctx.fillStyle = `rgba(255,130,70,${0.14 * S.dusk})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const dark = Math.min(0.86, 0.84 * night + wdim * (1 - night * 0.5));
    ctx.fillStyle = `rgba(8,13,28,${dark})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (night > 0.05) {
      ctx.globalAlpha = night * 0.85;
      ctx.drawImage(windowLayer, 0, 0);
      ctx.globalAlpha = 1;
    }

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

    // additive light: street lights + headlights
    ctx.globalCompositeOperation = 'lighter';
    const glowBoost = 0.35 + 0.65 * Math.max(night, S.darkness);
    for (const l of SC.lights) {
      if (l.level < 0.5) continue;
      const k = l.level / 100;
      const r = 14 + 56 * k;
      ctx.globalAlpha = Math.min(1, Math.pow(k, 1.35) * glowBoost * 0.95 * (0.3 + 0.7 * Math.max(night, 0.15)));
      ctx.drawImage(glowSprite, l.x - r, l.y - r, r * 2, r * 2);
    }
    if (M.layers.traffic && night > 0.1) {
      for (const v of S.vehicles) {
        if (v.type === 'ped') continue;
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(v.dir);
        ctx.globalAlpha = 0.6 * night * v.fade;
        ctx.drawImage(coneSprite, v.type === 'bus' ? 9 : 5, -12, 40, 24);
        if (v.stopped) {
          ctx.globalAlpha = 0.9 * night * v.fade;
          ctx.fillStyle = 'rgba(255,60,60,.7)';
          ctx.beginPath();
          ctx.arc(-(v.type === 'bus' ? 10 : 6), 0, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // traffic signals
    for (let i = 0; i < SC.ROADS_V.length; i++) {
      for (let j = 0; j < SC.ROADS_H.length; j++) {
        const x = SC.ROADS_V[i], y = SC.ROADS_H[j];
        const g = SC.signalGreen(i, j, now);
        const GREEN = '#12b76a', RED = '#f04438';
        const hc = g === 'h' ? GREEN : RED, vc = g === 'v' ? GREEN : RED;
        ctx.fillStyle = hc;
        ctx.beginPath(); ctx.arc(x - 16, y - 16, 2.2, 0, Math.PI * 2); ctx.arc(x + 16, y + 16, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = vc;
        ctx.beginPath(); ctx.arc(x + 16, y - 16, 2.2, 0, Math.PI * 2); ctx.arc(x - 16, y + 16, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // sensor ranges
    if (M.layers.sensors) {
      for (const l of SC.lights) {
        const active = l.motion > now && l.status === 'ok';
        ctx.beginPath();
        ctx.arc(l.x, l.y, 65, 0, Math.PI * 2);
        ctx.fillStyle = active ? 'rgba(42,120,214,.14)' : 'rgba(42,120,214,.03)';
        ctx.fill();
        ctx.strokeStyle = active ? 'rgba(42,120,214,.6)' : 'rgba(42,120,214,.16)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // traffic
    if (M.layers.traffic) {
      for (const v of S.vehicles) {
        ctx.globalAlpha = v.fade;
        if (v.type === 'ped') {
          ctx.fillStyle = night > 0.5 ? '#e4e7ec' : '#475467';
          ctx.beginPath();
          ctx.arc(v.x, v.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const len = v.type === 'bus' ? 20 : 12, wid = v.type === 'bus' ? 7.5 : 6.5;
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(v.dir);
        ctx.fillStyle = 'rgba(16,24,40,.22)';
        ctx.fillRect(-len / 2 + 1.2, -wid / 2 + 1.2, len, wid);
        ctx.fillStyle = v.color;
        roundRect(ctx, -len / 2, -wid / 2, len, wid, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.fillRect(len / 2 - 5, -wid / 2 + 1, 2.5, wid - 2);
        ctx.fillStyle = v.stopped ? '#ff3b30' : night > 0.2 ? '#ff6b6b' : 'rgba(200,40,40,.6)';
        ctx.fillRect(-len / 2, -wid / 2 + 0.5, 1.4, 1.8);
        ctx.fillRect(-len / 2, wid / 2 - 2.3, 1.4, 1.8);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // network packets + gateway pulse
    if (M.layers.network) {
      const pulse = (now % 2) / 2;
      ctx.strokeStyle = `rgba(42,157,244,${0.6 * (1 - pulse)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(GW.x, GW.y, 8 + pulse * 40, 0, Math.PI * 2);
      ctx.stroke();
      for (const p of packets) {
        for (let k = 4; k >= 0; k--) {
          const pt = pointAt(p, p.s - k * 5);
          ctx.globalAlpha = (1 - k / 5) * 0.9;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, k ? 1.6 : 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      for (const a of acks) {
        const q = (now - a.t) / 0.6;
        ctx.strokeStyle = `rgba(42,157,244,${0.8 * (1 - q)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 4 + q * 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // maintenance vans
    for (const c of S.crews) {
      if (c.state === 'idle') continue;
      if (c.state === 'enroute' && c.light) {
        ctx.setLineDash([4, 5]);
        ctx.lineDashOffset = -now * 30;
        ctx.strokeStyle = 'rgba(234,170,8,.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        for (let k = c.seg + 1; k < c.path.length; k++) ctx.lineTo(c.path[k].x, c.path[k].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.state === 'repairing' ? 0 : c.dir || 0);
      ctx.fillStyle = 'rgba(16,24,40,.25)';
      ctx.fillRect(-8, -4, 18, 10);
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -9, -5, 18, 10, 2);
      ctx.fill();
      ctx.strokeStyle = '#98a2b3';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.fillStyle = '#f79009';
      ctx.fillRect(-9, -1, 18, 2);
      ctx.restore();
      const blink = (Math.sin(now * 12) + 1) / 2;
      ctx.globalAlpha = 0.35 + 0.65 * blink;
      ctx.fillStyle = 'rgba(250,178,25,.85)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3 + blink * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // light heads
    for (const l of SC.lights) {
      if (l.status === 'fault') {
        const p = (now * 1.3 + l.x * 0.01) % 1;
        ctx.strokeStyle = `rgba(240,68,56,${1 - p})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(l.x, l.y, 5 + p * 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = Math.sin(now * 10) > 0 ? '#f04438' : '#912018';
        ctx.beginPath();
        ctx.arc(l.x, l.y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (l.status === 'maint') {
        ctx.fillStyle = '#fab219';
        ctx.beginPath();
        ctx.arc(l.x, l.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f79009';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(l.x, l.y, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * l.repair);
        ctx.stroke();
        continue;
      }
      const k = l.level / 100;
      ctx.fillStyle = k < 0.01 ? (night > 0.5 ? '#475467' : '#98a2b3') : mix([184, 145, 61], [255, 246, 214], k);
      ctx.beginPath();
      ctx.arc(l.x, l.y, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = k < 0.01 && night < 0.5 ? '#ffffff' : 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // hover + selection
    const ring = night > 0.45 ? '#ffffff' : '#1f5fbf';
    if (M.hover && M.hover !== M.selected) {
      ctx.strokeStyle = ring;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(M.hover.x, M.hover.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (M.selected) {
      const l = M.selected;
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(now * 1.5);
      ctx.strokeStyle = ring;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
      const p = (now * 0.8) % 1;
      ctx.strokeStyle = night > 0.45 ? `rgba(255,255,255,${0.6 * (1 - p)})` : `rgba(31,95,191,${0.6 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 13 + p * 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // weather overlays
    if (S.weather === 'rain') {
      ctx.strokeStyle = night > 0.5 ? 'rgba(190,215,255,.5)' : 'rgba(70,100,140,.35)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (const d of rain) {
        if (S.speed > 0) {
          d.y += d.s * dt;
          d.x -= d.s * 0.15 * dt;
          if (d.y > SC.H) { d.y = -20; d.x = Math.random() * (SC.W + 100); }
        }
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.l * 0.15, d.y + d.l);
      }
      ctx.stroke();
    } else if (S.weather === 'fog') {
      for (const f of clouds) {
        if (S.speed > 0) { f.x += f.v * dt; if (f.x - f.r > SC.W) f.x = -f.r; }
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, night > 0.5 ? 'rgba(180,190,205,.24)' : 'rgba(240,242,245,.55)');
        g.addColorStop(1, 'rgba(240,242,245,0)');
        ctx.fillStyle = g;
        ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
      }
    }

    // zone labels (constant on-screen size)
    if (M.layers.labels) {
      const fs = 12 / scale;
      ctx.font = `600 ${fs}px Inter, Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      LABELS.forEach((lb) => {
        const z = SC.zoneById(lb.zone);
        const w = ctx.measureText(z.name).width + 26 / scale;
        const h = 22 / scale;
        ctx.fillStyle = 'rgba(16,24,40,.12)';
        roundRect(ctx, lb.x - w / 2, lb.y - h / 2 + 1 / scale, w, h, h / 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, lb.x - w / 2, lb.y - h / 2, w, h, h / 2);
        ctx.fill();
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(lb.x - w / 2 + 11 / scale, lb.y, 3.5 / scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#101828';
        ctx.fillText(z.name, lb.x + 6 / scale, lb.y + 0.5 / scale);
      });
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    if (S.emergency) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const a = 0.16 + 0.1 * Math.sin(now * 6);
      const W = canvas.width, H = canvas.height;
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(208,59,59,0)');
      g.addColorStop(1, `rgba(208,59,59,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    updateTip();
  };

  const LABELS = [
    { zone: 'downtown', x: 480, y: 360 },
    { zone: 'residential', x: 200, y: 360 },
    { zone: 'industrial', x: 1020, y: 160 },
    { zone: 'park', x: 760, y: 515 },
    { zone: 'market', x: 1020, y: 580 },
  ];

  // ---------- Interaction ----------
  let mouse = null, drag = null;
  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }
  function pick(p) {
    const x = (p.px - ox) / scale, y = (p.py - oy) / scale;
    let best = null, bd = 12 / scale + 4;
    for (const l of SC.lights) {
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }
  function updateTip() {
    if (!mouse || !M.hover || drag) { tip.classList.remove('show'); return; }
    const l = M.hover;
    const st = { ok: 'Operational', fault: 'Fault', maint: 'Under repair' }[l.status];
    tip.innerHTML = `<b>${l.id} · ${SC.zoneById(l.zone).name}</b>${st} · ${Math.round(l.level)}% · ${SC.lightPower(l).toFixed(0)} W`;
    tip.style.left = Math.min(mouse.px + 14, cw - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.max(8, mouse.py - tip.offsetHeight - 10) + 'px';
    tip.classList.add('show');
  }

  M.select = (l) => {
    M.selected = l;
    SC.emit('select', l);
  };

  M.init = (cv) => {
    canvas = cv;
    ctx = cv.getContext('2d');
    wrap = cv.parentElement;
    tip = document.getElementById('mapTip');
    makeSprites();
    genCity();
    resize();
    new ResizeObserver(resize).observe(wrap);

    cv.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, px: view.px, py: view.py, moved: false };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      mouse = local(e);
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved && view.z > 1) {
          cv.classList.add('dragging');
          view.px = drag.px + dx;
          view.py = drag.py + dy;
          applyView();
        }
        return;
      }
      M.hover = pick(mouse);
      cv.style.cursor = M.hover ? 'pointer' : view.z > 1 ? 'grab' : 'default';
    });
    cv.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) {
        const l = pick(local(e));
        if (l) M.select(l);
      }
      drag = null;
      cv.classList.remove('dragging');
    });
    cv.addEventListener('pointerleave', () => { mouse = null; M.hover = null; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p.px, p.py);
    }, { passive: false });
  };
  M.resize = resize;
})();
