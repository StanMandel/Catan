'use strict';
/**
 * Generation du plateau de Catan a partir d une carte (voir maps.js) :
 *  - hexagones (pointe en haut), intersections (sommets) et aretes
 *  - jetons numerotes et ports repartis sur la cote
 * Les cartes peuvent avoir plusieurs iles ou un lac : la cote est
 * decoupee en autant de boucles que necessaire.
 */

const { getMap, FIXED } = require('./maps');
const { computeBalance } = require('./balance');

const SQRT3 = Math.sqrt(3);

const TERRAIN_RESOURCE = {
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  hills: 'brick',
  mountains: 'ore',
  desert: null
};

// Disposition « debutant » de la carte classique (plateau non aleatoire)
const CLASSIC_TILES = [
  'forest', 'forest', 'forest', 'forest',
  'pasture', 'pasture', 'pasture', 'pasture',
  'fields', 'fields', 'fields', 'fields',
  'hills', 'hills', 'hills',
  'mountains', 'mountains', 'mountains',
  'desert'
];
// Ordre spirale : indices des hexagones dans l ordre de pose des jetons,
// en partant du coin haut-gauche vers le centre.
const CLASSIC_SPIRAL = [0, 1, 2, 6, 11, 15, 18, 17, 16, 12, 7, 3, 4, 5, 10, 14, 13, 8, 9];

const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

function key(x, y) {
  const r = (v) => {
    const n = Math.round(v * 1000) / 1000;
    return (Math.abs(n) < 1e-9 ? 0 : n).toFixed(3);
  };
  return r(x) + '|' + r(y);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Geometrie d une carte (hexagones, sommets, aretes, boucles cotieres). */
function buildGeometry(map) {
  const cells = [];
  map.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === 'x' || FIXED[row[i]]) cells.push({ i, j, fixed: FIXED[row[i]] || null });
    }
  });
  const minI = Math.min(...cells.map((c) => c.i)), maxI = Math.max(...cells.map((c) => c.i));
  const minJ = Math.min(...cells.map((c) => c.j)), maxJ = Math.max(...cells.map((c) => c.j));
  const midI = (minI + maxI) / 2, midJ = (minJ + maxJ) / 2;

  const hexes = cells.map((c, id) => ({
    id, x: (c.i - midI) * SQRT3 / 2, y: (c.j - midJ) * 1.5, fixed: c.fixed,
    vertices: [], edges: [], neighbors: []
  }));

  const vertexMap = new Map();
  const vertices = [];
  const edgeMap = new Map();
  const edges = [];

  const corner = (h, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return { x: h.x + Math.cos(a), y: h.y + Math.sin(a) };
  };

  for (const h of hexes) {
    const ids = [];
    for (let i = 0; i < 6; i++) {
      const p = corner(h, i);
      const k = key(p.x, p.y);
      let v = vertexMap.get(k);
      if (!v) {
        v = { id: vertices.length, x: p.x, y: p.y, hexes: [], edges: [], adjacent: [], port: null };
        vertexMap.set(k, v);
        vertices.push(v);
      }
      v.hexes.push(h.id);
      ids.push(v.id);
      h.vertices.push(v.id);
    }
    for (let i = 0; i < 6; i++) {
      const a = ids[i], b = ids[(i + 1) % 6];
      const k = a < b ? a + '-' + b : b + '-' + a;
      let e = edgeMap.get(k);
      if (!e) {
        const va = vertices[a], vb = vertices[b];
        e = { id: edges.length, v: [a, b], hexes: [], x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2, port: null };
        edgeMap.set(k, e);
        edges.push(e);
        vertices[a].edges.push(e.id);
        vertices[b].edges.push(e.id);
        if (!vertices[a].adjacent.includes(b)) vertices[a].adjacent.push(b);
        if (!vertices[b].adjacent.includes(a)) vertices[b].adjacent.push(a);
      }
      e.hexes.push(h.id);
      h.edges.push(e.id);
    }
  }

  for (const a of hexes) {
    for (const b of hexes) {
      if (a.id === b.id) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (Math.abs(d - SQRT3) < 0.01) a.neighbors.push(b.id);
    }
  }

  // Cote : les aretes bordant un seul hexagone forment une ou plusieurs boucles
  // (chaque sommet cotier touche exactement deux aretes cotieres).
  const coastEdges = edges.filter((e) => e.hexes.length === 1);
  const byVertex = new Map();
  for (const e of coastEdges) {
    for (const v of e.v) {
      if (!byVertex.has(v)) byVertex.set(v, []);
      byVertex.get(v).push(e.id);
    }
  }
  const used = new Set();
  const loops = [];
  for (const start of coastEdges) {
    if (used.has(start.id)) continue;
    const loop = [];
    let cur = start;
    let entry = cur.v[0];
    while (cur && !used.has(cur.id)) {
      loop.push(cur.id);
      used.add(cur.id);
      const next = cur.v.find((v) => v !== entry);
      const nextEdgeId = (byVertex.get(next) || []).find((id) => !used.has(id));
      entry = next;
      cur = nextEdgeId === undefined ? null : edges[nextEdgeId];
    }
    loops.push(loop);
  }
  // la plus longue boucle (cote exterieure principale) en premier
  loops.sort((a, b) => b.length - a.length);

  return { hexes, vertices, edges, coastLoops: loops, coastRing: [].concat(...loops) };
}

