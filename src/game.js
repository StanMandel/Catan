'use strict';
/**
 * Moteur de regles complet de Catan (Les Colons de Catan - jeu de base).
 * Le serveur est autoritaire : le client n envoie que des intentions.
 */
const crypto = require('crypto');
const { createBoard } = require('./board');
const { getMap } = require('./maps');
const { activeMods, runHook } = require('./mods');

/* --- hasard --------------------------------------------------------- */
/* Math.random est un generateur pseudo-aleatoire : la suite des tirages
   est previsible a partir de son etat interne. Tout ce qui doit etre
   imprevisible dans une partie (des, pioche, vols, evenements) passe donc
   par le generateur cryptographique du systeme. */

/** Flottant vraiment aleatoire dans [0, 1). */
function cryptoRandom() {
  // 48 bits : le plus grand entier que readUIntBE rend exactement
  return crypto.randomBytes(6).readUIntBE(0, 6) / 281474976710656;
}

/** Entier vraiment aleatoire dans [0, max), sans biais de troncature. */
function randomInt(max) {
  if (!(max > 0)) return 0;
  if (crypto.randomInt) return crypto.randomInt(max);
  return Math.floor(cryptoRandom() * max);
}

const RESOURCES = ['lumber', 'brick', 'wool', 'grain', 'ore'];

const RES_FR = {
  lumber: 'bois',
  brick: 'argile',
  wool: 'laine',
  grain: 'ble',
  ore: 'minerai'
};

const COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  dev: { wool: 1, grain: 1, ore: 1 },
  boat: { lumber: 3, ore: 1, grain: 1 }
};

// stock de pieces du jeu de base (modifiable par l hote)
const LIMITS = { road: 15, settlement: 5, city: 4 };

// sur un 7, le voleur prend la moitie des cartes des mains qui depassent ce nombre
const ROBBER_THRESHOLD = 7;

const VP_CARD_NAMES = ['Bibliotheque', 'Universite', 'Chapelle', 'Palais', 'Marche'];

