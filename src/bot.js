'use strict';
/**
 * Joueurs controles par l ordinateur.
 * step(game) joue UNE action pour un bot (ou repond a un echange) et renvoie
 * true si quelque chose s est passe. Le serveur l appelle en boucle avec un
 * petit delai pour que les humains puissent suivre.
 */
const { RESOURCES, COSTS } = require('./game');

const MAX_ACTIONS_PER_TURN = 40;

const BOT_NAMES = ['Aurore', 'Basile', 'Céleste', 'Gaspard', 'Margot', 'Octave', 'Lucie', 'Firmin'];

function isBotTurn(game) {
  if (game.phase === 'ended') return false;
  const cur = game.current();
  return !!(cur && cur.bot && !cur.left);
}

/** Un bot doit-il agir maintenant ? */
function needsAction(game) {
  if (game.phase === 'ended') return false;
  if (pendingTradeBot(game)) return true;
  return isBotTurn(game);
}

function pendingTradeBot(game) {
  const t = game.trade;
  if (!t) return null;
  return game.players.find((p) => p.bot && !p.left && p.index !== t.from && t.responses[p.index] === undefined) || null;
}

/* ------------------------------------------------------------------ */
/* evaluation du plateau                                              */
/* ------------------------------------------------------------------ */

function producedResources(game, idx) {
  const set = new Set();
  for (const vid in game.buildings) {
    if (game.buildings[vid].owner !== idx) continue;
    for (const hid of game.board.vertices[vid].hexes) {
      const r = game.board.hexes[hid].resource;
      if (r) set.add(r);
    }
  }
  return set;
}

/** Interet d une intersection pour y poser une colonie. */
function vertexScore(game, idx, vid) {
  const v = game.board.vertices[vid];
  const owned = producedResources(game, idx);
  let score = 0;
  const seen = new Set();
  for (const hid of v.hexes) {
    const h = game.board.hexes[hid];
    if (!h.resource) continue;
    let pips = h.pips;
    if (hid === game.robber) pips *= 0.5;
    score += pips * (h.resource === 'ore' || h.resource === 'grain' ? 1.1 : 1);
    if (!owned.has(h.resource) && !seen.has(h.resource)) score += 1.5;
    seen.add(h.resource);
  }
  if (v.port !== null && v.port !== undefined) {
    const port = game.board.ports[v.port];
    if (port.type === '3:1') score += 1;
    else if (owned.has(port.type) || seen.has(port.type)) score += 1.5;
  }
  return score;
}

function best(list, scoreFn) {
  let bestItem = null, bestScore = -Infinity;
  for (const item of list) {
    const s = scoreFn(item);
    if (s > bestScore) { bestScore = s; bestItem = item; }
  }
  return { item: bestItem, score: bestScore };
}

/** Valeur d une route : proximite d un emplacement de colonie libre. */
function roadScore(game, idx, eid) {
  const e = game.board.edges[eid];
  let s = 0;
  for (const vid of e.v) {
    if (game.vertexFree(vid) && !game.playerTouchesVertex(idx, vid)) {
      s = Math.max(s, vertexScore(game, idx, vid));
    }
    for (const nb of game.board.vertices[vid].adjacent) {
      if (e.v.includes(nb)) continue;
      if (game.vertexFree(nb)) s = Math.max(s, vertexScore(game, idx, nb) * 0.6);
    }
  }
  return s;
}

function missing(p, cost) {
  const out = {};
  let total = 0;
  for (const r of RESOURCES) {
    const m = Math.max(0, (cost[r] || 0) - p.res[r]);
    if (m) { out[r] = m; total += m; }
  }
  return { out, total };
}

/* ------------------------------------------------------------------ */
/* decisions                                                          */
/* ------------------------------------------------------------------ */

function chooseRobberHex(game, p) {
  const leader = Math.max(...game.players.map((q) => (q.index === p.index ? 0 : game.publicVP(q))));
  const { item } = best(game.validRobberHexes().map((hid) => game.board.hexes[hid]), (h) => {
    let s = 0;
    for (const vid of h.vertices) {
      const b = game.buildings[vid];
      if (!b) continue;
      const weight = (b.type === 'city' ? 2 : 1) * (h.pips || 0.5);
      if (b.owner === p.index) s -= weight * 3;
      else {
        const q = game.players[b.owner];
        s += weight + (game.publicVP(q) === leader ? 1 : 0) + (game.resCount(q) > 0 ? 1 : 0);
      }
    }
    return s + Math.random() * 0.1;
  });
  return item;
}

