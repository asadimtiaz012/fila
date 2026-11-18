/* ==========================================================================
   FILA Disruptor — frame engine + store
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* Utilities                                                               */
  /* ---------------------------------------------------------------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var money = function (n) { return '$' + n.toFixed(n % 1 ? 2 : 0); };
  var money2 = function (n) { return '$' + n.toFixed(2); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  var reduced = document.documentElement.classList.contains('reduced-motion');
  var hasGSAP = typeof window.gsap !== 'undefined';
  var hasST = hasGSAP && typeof window.ScrollTrigger !== 'undefined';
  var hasFlip = hasGSAP && typeof window.Flip !== 'undefined';
  if (hasST) gsap.registerPlugin(ScrollTrigger);
  if (hasFlip) gsap.registerPlugin(Flip);

  var MOBILE_MQ = '(max-width: 768px), (orientation: portrait)';
  var useMobileSet = window.matchMedia(MOBILE_MQ).matches; // chosen once on load
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var FREE_SHIP = 75;
  var SHIP_FEE = 8;

  var PRODUCTS = window.FILA_PRODUCTS || [];
  var BY_ID = {};
  PRODUCTS.forEach(function (p) { BY_ID[p.id] = p; });
  var imgSrc = function (p, n) { return 'images/products/' + p.slug + '-' + (n || 1) + '.webp'; };
  var catLabel = function (p) {
    var c = p.categories;
    if (c.indexOf('Men') > -1 && c.indexOf('Women') > -1) return 'Unisex';
    return c.join(' / ');
  };

  /* ---------------------------------------------------------------------- */
  /* Fallback tile (only used when a product image is missing or broken)     */
  /* ---------------------------------------------------------------------- */
  function tileHTML(p) {
    var sw = (p && p.colorways && p.colorways[0].swatch) || ['#eee', '#0B1F4B', '#E4002B'];
    var id = 'g' + Math.random().toString(36).slice(2, 8);
    return '<div class="tile" aria-hidden="true">' +
      '<div class="tile__name">' + esc(p ? p.name : 'FILA') + '</div>' +
      '<div class="tile__floor"></div>' +
      '<div class="tile__shoe"><svg viewBox="0 0 200 80"><defs>' +
      '<linearGradient id="' + id + 'u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sw[0] + '"/><stop offset="1" stop-color="' + sw[0] + '" stop-opacity=".72"/></linearGradient>' +
      '<filter id="' + id + 'b"><feGaussianBlur stdDeviation="6"/></filter></defs>' +
      '<ellipse cx="100" cy="74" rx="92" ry="6" fill="#000" opacity=".6" filter="url(#' + id + 'b)"/>' +
      '<path d="M14 58C14 46 30 40 52 36c18-3 32-14 46-22 6-4 14-4 18 2l8 14c10 2 26 0 38-4 10-4 20-2 24 8l4 18Z" fill="url(#' + id + 'u)"/>' +
      '<path d="M60 48c20-2 44-10 64-22" stroke="' + sw[1] + '" stroke-width="5" stroke-linecap="round" fill="none"/>' +
      '<path d="M170 30c6 0 12 4 14 12l2 10-16 1Z" fill="' + sw[2] + '" opacity=".9"/>' +
      '<path d="M10 56 192 52c4 0 6 6 4 12l-2 6c-1 4-5 6-10 6H20c-8 0-12-6-11-12Z" fill="#ececea"/>' +
      '<path d="M18 72h170" stroke="#000" stroke-opacity=".15" stroke-width="2" stroke-dasharray="6 5"/>' +
      '</svg></div><div class="tile__mark">FILA</div></div>';
  }
  // Swap any broken product image for the tile.
  function handleImgError(img) {
    if (!img || img.dataset.failed) return;
    img.dataset.failed = '1';
    if (img.classList.contains('card__img--alt')) {
      var card = img.closest('.card'); if (card) card.classList.remove('has-alt');
      img.remove(); return;
    }
    var p = BY_ID[img.dataset.fallback];
    var wrap = document.createElement('div');
    wrap.innerHTML = tileHTML(p);
    img.replaceWith(wrap.firstChild);
  }
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-fallback')) handleImgError(t);
  }, true);
  function imgTag(p, n, cls, extra) {
    return '<img class="' + (cls || '') + '" src="' + imgSrc(p, n) + '" alt="' + esc(p.name + ' — ' + p.colorways[0].name) + '" width="900" height="1200" data-fallback="' + p.id + '" ' + (extra || '') + '>';
  }
  function checkStaticImages() {
    $$('img[data-fallback]').forEach(function (img) { if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) handleImgError(img); });
  }

  /* ---------------------------------------------------------------------- */
  /* Smooth scrolling (desktop only)                                         */
  /* ---------------------------------------------------------------------- */
  var lenis = null;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!reduced && !useMobileSet && finePointer && typeof window.Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.95 });
    if (hasST) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
    }
  }
  function navOffset() { return ($('#nav').offsetHeight || 64) + 8; }
  function scrollToTarget(target, offset) {
    var el = typeof target === 'string' ? $(target) : target;
    if (!el) return;
    var off = offset != null ? offset : -navOffset();
    if (lenis) { lenis.scrollTo(el, { offset: off, duration: 1.4 }); return; }
    var top = el.getBoundingClientRect().top + window.pageYOffset + off;
    window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
  }
  function lockScroll(on) {
    document.body.classList.toggle('is-locked', on);
    if (lenis) { if (on) lenis.stop(); else lenis.start(); }
  }

  /* ---------------------------------------------------------------------- */
  /* Preloader                                                               */
  /* ---------------------------------------------------------------------- */
  var preloader = $('#preloader');
  var preBar = $('#preloaderBar');
  var prePct = $('#preloaderPct');
  var preShown = 0;
  function setPreload(v) {
    v = clamp(v, 0, 1);
    if (v < preShown) return;
    preShown = v;
    preBar.style.transform = 'scaleX(' + v + ')';
    prePct.textContent = Math.round(v * 100);
  }
  var heroIntroPlayed = false;
  function hidePreloader() {
    if (preloader.classList.contains('is-done')) return;
    setPreload(1);
    setTimeout(function () {
      preloader.classList.add('is-done');
      playHeroIntro();
      setTimeout(function () { preloader.remove(); }, 900);
    }, 220);
  }
  function playHeroIntro() {
    if (heroIntroPlayed || reduced || !hasGSAP) return;
    heroIntroPlayed = true;
    var p0 = $('.panel--intro');
    gsap.from(p0.querySelector('.hero__title-word'), { yPercent: 40, opacity: 0, duration: 1.4, ease: 'expo.out' });
    gsap.from([p0.querySelector('.panel__eyebrow'), p0.querySelector('.hero__sub'), p0.querySelector('.btn'), p0.querySelector('.scroll-cue')],
      { y: 24, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, delay: 0.25, clearProps: 'transform,opacity' });
    gsap.from('#heroCanvas', { opacity: 0, scale: 1.04, duration: 1.6, ease: 'expo.out', clearProps: 'all' });
  }
  setTimeout(hidePreloader, 9000); // never block the store

  /* ---------------------------------------------------------------------- */
  /* Hero frame engine                                                       */
  /* ---------------------------------------------------------------------- */
  var Hero = (function () {
    var hero = $('#top');
    var sticky = $('.hero__sticky');
    var canvas = $('#heroCanvas');
    var ctx = canvas.getContext('2d', { alpha: false });
    var manifest, set, count = 0, frames = [], loaded = [], pending = [];
    var W = 0, H = 0, dpr = 1, rect = null, overlay = null;
    var current = 0, target = 0, lastDrawn = -1, dirty = true, lastT = 0;
    var heroTop = 0, heroDist = 1;
    var DESKTOP_ZOOM = 0.74;

    function url(i) {
      return set.path + manifest.prefix + String(i + 1).padStart(manifest.padding, '0') + '.' + manifest.extension;
    }
    function loadFrame(i) {
      if (pending[i]) return pending[i];
      pending[i] = new Promise(function (resolve) {
        var done = function (bmp) { if (bmp) { frames[i] = bmp; loaded[i] = true; dirty = true; } resolve(); };
        var viaImg = function () {
          var img = new Image();
          img.decoding = 'async';
          img.src = url(i);
          var ok = function () { done(img); };
          if (img.decode) img.decode().then(ok, function () { img.complete && img.naturalWidth ? ok() : done(null); });
          else { img.onload = ok; img.onerror = function () { done(null); }; }
        };
        if ('createImageBitmap' in window && window.fetch) {
          fetch(url(i)).then(function (r) { if (!r.ok) throw 0; return r.blob(); })
            .then(function (b) { return createImageBitmap(b); })
            .then(done, viaImg);
        } else viaImg();
      });
      return pending[i];
    }
    function loadList(list, conc, onProg) {
      var k = 0, n = 0;
      function worker() {
        if (k >= list.length) return Promise.resolve();
        var i = list[k++];
        return loadFrame(i).then(function () { n++; onProg && onProg(n / list.length); return worker(); });
      }
      var ws = []; for (var c = 0; c < conc; c++) ws.push(worker());
      return Promise.all(ws);
    }
    function nearest(i) {
      if (loaded[i]) return i;
      for (var d = 1; d < count; d++) {
        if (i - d >= 0 && loaded[i - d]) return i - d;
        if (i + d < count && loaded[i + d]) return i + d;
      }
      return -1;
    }

    function measure() {
      var w = sticky.clientWidth, h = sticky.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
      if (cw !== canvas.width || ch !== canvas.height) { canvas.width = cw; canvas.height = ch; }
      W = cw; H = ch;
      heroTop = hero.offsetTop;
      heroDist = Math.max(1, hero.offsetHeight - h);
      if (set) { computeRect(w, h); buildOverlay(); }
      dirty = true;
    }
    function computeRect(cssW, cssH) {
      var iw = set.width, ih = set.height, s, dw, dh, dx, dy;
      if (useMobileSet) {
        // Portrait: keep the whole shoe visible in the upper-middle of the screen.
        var landscape = cssW > cssH;
        s = Math.min(W * 1.04 / iw, H * (landscape ? 0.62 : 0.56) / ih);
        dw = iw * s; dh = ih * s;
        dx = (W - dw) / 2;
        var top = (landscape ? 0.12 : 0.14) * H;
        var bottom = (landscape ? 0.62 : 0.62) * H;
        dy = (top + bottom) / 2 - dh / 2;
      } else {
        // Landscape: cover, eased back slightly so copy has room beside the shoe.
        s = Math.max(W / iw, H / ih) * DESKTOP_ZOOM;
        dw = iw * s; dh = ih * s;
        dx = (W - dw) / 2; dy = (H - dh) * 0.5;
      }
      rect = { x: dx, y: dy, w: dw, h: dh };
    }
    function buildOverlay() {
      overlay = document.createElement('canvas');
      overlay.width = W; overlay.height = H;
      var o = overlay.getContext('2d'), r = rect, g, bg = '5,5,5';
      var edge = function (x0, y0, x1, y1, fx, fy, fw, fh) {
        g = o.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(' + bg + ',1)'); g.addColorStop(1, 'rgba(' + bg + ',0)');
        o.fillStyle = g; o.fillRect(fx, fy, fw, fh);
      };
      var fx = useMobileSet ? 0.07 : 0.16, ft = useMobileSet ? 0.22 : 0.2, fb = useMobileSet ? 0.42 : 0.3;
      edge(r.x, 0, r.x + r.w * fx, 0, r.x - 1, 0, r.w * fx + 1, H);                         // left
      edge(r.x + r.w, 0, r.x + r.w * (1 - fx), 0, r.x + r.w * (1 - fx), 0, r.w * fx + 1, H); // right
      edge(0, r.y, 0, r.y + r.h * ft, 0, r.y - 1, W, r.h * ft + 1);                           // top
      edge(0, r.y + r.h, 0, r.y + r.h * (1 - fb), 0, r.y + r.h * (1 - fb), W, r.h * fb + 1); // bottom
      // soft vignette
      var rg = o.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.75);
      rg.addColorStop(0, 'rgba(5,5,5,0)'); rg.addColorStop(1, 'rgba(5,5,5,0.55)');
      o.fillStyle = rg; o.fillRect(0, 0, W, H);
    }
    // Desktop: the shoe glides away from whichever side holds the copy.
    // [progress, horizontal shift as a fraction of the viewport width]
    var SHIFT = [[0, -0.035], [0.1, -0.035], [0.15, 0.09], [0.5, 0.09], [0.55, -0.09], [0.72, -0.09], [0.8, 0], [1, 0]];
    function shiftAt(p) {
      for (var i = 1; i < SHIFT.length; i++) {
        if (p <= SHIFT[i][0]) {
          var a = SHIFT[i - 1], b = SHIFT[i], t = (p - a[0]) / (b[0] - a[0] || 1);
          t = t * t * (3 - 2 * t);
          return a[1] + (b[1] - a[1]) * t;
        }
      }
      return SHIFT[SHIFT.length - 1][1];
    }
    function draw() {
      if (!rect) return;
      var i0 = Math.floor(current), f = current - i0;
      var a = nearest(i0);
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, W, H);
      if (a < 0) return;
      var sx = useMobileSet ? 0 : Math.round(shiftAt(current / Math.max(1, count - 1)) * W);
      var x = rect.x + sx;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 1;
      ctx.drawImage(frames[a], x, rect.y, rect.w, rect.h);
      if (f > 0.01 && i0 + 1 < count) {
        var b = nearest(i0 + 1);
        if (b !== a && b > -1) { ctx.globalAlpha = f; ctx.drawImage(frames[b], x, rect.y, rect.w, rect.h); ctx.globalAlpha = 1; }
      }
      if (overlay) ctx.drawImage(overlay, sx, 0);
      lastDrawn = current;
    }
    function progress() {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      return clamp((y - heroTop) / heroDist, 0, 1);
    }
    function tick(t) {
      var dt = lastT ? Math.min(64, t - lastT) : 16.7;
      lastT = t;
      target = progress() * (count - 1);
      var k = useMobileSet ? 0.16 : 0.22;
      current += (target - current) * (1 - Math.pow(1 - k, dt / 16.7));
      if (Math.abs(target - current) < 0.002) current = target;
      if (dirty || Math.abs(current - lastDrawn) > 0.002) { draw(); dirty = false; }
      requestAnimationFrame(tick);
    }

    function init() {
      return fetch('frames/manifest.json').then(function (r) { return r.json(); }).then(function (m) {
        manifest = m;
        set = useMobileSet ? m.mobile : m.desktop;
        count = set.count;
        frames = new Array(count); loaded = new Array(count); pending = new Array(count);

        if (reduced) {
          var img = $('#heroStatic');
          img.src = url(Math.round(count * 0.1));
          img.hidden = false;
          hidePreloader();
          return;
        }
        measure();
        var ro;
        var onResize = function () { cancelAnimationFrame(ro); ro = requestAnimationFrame(measure); };
        window.addEventListener('resize', onResize, { passive: true });
        window.addEventListener('orientationchange', function () { setTimeout(measure, 250); }, { passive: true });
        window.addEventListener('load', measure);
        requestAnimationFrame(tick);

        // Phase 1: first ~15% of the sequence, plus a sparse spread across the orbit.
        var first = Math.max(8, Math.ceil(count * 0.15));
        var initial = [], seen = {};
        for (var i = 0; i < first; i++) { initial.push(i); seen[i] = 1; }
        for (var j = first; j < count; j += 8) { initial.push(j); seen[j] = 1; }
        if (!seen[count - 1]) { initial.push(count - 1); seen[count - 1] = 1; }
        return loadList(initial, 6, function (v) { setPreload(v * 0.98); }).then(function () {
          hidePreloader();
          // Phase 2: the rest, in small background batches.
          var rest = [];
          for (var n = 0; n < count; n++) if (!seen[n]) rest.push(n);
          var batch = function () {
            if (!rest.length) return;
            var chunk = rest.splice(0, 12);
            loadList(chunk, 4).then(function () {
              (window.requestIdleCallback || setTimeout)(batch, { timeout: 120 });
            });
          };
          batch();
        });
      }).catch(function () {
        // Manifest unavailable: show the hero still so the page stays complete.
        var img = $('#heroStatic');
        img.src = 'images/products/disruptor-ii-1.webp';
        img.hidden = false;
        $('#heroCanvas').style.display = 'none';
        hidePreloader();
      });
    }
    return { init: init, measure: measure };
  })();

  /* ---------------------------------------------------------------------- */
  /* Hero copy, synced to the shoe's rotation                                */
  /* ---------------------------------------------------------------------- */
  function initHeroPanels() {
    if (reduced) return;
    var panels = $$('.panel');
    var ranges = [[0.15, 0.30], [0.35, 0.50], [0.55, 0.70]];
    if (hasST) {
      var tl = gsap.timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: { trigger: '#top', start: 'top top', end: 'bottom bottom', scrub: 0.6 }
      });
      tl.fromTo(panels[0], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -50, duration: 0.07, ease: 'power1.in', immediateRender: false }, 0.05);
      ranges.forEach(function (r, k) {
        var el = panels[k + 1];
        tl.fromTo(el, { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: 0.045 }, r[0])
          .to(el, { autoAlpha: 0, y: -50, duration: 0.045, ease: 'power1.in' }, r[1] - 0.045);
      });
      tl.fromTo(panels[4], { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: 0.06 }, 0.8);
      tl.set({}, {}, 1);
      return;
    }
    // Fallback without GSAP: compute visibility directly from scroll.
    var hero = $('#top');
    var all = [[-1, 0.12]].concat(ranges, [[0.8, 2]]);
    var update = function () {
      var p = clamp((window.pageYOffset - hero.offsetTop) / Math.max(1, hero.offsetHeight - window.innerHeight), 0, 1);
      panels.forEach(function (el, k) {
        var r = all[k], a = 1;
        if (p < r[0]) a = clamp(1 - (r[0] - p) / 0.045, 0, 1);
        else if (p > r[1]) a = clamp(1 - (p - r[1]) / 0.045, 0, 1);
        el.style.opacity = a; el.style.visibility = a > 0.01 ? 'visible' : 'hidden';
        el.style.transform = 'translateY(' + ((1 - a) * (p < r[0] ? 40 : -40)) + 'px)';
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* Fit the giant headline exactly to the available width */
  function fitTitle() {
    var t = $('.hero__title'), w = $('.hero__title-word');
    if (!t || !w) return;
    t.style.fontSize = '';
    var avail = t.clientWidth || (window.innerWidth - 32);
    var css = parseFloat(getComputedStyle(t).fontSize);
    var need = w.scrollWidth;
    if (!need) return;
    var size = css * (avail / need) * 0.995;
    var maxByHeight = window.innerHeight * (window.matchMedia('(min-width: 769px) and (orientation: landscape)').matches ? 0.26 : 0.12);
    t.style.fontSize = Math.min(size, maxByHeight) + 'px';
  }
  fitTitle();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
  window.addEventListener('resize', function () { requestAnimationFrame(fitTitle); }, { passive: true });

  /* ---------------------------------------------------------------------- */
  /* Nav state + progress bar                                                */
  /* ---------------------------------------------------------------------- */
  (function () {
    var bar = $('#scrollProgress');
    var ticking = false;
    var update = function () {
      ticking = false;
      var y = window.pageYOffset;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
      document.body.classList.toggle('is-scrolled', y > 40);
    };
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  })();

  /* ---------------------------------------------------------------------- */
  /* Overlay manager: focus trap, Esc, scroll lock                           */
  /* ---------------------------------------------------------------------- */
  var scrim = $('#scrim');
  var Overlay = (function () {
    var stack = [];
    var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';
    function focusables(entry) {
      var list = $$(FOCUSABLE, entry.el).filter(function (n) { return n.offsetParent !== null || n === document.activeElement; });
      if (entry.extra) list = entry.extra.concat(list);
      return list;
    }
    function open(el, opts) {
      opts = opts || {};
      if (stack.some(function (s) { return s.el === el; })) return;
      var entry = { el: el, opts: opts, extra: opts.extra, ret: document.activeElement };
      stack.push(entry);
      clearTimeout(el._hideT);
      el.hidden = false;
      void el.offsetWidth;
      el.classList.add('is-open');
      if (opts.scrim !== false) { scrim.hidden = false; void scrim.offsetWidth; scrim.classList.add('is-on'); scrim.style.zIndex = opts.scrimZ || ''; }
      lockScroll(true);
      setTimeout(function () {
        var f = opts.focus ? $(opts.focus, el) : null;
        (f || focusables(entry).filter(function (n) { return !(entry.extra || []).includes(n); })[0] || el).focus({ preventScroll: true });
      }, 60);
      opts.onOpen && opts.onOpen();
    }
    function close(el, silent) {
      var idx = -1;
      stack.forEach(function (s, i) { if (s.el === el) idx = i; });
      if (idx < 0) return;
      var entry = stack.splice(idx, 1)[0];
      el.classList.remove('is-open');
      el._hideT = setTimeout(function () { el.hidden = true; }, 560);
      if (!stack.some(function (s) { return s.opts.scrim !== false; })) {
        scrim.classList.remove('is-on');
        clearTimeout(scrim._t); scrim._t = setTimeout(function () { if (!scrim.classList.contains('is-on')) scrim.hidden = true; }, 420);
      }
      if (!stack.length) lockScroll(false);
      entry.opts.onClose && entry.opts.onClose();
      if (!silent && entry.ret && entry.ret.focus && document.contains(entry.ret)) entry.ret.focus({ preventScroll: true });
    }
    function top() { return stack[stack.length - 1]; }
    document.addEventListener('keydown', function (e) {
      var t = top(); if (!t) return;
      if (e.key === 'Escape') { e.preventDefault(); close(t.el); return; }
      if (e.key === 'Tab') {
        var f = focusables(t); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!t.el.contains(document.activeElement) && f.indexOf(document.activeElement) < 0) { e.preventDefault(); first.focus(); }
      }
    });
    scrim.addEventListener('click', function () { var t = top(); if (t) close(t.el); });
    document.addEventListener('click', function (e) {
      var c = e.target.closest('[data-close]');
      if (c) { var host = c.closest('.modal, .drawer, .search, .menu'); if (host) close(host); }
      if (e.target.classList && e.target.classList.contains('modal')) close(e.target);
    });
    return { open: open, close: close, top: top, isOpen: function (el) { return stack.some(function (s) { return s.el === el; }); } };
  })();

  /* ---------------------------------------------------------------------- */
  /* Mobile menu                                                             */
  /* ---------------------------------------------------------------------- */
  var burger = $('#burger');
  var menu = $('#mobileMenu');
  function toggleMenu(force) {
    var open = force != null ? force : !Overlay.isOpen(menu);
    if (open) {
      Overlay.open(menu, { scrim: false, extra: [burger], onClose: function () { burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Open menu'); } });
      burger.setAttribute('aria-expanded', 'true'); burger.setAttribute('aria-label', 'Close menu');
    } else Overlay.close(menu, true);
  }
  burger.addEventListener('click', function () { toggleMenu(); });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', function (e) { if (e.matches && Overlay.isOpen(menu)) toggleMenu(false); });

  /* ---------------------------------------------------------------------- */
  /* State: cart + wishlist                                                  */
  /* ---------------------------------------------------------------------- */
  var cart = store.get('fila.cart.v1', []).filter(function (l) { return BY_ID[l.id]; });
  var wish = store.get('fila.wishlist.v1', []).filter(function (id) { return BY_ID[id]; });
  var saveCart = function () { store.set('fila.cart.v1', cart); };
  var saveWish = function () { store.set('fila.wishlist.v1', wish); };
  var cartQty = function () { return cart.reduce(function (n, l) { return n + l.qty; }, 0); };
  var cartSubtotal = function () { return cart.reduce(function (n, l) { return n + BY_ID[l.id].price * l.qty; }, 0); };

  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function addToCart(id, size, color, qty) {
    var p = BY_ID[id];
    color = color || 0;
    var line = cart.find(function (l) { return l.id === id && l.size === size && l.color === color; });
    if (line) line.qty = Math.min(10, line.qty + (qty || 1));
    else cart.push({ id: id, size: size, color: color, qty: qty || 1 });
    saveCart();
    renderCart();
    bump($('#cartCount'));
    toast(p, 'Added to bag', 'Size ' + size + ' · ' + p.colorways[color].name);
  }
  function toggleWish(id) {
    var i = wish.indexOf(id), on = i < 0;
    if (on) wish.push(id); else wish.splice(i, 1);
    saveWish();
    renderWish();
    if (on) bump($('#wishCount'));
    return on;
  }
  function syncWishButtons() {
    $$('[data-wish]').forEach(function (b) {
      var on = wish.indexOf(b.dataset.wish) > -1;
      b.setAttribute('aria-pressed', on);
      var p = BY_ID[b.dataset.wish];
      if (p) b.setAttribute('aria-label', (on ? 'Remove ' : 'Add ') + p.name + (on ? ' from wishlist' : ' to wishlist'));
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Toasts                                                                  */
  /* ---------------------------------------------------------------------- */
  function toast(p, title, sub, opts) {
    opts = opts || {};
    var wrap = $('#toasts');
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML = (p ? '<div class="toast__img">' + imgTag(p, 1, '', 'alt=""') + '</div>' :
      '<div class="toast__icon"><svg viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7"/></svg></div>') +
      '<div class="toast__text"><strong>' + esc(title) + '</strong>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' +
      (opts.noAction ? '' : '<button type="button">View bag</button>');
    var btn = t.querySelector('button');
    if (btn) btn.addEventListener('click', function () { dismiss(); openDrawer('cart'); });
    wrap.appendChild(t);
    while (wrap.children.length > 3) wrap.firstChild.remove();
    var timer = setTimeout(dismiss, 3600);
    function dismiss() { clearTimeout(timer); t.classList.add('is-out'); setTimeout(function () { t.remove(); }, 400); }
  }

  /* ---------------------------------------------------------------------- */
  /* Size + color pickers                                                    */
  /* ---------------------------------------------------------------------- */
  function sizePicker(container, p, onChange) {
    var selected = null;
    container.innerHTML = p.sizes.map(function (s) {
      var out = (p.soldOut || []).indexOf(s) > -1;
      return '<button type="button" class="size" role="radio" aria-checked="false" data-size="' + s + '"' + (out ? ' disabled aria-label="Size ' + s + ', sold out"' : ' aria-label="Size ' + s + '"') + '>' + s + '</button>';
    }).join('');
    container.onclick = function (e) {
      var b = e.target.closest('.size'); if (!b || b.disabled) return;
      $$('.size', container).forEach(function (x) { x.setAttribute('aria-checked', x === b); });
      selected = b.dataset.size;
      onChange && onChange(selected);
    };
    return {
      get: function () { return selected; },
      require: function () {
        if (selected) return true;
        container.classList.remove('shake'); void container.offsetWidth; container.classList.add('shake');
        var first = container.querySelector('.size:not(:disabled)'); first && first.focus({ preventScroll: true });
        toast(null, 'Please select a size', p.name, { noAction: true });
        return false;
      }
    };
  }
  function colorPicker(container, p, onChange) {
    var selected = 0;
    container.innerHTML = p.colorways.map(function (c, i) {
      var bg = 'conic-gradient(from 200deg, ' + c.swatch[0] + ' 0 50%, ' + c.swatch[1] + ' 50% 75%, ' + c.swatch[2] + ' 75% 100%)';
      return '<button type="button" class="swatch" role="radio" aria-checked="' + (i === 0) + '" aria-label="' + esc(c.name) + '" title="' + esc(c.name) + '" data-i="' + i + '"><span style="background:' + bg + '"></span></button>';
    }).join('');
    container.onclick = function (e) {
      var b = e.target.closest('.swatch'); if (!b) return;
      $$('.swatch', container).forEach(function (x) { x.setAttribute('aria-checked', x === b); });
      selected = +b.dataset.i;
      onChange && onChange(selected);
    };
    return { get: function () { return selected; } };
  }
  function priceHTML(p) {
    return p.oldPrice ? '<span class="sale">' + money(p.price) + '</span><s>' + money(p.oldPrice) + '</s>' : money(p.price);
  }

  /* ---------------------------------------------------------------------- */
  /* Hero buy panel + featured                                               */
  /* ---------------------------------------------------------------------- */
  var HERO_ID = 'disruptor-ii';
  (function () {
    var p = BY_ID[HERO_ID]; if (!p) return;
    $('[data-hero-price]').innerHTML = priceHTML(p);
    var colors = colorPicker($('[data-hero-colors]'), p);
    var sizes = sizePicker($('[data-hero-sizes]'), p);
    $('[data-hero-add]').addEventListener('click', function () { if (sizes.require()) addToCart(p.id, sizes.get(), colors.get()); });
    $('[data-hero-buy]').addEventListener('click', function () {
      if (!sizes.require()) return;
      addToCart(p.id, sizes.get(), colors.get());
      openCheckout();
    });

    $('[data-feat-price]').innerHTML = priceHTML(p);
    $('[data-feat-desc]').textContent = p.description;
    $('[data-feat-specs]').innerHTML = p.specs.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var fs = sizePicker($('[data-feat-sizes]'), p);
    $('[data-feat-add]').addEventListener('click', function () { if (fs.require()) addToCart(p.id, fs.get(), 0); });
  })();

  /* ---------------------------------------------------------------------- */
  /* Product grid                                                            */
  /* ---------------------------------------------------------------------- */
  var grid = $('#productGrid');
  var filter = 'All', sort = 'featured';
  var heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z"/></svg>';
  function badgeHTML(p) {
    if (!p.badge) return '';
    var cls = p.badge.indexOf('%') > -1 ? 'card__badge--sale' : (p.badge === 'New' ? 'card__badge--new' : '');
    return '<span class="card__badge ' + cls + '">' + esc(p.badge) + '</span>';
  }
  function cardHTML(p) {
    var alt = p.images > 1;
    return '<article class="card' + (alt ? ' has-alt' : '') + '" data-id="' + p.id + '">' +
      '<div class="card__media">' +
        '<a class="card__open" href="#shop" data-qv="' + p.id + '" aria-label="View ' + esc(p.name) + '">' +
          imgTag(p, 1, 'card__img card__img--main', 'loading="lazy" decoding="async"') +
          (alt ? imgTag(p, 2, 'card__img card__img--alt', 'loading="lazy" decoding="async" alt=""').replace(/alt="[^"]*" width/, 'alt="" width') : '') +
        '</a>' + badgeHTML(p) +
        '<button type="button" class="card__wish" data-wish="' + p.id + '" aria-pressed="false" aria-label="Add ' + esc(p.name) + ' to wishlist"><span>' + heart + '</span></button>' +
        '<button type="button" class="card__quick" data-quick="' + p.id + '" aria-label="Quick add ' + esc(p.name) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Quick add</span></button>' +
      '</div>' +
      '<div class="card__body">' +
        '<div class="card__top"><button type="button" class="card__name" data-qv="' + p.id + '">' + esc(p.name) + '</button></div>' +
        '<p class="card__meta">' + esc(catLabel(p)) + ' · ' + esc(p.colorways[0].name) + '</p>' +
        '<div class="dots" aria-label="' + p.colorways.length + ' colorway' + (p.colorways.length > 1 ? 's' : '') + '">' + p.colorways[0].swatch.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</div>' +
        '<div class="card__row"><span class="card__price">' + priceHTML(p) + '</span>' +
          '<span class="card__rating" aria-label="Rated ' + p.rating + ' out of 5"><span class="stars" style="--r:' + p.rating + '"></span><span class="num">' + p.rating.toFixed(1) + '</span></span></div>' +
      '</div></article>';
  }
  grid.innerHTML = PRODUCTS.map(cardHTML).join('');
  var cardEls = {};
  $$('.card', grid).forEach(function (c) { cardEls[c.dataset.id] = c; });

  function visibleList() {
    var list = PRODUCTS.filter(function (p) {
      if (filter === 'All') return true;
      if (filter === 'new') return p.isNew;
      return p.categories.indexOf(filter) > -1;
    });
    if (sort === 'price-asc') list.sort(function (a, b) { return a.price - b.price; });
    else if (sort === 'price-desc') list.sort(function (a, b) { return b.price - a.price; });
    else list.sort(function (a, b) { return a.featured - b.featured; });
    return list;
  }
  function moveInk() {
    var ink = $('.tabs__ink'), act = $('.tab.is-active');
    if (!act) { ink.style.width = '0px'; return; }
    ink.style.width = act.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + act.offsetLeft + 'px)';
  }
  function applyGrid(animate) {
    var cards = $$('.card', grid);
    var state = animate && hasFlip && !reduced ? Flip.getState(cards) : null;
    var list = visibleList();
    var ids = list.map(function (p) { return p.id; });
    cards.forEach(function (c) { c.style.display = ids.indexOf(c.dataset.id) > -1 ? '' : 'none'; });
    ids.forEach(function (id) { grid.appendChild(cardEls[id]); });
    var label = filter === 'new' ? 'New arrivals' : (filter === 'All' ? 'All sneakers' : filter);
    $('#shopCount').innerHTML = esc(label) + ' · ' + list.length + ' style' + (list.length === 1 ? '' : 's') +
      (filter === 'new' ? ' · <button type="button" class="link-u" id="clearNew">Show all</button>' : '');
    var cn = $('#clearNew'); if (cn) cn.addEventListener('click', function () { setFilter('All', true); });
    $$('.tab').forEach(function (t) { var on = t.dataset.tab === filter; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); });
    moveInk();
    if (state) {
      Flip.from(state, {
        duration: 0.7, ease: 'power3.inOut', absolute: true, scale: false,
        onEnter: function (els) { return gsap.fromTo(els, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'power3.out' }); },
        onLeave: function (els) { return gsap.to(els, { opacity: 0, scale: 0.94, duration: 0.4 }); },
        onComplete: function () { hasST && ScrollTrigger.refresh(); }
      });
    } else if (hasST) ScrollTrigger.refresh();
  }
  function setFilter(f, animate) { filter = f; applyGrid(animate); }
  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { setFilter(t.dataset.tab, true); }); });
  $('.tabs').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var tabs = $$('.tab'), i = tabs.indexOf(document.activeElement); if (i < 0) return;
    var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus(); n.click();
  });
  $('#sortSelect').addEventListener('change', function (e) { sort = e.target.value; applyGrid(true); });
  window.addEventListener('resize', moveInk, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInk);

  grid.addEventListener('click', function (e) {
    var q = e.target.closest('[data-quick]');
    if (q) { openSizeSheet(q.dataset.quick); return; }
    var v = e.target.closest('[data-qv]');
    if (v) { e.preventDefault(); openQuickView(v.dataset.qv); }
  });
  // Wishlist hearts anywhere on the page
  document.addEventListener('click', function (e) {
    var w = e.target.closest('[data-wish]');
    if (!w) return;
    var id = w.dataset.wish, on = toggleWish(id);
    w.classList.remove('pop'); void w.offsetWidth; w.classList.add('pop');
    toast(BY_ID[id], on ? 'Saved to wishlist' : 'Removed from wishlist', BY_ID[id].name, { noAction: true });
  });

  /* Nav links that filter the grid */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (a.hasAttribute('data-qv')) return;
    if (href.length < 2) return;
    var targetEl = $(href);
    if (!targetEl) return;
    e.preventDefault();
    if (a.dataset.filter) setFilter(a.dataset.filter === 'new' ? 'new' : a.dataset.filter, false);
    if (a.dataset.faq) openFaq(a.dataset.faq);
    var go = function () { scrollToTarget(targetEl, href === '#top' ? 0 : undefined); };
    if (Overlay.isOpen(menu)) { toggleMenu(false); setTimeout(go, 350); } else go();
  });

  /* ---------------------------------------------------------------------- */
  /* Quick view                                                              */
  /* ---------------------------------------------------------------------- */
  var qv = $('#quickView');
  function openQuickView(id) {
    var p = BY_ID[id]; if (!p) return;
    var imgBox = $('#qvImg'), thumbs = $('#qvThumbs');
    var show = function (n) {
      imgBox.innerHTML = imgTag(p, n, '', '');
      $$('button', thumbs).forEach(function (b) { b.setAttribute('aria-current', +b.dataset.n === n); });
    };
    thumbs.innerHTML = p.images > 1 ? [1, 2].map(function (n) {
      return '<button type="button" data-n="' + n + '" aria-label="View image ' + n + '">' + imgTag(p, n, '', 'alt=""').replace(/alt="[^"]*" width/, 'alt="" width') + '</button>';
    }).join('') : '';
    thumbs.onclick = function (e) { var b = e.target.closest('button'); if (b) show(+b.dataset.n); };
    show(1);
    $('#qvCat').innerHTML = '<span class="dot"></span>' + esc(catLabel(p)) + (p.badge ? ' · ' + esc(p.badge) : '');
    $('#qvTitle').textContent = p.name;
    $('#qvPrice').innerHTML = '<span class="price">' + priceHTML(p) + '</span>';
    $('#qvRating').innerHTML = '<span class="buy__rating"><span class="stars" style="--r:' + p.rating + '"></span>' + p.rating.toFixed(1) + ' · ' + p.reviews.toLocaleString('en-US') + ' reviews</span>';
    $('#qvDesc').textContent = p.description;
    $('#qvColorName').textContent = p.colorways[0].name;
    var colors = colorPicker($('#qvColors'), p, function (i) { $('#qvColorName').textContent = p.colorways[i].name; });
    var sizes = sizePicker($('#qvSizes'), p);
    $('#qvAdd').onclick = function () {
      if (!sizes.require()) return;
      addToCart(p.id, sizes.get(), colors.get());
      Overlay.close(qv);
    };
    var wb = $('#qvWish'); wb.dataset.wish = p.id; syncWishButtons();
    Overlay.open(qv, { focus: '#qvTitle' });
    $('#qvTitle').setAttribute('tabindex', '-1');
  }

  /* ---------------------------------------------------------------------- */
  /* Quick add (size sheet)                                                  */
  /* ---------------------------------------------------------------------- */
  var sheet = $('#sizeSheet');
  function openSizeSheet(id) {
    var p = BY_ID[id]; if (!p) return;
    $('#ssThumb').innerHTML = imgTag(p, 1, '', 'alt=""');
    $('#ssTitle').textContent = p.name;
    $('#ssPrice').innerHTML = priceHTML(p) + ' · ' + esc(p.colorways[0].name);
    var add = $('#ssAdd');
    add.disabled = true; add.textContent = 'Select a size';
    var sizes = sizePicker($('#ssSizes'), p, function (s) { add.disabled = false; add.textContent = 'Add size ' + s + ' to bag'; });
    add.onclick = function () { if (!sizes.get()) return; addToCart(p.id, sizes.get(), 0); Overlay.close(sheet); };
    Overlay.open(sheet, { scrimZ: Overlay.top() ? 155 : '' });
  }

  /* Size guide */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-open-size-guide]')) Overlay.open($('#sizeGuide'), { scrimZ: Overlay.top() ? 155 : '' });
  });

  /* ---------------------------------------------------------------------- */
  /* Drawer: cart + wishlist                                                 */
  /* ---------------------------------------------------------------------- */
  var drawer = $('#drawer');
  function setDrawerView(v) {
    $$('.drawer__tab').forEach(function (t) { var on = t.dataset.view === v; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); });
    $$('[data-view-panel]').forEach(function (p) { p.hidden = p.dataset.viewPanel !== v; });
  }
  function openDrawer(view) {
    setDrawerView(view || 'cart');
    if (!Overlay.isOpen(drawer)) Overlay.open(drawer, { onOpen: function () { document.body.classList.add('drawer-open'); }, onClose: function () { document.body.classList.remove('drawer-open'); } });
  }
  $$('.drawer__tab').forEach(function (t) { t.addEventListener('click', function () { setDrawerView(t.dataset.view); }); });
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]');
    if (!o) return;
    var what = o.dataset.open;
    if (Overlay.isOpen(menu)) toggleMenu(false);
    if (what === 'cart' || what === 'wishlist') openDrawer(what);
    if (what === 'search') openSearch();
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-go-shop]')) return;
    Overlay.close(drawer, true);
    setTimeout(function () { scrollToTarget('#shop'); }, 200);
  });

  function lineImg(p) { return '<div class="line__img">' + imgTag(p, 1, '', 'alt="" loading="lazy"') + '</div>'; }
  function renderCart() {
    var qty = cartQty(), sub = cartSubtotal();
    var cc = $('#cartCount');
    cc.textContent = qty; cc.hidden = qty === 0;
    $('#cartBtn').setAttribute('aria-label', 'Shopping bag, ' + qty + ' item' + (qty === 1 ? '' : 's'));
    $$('[data-cart-qty]').forEach(function (n) { n.textContent = qty; });
    $('#cartLines').innerHTML = cart.map(function (l, i) {
      var p = BY_ID[l.id];
      return '<li class="line">' + lineImg(p) +
        '<div><p class="line__name">' + esc(p.name) + '</p>' +
        '<p class="line__meta">' + esc(p.colorways[l.color] ? p.colorways[l.color].name : p.colorways[0].name) + '<br>Size ' + esc(l.size) + '</p>' +
        '<div class="line__ctrl"><div class="qty" role="group" aria-label="Quantity for ' + esc(p.name) + '">' +
          '<button type="button" data-dec="' + i + '" aria-label="Decrease quantity">−</button><output aria-live="polite">' + l.qty + '</output>' +
          '<button type="button" data-inc="' + i + '" aria-label="Increase quantity">+</button></div>' +
          '<button type="button" class="line__remove" data-rm="' + i + '">Remove</button></div></div>' +
        '<p class="line__price">' + money(p.price * l.qty) + (p.oldPrice ? '<s>' + money(p.oldPrice * l.qty) + '</s>' : '') + '</p></li>';
    }).join('');
    var empty = cart.length === 0;
    $('#cartEmpty').hidden = !empty;
    $('#cartLines').hidden = empty;
    $('#cartFoot').hidden = empty;
    $('#shipMeter').hidden = empty;
    $('#cartSubtotal').textContent = money2(sub);
    var left = FREE_SHIP - sub;
    $('#shipMsg').innerHTML = left > 0 ? 'Add <strong>' + money2(left) + '</strong> more for free shipping' : '<strong>You’ve unlocked free shipping.</strong>';
    $('#shipBar').style.width = clamp(sub / FREE_SHIP, 0, 1) * 100 + '%';
  }
  $('#cartLines').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var i;
    if ((i = b.dataset.inc) != null) cart[i].qty = Math.min(10, cart[i].qty + 1);
    else if ((i = b.dataset.dec) != null) { cart[i].qty -= 1; if (cart[i].qty < 1) cart.splice(i, 1); }
    else if ((i = b.dataset.rm) != null) cart.splice(i, 1);
    else return;
    saveCart(); renderCart();
    var focusSel = b.dataset.inc != null ? '[data-inc="' + i + '"]' : (b.dataset.dec != null ? '[data-dec="' + i + '"]' : null);
    var f = focusSel && $(focusSel, $('#cartLines'));
    (f || $('.drawer__tab.is-active')).focus({ preventScroll: true });
    bump($('#cartCount'));
  });

  function renderWish() {
    var n = wish.length, wc = $('#wishCount');
    wc.textContent = n; wc.hidden = n === 0;
    $$('[data-wish-qty]').forEach(function (x) { x.textContent = n; });
    $('#wishLines').innerHTML = wish.map(function (id) {
      var p = BY_ID[id];
      return '<li class="line">' + lineImg(p) +
        '<div><p class="line__name">' + esc(p.name) + '</p><p class="line__meta">' + esc(catLabel(p)) + ' · ' + esc(p.colorways[0].name) + '</p>' +
        '<div class="line__ctrl"><button type="button" class="btn btn--primary" data-wadd="' + id + '">Add to bag</button>' +
        '<button type="button" class="line__remove" data-wrm="' + id + '">Remove</button></div></div>' +
        '<p class="line__price">' + money(p.price) + '</p></li>';
    }).join('');
    $('#wishEmpty').hidden = n > 0;
    $('#wishLines').hidden = n === 0;
    syncWishButtons();
  }
  $('#wishLines').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.wadd) openSizeSheet(b.dataset.wadd);
    if (b.dataset.wrm) { toggleWish(b.dataset.wrm); $('.drawer__tab.is-active').focus(); }
  });

  /* ---------------------------------------------------------------------- */
  /* Checkout                                                                */
  /* ---------------------------------------------------------------------- */
  var checkout = $('#checkout');
  function openCheckout() {
    if (!cart.length) { openDrawer('cart'); return; }
    var sub = cartSubtotal(), ship = sub >= FREE_SHIP ? 0 : SHIP_FEE;
    $('#coLines').innerHTML = cart.map(function (l) {
      var p = BY_ID[l.id];
      return '<li>' + lineImg(p) + '<div>' + esc(p.name) + '<small>Size ' + esc(l.size) + ' · Qty ' + l.qty + '</small></div><span>' + money(p.price * l.qty) + '</span></li>';
    }).join('');
    $('#coSubtotal').textContent = money2(sub);
    $('#coShipping').textContent = ship ? money2(ship) : 'Free';
    $('#coTotal').textContent = money2(sub + ship);
    $('#coForm').hidden = false; $('#coDone').hidden = true;
    var btn = $('#placeOrder'); btn.disabled = false; btn.textContent = 'Place order · ' + money2(sub + ship);
    if (Overlay.isOpen(drawer)) Overlay.close(drawer, true);
    Overlay.open(checkout, { focus: '#coName' });
  }
  $('#checkoutBtn').addEventListener('click', openCheckout);
  var rules = {
    name: function (v) { return v.trim().length >= 2 || 'Please enter your full name.'; },
    email: function (v) { return !!v.trim().match(EMAIL_RE) || 'Please enter a valid email address.'; },
    address: function (v) { return v.trim().length >= 5 || 'Please enter your street address.'; },
    city: function (v) { return v.trim().length >= 2 || 'Please enter your city.'; },
    zip: function (v) { return !!v.trim().match(/^[A-Za-z0-9 -]{3,10}$/) || 'Please enter a valid ZIP code.'; }
  };
  function validateField(input) {
    var r = rules[input.name]; if (!r) return true;
    var res = r(input.value), field = input.closest('.field'), err = field.querySelector('.field__err');
    var ok = res === true;
    field.classList.toggle('is-invalid', !ok);
    input.setAttribute('aria-invalid', !ok);
    err.textContent = ok ? '' : res;
    if (!err.id) err.id = input.id + 'Err';
    input.setAttribute('aria-describedby', err.id);
    return ok;
  }
  var coForm = $('#checkoutForm');
  coForm.addEventListener('blur', function (e) { if (e.target.name && e.target.value) validateField(e.target); }, true);
  coForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var inputs = $$('input', coForm), firstBad = null;
    inputs.forEach(function (i) { if (!validateField(i) && !firstBad) firstBad = i; });
    if (firstBad) { firstBad.focus(); return; }
    var btn = $('#placeOrder');
    btn.disabled = true; btn.textContent = 'Processing…';
    setTimeout(function () {
      var name = coForm.name.value.trim().split(/\s+/)[0];
      $('#coThanksName').textContent = name;
      $('#coThanksEmail').textContent = coForm.email.value.trim();
      $('#coNumber').textContent = '#FL' + Math.floor(100000 + Math.random() * 899999);
      $('#coForm').hidden = true; $('#coDone').hidden = false;
      $('#coDone .btn').focus();
      cart = []; saveCart(); renderCart();
      coForm.reset();
    }, 1100);
  });

  /* ---------------------------------------------------------------------- */
  /* Search                                                                  */
  /* ---------------------------------------------------------------------- */
  var search = $('#search'), sInput = $('#searchInput'), sResults = $('#searchResults');
  function openSearch() {
    Overlay.open(search, { scrim: false, focus: '#searchInput' });
    runSearch();
  }
  function hl(text, q) {
    if (!q) return esc(text);
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  function runSearch() {
    var q = sInput.value.trim();
    $('#searchHint').hidden = !!q;
    if (!q) { sResults.innerHTML = ''; return; }
    var terms = q.toLowerCase().split(/\s+/);
    var res = PRODUCTS.filter(function (p) {
      var hay = (p.name + ' ' + p.categories.join(' ') + ' ' + p.colorways.map(function (c) { return c.name; }).join(' ') + ' ' + p.tagline).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) > -1; });
    });
    sResults.innerHTML = res.length ? res.map(function (p) {
      return '<li><button type="button" data-sr="' + p.id + '">' + lineImg(p) +
        '<span><span class="line__name">' + hl(p.name, q) + '</span><span class="line__meta" style="display:block">' + esc(catLabel(p)) + ' · ' + esc(p.colorways[0].name) + '</span></span>' +
        '<span class="card__price">' + priceHTML(p) + '</span></button></li>';
    }).join('') : '<li class="search__empty">No styles match “' + esc(q) + '”. Try “Disruptor”, “court” or “platform”.</li>';
  }
  sInput.addEventListener('input', runSearch);
  $('#searchHint').addEventListener('click', function (e) { var b = e.target.closest('[data-q]'); if (b) { sInput.value = b.dataset.q; sInput.dispatchEvent(new Event('input')); sInput.focus(); } });
  sResults.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sr]'); if (!b) return;
    Overlay.close(search, true);
    setTimeout(function () { openQuickView(b.dataset.sr); }, 120);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !Overlay.top() && !document.activeElement.tagName.match(/input|textarea|select/i)) { e.preventDefault(); openSearch(); }
  });

  /* ---------------------------------------------------------------------- */
  /* Reviews                                                                 */
  /* ---------------------------------------------------------------------- */
  var REVIEWS = [
    { name: 'Maya R.', city: 'Brooklyn, NY', product: 'Disruptor II', rating: 5, title: 'Still the best chunky sneaker', text: 'Third pair and I’m not stopping. They make every outfit look intentional and they’re genuinely comfortable for a full day on my feet.' },
    { name: 'Jordan T.', city: 'Austin, TX', product: 'Grant Hill 2', rating: 5, title: 'Pure 90s nostalgia', text: 'Quality leather, the strap feels solid, and the colorway is exactly what I remember. Got compliments the first day I wore them.' },
    { name: 'Alicia M.', city: 'Los Angeles, CA', product: 'Renno Platform', rating: 5, title: 'The gum sole is everything', text: 'Soft suede, subtle lift, and they go with jeans or dresses. Shipping took two days and the box arrived perfect.' },
    { name: 'Chris W.', city: 'Chicago, IL', product: 'Venom 97', rating: 4, title: 'Bold in the best way', text: 'The translucent heel looks even better in person. Runs a touch narrow, so I’d go up half a size if you have wide feet.' },
    { name: 'Priya K.', city: 'Seattle, WA', product: 'Ray Tracer TR2', rating: 5, title: 'Comfort meets attitude', text: 'Wore them straight out of the box for a day of walking around the city, zero break-in. The navy and red pops so nicely.' },
    { name: 'Daniel O.', city: 'Miami, FL', product: 'Tennis 88', rating: 5, title: 'My son won’t take them off', text: 'Clean, sturdy and easy to wipe down after the playground. Ordered his usual size and the fit was spot on.' }
  ];
  $('#reviewsTrack').innerHTML = REVIEWS.map(function (r) {
    var initials = r.name.split(' ').map(function (s) { return s[0]; }).join('');
    return '<article class="review reveal"><div class="review__top"><span class="stars" style="--r:' + r.rating + '" role="img" aria-label="' + r.rating + ' out of 5 stars"></span><span class="review__product">' + esc(r.product) + '</span></div>' +
      '<h3>' + esc(r.title) + '</h3><p>' + esc(r.text) + '</p>' +
      '<div class="review__who"><span class="review__avatar" aria-hidden="true">' + esc(initials) + '</span><div><strong>' + esc(r.name) + '</strong>' +
      '<span class="verified"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>Verified buyer · ' + esc(r.city) + '</span></div></div></article>';
  }).join('');
  $$('[data-rev]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = $('#reviewsTrack'), card = $('.review', t);
      t.scrollBy({ left: (+b.dataset.rev) * (card.offsetWidth + 16), behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Lookbook                                                                */
  /* ---------------------------------------------------------------------- */
  var LOOKS = [
    { id: 'disruptor-ii', n: 1, title: 'Disruptor II, after dark' },
    { id: 'grant-hill-2', n: 1, title: 'Courtside, 1995 energy' },
    { id: 'renno-platform', n: 1, title: 'Soft suede, raised gum' },
    { id: 'venom-97', n: 1, title: 'Blacked out. Lit red.' },
    { id: 'oakmont-tr', n: 1, title: 'Lavender on the serrated sole' },
    { id: 'ray-tracer-tr2', n: 1, title: 'Archive lines, new attitude' }
  ];
  $('#lookbookGrid').innerHTML = LOOKS.map(function (l, i) {
    var p = BY_ID[l.id]; if (!p) return '';
    return '<a class="look reveal" href="#shop" data-qv="' + p.id + '" aria-label="' + esc(l.title) + ', shop ' + esc(p.name) + '">' +
      imgTag(p, l.n, '', 'loading="lazy" decoding="async"') +
      '<svg class="look__ig" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/></svg>' +
      '<span class="look__overlay"><strong>' + esc(l.title) + '</strong><span>Shop the look · ' + esc(p.name) + ' →</span></span></a>';
  }).join('');
  $('#lookbookGrid').addEventListener('click', function (e) {
    var a = e.target.closest('[data-qv]'); if (!a) return;
    e.preventDefault(); openQuickView(a.dataset.qv);
  });

  /* ---------------------------------------------------------------------- */
  /* FAQ                                                                     */
  /* ---------------------------------------------------------------------- */
  function setFaq(item, open) {
    item.classList.toggle('is-open', open);
    $('button', item).setAttribute('aria-expanded', open);
  }
  function openFaq(id) { var it = $('#' + id); if (it) setFaq(it, true); }
  $$('.faq__item').forEach(function (item) {
    $('button', item).addEventListener('click', function () {
      var open = !item.classList.contains('is-open');
      $$('.faq__item').forEach(function (o) { if (o !== item) setFaq(o, false); });
      setFaq(item, open);
      if (hasST) setTimeout(function () { ScrollTrigger.refresh(); }, 520);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Newsletter                                                              */
  /* ---------------------------------------------------------------------- */
  $('#newsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('#newsEmail'), msg = $('#newsMsg'), v = input.value.trim();
    if (!v.match(EMAIL_RE)) {
      msg.className = 'field__msg is-error'; msg.textContent = 'Please enter a valid email address.';
      input.setAttribute('aria-invalid', 'true'); input.focus(); return;
    }
    input.removeAttribute('aria-invalid');
    store.set('fila.newsletter', v);
    msg.className = 'field__msg is-ok';
    msg.innerHTML = 'Welcome to FILA Insiders. Use code <strong>WELCOME10</strong> for 10% off your first order.';
    input.value = '';
  });

  /* ---------------------------------------------------------------------- */
  /* Reveal + counters                                                       */
  /* ---------------------------------------------------------------------- */
  function initReveal() {
    var els = $$('.reveal');
    if (reduced || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      var batch = entries.filter(function (en) { return en.isIntersecting; });
      batch.forEach(function (en, i) {
        en.target.style.transitionDelay = Math.min(i * 70, 420) + 'ms';
        en.target.classList.add('is-in');
        io.unobserve(en.target);
        setTimeout(function () { en.target.style.transitionDelay = ''; }, 1600);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (e) { io.observe(e); });
  }
  function initCounters() {
    var nums = $$('[data-count]');
    var run = function (el) {
      var to = +el.dataset.count, start = null, dur = 1800;
      if (reduced) { el.textContent = to; return; }
      var step = function (t) {
        if (!start) start = t;
        var k = clamp((t - start) / dur, 0, 1), e = 1 - Math.pow(1 - k, 4);
        el.textContent = Math.round(to * e);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!('IntersectionObserver' in window)) { nums.forEach(run); return; }
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (x) { if (x.isIntersecting) { run(x.target); io.unobserve(x.target); } });
    }, { threshold: 0.6 });
    nums.forEach(function (n) { io.observe(n); });
  }

  /* Inline input hints (hidden once the field has a value) */
  $$('.hint-wrap input').forEach(function (i) {
    var sync = function () { i.parentNode.classList.toggle('is-filled', !!i.value); };
    i.addEventListener('input', sync); sync();
  });

  /* ---------------------------------------------------------------------- */
  /* Boot                                                                    */
  /* ---------------------------------------------------------------------- */
  $('#year').textContent = new Date().getFullYear();
  applyGrid(false);
  renderCart();
  renderWish();
  initReveal();
  initCounters();
  initHeroPanels();
  checkStaticImages();
  Hero.init();
  window.addEventListener('load', function () { if (hasST) ScrollTrigger.refresh(); moveInk(); });
})();