function emptyRes() {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function buildDevDeck(rng) {
  const deck = [];
  for (let i = 0; i < 14; i++) deck.push({ type: 'knight' });
  for (let i = 0; i < 5; i++) deck.push({ type: 'victoryPoint', name: VP_CARD_NAMES[i] });
  for (let i = 0; i < 2; i++) deck.push({ type: 'roadBuilding' });
  for (let i = 0; i < 2; i++) deck.push({ type: 'yearOfPlenty' });
  for (let i = 0; i < 2; i++) deck.push({ type: 'monopoly' });
  return shuffle(deck, rng);
}

let cardSeq = 1;

class Game {
  constructor(players, options) {
    options = options || {};
    this.rng = options.rng || cryptoRandom;
    this.targetVP = options.targetVP || 10;
    const lim = options.limits || {};
    this.limits = {
      road: Number.isFinite(lim.road) ? lim.road : LIMITS.road,
      settlement: Number.isFinite(lim.settlement) ? lim.settlement : LIMITS.settlement,
      city: Number.isFinite(lim.city) ? lim.city : LIMITS.city
    };
    this.startSettlements = Math.max(1, Math.min(this.limits.settlement, options.startSettlements || 1));
    this.startRoads = Math.max(0, Math.min(this.limits.road, options.startRoads === undefined ? 1 : options.startRoads));
    // voleur amical : il bloque toujours sa tuile mais ne prend jamais de cartes
    this.friendlyRobber = !!options.friendlyRobber;
    this.robberThreshold = Number.isFinite(options.robberThreshold) ? options.robberThreshold : ROBBER_THRESHOLD;
    this.mods = activeMods(options.mods);
    this.board = options.board || createBoard({
      map: options.map, rng: this.rng, random: options.randomBoard !== false, fair: options.fairBoard !== false
    });
    this.robber = this.board.robber;
    this.devDeck = buildDevDeck(this.rng);
    this.boatsEnabled = !!getMap(this.board.map).boats;
    this.boats = []; // { owner, port }

    this.players = players.map((p, i) => ({
      index: i,
      id: p.id,
      name: p.name,
      color: p.color,
      res: emptyRes(),
      dev: [],
      knights: 0,
      roadsLeft: this.limits.road,
      settlementsLeft: this.limits.settlement,
      citiesLeft: this.limits.city,
      longestRoadLength: 0,
      connected: true,
      left: false,
      bot: !!p.bot
    }));

    const bankSize = getMap(this.board.map).bank || 19;
    this.bank = { lumber: bankSize, brick: bankSize, wool: bankSize, grain: bankSize, ore: bankSize };
    this.buildings = {}; // vertexId -> { type:'settlement'|'city', owner: idx }
    this.roads = {};     // edgeId -> owner idx
    this.longestRoadOwner = null;
    this.largestArmyOwner = null;

    this.turn = 0;
    this.turnCount = 0;
    this.dice = null;
    this.phase = 'setup';
    // ordre de mise en place en serpentin : une manche par colonie de depart
    this.setupIndex = 0;
    this.setupOrder = [];
    for (let round = 0; round < this.startSettlements; round++) {
      const ids = this.players.map((p) => p.index);
      if (round % 2) ids.reverse();
      for (const i of ids) this.setupOrder.push({ player: i, round });
    }
    this.setupNeed = 'settlement';
    this.setupLastVertex = null;
    this.setupRoadsLeft = 0;
    this.setupTurnRoads = [];

    this.devPlayedThisTurn = false;
    this.freeRoads = 0;
    this.robberFrom = null;
    this.stealTargets = [];
    this.trade = null;
    this.winner = null;
    this.log = [];
    this.events = [];
    this.chat = [];
    this.version = 0;

    this.addLog('Partie lancee. Placement initial : ' + this.players[this.setupOrder[0].player].name + ' commence.');
    runHook(this, 'onGameStart');
  }

  /* ------------------------------------------------------------------ */
  /* utilitaires                                                        */
  /* ------------------------------------------------------------------ */

  /** Evenement de mod : journal + grand message rouge chez tous les joueurs.
   *  hexes : tuiles concernees, mises en avant sur le plateau par le client. */
  addEvent(title, text, hexes) {
    this.eventSeq = (this.eventSeq || 0) + 1;
    this.events.push({
      id: this.eventSeq, title, text, t: Date.now(),
      hexes: Array.isArray(hexes) ? hexes.slice() : []
    });
    if (this.events.length > 10) this.events.shift();
    this.addLog('⚡ ' + title + ' : ' + text, 'event');
  }

  addLog(text, kind) {
    this.log.push({ t: Date.now(), text, kind: kind || 'info' });
    if (this.log.length > 400) this.log.shift();
  }

  playerById(id) {
    return this.players.find((p) => p.id === id) || null;
  }

  current() {
    if (this.phase === 'setup') return this.players[this.setupOrder[this.setupIndex].player];
    return this.players[this.turn];
  }

  resCount(p) {
    let n = 0;
    for (const r of RESOURCES) n += p.res[r];
    return n;
  }

  hasRes(p, cost) {
    for (const r in cost) if (p.res[r] < cost[r]) return false;
    return true;
  }

  payRes(p, cost) {
    for (const r in cost) { p.res[r] -= cost[r]; this.bank[r] += cost[r]; }
  }

  giveRes(p, res, n) {
    const amount = Math.min(n, this.bank[res]);
    p.res[res] += amount;
    this.bank[res] -= amount;
    return amount;
  }

  publicVP(p) {
    let vp = 0;
    for (const vid in this.buildings) {
      const b = this.buildings[vid];
      if (b.owner === p.index) vp += b.type === 'city' ? 2 : 1;
    }
    if (this.longestRoadOwner === p.index) vp += 2;
    if (this.largestArmyOwner === p.index) vp += 2;
    return vp;
  }

  totalVP(p) {
    return this.publicVP(p) + p.dev.filter((c) => c.type === 'victoryPoint').length;
  }

  /* ------------------------------------------------------------------ */
  /* validations de construction                                        */
  /* ------------------------------------------------------------------ */

  vertexFree(vid) {
    if (this.buildings[vid]) return false;
    const v = this.board.vertices[vid];
    for (const nb of v.adjacent) if (this.buildings[nb]) return false;
    return true;
  }

  playerTouchesVertex(idx, vid) {
    const v = this.board.vertices[vid];
    for (const eid of v.edges) if (this.roads[eid] === idx) return true;
    return false;
  }

  validSettlementSpots(idx, setup) {
    const out = [];
    for (const v of this.board.vertices) {
      if (!this.vertexFree(v.id)) continue;
      if (!setup && !this.playerTouchesVertex(idx, v.id)) continue;
      out.push(v.id);
    }
    return out;
  }

  validCitySpots(idx) {
    const out = [];
    for (const vid in this.buildings) {
      const b = this.buildings[vid];
      if (b.owner === idx && b.type === 'settlement') out.push(Number(vid));
    }
    return out;
  }

  validRoadSpots(idx) {
    const anchors = this.anchorVertices(idx);
    const out = [];
    for (const e of this.board.edges) {
      if (this.roads[e.id] !== undefined) continue;
      let ok = false;
      for (const vid of e.v) {
        const b = this.buildings[vid];
        if (b && b.owner === idx) { ok = true; break; }
        if (b && b.owner !== idx) continue; // on ne traverse pas une colonie adverse
        if (this.playerTouchesVertex(idx, vid) || anchors.has(vid)) { ok = true; break; }
      }
      if (ok) out.push(e.id);
    }
    return out;
  }

  validSetupRoadSpots(vid) {
    const v = this.board.vertices[vid];
    return v.edges.filter((eid) => this.roads[eid] === undefined);
  }

  /** Routes posables pendant la mise en place : depuis la colonie du tour (et ses routes du tour). */
  validSetupRoads() {
    if (this.phase !== 'setup' || this.setupNeed !== 'road' || this.setupLastVertex === null) return [];
    const idx = this.current().index;
    const reach = new Set([this.setupLastVertex]);
    for (const eid of this.setupTurnRoads) for (const v of this.board.edges[eid].v) reach.add(v);
    const out = new Set();
    for (const vid of reach) {
      const b = this.buildings[vid];
      if (b && b.owner !== idx) continue;
      for (const eid of this.board.vertices[vid].edges) if (this.roads[eid] === undefined) out.add(eid);
    }
    return Array.from(out);
  }

  /* --- bateaux (cartes qui l autorisent) --- */

  /** Sommets des ports ou le joueur a amarre un bateau. */
  anchorVertices(idx) {
    const set = new Set();
    for (const b of this.boats) {
      if (b.owner !== idx) continue;
      for (const v of this.board.ports[b.port].vertices) set.add(v);
    }
    return set;
  }

  isCoastVertex(vid) {
    return this.board.vertices[vid].edges.some((eid) => this.board.edges[eid].hexes.length === 1);
  }

  /** Ports vers lesquels le joueur peut envoyer un bateau. */
  validBoatPorts(idx) {
    if (!this.boatsEnabled) return [];
    const coastal = Object.keys(this.buildings).some((vid) =>
      this.buildings[vid].owner === idx && this.isCoastVertex(Number(vid)));
    if (!coastal) return [];
    return this.board.ports.filter((port) => {
      if (this.boats.some((b) => b.owner === idx && b.port === port.id)) return false;
      // port deja relie au reseau du joueur : inutile
      if (port.vertices.some((v) => {
        const b = this.buildings[v];
        return (b && b.owner === idx) || this.playerTouchesVertex(idx, v);
      })) return false;
      // port entierement occupe par d autres joueurs
      if (port.vertices.every((v) => this.buildings[v] && this.buildings[v].owner !== idx)) return false;
      return true;
    }).map((port) => port.id);
  }

  /** Tuiles ou le voleur peut aller. */
  validRobberHexes() {
    return this.board.hexes.filter((h) => h.id !== this.robber).map((h) => h.id);
  }

  portsOf(idx) {
    const set = new Set();
    for (const vid in this.buildings) {
      if (this.buildings[vid].owner !== idx) continue;
      const p = this.board.vertices[vid].port;
      if (p !== null && p !== undefined) set.add(this.board.ports[p].type);
    }
    return set;
  }

  tradeRatios(idx) {
    const ports = this.portsOf(idx);
    const ratios = {};
    for (const r of RESOURCES) {
      let ratio = 4;
      if (ports.has('3:1')) ratio = 3;
      if (ports.has(r)) ratio = 2;
      ratios[r] = ratio;
    }
    return ratios;
  }

  /* ------------------------------------------------------------------ */
  /* route la plus longue / armee                                       */
  /* ------------------------------------------------------------------ */

  computeLongestRoad(idx) {
    const adj = new Map();
    const myEdges = [];
    for (const eid in this.roads) {
      if (this.roads[eid] !== idx) continue;
      const e = this.board.edges[eid];
      myEdges.push(e);
      for (const v of e.v) {
        if (!adj.has(v)) adj.set(v, []);
        adj.get(v).push({ edge: e.id, other: e.v[0] === v ? e.v[1] : e.v[0] });
      }
    }
    if (!myEdges.length) return 0;
    const blocked = new Set();
    for (const vid in this.buildings) {
      if (this.buildings[vid].owner !== idx) blocked.add(Number(vid));
    }
    let best = 0;
    const used = new Set();
    const walk = (v, depth) => {
      if (depth > best) best = depth;
      if (blocked.has(v) && depth > 0) return;
      const list = adj.get(v) || [];
      for (const step of list) {
        if (used.has(step.edge)) continue;
        used.add(step.edge);
        walk(step.other, depth + 1);
        used.delete(step.edge);
      }
    };
    for (const v of adj.keys()) walk(v, 0);
    return best;
  }

  updateLongestRoad() {
    let changed = false;
    for (const p of this.players) p.longestRoadLength = this.computeLongestRoad(p.index);
    const holder = this.longestRoadOwner;
    let max = 0;
    for (const p of this.players) if (p.longestRoadLength > max) max = p.longestRoadLength;
    if (max < 5) {
      if (holder !== null) { this.longestRoadOwner = null; changed = true; }
      return changed;
    }
    const leaders = this.players.filter((p) => p.longestRoadLength === max);
    if (holder !== null && this.players[holder].longestRoadLength === max) return false;
    if (leaders.length === 1) {
      if (this.longestRoadOwner !== leaders[0].index) {
        this.longestRoadOwner = leaders[0].index;
        this.addLog(leaders[0].name + ' prend la Route la plus longue (' + max + ').', 'award');
        changed = true;
      }
    } else if (holder !== null) {
      this.longestRoadOwner = null;
      this.addLog('La Route la plus longue est remise en jeu (egalite).', 'award');
      changed = true;
    }
    return changed;
  }

  updateLargestArmy() {
    let max = 0;
    for (const p of this.players) if (p.knights > max) max = p.knights;
    if (max < 3) return;
    const holder = this.largestArmyOwner;
    if (holder !== null && this.players[holder].knights >= max) return;
    const leaders = this.players.filter((p) => p.knights === max);
    if (leaders.length === 1 && this.largestArmyOwner !== leaders[0].index) {
      this.largestArmyOwner = leaders[0].index;
      this.addLog(leaders[0].name + ' prend l Armee la plus puissante (' + max + ' chevaliers).', 'award');
    }
  }

  checkVictory() {
    const p = this.current();
    if (!p) return;
    if (this.totalVP(p) >= this.targetVP) {
      this.phase = 'ended';
      this.winner = p.index;
      this.addLog('*** ' + p.name + ' remporte la partie avec ' + this.totalVP(p) + ' points de victoire ! ***', 'win');
    }
  }

  /* ------------------------------------------------------------------ */
  /* production                                                          */
  /* ------------------------------------------------------------------ */

  produce(number) {
    const gains = this.players.map(() => emptyRes());
    for (const h of this.board.hexes) {
      if (h.number !== number) continue;
      if (h.id === this.robber) continue;
      if (!h.resource) continue;
      for (const vid of h.vertices) {
        const b = this.buildings[vid];
        if (!b || this.players[b.owner].left) continue; // un joueur parti ne produit plus
        gains[b.owner][h.resource] += b.type === 'city' ? 2 : 1;
      }
    }
    const details = [];
    for (const r of RESOURCES) {
      let demand = 0;
      let claimants = 0;
      for (let i = 0; i < gains.length; i++) {
        if (gains[i][r] > 0) { demand += gains[i][r]; claimants++; }
      }
      if (demand === 0) continue;
      if (demand > this.bank[r]) {
        if (claimants === 1) {
          const i = gains.findIndex((g) => g[r] > 0);
          const got = this.giveRes(this.players[i], r, gains[i][r]);
          if (got > 0) details.push(this.players[i].name + ' +' + got + ' ' + RES_FR[r]);
          this.addLog('Banque a court de ' + RES_FR[r] + ' : distribution partielle.', 'warn');
        } else {
          this.addLog('Banque a court de ' + RES_FR[r] + ' : personne ne recoit cette ressource.', 'warn');
        }
        continue;
      }
      for (let i = 0; i < gains.length; i++) {
        if (gains[i][r] <= 0) continue;
        this.giveRes(this.players[i], r, gains[i][r]);
        details.push(this.players[i].name + ' +' + gains[i][r] + ' ' + RES_FR[r]);
      }
    }
    if (details.length) this.addLog('Production : ' + details.join(', '), 'produce');
    else this.addLog('Aucune production pour ce jet.', 'produce');
  }

  /* ------------------------------------------------------------------ */
  /* actions                                                             */
  /* ------------------------------------------------------------------ */

  act(playerId, type, payload) {
    payload = payload || {};
    const p = this.playerById(playerId);
    if (!p) return { error: 'Joueur inconnu.' };
    if (this.phase === 'ended') return { error: 'La partie est terminee.' };
    if (p.left && type !== 'leaveGame') return { error: 'Vous avez quitte cette partie.' };

    const handler = this['do_' + type];
    if (!handler) return { error: 'Action inconnue : ' + type };
    const res = handler.call(this, p, payload);
    if (res && res.error) return res;
    this.version++;
    return { ok: true };
  }

  requireTurn(p) {
    if (this.current().index !== p.index) return { error: 'Ce n est pas votre tour.' };
    return null;
  }

  /* --- mise en place --- */

  do_placeSettlement(p, payload) {
    if (this.phase !== 'setup') return this.do_buildSettlement(p, payload);
    const err = this.requireTurn(p); if (err) return err;
    if (this.setupNeed !== 'settlement') return { error: 'Vous devez placer une route.' };
    const vid = Number(payload.vertex);
    if (!this.board.vertices[vid]) return { error: 'Intersection invalide.' };
    if (!this.vertexFree(vid)) return { error: 'Emplacement interdit (regle de distance).' };
    if (p.settlementsLeft <= 0) return { error: 'Plus de colonies disponibles.' };
    const turn = this.setupOrder[this.setupIndex];
    this.buildings[vid] = { type: 'settlement', owner: p.index };
    p.settlementsLeft--;
    this.setupLastVertex = vid;
    this.setupTurnRoads = [];
    this.addLog(p.name + ' place une colonie.', 'build');
    // routes a poser pour cette colonie : repartition des routes de depart sur les manches
    const perRound = Math.floor(this.startRoads / this.startSettlements);
    const extra = turn.round < this.startRoads % this.startSettlements ? 1 : 0;
    this.setupRoadsLeft = Math.min(perRound + extra, p.roadsLeft);
    // derniere manche : ressources de depart
    if (turn.round === this.startSettlements - 1) {
      const got = [];
      for (const hid of this.board.vertices[vid].hexes) {
        const h = this.board.hexes[hid];
        if (!h.resource) continue;
        this.giveRes(p, h.resource, 1);
        got.push(RES_FR[h.resource]);
      }
      if (got.length) this.addLog(p.name + ' recoit ' + got.join(', ') + '.', 'produce');
    }
    this.setupNeed = 'road';
    if (this.setupRoadsLeft <= 0 || !this.validSetupRoads().length) this.finishSetupTurn();
    return { ok: true };
  }

  finishSetupTurn() {
    this.setupNeed = 'settlement';
    this.setupLastVertex = null;
    this.setupRoadsLeft = 0;
    this.setupTurnRoads = [];
    this.setupIndex++;
    if (this.setupIndex >= this.setupOrder.length) {
      this.phase = 'roll';
      this.turn = -1;
      this.nextTurn();
      this.turnCount = 1;
      this.log[this.log.length - 1].text = 'Placement termine. Tour de ' + this.players[this.turn].name + ' : lancez les des.';
    }
  }

  do_placeRoad(p, payload) {
    if (this.phase !== 'setup') return this.do_buildRoad(p, payload);
    const err = this.requireTurn(p); if (err) return err;
    if (this.setupNeed !== 'road') return { error: 'Vous devez placer une colonie.' };
    const eid = Number(payload.edge);
    if (!this.board.edges[eid]) return { error: 'Arete invalide.' };
    if (!this.validSetupRoads().includes(eid)) {
      return { error: 'La route doit partir de la colonie que vous venez de poser.' };
    }
    this.roads[eid] = p.index;
    p.roadsLeft--;
    this.setupRoadsLeft--;
    this.setupTurnRoads.push(eid);
    this.addLog(p.name + ' place une route.', 'build');
    this.updateLongestRoad();
    if (this.setupRoadsLeft <= 0 || p.roadsLeft <= 0 || !this.validSetupRoads().length) this.finishSetupTurn();
    return { ok: true };
  }

  /* --- des --- */

  do_roll(p) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'roll') return { error: 'Vous ne pouvez pas lancer les des maintenant.' };
    // chaque de est tire independamment, sans biais : 1 chance sur 6 par face
    const d1 = 1 + randomInt(6);
    const d2 = 1 + randomInt(6);
    this.dice = [d1, d2];
    const total = d1 + d2;
    this.addLog(p.name + ' lance les des : ' + d1 + ' + ' + d2 + ' = ' + total + '.', 'dice');
    if (total === 7) {
      this.startSeven(p);
    } else {
      this.produce(total);
      this.phase = 'main';
    }
    // evenements des mods : apres la production pour ne pas fausser le jet
    runHook(this, 'onRoll', p, total);
    return { ok: true };
  }

  /** Sur un 7 : le voleur prend la moitie des mains trop grosses, puis il est deplace. */
  startSeven(p) {
    this.addLog('7 ! ' + p.name + ' doit deplacer le voleur.', 'robber');
    if (!this.friendlyRobber) {
      for (const q of this.players) {
        if (q.left) continue;
        const count = this.resCount(q);
        if (count <= this.robberThreshold) continue;
        const lost = this.takeRandomCards(q, Math.floor(count / 2));
        this.addLog('Le voleur prend ' + lost + ' carte(s) a ' + q.name + ' (' + count + ' en main).', 'robber');
      }
    }
    this.phase = 'robber';
  }

  /** Retire n cartes au hasard d une main et les rend a la banque. */
  takeRandomCards(q, n) {
    let taken = 0;
    for (; taken < n; taken++) {
      const pool = [];
      for (const r of RESOURCES) for (let i = 0; i < q.res[r]; i++) pool.push(r);
      if (!pool.length) break;
      const r = pool[Math.floor(this.rng() * pool.length)];
      q.res[r]--;
      this.bank[r]++;
    }
    return taken;
  }

  do_moveRobber(p, payload) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'robber') return { error: 'Vous ne pouvez pas deplacer le voleur maintenant.' };
    const hid = Number(payload.hex);
    if (!this.board.hexes[hid]) return { error: 'Tuile invalide.' };
    if (hid === this.robber) return { error: 'Le voleur doit changer de tuile.' };
    this.robber = hid;
    this.addLog(p.name + ' deplace le voleur.', 'robber');
    const targets = new Set();
    if (!this.friendlyRobber) for (const vid of this.board.hexes[hid].vertices) {
      const b = this.buildings[vid];
      if (b && b.owner !== p.index && !this.players[b.owner].left &&
          this.resCount(this.players[b.owner]) > 0) targets.add(b.owner);
    }
    this.stealTargets = Array.from(targets);
    if (this.stealTargets.length === 0) {
      this.phase = this.dice ? 'main' : 'roll';
      this.stealTargets = [];
    } else if (this.stealTargets.length === 1) {
      this.steal(p, this.stealTargets[0]);
      this.phase = this.dice ? 'main' : 'roll';
      this.stealTargets = [];
    } else {
      this.phase = 'steal';
    }
    this.checkVictory();
    return { ok: true };
  }

  do_steal(p, payload) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'steal') return { error: 'Aucun vol en attente.' };
    const idx = Number(payload.target);
    if (!this.stealTargets.includes(idx)) return { error: 'Cible invalide.' };
    this.steal(p, idx);
    this.stealTargets = [];
    this.phase = this.dice ? 'main' : 'roll';
    return { ok: true };
  }

  steal(p, victimIdx) {
    const victim = this.players[victimIdx];
    const pool = [];
    for (const r of RESOURCES) for (let i = 0; i < victim.res[r]; i++) pool.push(r);
    if (!pool.length) return;
    const r = pool[Math.floor(this.rng() * pool.length)];
    victim.res[r]--;
    p.res[r]++;
    this.addLog(p.name + ' vole une carte a ' + victim.name + '.', 'robber');
    this.lastSteal = { thief: p.index, victim: victimIdx, resource: r };
  }

  /* --- constructions --- */

  do_buildRoad(p, payload) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'main') return { error: 'Construction impossible dans cette phase.' };
    const eid = Number(payload.edge);
    if (!this.board.edges[eid]) return { error: 'Arete invalide.' };
    if (this.roads[eid] !== undefined) return { error: 'Il y a deja une route ici.' };
    if (p.roadsLeft <= 0) return { error: 'Plus de routes disponibles (' + this.limits.road + ' max).' };
    if (!this.validRoadSpots(p.index).includes(eid)) return { error: 'La route doit prolonger votre reseau.' };
    const free = this.freeRoads > 0;
    if (!free) {
      if (!this.hasRes(p, COSTS.road)) return { error: 'Ressources insuffisantes (1 argile + 1 bois).' };
      this.payRes(p, COSTS.road);
    } else {
      this.freeRoads--;
    }
    this.roads[eid] = p.index;
    p.roadsLeft--;
    this.addLog(p.name + ' construit une route' + (free ? ' (gratuite)' : '') + '.', 'build');
    this.updateLongestRoad();
    this.checkVictory();
    return { ok: true };
  }

  do_buildSettlement(p, payload) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'main') return { error: 'Construction impossible dans cette phase.' };
    const vid = Number(payload.vertex);
    if (!this.board.vertices[vid]) return { error: 'Intersection invalide.' };
    if (p.settlementsLeft <= 0) return { error: 'Plus de colonies disponibles (' + this.limits.settlement + ' max).' };
    if (!this.vertexFree(vid)) return { error: 'Emplacement interdit (regle de distance).' };
    if (!this.playerTouchesVertex(p.index, vid)) return { error: 'Il faut une de vos routes adjacente.' };
    if (!this.hasRes(p, COSTS.settlement)) return { error: 'Ressources insuffisantes (bois, argile, laine, ble).' };
    this.payRes(p, COSTS.settlement);
    this.buildings[vid] = { type: 'settlement', owner: p.index };
    p.settlementsLeft--;
    this.addLog(p.name + ' construit une colonie.', 'build');
    this.updateLongestRoad(); // peut couper une route adverse
    this.checkVictory();
    return { ok: true };
  }

  do_buildCity(p, payload) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'main') return { error: 'Construction impossible dans cette phase.' };
    const vid = Number(payload.vertex);
    const b = this.buildings[vid];
    if (!b || b.owner !== p.index || b.type !== 'settlement') return { error: 'Vous devez ameliorer une de vos colonies.' };
    if (p.citiesLeft <= 0) return { error: 'Plus de villes disponibles (' + this.limits.city + ' max).' };
    if (!this.hasRes(p, COSTS.city)) return { error: 'Ressources insuffisantes (2 ble + 3 minerai).' };
    this.payRes(p, COSTS.city);
    b.type = 'city';
    p.citiesLeft--;
    p.settlementsLeft = Math.min(this.limits.settlement, p.settlementsLeft + 1);
    this.addLog(p.name + ' ameliore une colonie en ville.', 'build');
    this.checkVictory();
    return { ok: true };
  }

  do_buildBoat(p, payload) {
    const err = this.requireTurn(p); if (err) return err;
    if (!this.boatsEnabled) return { error: 'Pas de bateaux sur cette carte.' };
    if (this.phase !== 'main') return { error: 'Construction impossible dans cette phase.' };
    const portId = Number(payload.port);
    if (!this.board.ports[portId]) return { error: 'Port invalide.' };
    if (!this.validBoatPorts(p.index).includes(portId)) {
      return { error: 'Il faut une construction sur la cote, et un port que votre reseau n atteint pas encore.' };
    }
    if (!this.hasRes(p, COSTS.boat)) return { error: 'Ressources insuffisantes (3 bois, 1 minerai, 1 ble).' };
    this.payRes(p, COSTS.boat);
    this.boats.push({ owner: p.index, port: portId });
    this.addLog(p.name + ' envoie un bateau vers un port : il peut construire des routes depuis la-bas.', 'build');
    return { ok: true };
  }

  do_buyDev(p) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'main') return { error: 'Achat impossible dans cette phase.' };
    if (!this.devDeck.length) return { error: 'Pioche de developpement vide.' };
    if (!this.hasRes(p, COSTS.dev)) return { error: 'Ressources insuffisantes (laine, ble, minerai).' };
    this.payRes(p, COSTS.dev);
    const card = this.devDeck.pop();
    card.id = cardSeq++;
    card.turnBought = this.turnCount;
    p.dev.push(card);
    this.addLog(p.name + ' achete une carte developpement.', 'dev');
    this.checkVictory();
    return { ok: true };
  }

  do_playDev(p, payload) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'main' && this.phase !== 'roll') return { error: 'Impossible de jouer une carte maintenant.' };
    if (this.devPlayedThisTurn) return { error: 'Une seule carte developpement par tour.' };
    const id = Number(payload.card);
    const card = p.dev.find((c) => c.id === id);
    if (!card) return { error: 'Carte introuvable.' };
    if (card.type === 'victoryPoint') return { error: 'Les cartes point de victoire ne se jouent pas.' };
    if (card.turnBought === this.turnCount) return { error: 'Carte achetee ce tour-ci : jouable au prochain tour.' };

    if (card.type === 'knight') {
      p.dev = p.dev.filter((c) => c.id !== id);
      p.knights++;
      this.devPlayedThisTurn = true;
      this.addLog(p.name + ' joue un Chevalier (' + p.knights + ').', 'dev');
      this.updateLargestArmy();
      this.robberFrom = this.phase;
      this.phase = 'robber';
      this.checkVictory();
      return { ok: true };
    }

    if (card.type === 'roadBuilding') {
      if (this.phase !== 'main') return { error: 'Jouez cette carte apres le jet de des.' };
      p.dev = p.dev.filter((c) => c.id !== id);
      this.devPlayedThisTurn = true;
      this.freeRoads = Math.min(2, p.roadsLeft);
      this.addLog(p.name + ' joue Construction de routes : ' + this.freeRoads + ' route(s) gratuite(s).', 'dev');
      return { ok: true };
    }

    if (card.type === 'yearOfPlenty') {
      const picks = payload.resources || [];
      if (picks.length !== 2) return { error: 'Choisissez 2 ressources.' };
      for (const r of picks) if (!RESOURCES.includes(r)) return { error: 'Ressource invalide.' };
      const need = emptyRes();
      for (const r of picks) need[r]++;
      for (const r of RESOURCES) if (need[r] > this.bank[r]) return { error: 'La banque n a pas assez de ' + RES_FR[r] + '.' };
      p.dev = p.dev.filter((c) => c.id !== id);
      this.devPlayedThisTurn = true;
      for (const r of picks) this.giveRes(p, r, 1);
      this.addLog(p.name + ' joue Invention et prend ' + picks.map((r) => RES_FR[r]).join(' + ') + '.', 'dev');
      return { ok: true };
    }

    if (card.type === 'monopoly') {
      const r = payload.resource;
      if (!RESOURCES.includes(r)) return { error: 'Ressource invalide.' };
      p.dev = p.dev.filter((c) => c.id !== id);
      this.devPlayedThisTurn = true;
      let total = 0;
      for (const q of this.players) {
        if (q.index === p.index) continue;
        total += q.res[r];
        p.res[r] += q.res[r];
        q.res[r] = 0;
      }
      this.addLog(p.name + ' joue Monopole sur ' + RES_FR[r] + ' et recupere ' + total + ' carte(s).', 'dev');
      return { ok: true };
    }
    return { error: 'Type de carte inconnu.' };
  }

  /* --- commerce --- */

  do_bankTrade(p, payload) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'main') return { error: 'Commerce impossible dans cette phase.' };
    const give = payload.give;
    const want = payload.receive;
    if (!RESOURCES.includes(give) || !RESOURCES.includes(want)) return { error: 'Ressource invalide.' };
    if (give === want) return { error: 'Choisissez deux ressources differentes.' };
    const ratio = this.tradeRatios(p.index)[give];
    if (p.res[give] < ratio) return { error: 'Il vous faut ' + ratio + ' ' + RES_FR[give] + '.' };
    if (this.bank[want] < 1) return { error: 'La banque n a plus de ' + RES_FR[want] + '.' };
    p.res[give] -= ratio;
    this.bank[give] += ratio;
    this.giveRes(p, want, 1);
    this.addLog(p.name + ' echange ' + ratio + ' ' + RES_FR[give] + ' contre 1 ' + RES_FR[want] + ' (' + ratio + ':1).', 'trade');
    return { ok: true };
  }

  normalizeOffer(obj) {
    const out = emptyRes();
    let total = 0;
    for (const r of RESOURCES) {
      const n = Math.max(0, Math.floor((obj && obj[r]) || 0));
      out[r] = n;
      total += n;
    }
    return { out, total };
  }

  do_offerTrade(p, payload) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'main') return { error: 'Commerce impossible dans cette phase.' };
    const g = this.normalizeOffer(payload.give);
    const w = this.normalizeOffer(payload.receive);
    if (!g.total && !w.total) return { error: 'Proposition vide.' };
    for (const r of RESOURCES) if (g.out[r] > p.res[r]) return { error: 'Vous n avez pas ces ressources.' };
    this.trade = {
      from: p.index,
      give: g.out,
      receive: w.out,
      responses: {},
      counters: {}
    };
    this.addLog(p.name + ' propose un echange.', 'trade');
    return { ok: true };
  }

  do_respondTrade(p, payload) {
    if (!this.trade) return { error: 'Aucune proposition en cours.' };
    if (this.trade.from === p.index) return { error: 'Vous etes l initiateur.' };
    const answer = payload.accept ? 'accept' : 'decline';
    if (answer === 'accept') {
      for (const r of RESOURCES) {
        if (p.res[r] < this.trade.receive[r]) return { error: 'Vous n avez pas les ressources demandees.' };
      }
    }
    this.trade.responses[p.index] = answer;
    this.addLog(p.name + (answer === 'accept' ? ' accepte' : ' refuse') + ' l echange.', 'trade');
    return { ok: true };
  }

  do_counterTrade(p, payload) {
    if (!this.trade) return { error: 'Aucune proposition en cours.' };
    if (this.trade.from === p.index) return { error: 'Vous etes l initiateur.' };
    const g = this.normalizeOffer(payload.give);
    const w = this.normalizeOffer(payload.receive);
    for (const r of RESOURCES) if (g.out[r] > p.res[r]) return { error: 'Vous n avez pas ces ressources.' };
    this.trade.counters[p.index] = { give: g.out, receive: w.out };
    this.trade.responses[p.index] = 'counter';
    this.addLog(p.name + ' fait une contre-proposition.', 'trade');
    return { ok: true };
  }

  do_confirmTrade(p, payload) {
    const err = this.requireTurn(p); if (err) return err;
    if (!this.trade) return { error: 'Aucune proposition en cours.' };
    if (this.trade.from !== p.index) return { error: 'Seul l initiateur valide l echange.' };
    const idx = Number(payload.with);
    const other = this.players[idx];
    if (!other) return { error: 'Joueur invalide.' };
    const resp = this.trade.responses[idx];
    if (resp !== 'accept' && resp !== 'counter') return { error: 'Ce joueur n a pas accepte.' };
    let give = this.trade.give;
    let receive = this.trade.receive;
    if (resp === 'counter') {
      const c = this.trade.counters[idx];
      // contre-proposition : ce que l autre donne / recoit
      receive = c.give;
      give = c.receive;
    }
    for (const r of RESOURCES) {
      if (p.res[r] < give[r]) return { error: 'Vous n avez plus les ressources.' };
      if (other.res[r] < receive[r]) return { error: other.name + ' n a plus les ressources.' };
    }
    const parts = [];
    for (const r of RESOURCES) {
      p.res[r] -= give[r]; other.res[r] += give[r];
      other.res[r] -= receive[r]; p.res[r] += receive[r];
      if (give[r]) parts.push(give[r] + ' ' + RES_FR[r]);
    }
    const partsB = [];
    for (const r of RESOURCES) if (receive[r]) partsB.push(receive[r] + ' ' + RES_FR[r]);
    this.addLog(p.name + ' echange ' + (parts.join(', ') || 'rien') + ' contre ' + (partsB.join(', ') || 'rien') + ' avec ' + other.name + '.', 'trade');
    this.trade = null;
    return { ok: true };
  }

  do_cancelTrade(p) {
    if (!this.trade) return { error: 'Aucune proposition en cours.' };
    if (this.trade.from !== p.index) return { error: 'Seul l initiateur peut annuler.' };
    this.trade = null;
    this.addLog(p.name + ' annule sa proposition.', 'trade');
    return { ok: true };
  }

  /* --- fin de tour --- */

  do_endTurn(p) {
    const err = this.requireTurn(p); if (err) return err;
    if (this.phase !== 'main') return { error: 'Vous devez d abord lancer les des.' };
    this.nextTurn();
    return { ok: true };
  }

  /** Passe au joueur suivant encore en lice. */
  nextTurn() {
    this.trade = null;
    this.freeRoads = 0;
    this.devPlayedThisTurn = false;
    this.dice = null;
    this.stealTargets = [];
    for (let i = 0; i < this.players.length; i++) {
      this.turn = (this.turn + 1) % this.players.length;
      if (!this.players[this.turn].left) break;
    }
    this.turnCount++;
    this.phase = 'roll';
    this.addLog('Tour de ' + this.players[this.turn].name + '.', 'turn');
    runHook(this, 'onTurnStart', this.players[this.turn]);
  }

  activePlayers() {
    return this.players.filter((p) => !p.left);
  }

  /* --- abandon de partie --- */

  do_leaveGame(p) {
    if (p.left) return { error: 'Vous avez deja quitte la partie.' };
    p.left = true;
    p.connected = false;
    this.addLog(p.name + ' quitte la partie. Ses constructions restent sur le plateau.', 'warn');

    if (this.trade && (this.trade.from === p.index || this.trade.responses[p.index] !== undefined)) {
      if (this.trade.from === p.index) this.trade = null;
      else delete this.trade.responses[p.index];
    }

    const rest = this.activePlayers();
    if (rest.length <= 1) {
      this.phase = 'ended';
      this.winner = rest.length ? rest[0].index : null;
      this.addLog(rest.length
        ? '*** ' + rest[0].name + ' remporte la partie : tous les autres joueurs ont quitte. ***'
        : 'La partie est abandonnee : plus aucun joueur.', 'win');
      return { ok: true };
    }

    if (this.phase === 'setup') {
      // on retire ses placements restants de l ordre de mise en place
      const before = this.setupOrder.slice(0, this.setupIndex);
      const after = this.setupOrder.slice(this.setupIndex).filter((t) => t.player !== p.index);
      this.setupOrder = before.concat(after);
      this.setupNeed = 'settlement';
      this.setupLastVertex = null;
      this.setupRoadsLeft = 0;
      this.setupTurnRoads = [];
      if (this.setupIndex >= this.setupOrder.length) {
        this.phase = 'roll';
        this.turn = -1;
        this.nextTurn();
        this.turnCount = 1;
      }
      return { ok: true };
    }

    if (this.current() && this.current().index === p.index) this.nextTurn();
    return { ok: true };
  }

  /* ------------------------------------------------------------------ */
  /* sauvegarde                                                          */
  /* ------------------------------------------------------------------ */

  /** Etat complet de la partie, pret a etre ecrit en JSON. */
  toSave() {
    const data = {};
    for (const k of Object.keys(this)) {
      if (k === 'rng' || k === 'mods') continue;
      data[k] = this[k];
    }
    data.modIds = this.mods.map((m) => m.id);
    return JSON.parse(JSON.stringify(data));
  }

  /** Recree une partie a partir d une sauvegarde. */
  static fromSave(data) {
    const g = Object.create(Game.prototype);
    Object.assign(g, JSON.parse(JSON.stringify(data)));
    g.rng = cryptoRandom;
    g.mods = activeMods(data.modIds || []);
    delete g.modIds;
    // les nouvelles cartes developpement ne doivent pas reprendre un identifiant existant
    for (const p of g.players) for (const c of p.dev) if (c.id >= cardSeq) cardSeq = c.id + 1;
    return g;
  }

  /* ------------------------------------------------------------------ */
  /* etat transmis au client                                            */
  /* ------------------------------------------------------------------ */

  state(viewerId) {
    const viewer = this.playerById(viewerId);
    const cur = this.current();
    const isMyTurn = viewer && cur && cur.index === viewer.index;

    const players = this.players.map((p) => ({
      index: p.index,
      id: p.id,
      name: p.name,
      color: p.color,
      resourceCount: this.resCount(p),
      devCount: p.dev.length,
      knights: p.knights,
      roadsLeft: p.roadsLeft,
      settlementsLeft: p.settlementsLeft,
      citiesLeft: p.citiesLeft,
      longestRoadLength: p.longestRoadLength,
      vp: this.phase === 'ended' ? this.totalVP(p) : this.publicVP(p),
      hasLongestRoad: this.longestRoadOwner === p.index,
      hasLargestArmy: this.largestArmyOwner === p.index,
      connected: p.connected,
      left: !!p.left
    }));

    const valid = {};
    if (viewer && isMyTurn) {
      if (this.phase === 'setup') {
        if (this.setupNeed === 'settlement') valid.settlements = this.validSettlementSpots(viewer.index, true);
        else valid.roads = this.validSetupRoads();
      } else if (this.phase === 'main') {
        valid.settlements = this.validSettlementSpots(viewer.index, false);
        valid.cities = this.validCitySpots(viewer.index);
        valid.roads = this.validRoadSpots(viewer.index);
        valid.boats = this.validBoatPorts(viewer.index);
      } else if (this.phase === 'robber') {
        valid.robber = this.validRobberHexes();
      }
    }

    return {
      phase: this.phase,
      version: this.version,
      board: this.board,
      robber: this.robber,
      buildings: this.buildings,
      roads: this.roads,
      turn: this.turn,
      turnCount: this.turnCount,
      currentPlayer: cur ? cur.index : null,
      dice: this.dice,
      players,
      bank: this.bank,
      devDeckCount: this.devDeck.length,
      targetVP: this.targetVP,
      limits: this.limits,
      rules: {
        startSettlements: this.startSettlements,
        startRoads: this.startRoads,
        friendlyRobber: this.friendlyRobber,
        robberThreshold: this.robberThreshold,
        boats: this.boatsEnabled,
        mods: this.mods.map((m) => ({ id: m.id, name: m.name, desc: m.desc, icon: m.icon, chance: m.chance }))
      },
      boats: this.boats,
      events: this.events,
      setup: this.phase === 'setup' ? {
        need: this.setupNeed, index: this.setupIndex, total: this.setupOrder.length, roadsLeft: this.setupRoadsLeft
      } : null,
      trade: this.trade,
      stealTargets: this.phase === 'steal' ? this.stealTargets.map((i) => ({
        index: i, name: this.players[i].name, cards: this.resCount(this.players[i])
      })) : [],
      freeRoads: this.freeRoads,
      devPlayedThisTurn: this.devPlayedThisTurn,
      winner: this.winner,
      log: this.log.slice(-80),
      lastSteal: this.lastSteal || null,
      you: viewer ? {
        index: viewer.index,
        resources: viewer.res,
        dev: viewer.dev.map((c) => ({
          id: c.id,
          type: c.type,
          name: c.name || null,
          playable: c.type !== 'victoryPoint' && c.turnBought !== this.turnCount && !this.devPlayedThisTurn
        })),
        vp: this.totalVP(viewer),
        ratios: this.tradeRatios(viewer.index),
        ports: Array.from(this.portsOf(viewer.index)),
        isMyTurn: !!isMyTurn,
        valid
      } : null
    };
  }
}

module.exports = { Game, RESOURCES, RES_FR, COSTS, LIMITS, ROBBER_THRESHOLD, cryptoRandom, randomInt };
