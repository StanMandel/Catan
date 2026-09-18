/* ==========================================================================
   Rendu SVG du plateau de Catan (style du plateau physique)
   ========================================================================== */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  const TERRAIN = {
    forest:    { base: '#3f7a34', dark: '#2c5a24', name: 'Forêt',    res: 'lumber' },
    pasture:   { base: '#8dc45f', dark: '#6ea544', name: 'Pâturage', res: 'wool' },
    fields:    { base: '#e0bd4e', dark: '#c39c31', name: 'Champ',    res: 'grain' },
    hills:     { base: '#c07b3e', dark: '#9a5c28', name: 'Colline',  res: 'brick' },
    mountains: { base: '#9aa4ab', dark: '#76838c', name: 'Montagne', res: 'ore' },
    desert:    { base: '#e2cf9e', dark: '#c9b27c', name: 'Désert',   res: null }
  };

  const RES_COLOR = {
    lumber: '#2f6b34', brick: '#b5652c', wool: '#8dc45f', grain: '#e0bd4e', ore: '#8d989f'
  };
  const RES_LABEL = {
    lumber: 'Bois', brick: 'Argile', wool: 'Laine', grain: 'Blé', ore: 'Minerai'
  };

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) {
      if (attrs[k] === null || attrs[k] === undefined) continue;
      n.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexPoints(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      pts.push((cx + r * Math.cos(a)).toFixed(4) + ',' + (cy + r * Math.sin(a)).toFixed(4));
    }
    return pts.join(' ');
  }

  /* ------------------------------------------------------------------ */
  /* décors de tuiles                                                    */
  /* ------------------------------------------------------------------ */

  function drawForest(g, rnd) {
    const spots = [[-.45,-.3],[.05,-.45],[.45,-.15],[-.5,.25],[0,.05],[.35,.35],[-.1,.5]];
    spots.forEach((p, i) => {
      const s = 0.75 + rnd() * 0.4;
      const x = p[0] + (rnd() - .5) * .12, y = p[1] + (rnd() - .5) * .12;
      const t = el('g', { transform: 'translate(' + x + ',' + y + ') scale(' + s + ')' }, g);
      el('rect', { x: -.035, y: .06, width: .07, height: .16, fill: '#5b3a1c', rx: .02 }, t);
      el('ellipse', { cx: 0, cy: -.02, rx: .19, ry: .17, fill: i % 2 ? '#2e6b2c' : '#357a31' }, t);
      el('ellipse', { cx: -.08, cy: .04, rx: .13, ry: .12, fill: '#295f27' }, t);
      el('ellipse', { cx: .07, cy: -.09, rx: .11, ry: .1, fill: '#438a3a' }, t);
    });
  }

  function drawFields(g, rnd) {
    for (let i = 0; i < 5; i++) {
      const y = -.5 + i * .25;
      el('path', {
        d: 'M -0.72 ' + y + ' Q 0 ' + (y + .07) + ' 0.72 ' + y,
        stroke: '#c49a2c', 'stroke-width': .07, fill: 'none', opacity: .85
      }, g);
      for (let k = -3; k <= 3; k++) {
        const x = k * .2 + (rnd() - .5) * .05;
        if (Math.abs(x) > .62) continue;
        el('path', {
          d: 'M ' + x + ' ' + (y - .02) + ' l 0 -0.1 M ' + x + ' ' + (y - .1) + ' l -0.04 -0.05 M ' + x + ' ' + (y - .1) + ' l 0.04 -0.05',
          stroke: '#a67c1c', 'stroke-width': .022, fill: 'none'
        }, g);
      }
    }
  }

  function drawPasture(g, rnd) {
    el('path', { d: 'M -0.7 0.25 Q -0.2 0.05 0.35 0.3 T 0.72 0.2', stroke: '#78b04e', 'stroke-width': .06, fill: 'none', opacity: .6 }, g);
    const spots = [[-.35,-.2],[.2,-.35],[.05,.2],[.45,.05],[-.3,.35]];
    spots.forEach((p) => {
      const s = .8 + rnd() * .35;
      const t = el('g', { transform: 'translate(' + p[0] + ',' + p[1] + ') scale(' + s + ')' }, g);
      el('ellipse', { cx: 0, cy: 0, rx: .13, ry: .09, fill: '#f4f1e8' }, t);
      el('circle', { cx: .12, cy: -.04, r: .05, fill: '#4a3f34' }, t);
      el('rect', { x: -.08, y: .07, width: .025, height: .06, fill: '#4a3f34' }, t);
      el('rect', { x: .04, y: .07, width: .025, height: .06, fill: '#4a3f34' }, t);
    });
  }

  function drawHills(g, rnd) {
    for (let row = 0; row < 5; row++) {
      const y = -.5 + row * .24;
      const off = row % 2 ? .1 : -.05;
      for (let c = -3; c <= 3; c++) {
        const x = off + c * .21;
        if (Math.abs(x) > .55 || Math.abs(x) + Math.abs(y) > .95) continue;
        el('rect', {
          x: x - .085, y: y - .05, width: .17, height: .1, rx: .015,
          fill: rnd() > .5 ? '#a95c2b' : '#96501f', stroke: '#7d411a', 'stroke-width': .012
        }, g);
      }
    }
  }

  function drawMountains(g) {
    el('path', { d: 'M -0.62 0.4 L -0.2 -0.35 L 0.18 0.4 Z', fill: '#8c979e', stroke: '#6d7981', 'stroke-width': .02 }, g);
    el('path', { d: 'M -0.2 -0.35 L -0.06 -0.1 L -0.34 -0.1 Z', fill: '#f2f5f7' }, g);
    el('path', { d: 'M 0.02 0.42 L 0.34 -0.15 L 0.66 0.42 Z', fill: '#7e8990', stroke: '#66727a', 'stroke-width': .02 }, g);
    el('path', { d: 'M 0.34 -0.15 L 0.45 0.05 L 0.23 0.05 Z', fill: '#e8eef1' }, g);
    el('path', { d: 'M -0.55 0.42 L -0.3 0.42 L -0.42 0.18 Z', fill: '#98a3aa', opacity: .7 }, g);
    el('path', { d: 'M -0.7 0.45 Q 0 0.62 0.7 0.45', stroke: '#6d7981', 'stroke-width': .04, fill: 'none', opacity: .5 }, g);
  }

  function drawDesert(g, rnd) {
    el('path', { d: 'M -0.65 0.15 Q -0.2 -0.05 0.3 0.12 T 0.68 0.05', stroke: '#c9b27c', 'stroke-width': .05, fill: 'none' }, g);
    el('path', { d: 'M -0.6 0.42 Q -0.1 0.24 0.55 0.4', stroke: '#c9b27c', 'stroke-width': .04, fill: 'none' }, g);
    const rocks = [[-.28,-.22],[.18,-.3],[.34,.2],[-.1,.3]];
    rocks.forEach((p) => {
      const s = .7 + rnd() * .5;
      const t = el('g', { transform: 'translate(' + p[0] + ',' + p[1] + ') scale(' + s + ')' }, g);
      el('path', { d: 'M -0.16 0.08 L -0.1 -0.08 L 0.04 -0.12 L 0.16 0.02 L 0.1 0.09 Z', fill: '#a9803f', stroke: '#8a6528', 'stroke-width': .015 }, t);
      el('path', { d: 'M -0.1 -0.08 L 0.04 -0.12 L 0.02 -0.02 Z', fill: '#c19a58' }, t);
    });
  }

  const PAINTERS = {
    forest: drawForest, pasture: drawPasture, fields: drawFields,
    hills: drawHills, mountains: drawMountains, desert: drawDesert
  };

  // tuiles illustrées (remplacent le décor dessiné quand elles existent)
  const TILE_IMG = {
    forest: 'img/cases/forest.png',
    pasture: 'img/cases/pasture.png',
    fields: 'img/cases/fields.png',
    hills: 'img/cases/hills.png',
    mountains: 'img/cases/mountains.png',
    desert: 'img/cases/desert.png'
  };

  /* ------------------------------------------------------------------ */

  const SQRT3 = Math.sqrt(3);

  /** Positions de mer voisines des terres (cadre autour de l ile, lacs). */
  function seaCells(hexes) {
    // grille entière relative à la première tuile (le centre du plateau peut tomber entre deux rangées)
    const x0 = hexes[0].x, y0 = hexes[0].y;
    const col = (h) => Math.round((h.x - x0) / (SQRT3 / 2));
    const row = (h) => Math.round((h.y - y0) / 1.5);
    const land = new Set(hexes.map((h) => col(h) + ',' + row(h)));
    const sea = new Map();
    // toute la mer comprise dans l emprise des terres (baies, détroits entre îles)
    const cols = hexes.map(col), rows = hexes.map(row);
    const minI = Math.min(...cols), maxI = Math.max(...cols), minJ = Math.min(...rows), maxJ = Math.max(...rows);
    for (let j = minJ; j <= maxJ; j++) {
      for (let i = minI; i <= maxI; i++) {
        if (((i + j) % 2 + 2) % 2 !== 0) continue; // la première tuile est en (0,0)
        const k = i + ',' + j;
        if (!land.has(k)) sea.set(k, { x: x0 + i * SQRT3 / 2, y: y0 + j * 1.5 });
      }
    }
    // plus un anneau autour des côtes
    const dirs = [[2, 0], [-2, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const h of hexes) {
      const i = col(h), j = row(h);
      for (const d of dirs) {
        const k = (i + d[0]) + ',' + (j + d[1]);
        if (!land.has(k) && !sea.has(k)) sea.set(k, { x: x0 + (i + d[0]) * SQRT3 / 2, y: y0 + (j + d[1]) * 1.5 });
      }
    }
    return Array.from(sea.values());
  }

  function boundsOf(hexes) {
    const xs = hexes.map((h) => h.x), ys = hexes.map((h) => h.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  /**
   * Vue SVG d un plateau. Une instance pour la partie (interactive),
   * une autre pour l apercu du salon. `prefix` evite les collisions d id.
   */
  function createView(prefix, interactive) {
    const id = (name) => prefix + '-' + name;

    return {
      svg: null,
      layers: {},
      handlers: {},
      boardSig: null,
      home: { x: -5.55, y: -5.2, w: 11.1, h: 10.4 },
      view: { x: -5.55, y: -5.2, w: 11.1, h: 10.4 },

      init(svg, handlers) {
        this.svg = svg;
        this.handlers = handlers || {};
        this.applyView();
        if (interactive) this.bindPanZoom();
      },

      applyView() {
        const v = this.view;
        this.svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h);
        this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      },

      zoom(factor, cx, cy) {
        const v = this.view;
        const nx = cx === undefined ? v.x + v.w / 2 : cx;
        const ny = cy === undefined ? v.y + v.h / 2 : cy;
        const nw = Math.max(4, Math.min(Math.max(20, this.home.w * 1.8), v.w * factor));
        const nh = nw * (v.h / v.w);
        v.x = nx - (nx - v.x) * (nw / v.w);
        v.y = ny - (ny - v.y) * (nh / v.h);
        v.w = nw; v.h = nh;
        this.applyView();
      },

      reset() {
        this.view = Object.assign({}, this.home);
        this.applyView();
      },

      toBoard(evt) {
        const rect = this.svg.getBoundingClientRect();
        const v = this.view;
        // preserveAspectRatio meet : calcul de l échelle réelle
        const scale = Math.min(rect.width / v.w, rect.height / v.h);
        const offX = (rect.width - v.w * scale) / 2;
        const offY = (rect.height - v.h * scale) / 2;
        return {
          x: v.x + (evt.clientX - rect.left - offX) / scale,
          y: v.y + (evt.clientY - rect.top - offY) / scale
        };
      },

      bindPanZoom() {
        const svg = this.svg;
        let dragging = false, last = null, moved = 0;
        svg.addEventListener('wheel', (e) => {
          e.preventDefault();
          const p = this.toBoard(e);
          this.zoom(e.deltaY > 0 ? 1.12 : 0.89, p.x, p.y);
        }, { passive: false });
        svg.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          dragging = true; moved = 0; last = { x: e.clientX, y: e.clientY };
          svg.classList.add('dragging');
          // pas de selection de texte pendant le glisser, meme en sortant du plateau
          document.body.classList.add('no-select');
          if (window.getSelection) window.getSelection().removeAllRanges();
        });
        window.addEventListener('pointermove', (e) => {
          if (!dragging) return;
          const rect = svg.getBoundingClientRect();
          const scale = Math.min(rect.width / this.view.w, rect.height / this.view.h);
          const dx = (e.clientX - last.x) / scale;
          const dy = (e.clientY - last.y) / scale;
          moved += Math.abs(dx) + Math.abs(dy);
          this.view.x -= dx; this.view.y -= dy;
          last = { x: e.clientX, y: e.clientY };
          this.applyView();
        });
        window.addEventListener('pointerup', () => {
          dragging = false;
          svg.classList.remove('dragging');
          document.body.classList.remove('no-select');
        });
      },

      /* ---------------------------------------------------------------- */

      buildStatic(board) {
        const svg = this.svg;
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        const b = boundsOf(board.hexes);
        this.home = { x: b.minX - 2.0, y: b.minY - 2.15, w: b.maxX - b.minX + 4.0, h: b.maxY - b.minY + 4.3 };
        this.reset();
        const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
        const reach = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2 + 2;

        const defs = el('defs', {}, svg);
        const sea = el('radialGradient', {
          id: id('seaGrad'), gradientUnits: 'userSpaceOnUse', cx, cy, r: reach
        }, defs);
        el('stop', { offset: '0%', 'stop-color': '#3aa3e0' }, sea);
        el('stop', { offset: '60%', 'stop-color': '#1f7fc4' }, sea);
        el('stop', { offset: '100%', 'stop-color': '#12507f' }, sea);

        const shadow = el('filter', { id: id('tileShadow'), x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
        el('feDropShadow', { dx: 0, dy: .04, stdDeviation: .04, 'flood-opacity': .45 }, shadow);

        this.layers.ocean = el('g', {}, svg);
        this.layers.ports = el('g', {}, svg);
        this.layers.hexes = el('g', {}, svg);
        this.layers.tokens = el('g', {}, svg);
        this.layers.roads = el('g', {}, svg);
        this.layers.buildings = el('g', {}, svg);
        this.layers.robber = el('g', {}, svg);
        this.layers.hints = el('g', {}, svg);

        /* --- mer : un anneau de tuiles océan autour des terres (et dans les lacs) --- */
        const seas = seaCells(board.hexes);
        const outline = el('g', {}, this.layers.ocean);
        const water = el('g', {}, this.layers.ocean);
        for (const s of seas) {
          el('polygon', { points: hexPoints(s.x, s.y, 1.04), fill: '#0d4067', stroke: '#0d4067', 'stroke-width': .16, 'stroke-linejoin': 'round' }, outline);
          el('polygon', { points: hexPoints(s.x, s.y, 1.02), fill: 'url(#' + id('seaGrad') + ')', stroke: 'url(#' + id('seaGrad') + ')', 'stroke-width': .06 }, water);
        }
        // sous les terres aussi, pour qu aucun interstice ne laisse voir le fond
        for (const h of board.hexes) {
          el('polygon', { points: hexPoints(h.x, h.y, 1.02), fill: 'url(#' + id('seaGrad') + ')' }, water);
        }
        // vaguelettes
        const rnd = mulberry32(7);
        for (const s of seas) {
          if (rnd() < .45) continue;
          const x = s.x + (rnd() - .5) * .9, y = s.y + (rnd() - .5) * .8;
          el('path', {
            d: 'M ' + (x - .16) + ' ' + y + ' q 0.08 -0.06 0.16 0 t 0.16 0',
            stroke: 'rgba(255,255,255,.28)', 'stroke-width': .035, fill: 'none'
          }, this.layers.ocean);
        }

        /* --- ports --- */
        for (const p of board.ports) {
          const bx = p.x + p.dx * .62, by = p.y + p.dy * .62;
          const ends = p.ends || p.vertices.map((vid) => board.vertices[vid]);
          for (const v of ends) {
            el('line', { x1: bx, y1: by, x2: v.x, y2: v.y, class: 'port-line' }, this.layers.ports);
          }
          const isGeneric = p.type === '3:1';
          el('circle', {
            cx: bx, cy: by, r: .42,
            fill: isGeneric ? '#f0e2c0' : RES_COLOR[p.type],
            stroke: '#7a5a2e', 'stroke-width': .06
          }, this.layers.ports);
          el('circle', { cx: bx, cy: by, r: .35, fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': .03 }, this.layers.ports);
          const dark = isGeneric || p.type === 'wool' || p.type === 'grain';
          el('text', {
            x: bx, y: by + (isGeneric ? .1 : -.02), class: 'port-text', 'font-size': .28,
            fill: dark ? '#3b2a12' : '#fff'
          }, this.layers.ports).textContent = isGeneric ? '3:1' : '2:1';
          if (!isGeneric) {
            el('text', {
              x: bx, y: by + .24, class: 'port-text', 'font-size': .17, fill: dark ? '#3b2a12' : '#fff'
            }, this.layers.ports).textContent = RES_LABEL[p.type];
          }
        }

        /* --- tuiles --- */
        for (const h of board.hexes) {
          const info = TERRAIN[h.terrain];
          const g = el('g', { transform: 'translate(' + h.x + ',' + h.y + ')', filter: 'url(#' + id('tileShadow') + ')' }, this.layers.hexes);
          el('polygon', { points: hexPoints(0, 0, .995), fill: '#e9d9b2' }, g);
          if (TILE_IMG[h.terrain]) {
            const r = .995;
            const img = el('image', {
              x: -r * SQRT3 / 2, y: -r, width: r * SQRT3, height: 2 * r,
              preserveAspectRatio: 'none'
            }, g);
            img.setAttribute('href', TILE_IMG[h.terrain]);
          } else {
            const clipId = id('clip-hex-' + h.id);
            const clip = el('clipPath', { id: clipId }, g);
            el('polygon', { points: hexPoints(0, 0, .93) }, clip);
            el('polygon', { points: hexPoints(0, 0, .93), fill: info.base, class: 'hex-shape' }, g);
            const art = el('g', { 'clip-path': 'url(#' + clipId + ')' }, g);
            (PAINTERS[h.terrain] || function () {})(art, mulberry32(h.id * 9973 + 17));
            el('polygon', { points: hexPoints(0, 0, .93), fill: 'none', stroke: 'rgba(120,90,40,.45)', 'stroke-width': .03 }, g);
          }

          if (interactive) {
            const hit = el('polygon', {
              points: hexPoints(0, 0, .93), class: 'hex-hit', 'data-hex': h.id
            }, g);
            hit.addEventListener('click', () => {
              if (this.handlers.onHex) this.handlers.onHex(h.id);
            });
          }

          /* jeton numéroté */
          if (h.number) {
            const t = el('g', { transform: 'translate(' + h.x + ',' + h.y + ')' }, this.layers.tokens);
            const hot = h.number === 6 || h.number === 8;
            el('circle', { cx: 0, cy: 0, r: .33, class: 'token-circle' }, t);
            el('circle', { cx: 0, cy: 0, r: .3, fill: 'none', stroke: 'rgba(0,0,0,.15)', 'stroke-width': .02 }, t);
            el('text', {
              x: 0, y: .06, class: 'token-text' + (hot ? ' hot' : ''), 'font-size': .34,
              fill: hot ? '#b3261e' : '#3b2a12'
            }, t).textContent = h.number;
            const pips = h.pips;
            for (let i = 0; i < pips; i++) {
              el('circle', {
                cx: (i - (pips - 1) / 2) * .07, cy: .19, r: .022,
                class: 'pip' + (hot ? ' hot' : '')
              }, t);
            }
          }
        }
      },

      drawRobber(board, hexId) {
        const L = this.layers.robber;
        while (L.firstChild) L.removeChild(L.firstChild);
        const rh = board.hexes[hexId];
        if (!rh) return;
        const g = el('g', { transform: 'translate(' + rh.x + ',' + (rh.y + .48) + ')', class: 'robber-shape' }, L);
        el('ellipse', { cx: 0, cy: .2, rx: .19, ry: .06, fill: 'rgba(0,0,0,.35)' }, g);
        el('path', {
          d: 'M -0.15 0.2 Q -0.17 -0.02 -0.06 -0.1 L 0.06 -0.1 Q 0.17 -0.02 0.15 0.2 Z',
          fill: '#3b3b3b', stroke: '#161616', 'stroke-width': .03
        }, g);
        el('circle', { cx: 0, cy: -.17, r: .1, fill: '#4a4a4a', stroke: '#161616', 'stroke-width': .03 }, g);
      },

      /** Apercu statique (salon). */
      preview(board) {
        const sig = board.map + ':' + board.hexes.map((h) => h.terrain + (h.number || 0)).join('|') +
                    board.ports.map((p) => p.type + p.x.toFixed(2) + p.y.toFixed(2)).join('|');
        if (sig === this.boardSig) return;
        this.boardSig = sig;
        this.buildStatic(board);
        this.drawRobber(board, board.robber);
      },

      /* ---------------------------------------------------------------- */

      render(state) {
        const board = state.board;
        const sig = board.map + ':' + board.hexes.map((h) => h.terrain + (h.number || 0)).join('|') +
                    board.ports.map((p) => p.type + p.edge).join('|');
        if (sig !== this.boardSig) {
          this.boardSig = sig;
          this.buildStatic(board);
        }

        const L = this.layers;
        [L.roads, L.buildings, L.hints].forEach((g) => { while (g.firstChild) g.removeChild(g.firstChild); });

        const colorOf = (idx) => (state.players[idx] || {}).color || '#999';

        /* routes */
        for (const eid in state.roads) {
          const e = board.edges[eid];
          const a = board.vertices[e.v[0]], b = board.vertices[e.v[1]];
          const dx = b.x - a.x, dy = b.y - a.y;
          const x1 = a.x + dx * .16, y1 = a.y + dy * .16;
          const x2 = b.x - dx * .16, y2 = b.y - dy * .16;
          el('line', { x1, y1, x2, y2, stroke: '#1b1109', 'stroke-width': .19, 'stroke-linecap': 'round' }, L.roads);
          el('line', { x1, y1, x2, y2, stroke: colorOf(state.roads[eid]), 'stroke-width': .13, class: 'road-line' }, L.roads);
        }

        /* colonies et villes */
        for (const vid in state.buildings) {
          const b = state.buildings[vid];
          const v = board.vertices[vid];
          const g = el('g', { transform: 'translate(' + v.x + ',' + v.y + ')' }, L.buildings);
          if (b.type === 'settlement') {
            const dHouse = 'M -0.2 0.18 L -0.2 -0.02 L 0 -0.23 L 0.2 -0.02 L 0.2 0.18 Z';
            el('path', { d: dHouse, fill: 'none', stroke: '#fff6e2', 'stroke-width': .1, 'stroke-linejoin': 'round' }, g);
            el('path', { d: dHouse, fill: colorOf(b.owner), class: 'building' }, g);
            el('path', { d: 'M -0.2 -0.02 L 0 -0.23 L 0.2 -0.02', fill: 'none', stroke: 'rgba(0,0,0,.35)', 'stroke-width': .035 }, g);
          } else {
            const dCity = 'M -0.3 0.19 L -0.3 -0.04 L -0.1 -0.04 L -0.1 -0.16 L 0.03 -0.28 L 0.16 -0.16 L 0.3 -0.16 L 0.3 0.19 Z';
            el('path', { d: dCity, fill: 'none', stroke: '#fff6e2', 'stroke-width': .1, 'stroke-linejoin': 'round' }, g);
            el('path', { d: dCity, fill: colorOf(b.owner), class: 'building' }, g);
            el('rect', { x: -.24, y: .02, width: .09, height: .1, fill: 'rgba(0,0,0,.4)' }, g);
            el('rect', { x: .07, y: .02, width: .09, height: .1, fill: 'rgba(0,0,0,.4)' }, g);
          }
        }

        /* bateaux amarrés aux ports */
        const perPort = {};
        for (const boat of state.boats || []) {
          const p = board.ports[boat.port];
          if (!p) continue;
          const k = perPort[boat.port] = (perPort[boat.port] || 0) + 1;
          // à côté du badge du port, décalés le long de la côte
          const side = k % 2 ? 1 : -1;
          const off = .62 + Math.ceil(k / 2) * .02;
          const bx = p.x + p.dx * off - p.dy * side * (.7 + Math.floor((k - 1) / 2) * .5);
          const by = p.y + p.dy * off + p.dx * side * (.7 + Math.floor((k - 1) / 2) * .5);
          const g = el('g', { transform: 'translate(' + bx + ',' + by + ') scale(1.6)', class: 'boat' }, L.buildings);
          el('path', { d: 'M -0.2 0.04 L 0.2 0.04 L 0.13 0.14 L -0.13 0.14 Z', fill: '#6b4524', stroke: '#1b1109', 'stroke-width': .025 }, g);
          el('path', { d: 'M -0.01 0.02 L -0.01 -0.24 L 0.15 0.02 Z', fill: colorOf(boat.owner), stroke: '#1b1109', 'stroke-width': .025, 'stroke-linejoin': 'round' }, g);
          el('line', { x1: -0.01, y1: .04, x2: -0.01, y2: -.26, stroke: '#1b1109', 'stroke-width': .025 }, g);
        }

        /* voleur */
        this.drawRobber(board, state.robber);

        /* aides visuelles : emplacements jouables */
        const you = state.you;
        const valid = (you && you.valid) || {};
        const mode = this.mode || null;

        const wantVertex = (mode === 'settlement' && valid.settlements) ||
                           (state.phase === 'setup' && you && you.isMyTurn && valid.settlements);
        if (wantVertex) {
          for (const vid of valid.settlements) {
            const v = board.vertices[vid];
            const c = el('circle', { cx: v.x, cy: v.y, r: .17, class: 'spot' }, L.hints);
            c.addEventListener('click', () => this.handlers.onVertex && this.handlers.onVertex(vid, 'settlement'));
          }
        }
        if (mode === 'city' && valid.cities) {
          for (const vid of valid.cities) {
            const v = board.vertices[vid];
            const c = el('circle', { cx: v.x, cy: v.y, r: .22, class: 'spot' }, L.hints);
            c.addEventListener('click', () => this.handlers.onVertex && this.handlers.onVertex(vid, 'city'));
          }
        }
        const wantRoad = (mode === 'road' && valid.roads) ||
                         (state.phase === 'setup' && you && you.isMyTurn && valid.roads);
        if (wantRoad) {
          for (const eid of valid.roads) {
            const e = board.edges[eid];
            const a = board.vertices[e.v[0]], b = board.vertices[e.v[1]];
            const dx = b.x - a.x, dy = b.y - a.y;
            const line = el('line', {
              x1: a.x + dx * .2, y1: a.y + dy * .2, x2: b.x - dx * .2, y2: b.y - dy * .2,
              'stroke-width': .16, class: 'road-spot'
            }, L.hints);
            line.addEventListener('click', () => this.handlers.onEdge && this.handlers.onEdge(eid));
          }
        }

        if (mode === 'boat' && valid.boats) {
          for (const portId of valid.boats) {
            const p = board.ports[portId];
            const c = el('circle', { cx: p.x + p.dx * .62, cy: p.y + p.dy * .62, r: .5, class: 'spot port-spot' }, L.hints);
            c.addEventListener('click', () => this.handlers.onPort && this.handlers.onPort(portId));
          }
        }

        /* déplacement du voleur */
        const pickHex = state.phase === 'robber' && you && you.isMyTurn;
        const hits = this.svg.querySelectorAll('.hex-hit');
        const allowed = new Set(valid.robber || []);
        // voleur amical : seules les tuiles autorisées sont proposées
        for (const hit of hits) hit.classList.toggle('pick', !!pickHex && allowed.has(Number(hit.dataset.hex)));
      },

      setMode(mode) {
        this.mode = mode;
      }
    };
  }

  window.Board = createView('game', true);
  window.BoardPreview = createView('preview', false);
  window.createBoardView = createView;
  window.TERRAIN_INFO = TERRAIN;
  window.RES_COLOR = RES_COLOR;
  window.RES_LABEL = RES_LABEL;
})();