const GEOMETRY_CACHE = new Map();
function geometryOf(map) {
  if (!GEOMETRY_CACHE.has(map.id)) GEOMETRY_CACHE.set(map.id, buildGeometry(map));
  return GEOMETRY_CACHE.get(map.id);
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/** Choisit les aretes cotieres des ports, espacees regulierement. */
function pickPortEdges(map, geo) {
  const n = map.ports.length;
  const loops = geo.coastLoops;

  // nombre de ports par boucle cotiere, proportionnel a sa longueur ;
  // un lac ou un ilot (petite boucle) n en recoit qu un seul
  const cap = (loop) => (loop.length < 12 ? 1 : Infinity);
  const counts = loops.map(() => 0);
  for (let k = 0; k < n; k++) {
    let bestLoop = -1, bestRatio = -1;
    loops.forEach((loop, i) => {
      if (counts[i] >= cap(loop)) return;
      const ratio = loop.length / (counts[i] + 1);
      if (ratio > bestRatio) { bestRatio = ratio; bestLoop = i; }
    });
    if (bestLoop < 0) break;
    counts[bestLoop]++;
  }

  const taken = new Set(); // sommets deja utilises (ou voisins) par un port
  const chosen = [];
  loops.forEach((loop, i) => {
    let offsets = Array.from({ length: counts[i] }, (_, k) => Math.floor((k * loop.length) / counts[i]));
    if (map.portOffsets && loops.length === 1 && loop.length === 30) offsets = map.portOffsets;
    for (const off of offsets) {
      for (let shift = 0; shift < loop.length; shift++) {
        const eid = loop[(off + shift) % loop.length];
        const e = geo.edges[eid];
        if (chosen.includes(eid) || e.v.some((v) => taken.has(v))) continue;
        // ecarte aussi les sommets voisins pour ne pas coller deux ports
        for (const v of e.v) { taken.add(v); for (const nb of geo.vertices[v].adjacent) taken.add(nb); }
        chosen.push(eid);
        break;
      }
    }
  });
  return chosen;
}

// un plateau aleatoire doit etre « vert » (au moins ce score) en ressources, numeros et ports
const MIN_BALANCE = 70;
const MAX_BALANCE_TRIES = 3000;

/**
 * Cree un plateau jouable.
 * opts : { map: id de carte, random: disposition aleatoire, fair: pas de 6/8 adjacents, rng,
 *          balanced: retirer jusqu a un plateau equilibre (par defaut pour les plateaux aleatoires) }
 */
function createBoard(opts) {
  opts = opts || {};
  if (opts.random === false || opts.balanced === false) return generateBoard(opts);
  // tirages successifs jusqu a un plateau equilibre ; a defaut, le meilleur rencontre
  let best = null, bestKey = -1;
  for (let i = 0; i < MAX_BALANCE_TRIES; i++) {
    const board = generateBoard(opts);
    const b = computeBalance(board);
    const weakest = Math.min(b.resources, b.numbers, b.ports);
    if (weakest >= MIN_BALANCE) return board;
    const key = weakest * 1000 + b.score;
    if (key > bestKey) { bestKey = key; best = board; }
  }
  return best;
}

function generateBoard(opts) {
  const map = getMap(opts.map);
  const geo = geometryOf(map);
  const random = opts.random !== false;
  const fair = opts.fair !== false;
  const classicFixed = map.id === 'classic' && !random;
  // une carte non aleatoire garde toujours la meme disposition
  const rng = random ? (opts.rng || Math.random) : mulberry32(hashString(map.id));

  const tileBag = [];
  for (const t in map.tiles) for (let i = 0; i < map.tiles[t]; i++) tileBag.push(t);

  const count = geo.hexes.length;
  const deal = () => {
    const t = new Array(count);
    const n = new Array(count).fill(null);
    if (classicFixed) {
      CLASSIC_TILES.forEach((tile, i) => { t[i] = tile; });
      let k = 0;
      for (const hexId of CLASSIC_SPIRAL) if (t[hexId] !== 'desert') n[hexId] = map.numbers[k++];
      return { t, n };
    }
    const tiles = shuffle(tileBag, rng);
    const numbers = shuffle(map.numbers, rng);
    let a = 0, k = 0;
    for (const h of geo.hexes) t[h.id] = h.fixed || tiles[a++];
    for (const h of geo.hexes) if (t[h.id] !== 'desert') n[h.id] = numbers[k++];
    return { t, n };
  };

  const hot = (x) => x === 6 || x === 8;
  // le jeton `value` pose sur `hexId` est-il en conflit avec un voisin (hors `ignore`) ?
  const clashes = (n, hexId, value, ignore) => {
    if (value === null) return false;
    for (const nb of geo.hexes[hexId].neighbors) {
      if (nb === ignore) continue;
      const b = n[nb];
      if (b === null) continue;
      if (hot(value) && hot(b)) return true;
      if (value === b && (value === 2 || value === 12)) return true;
    }
    return false;
  };
  const conflicts = (n) => geo.hexes.filter((h) => clashes(n, h.id, n[h.id], -1)).map((h) => h.id);

  let dealt = deal();
  if (fair && !classicFixed) {
    const n = dealt.n;
    // reparation par echanges : un jeton en conflit part sur une tuile ou il est tranquille
    for (let pass = 0; pass < 5000; pass++) {
      const bad = conflicts(n);
      if (!bad.length) break;
      const a = bad[Math.floor(rng() * bad.length)];
      const spots = shuffle(geo.hexes.map((h) => h.id), rng).filter((b) =>
        b !== a && n[b] !== null && !clashes(n, b, n[a], a) && !clashes(n, a, n[b], b));
      if (spots.length && pass % 300 !== 299) {
        const b = spots[0];
        const tmp = n[a]; n[a] = n[b]; n[b] = tmp;
      } else {
        dealt = deal();
        for (let i = 0; i < count; i++) n[i] = dealt.n[i];
        dealt.n = n;
      }
    }
  }
  const tiles = dealt.t;
  const numbers = dealt.n;

  const hexes = geo.hexes.map((h) => ({
    id: h.id,
    x: h.x,
    y: h.y,
    terrain: tiles[h.id],
    resource: TERRAIN_RESOURCE[tiles[h.id]],
    number: numbers[h.id],
    pips: numbers[h.id] ? PIPS[numbers[h.id]] : 0,
    fixed: !!h.fixed,
    vertices: h.vertices.slice(),
    edges: h.edges.slice(),
    neighbors: h.neighbors.slice()
  }));

  const portEdges = pickPortEdges(map, geo);
  const portTypes = random ? shuffle(map.ports, rng) : map.ports.slice();
  const ports = portEdges.map((edgeId, i) => {
    const e = geo.edges[edgeId];
    const h = geo.hexes[e.hexes[0]];
    // le port est pose du cote de la mer, a l oppose de sa tuile
    const len = Math.hypot(e.x - h.x, e.y - h.y) || 1;
    const type = portTypes[i];
    return {
      id: i,
      edge: edgeId,
      vertices: e.v.slice(),
      ends: e.v.map((v) => ({ x: geo.vertices[v].x, y: geo.vertices[v].y })),
      type,
      ratio: type === '3:1' ? 3 : 2,
      x: e.x,
      y: e.y,
      dx: (e.x - h.x) / len,
      dy: (e.y - h.y) / len
    };
  });

  const vertices = geo.vertices.map((v) => ({
    id: v.id, x: v.x, y: v.y, hexes: v.hexes.slice(), edges: v.edges.slice(),
    adjacent: v.adjacent.slice(), port: null
  }));
  for (const p of ports) for (const v of p.vertices) vertices[v].port = p.id;

  const edges = geo.edges.map((e) => ({
    id: e.id, v: e.v.slice(), hexes: e.hexes.slice(), x: e.x, y: e.y, port: null
  }));
  for (const p of ports) edges[p.edge].port = p.id;

  let robber = hexes.findIndex((h) => h.terrain === 'desert');
  if (robber < 0) robber = 0;

  return { map: map.id, hexes, vertices, edges, ports, robber, coastRing: geo.coastRing.slice() };
}

/** Version allegee du plateau pour l apercu dans le salon. */
function boardPreview(board) {
  return {
    map: board.map,
    robber: board.robber,
    balance: computeBalance(board),
    hexes: board.hexes.map((h) => ({ id: h.id, x: h.x, y: h.y, terrain: h.terrain, number: h.number, pips: h.pips })),
    ports: board.ports.map((p) => ({ type: p.type, x: p.x, y: p.y, dx: p.dx, dy: p.dy, ends: p.ends }))
  };
}

module.exports = { createBoard, boardPreview, TERRAIN_RESOURCE, PIPS };
