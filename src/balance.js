'use strict';
/**
 * Indice d equilibrage d un plateau (0 a 100), en trois volets :
 *  - ressources : part de production de chaque ressource et regroupement des terrains
 *  - numeros    : repartition geographique de la production, jetons identiques voisins
 *  - ports      : ports 2:1 colles a leur propre ressource, ecart de richesse entre les ports
 */

const RESOURCES = ['lumber', 'brick', 'wool', 'grain', 'ore'];
const RES_FR = { lumber: 'Bois', brick: 'Argile', wool: 'Laine', grain: 'Blé', ore: 'Minerai' };
const SECTORS = 6;

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

function coefVar(values) {
  const n = values.length;
  if (!n) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return Math.sqrt(variance) / mean;
}

/** Secteur angulaire (autour du centre des terres) d un point. */
function sectorOf(x, y, cx, cy) {
  const a = Math.atan2(y - cy, x - cx) + Math.PI;
  return Math.min(SECTORS - 1, Math.floor((a / (2 * Math.PI)) * SECTORS));
}

function computeBalance(board) {
  const hexes = board.hexes;
  const land = hexes.filter((h) => h.resource);
  const totalPips = land.reduce((a, h) => a + (h.pips || 0), 0) || 1;
  const cx = hexes.reduce((a, h) => a + h.x, 0) / hexes.length;
  const cy = hexes.reduce((a, h) => a + h.y, 0) / hexes.length;
  const details = [];
  // les ecarts naturels diminuent avec la taille de la carte : on ramene tout a une ile de 18 tuiles
  const sizeNorm = Math.sqrt(Math.max(1, land.length) / 18);

  /* --- ressources --- */
  const tiles = {}, pips = {};
  for (const r of RESOURCES) { tiles[r] = 0; pips[r] = 0; }
  for (const h of land) { tiles[h.resource]++; pips[h.resource] += h.pips || 0; }
  let shareGap = 0, worst = null;
  for (const r of RESOURCES) {
    const expected = (tiles[r] / land.length) * totalPips;
    const gap = Math.abs(pips[r] - expected) / totalPips;
    shareGap += gap;
    if (!worst || gap > worst.gap) worst = { r, gap, share: pips[r] / totalPips, expected: expected / totalPips };
  }
  // terrains identiques voisins, compares a une disposition au hasard
  let pairs = 0, samePairs = 0;
  for (const h of land) {
    for (const nb of h.neighbors) {
      if (nb < h.id) continue;
      const o = hexes[nb];
      if (!o.resource) continue;
      if (h.fixed && o.fixed) continue; // regroupement voulu par la carte (ex. montagnes du volcan)
      pairs++;
      if (o.resource === h.resource) samePairs++;
    }
  }
  const pSame = RESOURCES.reduce((a, r) => a + (tiles[r] * (tiles[r] - 1)) / (land.length * (land.length - 1)), 0);
  const clusterExcess = pairs ? Math.max(0, samePairs / Math.max(1, pairs * pSame) - 1) : 0;
  const resources = clamp(100 - Math.max(0, shareGap * sizeNorm - 0.05) * 250 - clusterExcess * 25);
  if (worst && worst.gap > 0.02) {
    details.push(RES_FR[worst.r] + ' : ' + Math.round(worst.share * 100) + ' % de la production (attendu ' +
      Math.round(worst.expected * 100) + ' %)');
  }
  if (clusterExcess > 0.5) details.push('Terrains identiques souvent regroupés');

  /* --- numeros --- */
  const sectorPips = new Array(SECTORS).fill(0), sectorTiles = new Array(SECTORS).fill(0);
  for (const h of hexes) {
    if (Math.hypot(h.x - cx, h.y - cy) < 0.5) continue; // tuile centrale : aucun secteur
    const s = sectorOf(h.x, h.y, cx, cy);
    sectorTiles[s]++;
    sectorPips[s] += h.pips || 0;
  }
  const density = sectorPips.map((p, i) => (sectorTiles[i] ? p / sectorTiles[i] : null)).filter((v) => v !== null);
  const regionCV = coefVar(density);
  let sameNumbers = 0, hotPairs = 0;
  for (const h of land) {
    for (const nb of h.neighbors) {
      if (nb < h.id) continue;
      const o = hexes[nb];
      if (!o.number || !h.number) continue;
      if (o.number === h.number) sameNumbers++;
      if ((o.number === 6 || o.number === 8) && (h.number === 6 || h.number === 8)) hotPairs++;
    }
  }
  // meilleure intersection du plateau (somme des points de production)
  const vertexPips = board.vertices ? board.vertices.map((v) => v.hexes.reduce((a, hid) => a + (hexes[hid].pips || 0), 0)) : [];
  const bestVertex = vertexPips.length ? Math.max(...vertexPips) : 0;
  const perIsland = 18 / Math.max(1, land.length);
  const numbers = clamp(100 - Math.max(0, regionCV * sizeNorm - 0.1) * 160 - sameNumbers * perIsland * 4 -
    hotPairs * perIsland * 12 - Math.max(0, bestVertex - 13) * 6);
  if (regionCV * sizeNorm > 0.3) details.push('Production concentrée dans une partie de la carte');
  if (hotPairs) details.push(hotPairs + ' paire(s) de 6/8 voisins');
  if (bestVertex >= 14) details.push('Une intersection très riche (' + bestVertex + ' points de production)');

  /* --- ports --- */
  let synergy = 0, strongest = null;
  const access = [];
  for (const p of board.ports) {
    // tuiles touchant les deux sommets du port
    const touching = new Set();
    for (const h of hexes) {
      for (const end of p.ends) {
        if (Math.hypot(h.x - end.x, h.y - end.y) < 1.05) touching.add(h.id);
      }
    }
    let rich = 0, s = 0;
    for (const hid of touching) {
      rich += hexes[hid].pips || 0;
      if (hexes[hid].resource === p.type) s += hexes[hid].pips || 0;
    }
    access.push(rich);
    if (p.type === '3:1') continue;
    synergy += Math.max(0, s - 4);
    if (!strongest || s > strongest.s) strongest = { s, type: p.type };
  }
  // ecart de richesse entre les ports (certains inutiles, d autres excellents)
  const portCV = coefVar(access);
  const portsScore = clamp(100 - synergy * 8 - Math.max(0, portCV - 0.35) * 90);
  if (strongest && strongest.s >= 6) {
    details.push('Port 2:1 ' + RES_FR[strongest.type] + ' collé à une forte production de ' + RES_FR[strongest.type].toLowerCase());
  }
  if (portCV > 0.7) details.push('Ports très inégaux : certains bordent des terres pauvres');

  const score = clamp(resources * 0.4 + numbers * 0.4 + portsScore * 0.2);
  let label = 'Déséquilibrée';
  if (score >= 85) label = 'Très équilibrée';
  else if (score >= 70) label = 'Équilibrée';
  else if (score >= 55) label = 'Correcte';

  return { score, label, resources, numbers, ports: portsScore, details };
}

module.exports = { computeBalance };
