/* ==========================================================================
   Effets sonores : prechargement, deverrouillage navigateur, volume
   ========================================================================== */
(function () {
  'use strict';

  /* volume : chaque fichier n a pas le meme niveau d enregistrement, on
     rattrape ici. fade : fondu de sortie en ms, pour les sons coupes qui
     s arreteraient net (voleur) ou qui trainent en fin de piste (victoire). */
  const SFX = {
    des:        { src: 'sound/des.mp3',        volume: 0.75 },
    construire: { src: 'sound/construire.mp3', volume: 0.70 },
    carte:      { src: 'sound/carte.mp3',      volume: 0.70 },
    voleur:     { src: 'sound/voleur.mp3',     volume: 0.65, fade: 320 },
    tonTour:    { src: 'sound/ton-tour.mp3',   volume: 0.85 },
    victoire:   { src: 'sound/victoire.mp3',   volume: 0.85, fade: 450 }
  };

  const POOL = 4;        // lectures simultanees possibles par effet
  const THROTTLE = 90;   // ms : evite le doublon quand deux lignes arrivent ensemble

  const pools = {};      // nom -> { els: [Audio], next: index }
  const lastAt = {};     // nom -> timestamp de la derniere lecture
  let unlocked = false;

  /* --- preferences persistantes (localStorage peut lever : mode prive) --- */

  function ls(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) {}
    return null;
  }

  const prefs = {
    get on() { return ls('catan.sound') !== '0'; },
    set on(v) { ls('catan.sound', v ? '1' : '0'); },
    get volume() {
      const v = parseFloat(ls('catan.volume'));
      return isNaN(v) ? 0.8 : Math.min(1, Math.max(0, v));
    },
    set volume(v) { ls('catan.volume', String(Math.min(1, Math.max(0, v)))); }
  };

  /* --- prechargement --- */

  function build() {
    Object.keys(SFX).forEach((name) => {
      const els = [];
      for (let i = 0; i < POOL; i++) {
        const a = new Audio(SFX[name].src);
        a.preload = 'auto';
        a.volume = 0;
        els.push(a);
      }
      pools[name] = { els, next: 0 };
    });
  }

  /* Les navigateurs refusent tout son avant une interaction. On joue les
     pistes en muet au premier geste : ensuite elles repartent sans blocage. */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Object.keys(pools).forEach((name) => {
      pools[name].els.forEach((a) => {
        a.volume = 0;
        const p = a.play();
        if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
        else { try { a.pause(); a.currentTime = 0; } catch (e) {} }
      });
    });
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  }

  /* --- lecture --- */

  function fadeOut(a, ms) {
    const start = a.volume;
    const t0 = performance.now();
    clearInterval(a._fade);
    a._fade = setInterval(() => {
      const k = (performance.now() - t0) / ms;
      if (k >= 1 || a.paused) {
        clearInterval(a._fade);
        a._fade = null;
        try { a.pause(); a.currentTime = 0; } catch (e) {}
        return;
      }
      a.volume = start * (1 - k);
    }, 40);
  }

  function play(name) {
    const cfg = SFX[name];
    const pool = pools[name];
    if (!cfg || !pool || !prefs.on || !unlocked) return;

    const now = Date.now();
    if (now - (lastAt[name] || 0) < THROTTLE) return;
    lastAt[name] = now;

    const a = pool.els[pool.next];
    pool.next = (pool.next + 1) % POOL;

    clearInterval(a._fade);
    a._fade = null;
    clearTimeout(a._fadeTimer);
    try { a.pause(); a.currentTime = 0; } catch (e) {}
    a.volume = Math.min(1, Math.max(0, cfg.volume * prefs.volume));

    const p = a.play();
    if (p && p.catch) p.catch(() => {});

    if (cfg.fade) {
      const startFade = () => {
        const left = (a.duration - a.currentTime) * 1000;
        a._fadeTimer = setTimeout(() => fadeOut(a, cfg.fade), Math.max(0, left - cfg.fade));
      };
      if (isFinite(a.duration) && a.duration > 0) startFade();
      else a.addEventListener('loadedmetadata', startFade, { once: true });
    }
  }

  build();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  window.Sound = {
    play,
    list: Object.keys(SFX),
    get enabled() { return prefs.on; },
    set enabled(v) { prefs.on = !!v; },
    get volume() { return prefs.volume; },
    set volume(v) { prefs.volume = v; },
    toggle() { prefs.on = !prefs.on; return prefs.on; }
  };
})();