/** Objectifs de construction dans l ordre de preference. */
function goals(game, p) {
  const out = [];
  if (p.citiesLeft > 0 && game.validCitySpots(p.index).length) out.push('city');
  const spots = game.validSettlementSpots(p.index, false);
  if (p.settlementsLeft > 0 && spots.length) out.push('settlement');
  if (p.roadsLeft > 0 && !spots.length && game.validRoadSpots(p.index).some((e) => roadScore(game, p.index, e) > 0)) {
    out.push('road');
  }
  if (game.devDeck.length) out.push('dev');
  // plus de place sur son ile : un bateau vers un port prometteur
  if (!out.includes('settlement') && !out.includes('road') && p.roadsLeft > 0 && bestBoatPort(game, p).score > 0) {
    out.push('boat');
  }
  return out;
}

/** Port le plus interessant pour un bateau : emplacements libres a proximite. */
function bestBoatPort(game, p) {
  return best(game.validBoatPorts(p.index), (portId) => {
    let s = 0;
    for (const vid of game.board.ports[portId].vertices) {
      if (game.vertexFree(vid)) s = Math.max(s, vertexScore(game, p.index, vid));
      for (const nb of game.board.vertices[vid].adjacent) {
        if (game.vertexFree(nb)) s = Math.max(s, vertexScore(game, p.index, nb) * 0.8);
      }
    }
    return s;
  });
}

function tryBuild(game, p, goal) {
  const idx = p.index;
  if (!game.hasRes(p, COSTS[goal])) return false;
  if (goal === 'city') {
    const { item } = best(game.validCitySpots(idx), (vid) => vertexScore(game, idx, vid));
    return item !== null && ok(game.act(p.id, 'buildCity', { vertex: item }));
  }
  if (goal === 'settlement') {
    const { item } = best(game.validSettlementSpots(idx, false), (vid) => vertexScore(game, idx, vid));
    return item !== null && ok(game.act(p.id, 'buildSettlement', { vertex: item }));
  }
  if (goal === 'road') {
    const { item, score } = best(game.validRoadSpots(idx), (eid) => roadScore(game, idx, eid));
    return item !== null && score > 0 && ok(game.act(p.id, 'buildRoad', { edge: item }));
  }
  if (goal === 'boat') {
    const { item, score } = bestBoatPort(game, p);
    return item !== null && score > 0 && ok(game.act(p.id, 'buildBoat', { port: item }));
  }
  if (goal === 'dev') {
    // on n entame pas les ressources d une colonie ou d une ville presque prete
    const saving = goals(game, p).some((g) => (g === 'city' || g === 'settlement') && missing(p, COSTS[g]).total <= 1);
    if (saving && game.resCount(p) < 8) return false;
    return ok(game.act(p.id, 'buyDev', {}));
  }
  return false;
}

/** Un echange avec la banque qui rapproche d un objectif. */
function tryBankTrade(game, p, goal) {
  const cost = COSTS[goal];
  const need = missing(p, cost);
  if (!need.total) return false;
  const ratios = game.tradeRatios(p.index);
  // combien d echanges sont possibles avec le surplus ?
  let possible = 0;
  for (const r of RESOURCES) {
    const surplus = p.res[r] - (cost[r] || 0);
    if (surplus >= ratios[r]) possible += Math.floor(surplus / ratios[r]);
  }
  if (possible < need.total) return false;
  const want = Object.keys(need.out).find((r) => game.bank[r] > 0);
  if (!want) return false;
  const { item: give } = best(RESOURCES.filter((r) => p.res[r] - (cost[r] || 0) >= ratios[r]),
    (r) => p.res[r] - (cost[r] || 0) - ratios[r]);
  if (!give) return false;
  return ok(game.act(p.id, 'bankTrade', { give, receive: want }));
}

function tryPlayDev(game, p) {
  if (game.devPlayedThisTurn) return false;
  const playable = p.dev.filter((c) => c.type !== 'victoryPoint' && c.turnBought !== game.turnCount);
  if (!playable.length) return false;
  const idx = p.index;

  const knight = playable.find((c) => c.type === 'knight');
  if (knight) {
    const robberOnMe = game.board.hexes[game.robber].vertices.some((vid) => {
      const b = game.buildings[vid];
      return b && b.owner === idx;
    });
    if (game.phase === 'roll' ? robberOnMe : true) {
      return ok(game.act(p.id, 'playDev', { card: knight.id }));
    }
  }
  if (game.phase !== 'main') return false;

  const rb = playable.find((c) => c.type === 'roadBuilding');
  if (rb && p.roadsLeft > 0 && game.validRoadSpots(idx).some((e) => roadScore(game, idx, e) > 0)) {
    return ok(game.act(p.id, 'playDev', { card: rb.id }));
  }

  const yop = playable.find((c) => c.type === 'yearOfPlenty');
  if (yop) {
    const goal = goals(game, p).find((g) => g !== 'road') || 'city';
    const need = missing(p, COSTS[goal]);
    const picks = [];
    for (const r in need.out) for (let i = 0; i < need.out[r] && picks.length < 2; i++) picks.push(r);
    const fill = ['ore', 'grain', 'wool', 'brick', 'lumber'];
    while (picks.length < 2) picks.push(fill[picks.length]);
    if (ok(game.act(p.id, 'playDev', { card: yop.id, resources: picks }))) return true;
  }

  const mono = playable.find((c) => c.type === 'monopoly');
  if (mono) {
    const { item: r, score } = best(RESOURCES, (res) =>
      game.players.reduce((a, q) => a + (q.index === idx ? 0 : q.res[res]), 0));
    if (score >= 3) return ok(game.act(p.id, 'playDev', { card: mono.id, resource: r }));
  }
  return false;
}

