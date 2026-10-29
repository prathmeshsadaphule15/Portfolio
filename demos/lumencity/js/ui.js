/* =========================================================
   ui.js — pages, controls and live widgets
   ========================================================= */
(function () {
  const SC = window.SC;
  const S = SC.state;
  const C = SC.charts;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const UI = (SC.ui = {});
  let page = 'overview';

  const SERIES = { smart: '#2a78d6', base: '#eb6834', saved: '#1baf7a' };
  const RAMP = ['#d0d5dd', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'];
  const TITLES = { overview: 'Overview', zones: 'Zones', analytics: 'Energy analytics', maintenance: 'Maintenance', schedules: 'Schedules', about: 'About' };
  const MODE_LABEL = { auto: 'Auto', eco: 'Eco', manual: 'Manual', off: 'Off' };

  // ---------- helpers ----------
  const fillRange = (r) => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
  document.addEventListener('input', (e) => { if (e.target.type === 'range') fillRange(e.target); });
  const setRange = (r, v) => { r.value = v; fillRange(r); };
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };

  function tween(el, target, fmt) {
    if (el._v == null) el._v = 0;
    el._v += (target - el._v) * 0.25;
    if (Math.abs(target - el._v) < 0.005) el._v = target;
    setText(el, fmt(el._v));
  }

  const TOAST = {
    critical: ['#d03b3b', 'var(--crit-soft)', 'var(--crit-text)'],
    good: ['#0ca30c', 'var(--good-soft)', 'var(--good-text)'],
    warning: ['#fab219', 'var(--warn-soft)', 'var(--warn-text)'],
    info: ['#1f5fbf', 'var(--accent-soft)', 'var(--accent)'],
  };
  UI.toast = (title, sub, kind = 'info', icon = 'i-info') => {
    const [bar, bg, fg] = TOAST[kind];
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.setProperty('--tc', bar);
    t.innerHTML = `<span class="ti" style="background:${bg};color:${fg}"><svg><use href="#${icon}"/></svg></span><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const box = $('#toasts');
    box.appendChild(t);
    const max = innerWidth < 860 ? 2 : 3;
    while (box.children.length > max) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 4200);
  };

  // ---------- navigation ----------
  UI.go = (p) => {
    if (!$('#page-' + p)) p = 'overview';
    page = p;
    $$('.page').forEach((s) => s.classList.toggle('active', s.id === 'page-' + p));
    $$('[data-page]').forEach((a) => a.classList.toggle('active', a.dataset.page === p));
    setText($('#crumb'), TITLES[p]);
    C.hideTip();
    if (p === 'analytics') $$('#page-analytics .chart').forEach((c) => (c._drawn = false));
    if (p === 'maintenance') renderAlerts();
    $('#page-' + p).scrollTop = 0;
  };
  window.addEventListener('hashchange', () => UI.go(location.hash.slice(1)));

  // ---------- top bar ----------
  function initTopbar() {
    $$('[data-speed]').forEach((b) =>
      b.addEventListener('click', () => {
        S.speed = +b.dataset.speed;
        $$('[data-speed]').forEach((x) => x.classList.toggle('active', x === b));
        SC.log('info', S.speed ? `Simulation speed set to ${S.speed}×` : 'Simulation paused', S.speed ? 'i-play' : 'i-pause');
      })
    );
    $$('[data-weather]').forEach((b) =>
      b.addEventListener('click', () => {
        S.weather = b.dataset.weather;
        $$('[data-weather]').forEach((x) => x.classList.toggle('active', x === b));
        const w = SC.WEATHER[S.weather];
        const icon = { clear: 'i-sun', cloudy: 'i-cloud', rain: 'i-rain', fog: 'i-fog' }[S.weather];
        const boost = S.weather === 'rain' || S.weather === 'fog';
        SC.log('info', `Weather changed to ${w.name}${boost ? '. Visibility boost +20%' : ''}`, icon);
        UI.toast(`Weather: ${w.name}`, boost ? 'Lights raised 20% for visibility' : 'Lighting policy adjusted', 'info', icon);
      })
    );
    $('#emergencyBtn').addEventListener('click', () => {
      S.emergency = !S.emergency;
      $('#emergencyBtn').classList.toggle('on', S.emergency);
      SC.log(S.emergency ? 'critical' : 'good', S.emergency ? 'Emergency mode: all lights forced to 100%' : 'Emergency mode cleared', 'i-siren');
      UI.toast(S.emergency ? 'Emergency mode on' : 'Emergency mode off', S.emergency ? 'Every working light is at full brightness' : 'Returning to normal policies', S.emergency ? 'critical' : 'good', 'i-siren');
    });
    const ts = $('#timeSlider');
    ts.addEventListener('input', () => { S.minute = +ts.value; });
    $$('[data-layer]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.layer;
        SC.map.layers[k] = !SC.map.layers[k];
        b.classList.toggle('on', SC.map.layers[k]);
      })
    );
    initSearch();
    SC.on('fault', () => {
      const b = $('#bell');
      b.classList.remove('ringing');
      void b.offsetWidth;
      b.classList.add('ringing');
    });
    $('#zoomIn').addEventListener('click', () => SC.map.zoom(1.4));
    $('#zoomOut').addEventListener('click', () => SC.map.zoom(1 / 1.4));
    $('#zoomReset').addEventListener('click', () => SC.map.resetView());
  }

  // search: jump to a light (e.g. "SL-030" or "30") or a zone by name
  function initSearch() {
    const form = $('#searchForm'), input = $('#searchInput');
    $('#searchList').innerHTML =
      SC.ZONES.map((z) => `<option value="${z.name}">`).join('') + SC.lights.map((l) => `<option value="${l.id}">`).join('');
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
        e.preventDefault();
        input.focus();
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim().toLowerCase();
      if (!q) return;
      const m = q.match(/^(sl-?)?0*(\d+)$/);
      const light = m && SC.lights.find((l) => l.id === 'SL-' + m[2].padStart(3, '0'));
      const zone = !light && SC.ZONES.find((z) => z.name.toLowerCase().includes(q) || z.id.includes(q));
      if (light) {
        location.hash = 'overview';
        SC.map.select(light);
        setTimeout(() => SC.map.focus(light), 60);
      } else if (zone) {
        location.hash = 'zones';
        setTimeout(() => {
          const card = $(`.zone-card[data-zone="${zone.id}"]`);
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.animate([{ boxShadow: '0 0 0 3px ' + zone.color }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1400 });
        }, 80);
      } else {
        form.classList.remove('shake');
        void form.offsetWidth;
        form.classList.add('shake');
        return;
      }
      input.value = '';
      input.blur();
    });
  }

  function phase(min) {
    const h = min / 60;
    if (h < 5) return 'Late night';
    if (h < 7) return 'Dawn';
    if (h < 17.75) return 'Day';
    if (h < 19.25) return 'Dusk';
    return 'Night';
  }
  function headline() {
    const h = S.minute / 60;
    if (S.emergency) return 'Emergency mode: all lights at full power';
    if (S.darkness < 0.02) return h < 12 ? 'Daylight: street lights are off' : 'Daylight: lights off, sensors on standby';
    if (h >= 17 && h < 19.25) return 'Sunset: street lights are switching on';
    if (h >= 5 && h < 7) return 'Sunrise: street lights are switching off';
    if (h < 5) return 'Late night: empty streets are dimmed';
    return 'Night: adaptive lighting is active';
  }
  const trafficLabel = (f) => (f > 0.65 ? 'Heavy' : f > 0.35 ? 'Moderate' : 'Light');

  let lastIcon = '';
  function updateChrome() {
    setText($('#clockTime'), SC.fmtTime(S.minute));
    setText($('#clockSub'), `Day ${S.day} · ${phase(S.minute)}`);
    const day = S.night < 0.5;
    const icon = day ? 'i-sun' : 'i-moon';
    if (icon !== lastIcon) {
      $('#clockIcon').innerHTML = `<svg><use href="#${icon}"/></svg>`;
      $('#clockIcon').classList.toggle('day', day);
      lastIcon = icon;
    }
    const luxTxt = S.lux >= 1000 ? (S.lux / 1000).toFixed(1) + 'k lx' : Math.round(S.lux) + ' lx';
    setText($('#luxVal'), luxTxt);
    $('#luxBar').style.width = Math.min(100, (Math.log10(S.lux + 1) / 5) * 100) + '%';
    const online = SC.lights.filter((l) => l.status === 'ok').length;
    setText($('#ssNodes'), `${online} / ${SC.lights.length}`);
    $('#ssNodesBar').style.width = (online / SC.lights.length) * 100 + '%';
    const ts = $('#timeSlider');
    if (document.activeElement !== ts) setRange(ts, Math.floor(S.minute));

    if (page === 'overview') {
      setText($('#skyPhase'), `${phase(S.minute)} · ${SC.fmtTime(S.minute)}`);
      const t = headline();
      const h1 = $('#skyTitle');
      if (h1.textContent !== t && !h1._busy) {
        h1._busy = true;
        h1.style.opacity = 0;
        setTimeout(() => { h1.textContent = t; h1.style.opacity = 1; h1._busy = false; }, 250);
      }
      const lit = SC.lights.filter((l) => l.level > 0.5).length;
      setText($('#skySub'), `Sunset 18:30 · Sunrise 06:00 · ${lit} of ${SC.lights.length} lights lit`);
      setText($('#skyLux'), luxTxt);
      setText($('#skyWeather'), SC.WEATHER[S.weather].name);
      setText($('#skyTraffic'), trafficLabel(SC.traffic(S.minute)));
      $('#skyCard').classList.toggle('light-sky', SC.scenes.lightSky);
    }
  }

  // ---------- KPIs ----------
  let lastFaults = 0;
  function updateKpis() {
    const total = SC.lights.length;
    const online = SC.lights.filter((l) => l.status === 'ok').length;
    tween($('#kOnline'), online, (v) => String(Math.round(v)));
    $('#kOnlineBar').style.width = (online / total) * 100 + '%';
    setText($('#kOnlineFoot'), `of ${total} nodes · ${SC.lights.filter((l) => l.level > 0.5).length} lit now`);
    tween($('#kPower'), S.watts / 1000, (v) => v.toFixed(2) + ' kW');
    const baseKw = SC.baselineOn(S.minute) ? (total * SC.BASELINE_W) / 1000 : 0;
    setText($('#kPowerFoot'), `Conventional lamps: ${baseKw.toFixed(1)} kW`);
    const t = SC.totals();
    if (t.base > 0.01) {
      const pct = (t.saved / t.base) * 100;
      tween($('#kSaved'), pct, (v) => v.toFixed(1) + '%');
      $('#kSavedBar').style.width = pct + '%';
      setText($('#kSavedFoot'), `${t.saved.toFixed(1)} kWh vs. conventional lamps`);
    }
    const co2 = t.saved * SC.CO2_PER_KWH;
    tween($('#kCo2'), co2, (v) => v.toFixed(1) + ' kg');
    setText($('#kTrees'), `≈ ${Math.round(co2 / 0.12).toLocaleString('en-IN')} km of car travel`);
    setText($('#kCost'), `₹${Math.round(t.saved * SC.TARIFF).toLocaleString('en-IN')} saved on the bill`);

    const open = S.alerts.filter((a) => a.status !== 'resolved');
    setText($('#kFaults'), String(open.length));
    const badge = $('#kFaultsBadge');
    badge.className = 'badge ' + (open.length ? 'crit' : 'ok');
    badge.innerHTML = `<i></i>${open.length ? 'Attention needed' : 'All clear'}`;
    const moving = S.crews.filter((c) => c.state !== 'idle').length;
    setText($('#kFaultsFoot'), moving ? `${moving} crew${moving === 1 ? '' : 's'} deployed` : 'No crews deployed');
    if (open.length > lastFaults) {
      const k = $('#kpiFaults');
      k.classList.remove('bump');
      void k.offsetWidth;
      k.classList.add('bump');
    }
    lastFaults = open.length;
    const nb = $('#navBadge');
    nb.hidden = !open.length;
    setText(nb, String(open.length));
    const bc = $('#bellCount');
    bc.hidden = !open.length;
    setText(bc, String(open.length));

    trend($('#kOnlineTrend'), ((online / total) * 100).toFixed(1) + '%', online === total ? 'up' : 'down');
    const vsBase = baseKw > 0 ? Math.round((1 - S.watts / 1000 / baseKw) * 100) : null;
    trend($('#kPowerTrend'), vsBase != null ? `−${vsBase}%` : '', 'up');
    trend($('#kSavedTrend'), t.saved > 0 ? `${t.saved.toFixed(0)} kWh` : '', 'up');
    trend($('#kCo2Trend'), '', '');
  }
  function trend(el, text, cls) {
    setText(el, text);
    const c = 'trend ' + cls;
    if (el.className !== c) el.className = c;
  }

  // ---------- inspector ----------
  function initInspector() {
    SC.on('select', (l) => {
      $('#inspectorEmpty').hidden = !!l;
      $('#inspectorBody').hidden = !l;
      $('#inspClose').hidden = !l;
      if (l) {
        const b = $('#inspectorBody');
        b.style.animation = 'none';
        void b.offsetWidth;
        b.style.animation = '';
      }
      updateInspector(performance.now() / 1000);
    });
    $('#inspClose').addEventListener('click', () => SC.map.select(null));
    $('#inspOverride').addEventListener('input', (e) => {
      const l = SC.map.selected;
      if (l && l.status === 'ok') l.override = +e.target.value;
    });
    $('#inspAuto').addEventListener('click', () => {
      const l = SC.map.selected;
      if (l) { l.override = null; SC.log('info', `${l.id} returned to automatic control`, 'i-bulb'); }
    });
    $('#inspFault').addEventListener('click', () => {
      const l = SC.map.selected;
      if (!l) return;
      if (l.status === 'ok') SC.raiseFault(l, SC.FAULTS[0]);
      else if (l.fault && l.fault.status === 'open' && !SC.dispatch(l.fault)) UI.toast('All crews are busy', `${l.id} is queued for the next free crew`, 'warning', 'i-truck');
    });
  }

  // animated lamp illustration
  let carPos = -40;
  function updateLampStage(l, now, dt) {
    const night = Math.max(S.night, S.darkness * 0.7);
    const level = l ? l.level : SC.lights.reduce((a, x) => a + x.level, 0) / SC.lights.length;
    const k = level / 100;
    const vis = k * (0.35 + 0.65 * night);
    $('#lampBeam').setAttribute('opacity', vis.toFixed(3));
    $('#lampPool').setAttribute('opacity', (vis * 0.9).toFixed(3));
    const fault = l && l.status !== 'ok';
    $('#lampHead').setAttribute('fill', fault ? (l.status === 'fault' ? '#d03b3b' : '#fab219') : k > 0.01 ? `rgb(255,${200 + 46 * k},${110 + 110 * k})` : '#5c6677');
    $('#lampFault').setAttribute('opacity', l && l.status === 'fault' ? 1 : 0);
    const top = night > 0.5 ? '#1b2540' : '#cfe3f7', bottom = night > 0.5 ? '#2d3a5c' : '#eaf3fc';
    $('#stageTop').setAttribute('stop-color', top);
    $('#stageBottom').setAttribute('stop-color', bottom);
    $('.lamp-readout').style.color = night > 0.5 ? '#fff' : '#101828';
    const moving = l ? l.motion > now && l.status === 'ok' : SC.traffic(S.minute) > 0.3;
    const car = $('#lampCar');
    if (moving || (carPos > -40 && carPos < 260)) {
      carPos += dt * 140;
      if (carPos > 270) carPos = moving ? -40 : 280;
    }
    car.setAttribute('transform', `translate(${carPos.toFixed(1)},0)`);
    car.setAttribute('opacity', carPos > -40 && carPos < 262 ? 1 : 0);
    setText($('#inspLevel'), l ? Math.round(l.level) + '%' : Math.round(level) + '%');
    setText($('.lamp-readout span'), l ? 'brightness' : 'city average');
  }

  function updateInspector(now) {
    const l = SC.map.selected;
    setText($('#inspSub'), l ? `${l.id} · ${SC.zoneById(l.zone).name}` : 'Select a light on the map');
    if (!l) return;
    const z = SC.zoneById(l.zone);
    setText($('#inspId'), l.id);
    setText($('#inspZone'), z.name + ' zone');
    $('#inspZone').style.setProperty('--zc', z.color);
    const st = $('#inspStatus');
    const cls = l.status === 'ok' ? 'ok' : l.status === 'fault' ? 'crit' : 'warn';
    const txt = l.status === 'ok' ? 'Operational' : l.status === 'fault' ? l.fault.type : `Repair by ${l.fault.crew}`;
    if (st.className !== 'badge ' + cls || st.textContent !== txt) { st.className = 'badge ' + cls; st.innerHTML = `<i></i>${txt}`; }
    setText($('#inspPower'), SC.lightPower(l).toFixed(1) + ' W');
    setText($('#inspEnergy'), l.energyWh >= 1000 ? (l.energyWh / 1000).toFixed(2) + ' kWh' : Math.round(l.energyWh) + ' Wh');
    const motion = l.motion > now && l.status === 'ok';
    setText($('#inspMotion'), l.status !== 'ok' ? 'Offline' : motion ? 'Motion detected' : 'Idle');
    $('#inspMotion').style.color = motion ? 'var(--accent)' : '';
    setText($('#inspMode'), SC.modeLabel(l));
    const ov = $('#inspOverride');
    ov.disabled = l.status !== 'ok' || S.emergency;
    if (document.activeElement !== ov) setRange(ov, l.override != null ? l.override : Math.round(l.level / 5) * 5);
    setText($('#inspOvVal'), l.override != null ? l.override + '%' : 'Auto');
    $('#inspAuto').disabled = l.override == null;
    const fb = $('#inspFault');
    if (l.status === 'ok') { setText(fb, 'Report fault'); fb.disabled = false; }
    else if (l.fault && l.fault.status === 'open') { setText(fb, l.fault.queued ? 'Queued' : 'Send crew'); fb.disabled = false; }
    else { setText(fb, 'Crew on site'); fb.disabled = true; }
  }

  // ---------- activity feed ----------
  function feedItem(e) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="fi ${e.kind}"><svg><use href="#${e.icon}"/></svg></span><div>${e.text}<time>${e.time}</time></div>`;
    return li;
  }
  function initFeed() {
    const feed = $('#feed');
    S.events.slice(0, 30).forEach((e) => feed.appendChild(feedItem(e)));
    SC.on('event', (e) => {
      feed.prepend(feedItem(e));
      while (feed.children.length > 30) feed.lastChild.remove();
    });
    SC.on('fault', (a) => UI.toast(`Fault at ${a.lightId}`, `${a.type} · ${SC.zoneById(a.zone).name}`, 'critical', 'i-alert'));
    SC.on('repaired', (a) => UI.toast(`${a.lightId} repaired`, `${a.crew} fixed: ${a.type}`, 'good', 'i-check'));
  }

  // ---------- zones ----------
  const MODES = ['auto', 'eco', 'manual', 'off'];
  function zoneStats(z) {
    const ls = SC.lightsInZone(z.id);
    return {
      ls,
      avg: ls.reduce((a, l) => a + l.level, 0) / ls.length,
      load: ls.reduce((a, l) => a + SC.lightPower(l), 0),
      lit: ls.filter((l) => l.level > 0.5).length,
      faults: ls.filter((l) => l.status !== 'ok').length,
    };
  }
  function initZones() {
    $('#zoneStrip').innerHTML = SC.ZONES.map(
      (z) => `<a class="zs" href="#zones" data-zone="${z.id}" style="--zc:${z.color}">
        <span class="zs-name">${z.name}</span>
        <div class="meter"><i data-k="bar"></i></div>
        <b class="zs-avg" data-k="avg">0%</b>
        <span class="zs-meta" data-k="lit"></span>
        <span class="zs-meta" data-k="load"></span>
        <span class="badge" data-k="mode">Auto</span></a>`
    ).join('');

    const grid = $('#zoneGrid');
    SC.ZONES.forEach((z, i) => {
      const n = SC.lightsInZone(z.id).length;
      const card = document.createElement('div');
      card.className = 'card zone-card reveal';
      card.style.setProperty('--zc', z.color);
      card.style.setProperty('--i', i);
      card.dataset.zone = z.id;
      card.innerHTML = `
        <div class="zone-top"><h3><i></i>${z.name}</h3><span class="badge" data-k="lights">${n} lights</span></div>
        <p class="zone-desc">${z.desc}</p>
        <div class="zone-stats">
          <div><span>Avg brightness</span><b data-k="avg">0%</b></div>
          <div><span>Live load</span><b data-k="load">0 W</b></div>
          <div><span>Faults</span><b data-k="faults">0</b></div>
        </div>
        <div class="mode-seg"><span class="seg-pill"></span>${MODES.map((m) => `<button data-mode="${m}">${MODE_LABEL[m]}</button>`).join('')}</div>
        <label class="field-range"><span>Base dim level <b data-k="baseV"></b></span><input type="range" min="5" max="100" step="5" data-k="base" /></label>
        <label class="field-range"><span>Manual level <b data-k="manV"></b></span><input type="range" min="0" max="100" step="5" data-k="manual" /></label>
        <div class="zone-bulbs">${SC.lightsInZone(z.id).map(() => '<i></i>').join('')}</div>`;
      grid.appendChild(card);
      $$('[data-mode]', card).forEach((b) => b.addEventListener('click', () => setMode(z, b.dataset.mode)));
      const base = $('[data-k=base]', card), man = $('[data-k=manual]', card);
      setRange(base, z.base);
      setRange(man, z.manual);
      base.addEventListener('input', () => (z.base = +base.value));
      man.addEventListener('input', () => (z.manual = +man.value));
      syncZone(z);
    });
    $('#allAuto').addEventListener('click', () => {
      SC.ZONES.forEach((z) => setMode(z, 'auto', true));
      UI.toast('All zones set to Auto', 'Motion and daylight control restored', 'info', 'i-layers');
    });
    $('#allEco').addEventListener('click', () => {
      SC.ZONES.forEach((z) => setMode(z, 'eco', true));
      UI.toast('Eco mode for all zones', 'Lower base levels, motion boost capped at 80%', 'good', 'i-leaf');
    });
  }
  function setMode(z, mode, quiet) {
    if (z.mode === mode) return;
    z.mode = mode;
    syncZone(z);
    if (!quiet) SC.log('info', `${z.name} switched to ${MODE_LABEL[mode]} mode`, 'i-layers');
  }
  function syncZone(z) {
    const card = $(`.zone-card[data-zone="${z.id}"]`);
    $('.seg-pill', card).style.transform = `translateX(${MODES.indexOf(z.mode) * 100}%)`;
    $$('[data-mode]', card).forEach((b) => b.classList.toggle('active', b.dataset.mode === z.mode));
    $('[data-k=base]', card).disabled = z.mode === 'manual' || z.mode === 'off';
    $('[data-k=manual]', card).disabled = z.mode !== 'manual';
  }
  const modeBadge = (z) => (z.mode === 'eco' ? 'badge ok' : z.mode === 'off' ? 'badge' : z.mode === 'manual' ? 'badge warn' : 'badge info');
  function updateZoneStrip() {
    SC.ZONES.forEach((z) => {
      const el = $(`.zs[data-zone="${z.id}"]`);
      const s = zoneStats(z);
      const m = $('[data-k=mode]', el);
      const cls = modeBadge(z);
      if (m.className !== cls) m.className = cls;
      setText(m, MODE_LABEL[z.mode]);
      tween($('[data-k=avg]', el), s.avg, (x) => Math.round(x) + '%');
      $('[data-k=bar]', el).style.width = s.avg + '%';
      setText($('[data-k=lit]', el), `${s.lit}/${s.ls.length} lit`);
      setText($('[data-k=load]', el), `${Math.round(s.load)} W`);
    });
  }
  function updateZones() {
    SC.ZONES.forEach((z) => {
      const card = $(`.zone-card[data-zone="${z.id}"]`);
      const s = zoneStats(z);
      setText($('[data-k=avg]', card), Math.round(s.avg) + '%');
      setText($('[data-k=load]', card), s.load.toFixed(0) + ' W');
      const fe = $('[data-k=faults]', card);
      setText(fe, String(s.faults));
      fe.style.color = s.faults ? 'var(--crit-text)' : '';
      setText($('[data-k=baseV]', card), z.base + '%');
      setText($('[data-k=manV]', card), z.manual + '%');
      const dots = $$('.zone-bulbs i', card);
      s.ls.forEach((l, i) => {
        const d = dots[i];
        if (l.status === 'fault') { d.style.background = '#f04438'; d.style.borderColor = '#f04438'; d.style.transform = 'scale(1.15)'; }
        else if (l.status === 'maint') { d.style.background = '#fab219'; d.style.borderColor = '#fab219'; d.style.transform = ''; }
        else {
          const k = l.level / 100;
          d.style.background = k < 0.01 ? '' : `rgba(232,163,23,${0.2 + 0.8 * k})`;
          d.style.borderColor = k < 0.01 ? '' : `rgba(200,130,10,${0.3 + 0.7 * k})`;
          d.style.transform = '';
        }
      });
    });
  }

  // ---------- analytics ----------
  function initAnalytics() {
    $('#hourlyLegend').innerHTML =
      `<span><i style="border-color:${SERIES.smart}"></i>Smart LED (adaptive)</span>` +
      `<span><i class="dash" style="border-color:${SERIES.base}"></i>Conventional sodium lamps</span>`;
    $('#hourlyTableBtn').addEventListener('click', () => {
      const t = $('#hourlyTable');
      t.hidden = !t.hidden;
      $('#chartHourly').hidden = !t.hidden;
      $('#hourlyLegend').hidden = !t.hidden;
      setText($('#hourlyTableBtn span'), t.hidden ? 'Table' : 'Chart');
      $('#chartHourly')._drawn = false;
      renderAnalytics();
    });
  }
  const hoverFree = (id) => !$(id).matches(':hover');
  function renderAnalytics() {
    const hour = Math.floor(S.minute / 60);
    const t = SC.totals();
    setText($('#aSmart'), t.smart.toFixed(1) + ' kWh');
    setText($('#aBase'), t.base.toFixed(1) + ' kWh');
    const weekSaved = S.week.reduce((a, d) => a + (d.base - d.smart), 0) + t.saved;
    setText($('#aWeek'), weekSaved.toFixed(0) + ' kWh');
    setText($('#aWeekCost'), '₹' + Math.round(weekSaved * SC.TARIFF).toLocaleString('en-IN'));
    setText($('#hourlySub'), `kWh per hour across all ${SC.lights.length} lights`);

    const pct = t.base > 0 ? t.saved / t.base : 0;
    $('#savingRing').style.strokeDashoffset = 402.1 * (1 - pct);
    setText($('#ringPct'), Math.round(pct * 100) + '%');
    setText($('#ringSmart'), t.smart.toFixed(1) + ' kWh');
    setText($('#ringBase'), t.base.toFixed(1) + ' kWh');

    const labels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const smart = S.hourly.smart.map((v, i) => (i <= hour ? v : null));
    const base = S.hourly.base.map((v, i) => (i <= hour ? v : null));
    if (!$('#hourlyTable').hidden) {
      $('#hourlyTable').innerHTML = `<table class="table"><thead><tr><th>Hour</th><th>Smart LED (kWh)</th><th>Conventional (kWh)</th><th>Saved (kWh)</th></tr></thead><tbody>${labels
        .slice(0, hour + 1)
        .map((lb, i) => `<tr><td>${lb}:00</td><td>${smart[i].toFixed(2)}</td><td>${base[i].toFixed(2)}</td><td><b>${Math.max(0, base[i] - smart[i]).toFixed(2)}</b></td></tr>`)
        .join('')}</tbody></table>`;
    } else if (hoverFree('#chartHourly')) {
      C.line($('#chartHourly'), {
        labels,
        unit: 'kWh',
        aria: 'Hourly energy use: smart LED versus conventional lamps',
        series: [
          { name: 'Smart LED', color: SERIES.smart, values: smart, area: true },
          { name: 'Conventional', color: SERIES.base, values: base, dash: '5 4' },
        ],
        tipTitle: (i) => `${labels[i]}:00 – ${String((i + 1) % 24).padStart(2, '0')}:00${i === hour ? ' (so far)' : ''}`,
        extraTip: (i) => (smart[i] == null ? [] : [{ name: 'Saved', value: Math.max(0, base[i] - smart[i]).toFixed(2) + ' kWh' }]),
      });
    }

    if (hoverFree('#chartWeek')) {
      const days = S.week.concat([{ label: 'Today', smart: t.smart, base: t.base }]);
      const saved = days.map((d) => Math.max(0, d.base - d.smart));
      C.bars($('#chartWeek'), {
        labels: days.map((d) => d.label),
        values: saved,
        color: SERIES.saved,
        aria: 'Energy saved per day',
        partial: (i) => i === days.length - 1,
        labelIdx: (i, max) => i === max || i === days.length - 1,
        tipTitle: (i) => (i === days.length - 1 ? 'Today (so far)' : days[i].label),
        tipRows: (i) => [
          { name: 'Smart LED', value: days[i].smart.toFixed(1) + ' kWh', color: SERIES.smart },
          { name: 'Conventional', value: days[i].base.toFixed(1) + ' kWh', color: SERIES.base },
          { name: 'Saved', value: saved[i].toFixed(1) + ' kWh', color: SERIES.saved },
        ],
      });
    }

    if (hoverFree('#chartZones')) {
      const st = SC.ZONES.map(zoneStats);
      C.hbars($('#chartZones'), {
        labels: SC.ZONES.map((z) => z.name),
        values: st.map((s) => s.load),
        colors: SC.ZONES.map((z) => z.color),
        aria: 'Live load by zone',
        valueFmt: (v) => v.toFixed(0) + ' W',
        tipRows: (i) => [
          { name: 'Load', value: st[i].load.toFixed(0) + ' W' },
          { name: 'Lights lit', value: `${st[i].lit} / ${st[i].ls.length}` },
          { name: 'Avg brightness', value: Math.round(st[i].avg) + '%' },
          { name: 'Mode', value: MODE_LABEL[SC.ZONES[i].mode] },
        ],
      });
    }

    if (hoverFree('#chartDist')) {
      const bands = ['Off', '1–20%', '21–40%', '41–60%', '61–80%', '81–100%'];
      const counts = new Array(6).fill(0);
      SC.lights.forEach((l) => { counts[l.level < 0.5 ? 0 : Math.min(5, 1 + Math.floor((l.level - 0.01) / 20))]++; });
      C.bars($('#chartDist'), {
        labels: bands,
        values: counts,
        color: RAMP,
        height: 220,
        aria: 'Number of lights at each brightness band',
        valueFmt: (v) => String(Math.round(v)),
        tipTitle: (i) => bands[i],
        tipRows: (i) => [{ name: 'Lights', value: counts[i] }, { name: 'Share', value: Math.round((counts[i] / SC.lights.length) * 100) + '%' }],
      });
    }
  }

  // ---------- maintenance ----------
  let alertFilter = 'open';
  const seenAlerts = new Set();
  const STEPS = ['Detected', 'Dispatched', 'Repairing', 'Resolved'];
  function stepper(a) {
    const idx = { open: 0, dispatched: 1, repairing: 2, resolved: 3 }[a.status];
    const done = a.status === 'resolved';
    let html = '<div class="stepper">';
    STEPS.forEach((_, k) => {
      if (k) html += `<span class="ln ${done ? 'ok' : k <= idx ? 'done' : ''}"></span>`;
      html += `<span class="st ${done ? 'ok' : k < idx ? 'done' : k === idx ? 'now' : ''}"></span>`;
    });
    const label = a.status === 'open' && a.queued ? 'Queued' : STEPS[idx];
    return html + `<span class="stepper-label">${label}</span></div>`;
  }
  function initMaintenance() {
    $$('#alertFilter button').forEach((b) =>
      b.addEventListener('click', () => {
        alertFilter = b.dataset.f;
        $$('#alertFilter button').forEach((x) => x.classList.toggle('active', x === b));
        renderAlerts();
      })
    );
    $('#autoDispatch').addEventListener('change', (e) => {
      S.autoDispatch = e.target.checked;
      SC.log('info', `Auto-dispatch ${S.autoDispatch ? 'enabled' : 'disabled'}`, 'i-truck');
    });
    $('#simFault').addEventListener('click', () => {
      const ok = SC.lights.filter((l) => l.status === 'ok');
      if (ok.length) SC.raiseFault(ok[Math.floor(Math.random() * ok.length)]);
    });
    $('#alertTable tbody').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = S.alerts.find((x) => x.id === +b.dataset.id);
      if (b.dataset.act === 'dispatch') {
        if (!SC.dispatch(a)) UI.toast('All crews are busy', `${a.lightId} queued for the next free crew`, 'warning', 'i-truck');
      } else if (b.dataset.act === 'locate') {
        const l = SC.lights.find((x) => x.id === a.lightId);
        location.hash = 'overview';
        SC.map.select(l);
        setTimeout(() => SC.map.focus(l), 60);
      }
    });
    ['alerts', 'fault', 'repaired'].forEach((ev) => SC.on(ev, renderAlerts));
    $('#fleet').innerHTML = S.crews
      .map(
        (c, i) => `<div class="van reveal" data-crew="${c.id}" style="--i:${i}">
          <div class="van-head"><span class="van-icon"><svg><use href="#i-truck"/></svg></span><div><b>${c.id}</b><span class="van-state" data-k="st">Idle at depot</span></div><span class="badge" data-k="badge"><i></i>Available</span></div>
          <div class="van-route"><i data-k="p"></i><span class="pin" style="left:0"></span><span class="pin mid"></span><span class="pin end"></span></div>
          <div class="van-labels"><span>Depot</span><span>On site</span><span>Fixed</span></div></div>`
      )
      .join('');
  }
  function renderAlerts() {
    const rows = S.alerts.filter((a) => alertFilter === 'all' || (alertFilter === 'open' ? a.status !== 'resolved' : a.status === 'resolved'));
    $('#alertEmpty').hidden = rows.length > 0;
    $('#alertTable').hidden = rows.length === 0;
    const sevCls = { critical: 'crit', serious: 'serious', warning: 'warn' };
    $('#alertTable tbody').innerHTML = rows
      .map((a) => {
        const isNew = !seenAlerts.has(a.id + a.status);
        seenAlerts.add(a.id + a.status);
        let act = '';
        if (a.status === 'open') act = `<button class="btn btn-sm btn-primary" data-act="dispatch" data-id="${a.id}"><svg><use href="#i-truck"/></svg>Dispatch</button>`;
        else if (a.status !== 'resolved') act = `<span class="muted">${a.crew}</span>`;
        else act = `<span class="muted">Fixed ${a.resolved}</span>`;
        return `<tr class="${isNew ? 'new' : ''}"><td>${a.time}</td><td><b>${a.lightId}</b></td><td>${SC.zoneById(a.zone).name}</td><td>${a.type}</td>
          <td><span class="badge ${sevCls[a.sev]}"><i></i>${a.sev[0].toUpperCase() + a.sev.slice(1)}</span></td>
          <td>${stepper(a)}</td>
          <td><div class="cell-actions">${act}<button class="icon-btn" data-act="locate" data-id="${a.id}" title="Show on map"><svg><use href="#i-pin"/></svg></button></div></td></tr>`;
      })
      .join('');
  }
  function updateFleet() {
    S.crews.forEach((c) => {
      const el = $(`.van[data-crew="${c.id}"]`);
      el.classList.toggle('busy', c.state !== 'idle');
      const id = c.light && c.light.id;
      setText($('[data-k=st]', el), { idle: 'Idle at depot', enroute: `Driving to ${id}`, repairing: `Repairing ${id}`, returning: 'Returning to depot' }[c.state]);
      const b = $('[data-k=badge]', el);
      const cls = c.state === 'idle' ? 'badge ok' : 'badge warn';
      if (b.className !== cls) { b.className = cls; b.innerHTML = `<i></i>${c.state === 'idle' ? 'Available' : 'On duty'}`; }
      let p = 0;
      if (c.state === 'enroute') p = ((c.seg + c.t) / (c.path.length - 1)) * 40;
      else if (c.state === 'repairing') p = 40 + c.repair * 60;
      else if (c.state === 'returning') p = 100;
      $('[data-k=p]', el).style.width = p + '%';
    });
  }

  // ---------- schedules ----------
  function initSchedules() {
    $('#rZone').innerHTML = SC.ZONES.map((z) => `<option value="${z.id}">${z.name}</option>`).join('');
    const lv = $('#rLevel');
    fillRange(lv);
    lv.addEventListener('input', () => setText($('#rLevelVal'), lv.value + '%'));
    $('#rAction').addEventListener('change', (e) => ($('#rLevelRow').hidden = e.target.value === 'off'));
    $('#ruleForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const from = SC.parseTime($('#rFrom').value), to = SC.parseTime($('#rTo').value);
      if (from === to) { UI.toast('Invalid time window', 'Start and end time must differ', 'warning', 'i-alert'); return; }
      const r = SC.addRule({ name: $('#rName').value.trim(), zone: $('#rZone').value, from, to, action: $('#rAction').value, level: +lv.value });
      SC.log('info', `Schedule “${r.name}” created`, 'i-calendar');
      UI.toast('Rule added', `${r.name} · ${SC.fmtTime(from)}–${SC.fmtTime(to)}`, 'good', 'i-calendar');
      $('#rName').value = '';
      renderRules();
    });
    $('#rules').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      b.closest('.rule').classList.add('removing');
      setTimeout(() => {
        const i = S.rules.findIndex((r) => r.id === +b.dataset.del);
        if (i >= 0) { SC.log('info', `Schedule “${S.rules[i].name}” deleted`, 'i-trash'); S.rules.splice(i, 1); }
        renderRules();
      }, 300);
    });
    $('#rules').addEventListener('change', (e) => {
      if (!e.target.dataset.tog) return;
      S.rules.find((x) => x.id === +e.target.dataset.tog).enabled = e.target.checked;
      renderRules();
    });
    renderRules();
  }
  function renderRules() {
    const pct = (m) => (m / 1440) * 100;
    const segs = (r) => {
      const cls = 'tl-seg' + (r.action === 'off' ? ' off' : '');
      if (r.from < r.to) return `<i class="${cls}" style="left:${pct(r.from)}%;width:${pct(r.to - r.from)}%"></i>`;
      return `<i class="${cls}" style="left:${pct(r.from)}%;width:${100 - pct(r.from)}%"></i><i class="${cls}" style="left:0;width:${pct(r.to)}%"></i>`;
    };
    $('#timeline').innerHTML =
      `<div class="tl-hours"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>` +
      S.rules.filter((r) => r.enabled).map((r) => `<div class="tl-row" style="--zc:${SC.zoneById(r.zone).color}"><span title="${r.name}">${r.name}</span><div class="tl-track">${segs(r)}</div></div>`).join('') +
      `<div class="tl-now" id="tlNow"></div>`;
    $('#rules').innerHTML = S.rules.length
      ? S.rules
          .map((r) => {
            const z = SC.zoneById(r.zone);
            return `<li class="rule ${r.enabled ? '' : 'disabled'}" data-id="${r.id}" style="--zc:${z.color}">
              <span class="rz"></span>
              <div class="rinfo"><b>${r.name}<span class="badge info" data-live hidden><i></i>Active now</span></b>
              <span>${z.name} · ${SC.fmtTime(r.from)}–${SC.fmtTime(r.to)} · ${r.action === 'off' ? 'Lights off' : `${r.level}% base`}</span></div>
              <label class="switch" title="Enable rule"><input type="checkbox" data-tog="${r.id}" ${r.enabled ? 'checked' : ''} /><i></i></label>
              <button class="icon-btn" data-del="${r.id}" title="Delete rule"><svg><use href="#i-trash"/></svg></button></li>`;
          })
          .join('')
      : '<div class="empty"><b>No rules yet</b><span>Add one with the form.</span></div>';
  }
  function updateRules() {
    const now = $('#tlNow');
    if (now) now.style.left = `calc(130px + (100% - 130px) * ${S.minute / 1440})`;
    S.rules.forEach((r) => {
      const li = $(`.rule[data-id="${r.id}"]`);
      if (!li) return;
      const live = r.live && r.enabled;
      li.classList.toggle('live', live);
      $('[data-live]', li).hidden = !live;
    });
  }

  // ---------- per-frame driver ----------
  let tFast = 0, tSlow = 0, tSpark = 0, lastNow = 0;
  UI.frame = (now) => {
    const dt = Math.min(0.05, now - (lastNow || now));
    lastNow = now;
    if (page === 'overview') {
      SC.scenes.sky($('#skyCanvas'), dt, now);
      updateLampStage(SC.map.selected, now, dt);
    }
    if (page === 'about') SC.scenes.about($('#aboutCanvas'), dt, now);
    if (now - tFast > 0.2) {
      tFast = now;
      updateChrome();
      updateKpis();
      if (page === 'overview') { updateInspector(now); updateZoneStrip(); }
      if (page === 'zones') updateZones();
      if (page === 'maintenance') updateFleet();
      if (page === 'schedules') updateRules();
    }
    if (now - tSlow > 1) {
      tSlow = now;
      if (page === 'analytics') renderAnalytics();
    }
    if (now - tSpark > 1) {
      tSpark = now;
      S.powerHistory.push(S.watts / 1000);
      if (S.powerHistory.length > 60) S.powerHistory.shift();
      C.spark($('#sparkPower'), S.powerHistory, '#1f5fbf');
    }
  };

  UI.init = () => {
    initTopbar();
    initInspector();
    initFeed();
    initZones();
    initAnalytics();
    initMaintenance();
    initSchedules();
    // stagger index for reveal animations, per page
    $$('.page').forEach((p) => $$('.reveal', p).forEach((el, i) => { if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', i); }));
    $$('input[type=range]').forEach(fillRange);
    UI.go(location.hash.slice(1) || 'overview');
  };
})();
