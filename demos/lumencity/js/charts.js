/* =========================================================
   charts.js — lightweight SVG charts with hover tooltips
   ========================================================= */
(function () {
  const SC = window.SC;
  const NS = 'http://www.w3.org/2000/svg';
  const C = (SC.charts = {});
  const tip = () => document.getElementById('chartTip');

  const INK_MUTED = '#667085';
  const GRID = '#eef0f3';

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  const fmt = (v, d = 1) => (v >= 100 ? v.toFixed(0) : v.toFixed(d));
  C.fmt = fmt;

  C.showTip = (e, title, rows) => {
    const t = tip();
    t.innerHTML = `<div class="tt-title">${title}</div>` + rows.map((r) => `<div class="tt-row">${r.color ? `<i style="background:${r.color}"></i>` : ''}${r.name}<b>${r.value}</b></div>`).join('');
    t.classList.add('show');
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = e.clientX + 14, y = e.clientY - h - 12;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y < 8) y = e.clientY + 16;
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  };
  C.hideTip = () => tip().classList.remove('show');

  // top-rounded bar anchored to the baseline
  function barPath(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  function hbarPath(x, y, w, h, r) {
    if (w <= 0) return '';
    r = Math.min(r, h / 2, w);
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }

  // ---------- Line chart (multi-series, crosshair tooltip) ----------
  C.line = (host, opt) => {
    const W = Math.max(300, host.clientWidth), H = opt.height || 250;
    const m = { l: 44, r: 92, t: 12, b: 28 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const n = opt.labels.length;
    const all = opt.series.flatMap((s) => s.values.filter((v) => v != null));
    const ymax = niceMax(Math.max(...all, 0.001) * 1.1);
    const X = (i) => m.l + (pw * i) / (n - 1);
    const Y = (v) => m.t + ph - (ph * v) / ymax;
    const first = !host._drawn;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opt.aria || '' });
    for (let k = 0; k <= 4; k++) {
      const v = (ymax * k) / 4;
      el('line', { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: k ? 'grid' : 'axis' }, svg);
      el('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v === 0 ? '0' : fmt(v, v < 10 ? 1 : 0);
    }
    opt.labels.forEach((lb, i) => {
      if (i % 3 === 0) el('text', { x: X(i), y: H - 8, 'text-anchor': 'middle' }, svg).textContent = lb;
    });

    opt.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
      if (pts.length < 2) return;
      const d = 'M' + pts.map((p) => p.join(',')).join('L');
      if (s.area) {
        const gid = 'ga' + si + Math.random().toString(36).slice(2, 6);
        const defs = el('defs', {}, svg);
        const lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': 0.28 }, lg);
        el('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }, lg);
        el('path', { d: d + `L${pts[pts.length - 1][0]},${Y(0)}L${pts[0][0]},${Y(0)}Z`, fill: `url(#${gid})`, class: first ? 'fade-in' : '' }, svg);
      }
      const path = el('path', { d, stroke: s.color, 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round', 'stroke-dasharray': s.dash || '' }, svg);
      if (first && !s.dash) {
        path.classList.add('line-path');
        path.style.setProperty('--len', Math.ceil(pw * 2));
      }
      // direct label at the end of the line (text in ink, marker carries color)
      const last = pts[pts.length - 1];
      el('circle', { cx: last[0], cy: last[1], r: 4, fill: s.color, stroke: '#ffffff', 'stroke-width': 2 }, svg);
      s._end = last;
    });
    // de-collide end labels
    const ends = opt.series.filter((s) => s._end).map((s) => ({ s, y: s._end[1] })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
    ends.forEach(({ s, y }) => {
      el('text', { x: s._end[0] + 9, y: y + 4, class: 'lbl' }, svg).textContent = s.name;
    });

    // crosshair layer
    const cross = el('line', { y1: m.t, y2: m.t + ph, stroke: '#98a2b3', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 }, svg);
    const dots = opt.series.map((s) => el('circle', { r: 4.5, fill: s.color, stroke: '#ffffff', 'stroke-width': 2, opacity: 0 }, svg));
    const hit = el('rect', { x: m.l - 10, y: m.t, width: pw + 20, height: ph, class: 'hit' }, svg);
    const move = (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / pw) * (n - 1))));
      host._hover = i;
      cross.setAttribute('x1', X(i));
      cross.setAttribute('x2', X(i));
      cross.setAttribute('opacity', 1);
      const rows = [];
      opt.series.forEach((s, k) => {
        const v = s.values[i];
        if (v == null) { dots[k].setAttribute('opacity', 0); return; }
        dots[k].setAttribute('cx', X(i));
        dots[k].setAttribute('cy', Y(v));
        dots[k].setAttribute('opacity', 1);
        rows.push({ name: s.name, value: fmt(v, 2) + ' ' + opt.unit, color: s.color });
      });
      if (opt.extraTip) rows.push(...opt.extraTip(i));
      C.showTip(e, opt.tipTitle(i), rows.length ? rows : [{ name: 'No data yet', value: '' }]);
    };
    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', () => {
      host._hover = null;
      cross.setAttribute('opacity', 0);
      dots.forEach((d) => d.setAttribute('opacity', 0));
      C.hideTip();
    });

    host.replaceChildren(svg);
    host._drawn = true;
  };

  // ---------- Vertical bars ----------
  C.bars = (host, opt) => {
    const W = Math.max(260, host.clientWidth), H = opt.height || 220;
    const m = { l: 40, r: 10, t: 22, b: 28 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const n = opt.values.length;
    const ymax = niceMax(Math.max(...opt.values, 0.001) * 1.12);
    const slot = pw / n, bw = Math.min(56, slot * 0.62);
    const Y = (v) => m.t + ph - (ph * v) / ymax;
    const first = !host._drawn;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opt.aria || '' });
    for (let k = 0; k <= 4; k++) {
      const v = (ymax * k) / 4;
      el('line', { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: k ? 'grid' : 'axis' }, svg);
      el('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = v === 0 ? '0' : fmt(v, v < 10 ? 1 : 0);
    }
    const g = el('g', {}, svg);
    const maxIdx = opt.values.indexOf(Math.max(...opt.values));
    opt.values.forEach((v, i) => {
      const x = m.l + slot * i + (slot - bw) / 2;
      const color = Array.isArray(opt.color) ? opt.color[i] : opt.color;
      const b = el('path', { d: barPath(x, Y(v), bw, Y(0) - Y(v), 4), fill: color, class: 'bar' + (first ? ' grow' : '') }, g);
      if (first) b.style.animationDelay = i * 60 + 'ms';
      if (opt.partial && opt.partial(i)) {
        b.setAttribute('fill-opacity', 0.55);
        b.setAttribute('stroke', color);
        b.setAttribute('stroke-dasharray', '3 3');
      }
      el('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, svg).textContent = opt.labels[i];
      if (opt.labelIdx ? opt.labelIdx(i, maxIdx) : true)
        el('text', { x: x + bw / 2, y: Y(v) - 6, 'text-anchor': 'middle', class: 'val' }, svg).textContent = (opt.valueFmt || fmt)(v);
      const hit = el('rect', { x: m.l + slot * i, y: m.t, width: slot, height: ph, class: 'hit' }, svg);
      hit.addEventListener('mousemove', (e) => {
        g.classList.add('dimmed');
        b.classList.add('hl');
        C.showTip(e, opt.tipTitle(i), opt.tipRows(i));
      });
      hit.addEventListener('mouseleave', () => {
        g.classList.remove('dimmed');
        b.classList.remove('hl');
        C.hideTip();
      });
    });
    host.replaceChildren(svg);
    host._drawn = true;
  };

  // ---------- Horizontal bars ----------
  C.hbars = (host, opt) => {
    const W = Math.max(260, host.clientWidth);
    const rowH = 34, m = { l: 100, r: 64, t: 6, b: 6 };
    const H = m.t + m.b + rowH * opt.values.length;
    const pw = W - m.l - m.r;
    const xmax = niceMax(Math.max(...opt.values, 0.001));
    const first = !host._drawn;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opt.aria || '' });
    el('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, class: 'axis' }, svg);
    const g = el('g', {}, svg);
    opt.values.forEach((v, i) => {
      const y = m.t + rowH * i + 8, bh = rowH - 16;
      el('text', { x: m.l - 10, y: y + bh / 2 + 4, 'text-anchor': 'end', class: 'lbl' }, svg).textContent = opt.labels[i];
      const w = (pw * v) / xmax;
      const b = el('path', { d: hbarPath(m.l + 1, y, w, bh, 4), fill: opt.colors[i], class: 'bar' + (first ? ' growx' : '') }, g);
      if (first) b.style.animationDelay = i * 70 + 'ms';
      el('text', { x: m.l + w + 8, y: y + bh / 2 + 4, class: 'val' }, svg).textContent = opt.valueFmt(v);
      const hit = el('rect', { x: 0, y: y - 8, width: W, height: rowH, class: 'hit' }, svg);
      hit.addEventListener('mousemove', (e) => {
        g.classList.add('dimmed');
        b.classList.add('hl');
        C.showTip(e, opt.labels[i], opt.tipRows(i));
      });
      hit.addEventListener('mouseleave', () => {
        g.classList.remove('dimmed');
        b.classList.remove('hl');
        C.hideTip();
      });
    });
    host.replaceChildren(svg);
    host._drawn = true;
  };

  // ---------- Sparkline ----------
  C.spark = (svg, values, color) => {
    if (values.length < 2) return;
    const max = Math.max(...values) * 1.1 || 1;
    const min = Math.min(...values) * 0.9;
    const X = (i) => (120 * i) / (values.length - 1);
    const Y = (v) => 26 - (24 * (v - min)) / (max - min || 1);
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    svg.innerHTML = `<defs><linearGradient id="spG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${d}L120,28L0,28Z" fill="url(#spG)"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  };

  C.GRID = GRID;
  C.INK_MUTED = INK_MUTED;
})();
