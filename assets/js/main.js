/* ==========================================================================
   Prathmesh Sadaphule — portfolio
   Motion runs on GSAP + ScrollTrigger with Lenis smooth scrolling. If the CDN
   scripts fail to load (or the visitor prefers reduced motion), a plain
   IntersectionObserver fallback reveals the same elements with CSS.
   ========================================================================== */

(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const hasGsap = Boolean(window.gsap && window.ScrollTrigger) && !reduceMotion;
  let lenis = null;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---------- Theme ---------- */
  const themeBtn = $('.theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      // Dark is the default; light is opt-in.
      const current = root.dataset.theme || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      themeBtn.setAttribute('aria-label', `Switch to ${current} theme`);
      try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked */ }
      window.dispatchEvent(new Event('themechange'));
    });
  }

  /* ---------- Text roll: duplicate the label so hover can swap it ---------- */
  $$('[data-roll]').forEach(el => {
    const text = el.textContent.trim();
    if (!text) return;
    const top = document.createElement('span');
    const bottom = document.createElement('span');
    top.textContent = text;
    bottom.textContent = text;
    bottom.setAttribute('aria-hidden', 'true');
    const roll = document.createElement('span');
    roll.className = 'roll';
    roll.append(top, bottom);
    el.replaceChildren(roll);
  });

  /* ---------- Split big type into letters (kept inside word wrappers so
     lines can only break between words) ---------- */
  $$('[data-chars]').forEach(el => {
    const walk = node => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) { walk(child); return; }
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) return;
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const word = document.createElement('span');
          word.className = 'wd';
          for (const c of part) {
            const ch = document.createElement('span');
            ch.className = 'ch';
            ch.textContent = c;
            word.appendChild(ch);
          }
          frag.appendChild(word);
        });
        node.replaceChild(frag, child);
      });
    };
    walk(el);
  });

  /* ---------- Hero name: letters near the cursor grow wider and heavier ---------- */
  const flex = $('[data-flex]');
  if (flex && finePointer && !reduceMotion) {
    const letters = $$('.ch', flex);
    const BASE = { wdth: 116, wght: 800 }, PEAK = { wdth: 125, wght: 900 }, REACH = 280;
    const state = letters.map(() => ({ wdth: BASE.wdth, wght: BASE.wght }));
    const pointer = { x: 0, y: 0, active: false };
    let raf = 0;
    const step = () => {
      const rects = letters.map(l => l.getBoundingClientRect());
      let moving = false;
      letters.forEach((l, i) => {
        const r = rects[i];
        const d = Math.hypot(r.left + r.width / 2 - pointer.x, r.top + r.height / 2 - pointer.y);
        const k = pointer.active ? Math.max(0, 1 - d / REACH) ** 2 : 0;
        const s = state[i];
        const tw = BASE.wdth + (PEAK.wdth - BASE.wdth) * k;
        const tg = BASE.wght + (PEAK.wght - BASE.wght) * k;
        s.wdth += (tw - s.wdth) * .14;
        s.wght += (tg - s.wght) * .14;
        if (Math.abs(tw - s.wdth) > .05 || Math.abs(tg - s.wght) > .5) moving = true;
        l.style.fontVariationSettings = `"wdth" ${s.wdth.toFixed(1)}, "wght" ${Math.round(s.wght)}`;
      });
      raf = moving || pointer.active ? requestAnimationFrame(step) : 0;
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(step); };
    const hero = flex.closest('.hero') || flex;
    hero.addEventListener('mousemove', e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; wake(); });
    hero.addEventListener('mouseleave', () => { pointer.active = false; wake(); });
  }

  /* ---------- Hero dot field: a grid that parts around the cursor ---------- */
  const field = $('.hero-field');
  if (field && field.getContext) {
    const ctx = field.getContext('2d');
    const GAP = 30, RADIUS = 160;
    const mouse = { x: -9999, y: -9999 };
    let w = 0, h = 0, pts = [], colors = {}, visible = true, running = false;
    const start = performance.now();

    const readColors = () => {
      const cs = getComputedStyle(root);
      colors = { dot: cs.getPropertyValue('--muted').trim(), accent: cs.getPropertyValue('--accent').trim() };
    };
    const resize = () => {
      const r = field.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      field.width = Math.round(w * dpr);
      field.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = [];
      for (let y = GAP / 2; y < h; y += GAP) {
        for (let x = GAP / 2; x < w; x += GAP) pts.push({ x, y, ox: 0, oy: 0 });
      }
    };
    const draw = now => {
      const t = reduceMotion ? 0 : (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d = Math.hypot(dx, dy);
        const k = d < RADIUS ? 1 - d / RADIUS : 0;
        const push = k * k * 20;
        p.ox += ((d ? dx / d : 0) * push - p.ox) * .12;
        p.oy += ((d ? dy / d : 0) * push - p.oy) * .12;
        const wave = (Math.sin(p.x * .011 + p.y * .007 - t * 1.1) + 1) / 2;
        const alpha = .12 + wave * .26;
        if (k > .02) {
          ctx.fillStyle = colors.accent;
          ctx.globalAlpha = Math.min(1, alpha + k);
        } else {
          ctx.fillStyle = colors.dot;
          ctx.globalAlpha = alpha;
        }
        ctx.beginPath();
        ctx.arc(p.x + p.ox, p.y + p.oy, 1.1 + k * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const loop = now => {
      if (!visible) { running = false; return; }
      draw(now);
      requestAnimationFrame(loop);
    };
    const kick = () => {
      if (reduceMotion) { draw(0); return; }
      if (!running && visible) { running = true; requestAnimationFrame(loop); }
    };

    readColors();
    resize();
    kick();
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { resize(); kick(); }, 150); });
    window.addEventListener('themechange', () => { readColors(); kick(); });
    if (finePointer) {
      window.addEventListener('mousemove', e => {
        const r = field.getBoundingClientRect();
        mouse.x = e.clientX - r.left;
        mouse.y = e.clientY - r.top;
      }, { passive: true });
      document.addEventListener('mouseleave', () => { mouse.x = mouse.y = -9999; });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; kick(); }).observe(field);
    }
  }

  /* ---------- Header: border, hide on scroll down, progress ---------- */
  const header = $('.site-header');
  const progress = $('.progress');
  const navList = $('.nav-list');
  let lastY = window.scrollY;
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    header.classList.toggle('is-scrolled', y > 8);
    const menuOpen = navList && navList.classList.contains('is-open');
    if (!menuOpen && !document.body.classList.contains('lb-open')) {
      header.classList.toggle('is-hidden', y > 240 && y > lastY + 2);
      if (y < lastY - 2) header.classList.remove('is-hidden');
    }
    if (progress) progress.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
    lastY = y;
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  const menuBtn = $('.menu-toggle');
  function setMenu(open) {
    navList.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (lenis) open ? lenis.stop() : lenis.start();
  }
  if (menuBtn && navList) {
    menuBtn.addEventListener('click', () => setMenu(!navList.classList.contains('is-open')));
    $$('.nav-link', navList).forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && navList.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); }
    });
  }

  /* ---------- Active nav link ---------- */
  const sectionLinks = $$('.nav-link[href^="#"]');
  if (sectionLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(sectionLinks.map(a => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        sectionLinks.forEach(a => a.classList.remove('is-active'));
        const link = byId.get(entry.target.id);
        if (link) link.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* ---------- Small details ---------- */
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  const clock = $('[data-clock]');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
    const tick = () => { clock.textContent = fmt.format(new Date()); };
    tick();
    setInterval(tick, 20000);
  }

  $$('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const label = btn.querySelector('span');
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.classList.add('is-done');
        label.textContent = 'Copied';
      } catch (e) {
        label.textContent = 'Press Ctrl+C';
      }
      setTimeout(() => { btn.classList.remove('is-done'); label.textContent = 'Copy'; }, 2000);
    });
  });

  /* ---------- Contact form (Formspree) ---------- */
  const form = $('#contact-form');
  if (form) {
    const status = $('.form-status', form);
    const submit = $('button[type="submit"]', form);
    const submitHTML = submit.innerHTML;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const rules = {
      name: v => v.length >= 2 || 'Please tell me your name.',
      email: v => emailRe.test(v) || 'That email address doesn’t look right.',
      message: v => v.length >= 10 || 'A little more detail, please (10+ characters).',
    };

    function setError(field, msg) {
      const wrap = field.closest('.field');
      const out = $('.field-error', wrap);
      wrap.classList.toggle('has-error', Boolean(msg));
      field.setAttribute('aria-invalid', msg ? 'true' : 'false');
      out.textContent = msg || '';
    }

    function validate() {
      let firstBad = null;
      Object.entries(rules).forEach(([name, check]) => {
        const field = form.elements[name];
        const result = check(field.value.trim());
        setError(field, result === true ? '' : result);
        if (result !== true && !firstBad) firstBad = field;
      });
      if (firstBad) firstBad.focus();
      return !firstBad;
    }

    Object.keys(rules).forEach(name => {
      form.elements[name].addEventListener('input', e => {
        if (e.target.closest('.field').classList.contains('has-error')) {
          const result = rules[name](e.target.value.trim());
          setError(e.target, result === true ? '' : result);
        }
      });
    });

    function showStatus(kind, html) {
      status.className = `form-status is-visible ${kind}`;
      status.innerHTML = html;
    }

    function mailtoFallback() {
      const to = form.dataset.email;
      const subject = encodeURIComponent(form.elements.subject.value.trim() || 'Hello from your portfolio');
      const body = encodeURIComponent(`${form.elements.message.value.trim()}\n\n${form.elements.name.value.trim()}\n${form.elements.email.value.trim()}`);
      return `mailto:${to}?subject=${subject}&body=${body}`;
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      status.className = 'form-status';
      if (!validate()) return;

      // Bots fill the hidden field; humans never see it.
      if (form.elements._gotcha.value) { form.reset(); return; }

      submit.disabled = true;
      submit.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending…';

      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const name = form.elements.name.value.trim().split(' ')[0];
          form.reset();
          showStatus('ok', `Thanks, ${name.replace(/[<>&"]/g, '')}. Your message reached my inbox and I’ll reply to the email you gave.`);
        } else {
          const data = await res.json().catch(() => ({}));
          const reason = data.errors ? data.errors.map(x => x.message).join(' ') : 'The form service returned an error.';
          showStatus('err', `${reason} You can <a href="${mailtoFallback()}">send it by email instead</a>.`);
        }
      } catch (err) {
        showStatus('err', `Couldn’t reach the form service. Check your connection, or <a href="${mailtoFallback()}">send it by email instead</a>.`);
      } finally {
        submit.disabled = false;
        submit.innerHTML = submitHTML;
      }
    });
  }

  /* ---------- Lightbox for case-study galleries ---------- */
  const galleryButtons = $$('[data-gallery] button[data-full]');
  if (galleryButtons.length) {
    const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Screenshot viewer');
    lb.innerHTML = `
      <div class="lb-top"><span class="lb-count"></span>
        <button class="lb-btn" data-lb="close" aria-label="Close">${icon('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>
      <div class="lb-stage"><img alt=""></div>
      <div class="lb-bottom"><p class="lb-caption"></p>
        <div class="lb-nav">
          <button class="lb-btn" data-lb="prev" aria-label="Previous">${icon('<path d="M15 6l-6 6 6 6"/>')}</button>
          <button class="lb-btn" data-lb="next" aria-label="Next">${icon('<path d="M9 6l6 6-6 6"/>')}</button>
        </div></div>`;
    document.body.appendChild(lb);
    const img = $('img', lb), cap = $('.lb-caption', lb), count = $('.lb-count', lb);
    let items = [], index = 0, opener = null;

    function render() {
      const b = items[index];
      img.style.animation = 'none';
      void img.offsetWidth;
      img.style.animation = '';
      img.src = b.dataset.full;
      img.alt = b.querySelector('img').alt;
      cap.textContent = b.dataset.caption || img.alt;
      count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    }
    function open(btn) {
      items = $$('button[data-full]', btn.closest('[data-gallery]'));
      index = items.indexOf(btn);
      opener = btn;
      render();
      lb.classList.add('is-open');
      document.body.classList.add('lb-open');
      if (lenis) lenis.stop();
      $('[data-lb="close"]', lb).focus();
    }
    function close() {
      lb.classList.remove('is-open');
      document.body.classList.remove('lb-open');
      if (lenis) lenis.start();
      if (opener) opener.focus();
    }
    const step = d => { index = (index + d + items.length) % items.length; render(); };

    galleryButtons.forEach(b => b.addEventListener('click', () => open(b)));
    lb.addEventListener('click', e => {
      const action = e.target.closest('[data-lb]')?.dataset.lb;
      if (action === 'close' || e.target.classList.contains('lb-stage')) close();
      else if (action === 'prev') step(-1);
      else if (action === 'next') step(1);
    });
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'Tab') {
        const f = $$('button', lb);
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  }

  /* ---------- Motion ---------- */
  if (hasGsap) initGsap();
  else initFallback();

  function initFallback() {
    root.classList.remove('preload', 'pt-in');
    try { sessionStorage.setItem('seen', '1'); } catch (e) { /* storage blocked */ }
    requestAnimationFrame(() => root.classList.add('is-loaded'));
    const els = $$('[data-reveal]');
    if (!('IntersectionObserver' in window) || reduceMotion) {
      els.forEach(el => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      });
    }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
  }

  // Wrap each word in two spans so it can rise out of a mask. Keeps inline
  // elements like <em> intact by recursing into them.
  function splitWords(el) {
    const walk = node => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parts = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const outer = document.createElement('span');
            outer.className = 'split-word';
            const inner = document.createElement('span');
            inner.textContent = part;
            outer.appendChild(inner);
            frag.appendChild(outer);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    walk(el);
    $$('.split-word', el).forEach(w => w.setAttribute('aria-hidden', 'true'));
    return $$('.split-word > span', el);
  }

  function initGsap() {
    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);
    root.classList.add('has-gsap');

    /* Smooth scroll */
    if (window.Lenis) {
      lenis = new window.Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(time => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);

      $$('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
          const id = a.getAttribute('href');
          const target = id === '#' || id === '#top' ? 0 : $(id);
          if (target === null) return;
          e.preventDefault();
          lenis.scrollTo(target, { offset: target === 0 ? 0 : -(header.offsetHeight + 12), duration: 1.4 });
          if (target !== 0) history.replaceState(null, '', id);
        });
      });
    }

    /* Intro: hero (home) or title block (case study) */
    const titleLines = $$('.hero-name .line > span, .cs-title .line > span');
    const titleChars = $$('.hero-name .ch, .cs-title .ch');
    const fades = $$('.hero [data-fade], .cs-hero [data-fade]');
    // Pre-set the hidden state so nothing flashes while the preloader runs.
    // The lines drop their CSS pre-hide (y: 0 stops GSAP reading it in as pixels)
    // and the letters take over, each one tucked below its line's mask.
    gsap.set(titleLines, { y: 0, yPercent: 0 });
    gsap.set(titleChars, { yPercent: 115, rotate: 4 });
    gsap.set(fades, { autoAlpha: 0, y: 18 });
    function playIntro() {
      const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
      if (titleChars.length) intro.to(titleChars, { yPercent: 0, rotate: 0, duration: 1.4, stagger: .028 });
      if ($('.hero-rule')) intro.fromTo('.hero-rule', { scaleX: 0 }, { scaleX: 1, duration: 1.5, ease: 'expo.inOut' }, .25);
      if (fades.length) intro.to(fades, { autoAlpha: 1, y: 0, duration: 1.1, stagger: .07 }, .55);
    }
    const markSeen = () => { try { sessionStorage.setItem('seen', '1'); } catch (e) { /* storage blocked */ } };

    /* Preloader (first visit), curtain (arriving from another page), or straight in */
    const preloader = $('.preloader');
    const curtain = $('.curtain');
    if (root.classList.contains('preload') && preloader) {
      if (lenis) lenis.stop();
      const num = $('.pl-num', preloader);
      const bar = $('.pl-bar i', preloader);
      const count = { v: 0 };
      gsap.timeline()
        .to(count, { v: 100, duration: 1.6, ease: 'power2.inOut', onUpdate: () => { num.textContent = Math.round(count.v); } }, 0)
        .to(bar, { scaleX: 1, duration: 1.6, ease: 'power2.inOut' }, 0)
        .to(preloader, { yPercent: -100, duration: 1.1, ease: 'expo.inOut' }, '+=.15')
        .add(playIntro, '-=.55')
        .add(() => {
          root.classList.remove('preload');
          gsap.set(preloader, { clearProps: 'all' });
          if (lenis) lenis.start();
          markSeen();
        });
    } else if (root.classList.contains('pt-in') && curtain) {
      gsap.to(curtain, {
        yPercent: -100, duration: .9, ease: 'expo.inOut', delay: .05,
        onComplete: () => { root.classList.remove('pt-in'); gsap.set(curtain, { clearProps: 'all' }); },
      });
      gsap.delayedCall(.45, playIntro);
      markSeen();
    } else {
      gsap.delayedCall(.1, playIntro);
      markSeen();
    }

    /* Page transitions: the curtain covers the screen before leaving */
    if (curtain) {
      $$('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || /^(mailto|tel):/.test(href) || a.target === '_blank' || a.hasAttribute('download')) return;
        const url = new URL(href, location.href);
        if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
        a.addEventListener('click', e => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          try { sessionStorage.setItem('pt', '1'); } catch (err) { /* storage blocked */ }
          if (lenis) lenis.stop();
          gsap.fromTo(curtain, { y: 0, yPercent: 100 }, {
            yPercent: 0, duration: .75, ease: 'expo.inOut',
            onComplete: () => { location.href = url.href; },
          });
        });
      });
      // Back/forward cache restores the page with the curtain still down.
      window.addEventListener('pageshow', e => {
        if (!e.persisted) return;
        gsap.set(curtain, { clearProps: 'all' });
        root.classList.remove('pt-in');
        if (lenis) lenis.start();
      });
    }

    /* Hero name drifts apart as you scroll away */
    if ($('.hero')) {
      const scrub = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: .6 };
      gsap.to('.hero-name .line:nth-child(1)', { xPercent: -6, ease: 'none', scrollTrigger: scrub });
      gsap.to('.hero-name .line:nth-child(2)', { xPercent: 5, ease: 'none', scrollTrigger: { ...scrub } });
      gsap.to('.hero-grid', { yPercent: -12, autoAlpha: .25, ease: 'none', scrollTrigger: { ...scrub } });
    }

    /* Headings: word-by-word rise */
    $$('[data-split]').forEach(el => {
      const words = splitWords(el);
      gsap.fromTo(words, { yPercent: 115 }, {
        yPercent: 0, duration: 1.25, ease: 'expo.out', stagger: .045,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    /* Generic fade-up, batched so neighbours stagger together */
    ScrollTrigger.batch('[data-reveal]:not([data-reveal="mask"])', {
      start: 'top 90%',
      once: true,
      onEnter: batch => gsap.fromTo(batch, { autoAlpha: 0, y: 34 }, {
        autoAlpha: 1, y: 0, duration: 1.15, ease: 'expo.out', stagger: .08, overwrite: true,
      }),
    });

    /* Lists (rows, education, toolkit…): children rise in sequence */
    $$('[data-stagger]').forEach(list => {
      gsap.fromTo(list.children, { autoAlpha: 0, y: 28 }, {
        autoAlpha: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: .07,
        scrollTrigger: { trigger: list, start: 'top 88%', once: true },
      });
    });

    /* Project frames: curtain reveal, then the screenshot parallaxes inside */
    $$('[data-reveal="mask"]').forEach(el => {
      const pic = $('.frame-img img', el) || $('img', el);
      gsap.fromTo(el, { clipPath: 'inset(0% 0% 100% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'expo.inOut',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      });
      if (pic) {
        gsap.fromTo(pic, { scale: 1.22 }, {
          scale: 1.06, duration: 1.9, ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        });
        gsap.fromTo(pic, { yPercent: -2.5 }, {
          yPercent: 2.5, ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      }
    });

    /* Numbers count up */
    $$('[data-count]').forEach(el => {
      const end = parseFloat(el.dataset.count);
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const fmt = v => prefix + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
      const state = { v: 0 };
      el.textContent = fmt(0);
      gsap.to(state, {
        v: end, duration: 1.8, ease: 'power3.out',
        onUpdate: () => { el.textContent = fmt(state.v); },
        scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      });
    });

    /* Rules draw across */
    $$('[data-line]').forEach(el => {
      gsap.fromTo(el, { scaleX: 0 }, {
        scaleX: 1, transformOrigin: 'left center', duration: 1.4, ease: 'expo.inOut',
        scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      });
    });

    /* Project cards: content rises in, then each card sinks back as the next stacks over it */
    const cards = $$('.pcard');
    cards.forEach(card => {
      const body = $$('.pcard-body > *', card);
      const visual = $('.pcard-visual', card);
      const st = { trigger: card, start: 'top 78%', once: true };
      gsap.fromTo(body, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: .06, scrollTrigger: st });
      if (visual) {
        gsap.fromTo(visual, { clipPath: 'inset(100% 0% 0% 0% round 14px)' }, {
          clipPath: 'inset(0% 0% 0% 0% round 14px)', duration: 1.4, ease: 'expo.inOut', scrollTrigger: { ...st },
        });
        const media = $('img, svg', visual);
        if (media) gsap.fromTo(media, { scale: 1.18 }, { scale: 1, duration: 1.8, ease: 'expo.out', scrollTrigger: { ...st } });
      }
    });
    gsap.matchMedia().add('(min-width: 901px)', () => {
      cards.forEach((card, i) => {
        const next = cards[i + 1];
        if (!next) return;
        const stickTop = () => header.offsetHeight + 16 + (i + 1) * 14;
        gsap.timeline({
          scrollTrigger: { trigger: next, start: 'top bottom', end: () => `top ${stickTop()}px`, scrub: true },
        })
          .to($('.pcard-inner', card), { scale: .92, ease: 'none' }, 0)
          .to($('.pcard-shade', card), { opacity: .6, ease: 'none' }, 0);
      });
    });

    /* Marquee: endless loop that speeds up with scroll velocity */
    const track = $('.marquee-track');
    if (track) {
      const loop = gsap.to(track, { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
      let boost = 0, speed = 1;
      ScrollTrigger.create({
        trigger: '.marquee', start: 'top bottom', end: 'bottom top',
        onUpdate: self => { boost = Math.min(Math.abs(self.getVelocity()) / 220, 7); },
      });
      gsap.ticker.add(() => {
        speed += (1 + boost - speed) * .08;
        boost *= .9;
        loop.timeScale(speed);
      });
    }

    /* Oversized footer name slides up as the page ends */
    const bigChars = $$('.footer-big .ch');
    if (bigChars.length) {
      gsap.fromTo(bigChars, { yPercent: 105 }, {
        yPercent: 0, ease: 'none', stagger: .05,
        scrollTrigger: { trigger: '.site-footer', start: 'top bottom', end: 'bottom bottom', scrub: true },
      });
    }

    /* Long statements light up word by word as they scroll through */
    $$('[data-scrub-words]').forEach(el => {
      gsap.fromTo(splitWords(el), { opacity: .14 }, {
        opacity: 1, ease: 'none', stagger: .1,
        scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 45%', scrub: .4 },
      });
    });

    if (finePointer) {
      /* Magnetic buttons */
      $$('[data-magnetic]').forEach(el => {
        const strength = parseFloat(el.dataset.magnetic) || .3;
        const xTo = gsap.quickTo(el, 'x', { duration: .6, ease: 'power3.out' });
        const yTo = gsap.quickTo(el, 'y', { duration: .6, ease: 'power3.out' });
        el.addEventListener('mousemove', e => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - r.left - r.width / 2) * strength);
          yTo((e.clientY - r.top - r.height / 2) * strength);
        });
        el.addEventListener('mouseleave', () => {
          gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, .45)' });
        });
      });

      /* Cursor label over projects */
      const targets = $$('[data-cursor]');
      if (targets.length) {
        const cursor = document.createElement('div');
        cursor.className = 'cursor';
        cursor.setAttribute('aria-hidden', 'true');
        document.body.appendChild(cursor);
        root.classList.add('has-cursor');
        const cx = gsap.quickTo(cursor, 'x', { duration: .45, ease: 'power3.out' });
        const cy = gsap.quickTo(cursor, 'y', { duration: .45, ease: 'power3.out' });
        window.addEventListener('mousemove', e => { cx(e.clientX); cy(e.clientY); }, { passive: true });
        targets.forEach(t => {
          t.addEventListener('mouseenter', () => {
            cursor.textContent = t.dataset.cursor;
            gsap.to(cursor, { scale: 1, duration: .5, ease: 'expo.out', overwrite: 'auto' });
          });
          t.addEventListener('mouseleave', () => {
            gsap.to(cursor, { scale: 0, duration: .35, ease: 'power3.in', overwrite: 'auto' });
          });
        });
      }
    }

    // Images change layout as they load; re-measure trigger positions after.
    window.addEventListener('load', () => ScrollTrigger.refresh());
  }
})();
