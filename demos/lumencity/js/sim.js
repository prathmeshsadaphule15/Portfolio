/* =========================================================
   sim.js — city model + smart lighting control engine
   Everything lives on the global SC namespace so the app
   runs straight from file:// with no build step.
   ========================================================= */
(function () {
  const SC = (window.SC = {});

  // ---------- City layout (logical units) ----------
  SC.W = 1200;
  SC.H = 760;
  SC.ROADS_H = [60, 260, 460, 700]; // y of horizontal roads
  SC.ROADS_V = [60, 340, 620, 900, 1140]; // x of vertical roads
  SC.ROAD_W = 28;
  SC.DEPOT = { x: 60, y: 700 };

  SC.ZONES = [
    { id: 'downtown', name: 'Downtown', color: '#2a78d6', desc: 'Business district and main avenues', base: 55 },
    { id: 'residential', name: 'Residential', color: '#eb6834', desc: 'Housing colonies and inner lanes', base: 35 },
    { id: 'park', name: 'Central Park', color: '#1baf7a', desc: 'Walking tracks, lake and garden', base: 25 },
    { id: 'industrial', name: 'Industrial', color: '#eda100', desc: 'Factories and warehouses', base: 40 },
    { id: 'market', name: 'Market', color: '#e87ba4', desc: 'Shops, bus stand and night market', base: 50 },
  ];
  SC.ZONES.forEach((z) => Object.assign(z, { mode: 'auto', manual: 70 }));
  SC.zoneById = (id) => SC.ZONES.find((z) => z.id === id);

  // block grid [row][col] -> zone id
  SC.BLOCK_ZONES = [
    ['residential', 'downtown', 'downtown', 'industrial'],
    ['residential', 'downtown', 'downtown', 'industrial'],
    ['residential', 'residential', 'park', 'market'],
  ];

  SC.blocks = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const pad = SC.ROAD_W / 2 + 4;
      SC.blocks.push({
        r, c,
        zone: SC.BLOCK_ZONES[r][c],
        x: SC.ROADS_V[c] + pad,
        y: SC.ROADS_H[r] + pad,
        w: SC.ROADS_V[c + 1] - SC.ROADS_V[c] - pad * 2,
        h: SC.ROADS_H[r + 1] - SC.ROADS_H[r] - pad * 2,
      });
    }
  }

  function segIndex(arr, v) {
    for (let i = 0; i < arr.length - 1; i++) if (v < arr[i + 1]) return i;
    return arr.length - 2;
  }
  function zoneAt(x, y) {
    const c = segIndex(SC.ROADS_V, x);
    const r = segIndex(SC.ROADS_H, y);
    return SC.BLOCK_ZONES[r][c];
  }

  // ---------- Street lights ----------
  SC.RATED_W = 90; // smart LED fixture
  SC.STANDBY_W = 1.5; // controller + radio
  SC.BASELINE_W = 150; // conventional sodium lamp
  SC.lights = [];
  (function buildLights() {
    let n = 1;
    const step = 60;
    const near = (v, arr) => arr.some((a) => Math.abs(a - v) < 26);
    const add = (x, y, axis, road) => {
      SC.lights.push({
        id: 'SL-' + String(n++).padStart(3, '0'),
        x, y, axis, road,
        zone: zoneAt(x, y),
        status: 'ok',
        level: 0,
        override: null,
        motion: 0,
        energyWh: 0,
        fault: null,
        repair: 0,
      });
    };
    SC.ROADS_H.forEach((ry, i) => {
      let side = i % 2 ? 1 : -1;
      for (let x = SC.ROADS_V[0] + 30; x < SC.ROADS_V[SC.ROADS_V.length - 1]; x += step) {
        if (near(x, SC.ROADS_V)) continue;
        add(x, ry + side * 20, 'h', ry);
        side = -side;
      }
    });
    SC.ROADS_V.forEach((rx, i) => {
      let side = i % 2 ? 1 : -1;
      for (let y = SC.ROADS_H[0] + 30; y < SC.ROADS_H[SC.ROADS_H.length - 1]; y += step) {
        if (near(y, SC.ROADS_H)) continue;
        add(rx + side * 20, y, 'v', rx);
        side = -side;
      }
    });
  })();
  SC.lightsInZone = (id) => SC.lights.filter((l) => l.zone === id);

  // ---------- Simulation state ----------
  const S = (SC.state = {
    minute: 18 * 60, // minute of day
    day: 1,
    speed: 10, // simulated minutes per real second
    weather: 'clear',
    emergency: false,
    autoDispatch: true,
    lux: 0,
    darkness: 0,
    night: 0, // visual night factor 0..1
    dusk: 0, // visual twilight tint 0..1
    hourly: { smart: new Array(24).fill(0), base: new Array(24).fill(0) },
    week: [], // [{label, smart, base}] previous days (kWh)
    powerHistory: [],
    alerts: [],
    events: [],
    rules: [],
    vehicles: [],
    crews: [
      { id: 'Crew A', state: 'idle' },
      { id: 'Crew B', state: 'idle' },
      { id: 'Crew C', state: 'idle' },
    ],
  });

  SC.WEATHER = {
    clear: { name: 'Clear', light: 1, dim: 0 },
    cloudy: { name: 'Cloudy', light: 0.45, dim: 0.1 },
    rain: { name: 'Rain', light: 0.25, dim: 0.2 },
    fog: { name: 'Fog', light: 0.3, dim: 0.15 },
  };

  // ---------- Time helpers ----------
  SC.fmtTime = (min) => {
    min = ((Math.floor(min) % 1440) + 1440) % 1440;
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  };
  SC.parseTime = (s) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  SC.inWindow = (min, from, to) => (from <= to ? min >= from && min < to : min >= from || min < to);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  SC.clamp = clamp;

  // sunrise 06:00, sunset 18:30
  function sun(min) {
    return Math.sin((Math.PI * (min / 60 - 6)) / 12.5);
  }
  function luxAt(min, weather) {
    const s = sun(min);
    let lux = 0;
    if (s > 0) lux = 120000 * Math.pow(s, 1.4) + 400;
    else if (s > -0.1) lux = (400 * (s + 0.1)) / 0.1;
    return lux * SC.WEATHER[weather].light;
  }
  function darknessFromLux(lux) {
    return 1 - clamp((lux - 40) / 960, 0, 1);
  }
  // traffic density 0..1 with morning and evening peaks
  SC.traffic = (min) => {
    const h = min / 60;
    const g = (mu, sd) => Math.exp(-((h - mu) ** 2) / (2 * sd * sd));
    return clamp(0.12 + 0.85 * g(9, 1.6) + 0.95 * g(18.5, 2.2) + 0.25 * g(13, 2), 0, 1);
  };

  // ---------- Schedules ----------
  let ruleSeq = 1;
  SC.addRule = (r) => {
    const rule = Object.assign({ id: ruleSeq++, enabled: true, live: false }, r);
    S.rules.push(rule);
    return rule;
  };
  SC.addRule({ name: 'Park night closure', zone: 'park', from: 60, to: 300, action: 'off', level: 0 });
  SC.addRule({ name: 'Evening rush boost', zone: 'downtown', from: 18 * 60, to: 22 * 60, action: 'level', level: 80 });
  SC.addRule({ name: 'Industrial night eco', zone: 'industrial', from: 23 * 60, to: 300, action: 'level', level: 25 });

  function activeRules() {
    const map = {};
    S.rules.forEach((r) => {
      const live = r.enabled && SC.inWindow(S.minute, r.from, r.to);
      if (live && !r.live) SC.log('info', `Schedule “${r.name}” is now active`, 'i-calendar');
      r.live = live;
      if (live) map[r.zone] = r;
    });
    return map;
  }

  // ---------- Control logic ----------
  function targetLevel(l, zone, ctx) {
    if (l.status !== 'ok') return 0;
    if (S.emergency) return 100;
    if (l.override != null) return l.override;
    if (zone.mode === 'off') return 0;
    if (zone.mode === 'manual') return zone.manual;
    if (ctx.darkness < 0.02) return 0;

    let base = zone.base;
    let max = 100;
    const rule = ctx.rules[zone.id];
    if (rule) {
      if (rule.action === 'off') return 0;
      base = rule.level;
    }
    if (zone.mode === 'eco') {
      max = 80;
      base *= ctx.lateNight ? 0.45 : 0.65;
    }
    if (ctx.badWeather) base += 20;
    base = Math.min(base, max);
    const t = l.motion > ctx.now ? max : base;
    return t * Math.min(1, ctx.darkness * 1.4);
  }
  SC.lightPower = (l) => (l.status === 'fault' ? 0 : SC.STANDBY_W + (SC.RATED_W * l.level) / 100);
  SC.baselineOn = (min) => min >= 18 * 60 || min < 6 * 60;

  SC.modeLabel = (l) => {
    if (l.status !== 'ok') return '—';
    if (S.emergency) return 'Emergency';
    if (l.override != null) return 'Override';
    const z = SC.zoneById(l.zone);
    return { auto: 'Auto', eco: 'Eco', manual: 'Manual', off: 'Off' }[z.mode];
  };

  // ---------- Events ----------
  SC.listeners = {};
  SC.on = (ev, fn) => (SC.listeners[ev] = SC.listeners[ev] || []).push(fn);
  SC.emit = (ev, data) => (SC.listeners[ev] || []).forEach((fn) => fn(data));
  SC.log = (kind, text, icon) => {
    const e = { kind, text, icon: icon || 'i-info', time: SC.fmtTime(S.minute), id: Math.random() };
    S.events.unshift(e);
    if (S.events.length > 60) S.events.pop();
    SC.emit('event', e);
  };

  // ---------- Faults & maintenance ----------
  SC.FAULTS = [
    { type: 'Lamp failure', sev: 'critical' },
    { type: 'LED driver overheating', sev: 'serious' },
    { type: 'Communication lost', sev: 'warning' },
    { type: 'Voltage fluctuation', sev: 'warning' },
  ];
  let alertSeq = 1;

  SC.raiseFault = (l, f) => {
    if (!l || l.status !== 'ok') return null;
    f = f || SC.FAULTS[Math.floor(Math.random() * SC.FAULTS.length)];
    l.status = 'fault';
    l.override = null;
    const a = {
      id: alertSeq++, lightId: l.id, zone: l.zone, type: f.type, sev: f.sev,
      time: `D${S.day} ${SC.fmtTime(S.minute)}`, status: 'open', crew: null, queued: false,
    };
    l.fault = a;
    S.alerts.unshift(a);
    SC.log('critical', `${f.type} at ${l.id} (${SC.zoneById(l.zone).name})`, 'i-alert');
    SC.emit('fault', a);
    if (S.autoDispatch) SC.dispatch(a, true);
    return a;
  };

  function routeTo(l) {
    const d = SC.DEPOT;
    if (l.axis === 'h') return [{ x: d.x, y: d.y }, { x: d.x, y: l.road }, { x: l.x, y: l.road }];
    return [{ x: d.x, y: d.y }, { x: l.road, y: d.y }, { x: l.road, y: l.y }];
  }

  SC.dispatch = (a, auto) => {
    if (a.status !== 'open') return false;
    const crew = S.crews.find((c) => c.state === 'idle');
    if (!crew) {
      if (!a.queued) SC.log('warning', `All crews busy. ${a.lightId} queued for repair`, 'i-truck');
      a.queued = true;
      return false;
    }
    const l = SC.lights.find((x) => x.id === a.lightId);
    a.status = 'dispatched';
    a.crew = crew.id;
    a.queued = false;
    Object.assign(crew, { state: 'enroute', alert: a, light: l, path: routeTo(l), seg: 0, t: 0, x: SC.DEPOT.x, y: SC.DEPOT.y, repair: 0 });
    SC.log('info', `${crew.id} ${auto ? 'auto-' : ''}dispatched to ${l.id}`, 'i-truck');
    SC.emit('alerts');
    return true;
  };

  function moveAlong(c, dist) {
    while (dist > 0 && c.seg < c.path.length - 1) {
      const a = c.path[c.seg], b = c.path[c.seg + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const remain = len * (1 - c.t);
      if (dist >= remain) {
        dist -= remain;
        c.seg++;
        c.t = 0;
      } else {
        c.t += dist / len;
        dist = 0;
      }
    }
    const a = c.path[Math.min(c.seg, c.path.length - 1)];
    const b = c.path[Math.min(c.seg + 1, c.path.length - 1)];
    c.x = a.x + (b.x - a.x) * c.t;
    c.y = a.y + (b.y - a.y) * c.t;
    c.dir = Math.atan2(b.y - a.y, b.x - a.x);
    return c.seg >= c.path.length - 1;
  }

  const CREW_SPEED = 170;
  const REPAIR_SECONDS = 4;
  function updateCrews(dt) {
    S.crews.forEach((c) => {
      if (c.state === 'enroute') {
        if (moveAlong(c, CREW_SPEED * dt)) {
          c.state = 'repairing';
          c.repair = 0;
          c.alert.status = 'repairing';
          c.light.status = 'maint';
          SC.log('warning', `${c.id} repairing ${c.light.id}`, 'i-wrench');
          SC.emit('alerts');
        }
      } else if (c.state === 'repairing') {
        c.repair += dt / REPAIR_SECONDS;
        c.light.repair = c.repair;
        if (c.repair >= 1) {
          c.light.status = 'ok';
          c.light.fault = null;
          c.light.repair = 0;
          c.alert.status = 'resolved';
          c.alert.resolved = `D${S.day} ${SC.fmtTime(S.minute)}`;
          SC.log('good', `${c.light.id} repaired by ${c.id}`, 'i-check');
          SC.emit('repaired', c.alert);
          c.state = 'returning';
          c.path = c.path.slice().reverse();
          c.seg = 0;
          c.t = 0;
          SC.emit('alerts');
        }
      } else if (c.state === 'returning') {
        if (moveAlong(c, CREW_SPEED * dt)) {
          Object.assign(c, { state: 'idle', alert: null, light: null, path: null });
          SC.emit('alerts');
        }
      }
    });
    // pick up queued work
    if (S.crews.some((c) => c.state === 'idle')) {
      const q = S.alerts.filter((a) => a.status === 'open' && (a.queued || S.autoDispatch)).pop();
      if (q) SC.dispatch(q, true);
    }
  }

  // ---------- Traffic ----------
  const NV = SC.ROADS_V.length, NH = SC.ROADS_H.length;
  const nodePos = (n) => ({ x: SC.ROADS_V[n.i], y: SC.ROADS_H[n.j] });
  function neighbours(n) {
    const out = [];
    if (n.i > 0) out.push({ i: n.i - 1, j: n.j });
    if (n.i < NV - 1) out.push({ i: n.i + 1, j: n.j });
    if (n.j > 0) out.push({ i: n.i, j: n.j - 1 });
    if (n.j < NH - 1) out.push({ i: n.i, j: n.j + 1 });
    return out;
  }
  const CAR_COLORS = ['#475467', '#2a78d6', '#d14343', '#e3a008', '#0e9384', '#7a5af8', '#98a2b3', '#344054'];
  function spawn(type) {
    const from = { i: Math.floor(Math.random() * NV), j: Math.floor(Math.random() * NH) };
    const nb = neighbours(from);
    const to = nb[Math.floor(Math.random() * nb.length)];
    const ped = type === 'ped';
    const bus = !ped && Math.random() < 0.12;
    S.vehicles.push({
      type: ped ? 'ped' : bus ? 'bus' : 'car',
      from, to, t: Math.random(),
      speed: ped ? 10 + Math.random() * 8 : bus ? 55 + Math.random() * 15 : 70 + Math.random() * 50,
      color: ped ? '#475467' : bus ? '#f79009' : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      fade: 0, leaving: false,
    });
  }
  // traffic signals: each junction alternates green between the two axes
  SC.SIGNAL_PERIOD = 5;
  SC.signalGreen = (i, j, now) => (Math.floor(now / SC.SIGNAL_PERIOD + (i * 0.37 + j * 0.61)) % 2 === 0 ? 'h' : 'v');
  const STOP_T = 0.86;

  function updateTraffic(dt, now) {
    const f = SC.traffic(S.minute);
    const wantCars = Math.round(4 + 18 * f);
    const wantPeds = Math.round(2 + 7 * f * (S.weather === 'rain' ? 0.4 : 1));
    const cars = S.vehicles.filter((v) => v.type !== 'ped' && !v.leaving).length;
    const peds = S.vehicles.filter((v) => v.type === 'ped' && !v.leaving).length;
    if (cars < wantCars && Math.random() < dt * 3) spawn('car');
    if (peds < wantPeds && Math.random() < dt * 2) spawn('ped');

    for (let k = S.vehicles.length - 1; k >= 0; k--) {
      const v = S.vehicles[k];
      v.fade = v.leaving ? v.fade - dt * 2 : Math.min(1, v.fade + dt * 2);
      if (v.leaving && v.fade <= 0) { S.vehicles.splice(k, 1); continue; }
      const a = nodePos(v.from), b = nodePos(v.to);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let nt = v.t + (v.speed * dt) / len;
      if (v.type !== 'ped') {
        // stop at a red signal, and queue behind the car in front
        const axis = a.y === b.y ? 'h' : 'v';
        if (v.t <= STOP_T && nt > STOP_T && SC.signalGreen(v.to.i, v.to.j, now) !== axis) nt = STOP_T;
        const gap = 17 / len;
        for (const o of S.vehicles) {
          if (o === v || o.type === 'ped' || o.from.i !== v.from.i || o.from.j !== v.from.j || o.to.i !== v.to.i || o.to.j !== v.to.j) continue;
          if (o.t > v.t && nt > o.t - gap) nt = Math.max(v.t, o.t - gap);
        }
        v.stopped = nt === v.t;
      }
      v.t = nt;
      if (v.t >= 1) {
        const isPed = v.type === 'ped';
        const live = S.vehicles.filter((o) => (o.type === 'ped') === isPed && !o.leaving).length;
        if (live > (isPed ? wantPeds : wantCars)) v.leaving = true;
        const nb = neighbours(v.to).filter((n) => !(n.i === v.from.i && n.j === v.from.j));
        v.from = v.to;
        v.to = nb[Math.floor(Math.random() * nb.length)];
        v.t = 0;
      }
      // keep to the left (Indian traffic): offset perpendicular to direction
      const p = nodePos(v.from), q = nodePos(v.to);
      const dx = Math.sign(q.x - p.x), dy = Math.sign(q.y - p.y);
      const off = v.type === 'ped' ? 17 : 7;
      v.x = p.x + (q.x - p.x) * v.t + dy * off;
      v.y = p.y + (q.y - p.y) * v.t - dx * off;
      v.dir = Math.atan2(dy, dx);
    }
  }

  function detectMotion(now) {
    const vs = S.vehicles;
    for (const l of SC.lights) {
      for (const v of vs) {
        const r = v.type === 'ped' ? 40 : 65;
        const dx = v.x - l.x, dy = v.y - l.y;
        if (dx * dx + dy * dy < r * r) { l.motion = now + 1.5; break; }
      }
    }
  }

  // ---------- History seeding (model estimate for hours before start) ----------
  function estimateHour(h, weather) {
    let smart = 0, base = 0;
    const m = h * 60 + 30;
    const dark = darknessFromLux(luxAt(m, weather));
    const motionShare = Math.min(0.8, 0.1 + 0.45 * SC.traffic(m));
    SC.lights.forEach((l) => {
      const z = SC.zoneById(l.zone);
      let lvl = 0;
      if (dark > 0.02) {
        let b = z.base;
        const rule = S.rules.find((r) => r.zone === z.id && SC.inWindow(m, r.from, r.to));
        if (rule) b = rule.action === 'off' ? 0 : rule.level;
        lvl = (b > 0 ? b * (1 - motionShare) + 100 * motionShare : 0) * Math.min(1, dark * 1.4);
      }
      smart += SC.STANDBY_W + (SC.RATED_W * lvl) / 100;
      if (SC.baselineOn(m)) base += SC.BASELINE_W;
    });
    return { smart: smart / 1000, base: base / 1000 };
  }
  (function seed() {
    for (let h = 0; h < 18; h++) {
      const e = estimateHour(h, 'clear');
      S.hourly.smart[h] = e.smart;
      S.hourly.base[h] = e.base;
    }
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().getDay();
    let daySmart = 0, dayBase = 0;
    for (let h = 0; h < 24; h++) {
      const e = estimateHour(h, 'clear');
      daySmart += e.smart;
      dayBase += e.base;
    }
    for (let d = 6; d >= 1; d--) {
      const jitter = 0.9 + Math.random() * 0.2;
      S.week.push({ label: names[(today - d + 7) % 7], smart: daySmart * jitter, base: dayBase });
    }
    S.todayLabel = names[today];
  })();

  // ---------- Main step ----------
  let faultClock = 0;
  SC.step = (dt, now) => {
    const simDt = dt * S.speed; // simulated minutes elapsed
    const running = S.speed > 0;

    if (running) {
      S.minute += simDt;
      if (S.minute >= 1440) {
        const smart = S.hourly.smart.reduce((a, b) => a + b, 0);
        const base = S.hourly.base.reduce((a, b) => a + b, 0);
        S.week.push({ label: S.todayLabel, smart, base });
        if (S.week.length > 6) S.week.shift();
        const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        S.todayLabel = names[(names.indexOf(S.todayLabel) + 1) % 7];
        S.minute -= 1440;
        S.day++;
        S.hourly.smart.fill(0);
        S.hourly.base.fill(0);
        SC.lights.forEach((l) => (l.energyWh = 0));
        SC.log('info', `Day ${S.day} started. Daily energy report saved`, 'i-chart');
        SC.emit('newday');
      }
    }

    const s = sun(S.minute);
    S.lux = luxAt(S.minute, S.weather);
    S.darkness = darknessFromLux(S.lux);
    S.night = 1 - clamp((s + 0.12) / 0.32, 0, 1);
    S.dusk = clamp(1 - Math.abs(s) / 0.18, 0, 1);

    const ctx = {
      now,
      darkness: S.darkness,
      rules: activeRules(),
      lateNight: S.minute < 5 * 60,
      badWeather: S.weather === 'rain' || S.weather === 'fog',
    };

    if (running) {
      updateTraffic(dt, now);
      updateCrews(dt);
    }
    detectMotion(now);

    const hour = Math.floor(S.minute / 60) % 24;
    let watts = 0;
    for (const l of SC.lights) {
      const z = SC.zoneById(l.zone);
      const tgt = targetLevel(l, z, ctx);
      // ramp up fast, fade down gently
      const rate = tgt > l.level ? 6 : 1.8;
      l.level += (tgt - l.level) * Math.min(1, dt * rate);
      if (Math.abs(tgt - l.level) < 0.05) l.level = tgt;
      const p = SC.lightPower(l);
      watts += p;
      if (running) {
        const wh = (p * simDt) / 60;
        l.energyWh += wh;
        S.hourly.smart[hour] += wh / 1000;
        if (SC.baselineOn(S.minute)) S.hourly.base[hour] += (SC.BASELINE_W * simDt) / 60 / 1000;
      }
    }
    S.watts = watts;

    // random faults: ~2 per simulated day across the city
    if (running) {
      faultClock += simDt;
      while (faultClock >= 1) {
        faultClock -= 1;
        if (Math.random() < 2.2 / 1440) {
          const ok = SC.lights.filter((l) => l.status === 'ok');
          SC.raiseFault(ok[Math.floor(Math.random() * ok.length)]);
        }
      }
    }
  };

  SC.totals = () => {
    const smart = S.hourly.smart.reduce((a, b) => a + b, 0);
    const base = S.hourly.base.reduce((a, b) => a + b, 0);
    return { smart, base, saved: Math.max(0, base - smart) };
  };
  SC.CO2_PER_KWH = 0.82; // kg, Indian grid average
  SC.TARIFF = 8; // ₹ per kWh
})();
