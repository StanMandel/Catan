'use strict';
/**
 * Mods : contenu additionnel activable par l hote dans le salon.
 *
 * Un mod est un objet de la forme :
 *   {
 *     id: 'mon-mod',                  // identifiant unique
 *     name: 'Mon mod',                // nom affiche
 *     desc: 'Ce que le mod ajoute.',  // description affichee
 *     hooks: {                        // tous facultatifs
 *       onGameStart(game) {},         // fin de la creation de la partie
 *       onTurnStart(game, player) {}, // debut du tour d un joueur
 *       onRoll(game, player, total) {} // apres un jet de des (production ou 7 deja resolus)
 *     }
 *   }
 *
 * Un mod qui declenche un evenement appelle game.addEvent(titre, texte, tuiles) :
 * l evenement est note au journal et affiche en grand, en rouge, chez tous les joueurs.
 * Les tuiles passees en 3e argument sont entourees d un contour rouge neon sur le plateau.
 */

const EVENT_CHANCE = 1 / 25;
const BAD_OMEN_CHANCE = 1 / 20;

const TERRAIN_FR = {
  forest: 'Forêt', pasture: 'Pâturage', fields: 'Champ', hills: 'Colline', mountains: 'Montagne', desert: 'Désert'
};

const pick = (game, list) => list[Math.floor(game.rng() * list.length)];
const tileName = (h) => TERRAIN_FR[h.terrain] + (h.number ? ' ' + h.number : '');

/* ------------------------------------------------------------------ */

/** Intervertit deux tuiles (terrain et jeton) ; le voleur reste sur sa case. */
function swapTiles(game) {
  // les tuiles fixes d une carte (volcan, desert central...) ne bougent pas
  const hexes = game.board.hexes.filter((h) => !h.fixed);
  if (hexes.length < 2) return;
  const a = pick(game, hexes);
  const others = hexes.filter((h) => h.id !== a.id && (h.terrain !== a.terrain || h.number !== a.number));
  if (!others.length) return;
  const b = pick(game, others);
  const before = tileName(a) + ' et ' + tileName(b);
  for (const key of ['terrain', 'resource', 'number', 'pips']) {
    const t = a[key]; a[key] = b[key]; b[key] = t;
  }
  // les deux tuiles sont renvoyees au client : il les entoure d un contour rouge neon
  game.addEvent('Événement perturbant', 'La terre tremble : les tuiles ' + before + ' ont été interverties !', [a.id, b.id]);
}

/** Le voleur part seul sur une tuile au hasard, sans rien voler. */
function nomadRobber(game) {
  const from = game.robber;
  const to = pick(game, game.board.hexes.filter((h) => h.id !== from));
  game.robber = to.id;
  game.addEvent('Nomade', 'Le voleur erre et s’installe sur la tuile ' + tileName(to) + '. Il ne vole rien.');
}

/** Detruit une route, une colonie ou un bateau du joueur le plus developpe (jamais une ville). */
function badOmen(game) {
  const active = game.players.filter((p) => !p.left);
  if (!active.length) return;
  const size = (p) => {
    let n = game.publicVP(p) * 100;
    for (const vid in game.buildings) if (game.buildings[vid].owner === p.index) n += game.buildings[vid].type === 'city' ? 2 : 1;
    for (const eid in game.roads) if (game.roads[eid] === p.index) n += 0.1;
    return n;
  };
  const top = Math.max(...active.map(size));
  const victim = pick(game, active.filter((p) => size(p) === top));

  const mine = (type) => Object.keys(game.buildings).filter((vid) =>
    game.buildings[vid].owner === victim.index && game.buildings[vid].type === type).map(Number);
  const roads = Object.keys(game.roads).filter((eid) => game.roads[eid] === victim.index).map(Number);
  const settlements = mine('settlement');
  const cities = mine('city');
  const boats = (game.boats || []).filter((b) => b.owner === victim.index);

  // une categorie au hasard parmi celles possedees ; les villes sont epargnees
  // et on ne retire jamais la derniere construction
  const choices = [];
  if (roads.length) choices.push('road');
  if (settlements.length && settlements.length + cities.length > 1) choices.push('settlement');
  if (boats.length) choices.push('boat');
  if (!choices.length) return;

  const kind = pick(game, choices);
  let text = '';
  if (kind === 'road') {
    delete game.roads[pick(game, roads)];
    victim.roadsLeft++;
    text = 'une route de ' + victim.name + ' s’effondre';
  } else if (kind === 'settlement') {
    delete game.buildings[pick(game, settlements)];
    victim.settlementsLeft++;
    text = 'une colonie de ' + victim.name + ' est détruite';
  } else {
    const boat = pick(game, boats);
    game.boats.splice(game.boats.indexOf(boat), 1);
    text = 'un bateau de ' + victim.name + ' fait naufrage';
  }
  game.updateLongestRoad();
  game.addEvent('Mauvais augure', 'Un sombre présage frappe le joueur le plus développé : ' + text + ' !');
}

/* ------------------------------------------------------------------ */

const MODS = [
  {
    id: 'perturbant',
    name: 'Événement perturbant',
    icon: '🔀',
    category: 'Événement',
    chance: '1 chance sur 25 par lancer',
    effect: 'Plateau',
    desc: 'Deux tuiles de la carte échangent leur terrain et leur jeton numéroté. Les tuiles fixes d’une carte ne bougent pas.',
    hooks: {
      onRoll(game) { if (game.rng() < EVENT_CHANCE) swapTiles(game); }
    }
  },
  {
    id: 'nomade',
    name: 'Nomade',
    icon: '🧭',
    category: 'Événement',
    chance: '1 chance sur 25 par lancer (hors 7)',
    effect: 'Voleur',
    desc: 'Le voleur quitte sa tuile et s’installe seul sur une tuile au hasard. Il ne vole rien.',
    hooks: {
      onRoll(game, player, total) { if (total !== 7 && game.rng() < EVENT_CHANCE) nomadRobber(game); }
    }
  },
  {
    id: 'mauvais-augure',
    name: 'Mauvais augure',
    icon: '🌑',
    category: 'Événement',
    chance: '1 chance sur 20 par lancer',
    effect: 'Joueur en tête',
    desc: 'Le joueur le plus développé perd une pièce : route, colonie ou bateau. Ses villes sont épargnées, et jamais sa dernière construction.',
    hooks: {
      onRoll(game) { if (game.rng() < BAD_OMEN_CHANCE) badOmen(game); }
    }
  }
];

/** Liste envoyee aux clients pour la fenetre des mods. */
function modList() {
  return MODS.map((m) => ({
    id: m.id, name: m.name, desc: m.desc || '', icon: m.icon || '🧩',
    category: m.category || 'Règle', chance: m.chance || '', effect: m.effect || ''
  }));
}

/** Ne garde que les identifiants de mods existants. */
function sanitizeMods(ids) {
  if (!Array.isArray(ids)) return [];
  const known = new Set(MODS.map((m) => m.id));
  return Array.from(new Set(ids.map(String).filter((id) => known.has(id))));
}

function activeMods(ids) {
  const wanted = new Set(sanitizeMods(ids));
  return MODS.filter((m) => wanted.has(m.id));
}

/** Appelle un crochet sur tous les mods actifs d une partie. */
function runHook(game, name, ...args) {
  for (const mod of game.mods || []) {
    const fn = mod.hooks && mod.hooks[name];
    if (typeof fn === 'function') fn(game, ...args);
  }
}

module.exports = { MODS, modList, sanitizeMods, activeMods, runHook, EVENT_CHANCE };