function respondToTrade(game, p) {
  const t = game.trade;
  // le bot donne ce que l initiateur demande, et recoit ce qu il offre
  let give = 0, get = 0, gainsNeeded = false;
  for (const r of RESOURCES) {
    if (p.res[r] < t.receive[r]) return game.act(p.id, 'respondTrade', { accept: false });
    give += t.receive[r];
    get += t.give[r];
    if (t.give[r] > 0 && p.res[r] === 0) gainsNeeded = true;
  }
  const from = game.players[t.from];
  const threatening = game.publicVP(from) >= game.targetVP - 2;
  const accept = !threatening && get > 0 && (get > give || (get === give && gainsNeeded));
  return game.act(p.id, 'respondTrade', { accept });
}

function ok(res) {
  return !!(res && res.ok);
}

/* ------------------------------------------------------------------ */

function step(game) {
  if (game.phase === 'ended') return false;
  let acted = false;
  try { acted = decide(game); } catch (e) { console.error('Bot :', e); }
  if (acted || !isBotTurn(game)) return acted;
  return fallback(game);
}

/** Action minimale garantissant que la partie avance. */
function fallback(game) {
  const p = game.current();
  const idx = p.index;
  let res = null;
  if (game.phase === 'setup') {
    if (game.setupNeed === 'settlement') res = game.act(p.id, 'placeSettlement', { vertex: game.validSettlementSpots(idx, true)[0] });
    else res = game.act(p.id, 'placeRoad', { edge: game.validSetupRoads()[0] });
  } else if (game.phase === 'roll') res = game.act(p.id, 'roll', {});
  else if (game.phase === 'robber') res = game.act(p.id, 'moveRobber', { hex: game.validRobberHexes()[0] });
  else if (game.phase === 'steal') res = game.act(p.id, 'steal', { target: game.stealTargets[0] });
  else if (game.phase === 'main') res = game.act(p.id, 'endTurn', {});
  return ok(res);
}

function decide(game) {

  const responder = pendingTradeBot(game);
  if (responder) { respondToTrade(game, responder); return true; }

  if (!isBotTurn(game)) return false;
  const p = game.current();
  const idx = p.index;

  if (p._turn !== game.turnCount) { p._turn = game.turnCount; p._actions = 0; }
  p._actions++;

  if (game.phase === 'setup') {
    if (game.setupNeed === 'settlement') {
      const { item } = best(game.validSettlementSpots(idx, true), (vid) => vertexScore(game, idx, vid) + Math.random() * 0.3);
      return ok(game.act(p.id, 'placeSettlement', { vertex: item }));
    }
    const edges = game.validSetupRoads();
    const { item } = best(edges, (eid) => roadScore(game, idx, eid) + Math.random() * 0.1);
    return ok(game.act(p.id, 'placeRoad', { edge: item }));
  }

  if (game.phase === 'roll') {
    if (tryPlayDev(game, p)) return true;
    return ok(game.act(p.id, 'roll', {}));
  }

  if (game.phase === 'robber') {
    const h = chooseRobberHex(game, p);
    return ok(game.act(p.id, 'moveRobber', { hex: h.id }));
  }

  if (game.phase === 'steal') {
    const { item } = best(game.stealTargets, (i) => game.resCount(game.players[i]));
    return ok(game.act(p.id, 'steal', { target: item }));
  }

  if (game.phase === 'main') {
    if (game.trade && game.trade.from === idx) game.act(p.id, 'cancelTrade', {});
    if (p._actions > MAX_ACTIONS_PER_TURN) return ok(game.act(p.id, 'endTurn', {}));

    if (game.freeRoads > 0) {
      const spots = game.validRoadSpots(idx);
      if (spots.length) {
        const { item } = best(spots, (eid) => roadScore(game, idx, eid));
        if (ok(game.act(p.id, 'buildRoad', { edge: item }))) return true;
      }
    }

    if (tryPlayDev(game, p)) return true;

    const list = goals(game, p);
    for (const g of list) if (tryBuild(game, p, g)) return true;
    for (const g of list) if (tryBankTrade(game, p, g)) return true;

    return ok(game.act(p.id, 'endTurn', {}));
  }
  return false;
}

module.exports = { step, needsAction, BOT_NAMES };
