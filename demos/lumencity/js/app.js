/* =========================================================
   app.js — boot sequence and main animation loop
   ========================================================= */
(function () {
  const SC = window.SC;
  const S = SC.state;

  const BOOT = [
    `Connecting to ${SC.lights.length} street-light nodes`,
    'Reading ambient light sensors',
    'Calibrating motion sensors',
    'Loading zone policies and schedules',
    'Starting live city simulation',
  ];
  const STEP_MS = 420;

  let started = false;
  function start() {
    if (started) return;
    started = true;
    document.getElementById('splash').classList.add('hide');
    SC.map.resize();
    S.speed = 10;
    SC.log('good', `Control centre online. ${SC.lights.length} nodes connected`, 'i-check');
    SC.ui.toast('Control centre online', 'Sunset is near. Watch the street lights switch on.', 'info', 'i-bulb');
    // show the fault workflow early in a demo
    setTimeout(() => {
      const dt = SC.lights.filter((l) => l.zone === 'downtown' && l.status === 'ok');
      SC.raiseFault(dt[Math.floor(Math.random() * dt.length)], SC.FAULTS[0]);
    }, 9000);
  }

  function runBoot() {
    const list = document.getElementById('boot');
    const bar = document.getElementById('splashBar');
    BOOT.forEach((msg, i) => {
      setTimeout(() => {
        const prev = list.lastElementChild;
        if (prev) prev.className = 'done';
        const li = document.createElement('li');
        li.className = 'run';
        li.innerHTML = `<span class="bi"><svg><use href="#i-check"/></svg></span>${msg}`;
        list.appendChild(li);
        bar.style.width = ((i + 1) / (BOOT.length + 1)) * 100 + '%';
      }, 700 + i * STEP_MS);
    });
    setTimeout(() => {
      const last = list.lastElementChild;
      if (last) last.className = 'done';
      bar.style.width = '100%';
    }, 700 + BOOT.length * STEP_MS);
    setTimeout(start, 700 + BOOT.length * STEP_MS + 500);
  }

  function boot() {
    S.speed = 0; // hold the clock while the splash plays
    SC.map.init(document.getElementById('cityCanvas'));
    SC.ui.init();
    runBoot();
    document.getElementById('splash').addEventListener('click', start);

    let last = performance.now();
    function frame(t) {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const now = t / 1000;
      try {
        SC.step(dt, now);
        SC.map.draw(now, dt);
        SC.ui.frame(now);
      } catch (err) {
        console.error(err);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
