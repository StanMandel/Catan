'use strict';
/**
 * Cartes jouables.
 *
 * Chaque carte est dessinee en texte : une ligne par rangee d hexagones
 * (pointe en haut). Deux colonnes de texte = un hexagone, les rangees
 * impaires sont decalees d une colonne.
 *   x : tuile tiree dans le sac
 *   tuiles fixes : D desert, F foret, P paturage, C champ, H colline, M montagne
 *   . ou espace : mer
 *
 * tiles   : contenu du sac de tuiles (hors deserts fixes)
 * numbers : jetons numerotes (un par tuile non desert)
 * ports   : types de ports, repartis regulierement sur la cote
 * bank    : cartes par ressource dans la banque (19 par defaut)
 * boats   : autorise les bateaux (3 bois, 1 minerai, 1 ble) pour rejoindre un autre port
 */

// lettres des tuiles fixes
const FIXED = { D: 'desert', F: 'forest', P: 'pasture', C: 'fields', H: 'hills', M: 'mountains' };
const LAND = /[xDFPCHM]/;

const MAPS = [
  {
    id: 'classic',
    name: 'Classique',
    players: '3-4 joueurs',
    desc: 'L’île de base : 19 tuiles, 9 ports.',
    rows: [
      '  x x x',
      ' x x x x',
      'x x x x x',
      ' x x x x',
      '  x x x'
    ],
    tiles: { forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3, desert: 1 },
    numbers: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    ports: ['3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore'],
    // emplacements historiques des ports sur l anneau cotier
    portOffsets: [0, 3, 6, 10, 13, 16, 20, 23, 26]
  },
  {
    id: 'grande',
    name: 'Grande île',
    players: '5-6 joueurs',
    desc: 'La version agrandie : 30 tuiles, 2 déserts et 11 ports.',
    rows: [
      '   x x x',
      '  x x x x',
      ' x x x x x',
      'x x x x x x',
      ' x x x x x',
      '  x x x x',
      '   x x x'
    ],
    tiles: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 2 },
    numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
    ports: ['3:1', '3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'wool', 'grain', 'ore'],
    bank: 24
  },
  {
    id: 'continent',
    name: 'Continent',
    players: '4-6 joueurs',
    desc: 'Une très grande île de 61 tuiles : parties longues, beaucoup de place pour s’étendre.',
    rows: [
      '    x x x x x',
      '   x x x x x x',
      '  x x x x x x x',
      ' x x x x x x x x',
      'x x x x x x x x x',
      ' x x x x x x x x',
      '  x x x x x x x',
      '   x x x x x x',
      '    x x x x x'
    ],
    tiles: { forest: 12, pasture: 12, fields: 12, hills: 10, mountains: 10, desert: 5 },
    numbers: [
      2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5,
      6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9,
      10, 10, 10, 10, 10, 10, 11, 11, 11, 11, 11, 11, 12, 12, 12
    ],
    ports: ['3:1', '3:1', '3:1', '3:1', '3:1', '3:1', 'lumber', 'lumber', 'brick', 'brick',
      'wool', 'wool', 'grain', 'grain', 'ore', 'ore'],
    bank: 40
  },
  {
    id: 'lac',
    name: 'Le Lac',
    players: '3-4 joueurs',
    desc: 'Un lac remplace le centre de l’île : des ports s’ouvrent aussi sur ses rives.',
    rows: [
      '  x x x',
      ' x x x x',
      'x x . x x',
      ' x x x x',
      '  x x x'
    ],
    tiles: { forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 2, desert: 1 },
    numbers: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11],
    ports: ['3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore']
  },
  {
    id: 'archipel',
    name: 'Archipel',
    players: '3-6 joueurs',
    desc: 'Trois îles séparées par la mer. Construisez des bateaux (3 bois, 1 minerai, 1 blé) pour rejoindre un port d’une autre île et y prolonger vos routes.',
    rows: [
      ' x x x     x x x',
      'x x x x   x x x x',
      ' x x x     x x x',
      '',
      '       x x x',
      '      x x x x',
      '       x x x'
    ],
    tiles: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 2 },
    numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
    ports: ['3:1', '3:1', '3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'wool', 'grain', 'ore'],
    bank: 24,
    boats: true
  },
  {
    id: 'fer',
    name: 'Fer à cheval',
    players: '3-5 joueurs',
    desc: 'Une île en arc autour d’une baie : beaucoup de côtes et de ports.',
    rows: [
      '    x x x x x',
      '   x x x x x x',
      '  x x x   x x x',
      ' x x x     x x x',
      'x x x       x x x'
    ],
    tiles: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 1 },
    numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
    ports: ['3:1', '3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'wool', 'grain', 'ore'],
    bank: 24
  },
  {
    id: 'oasis',
    name: 'Grand Désert',
    players: '3-4 joueurs',
    desc: 'Deux déserts au cœur de l’île : les meilleures terres sont sur le littoral.',
    rows: [
      '   x x x x',
      '  x x x x x',
      ' x x D D x x',
      '  x x x x x',
      '   x x x x'
    ],
    tiles: { forest: 5, pasture: 5, fields: 4, hills: 4, mountains: 4 },
    numbers: [2, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 11, 11, 12],
    ports: ['3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore']
  },
  {
    id: 'atoll',
    name: 'Atoll',
    players: '3-6 joueurs',
    desc: 'Un anneau de terre autour d’un grand lagon : des ports s’ouvrent des deux côtés du rivage.',
    rows: [
      '   x x x x',
      '  x x x x x',
      ' x x . . x x',
      'x x . . . x x',
      ' x x . . x x',
      '  x x x x x',
      '   x x x x'
    ],
    tiles: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 2 },
    numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
    ports: ['3:1', '3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'wool', 'grain', 'ore'],
    bank: 24
  },
  {
    id: 'detroit',
    name: 'Le Détroit',
    players: '3-6 joueurs',
    desc: 'Deux continents séparés par un bras de mer. Construisez des bateaux (3 bois, 1 minerai, 1 blé) pour traverser.',
    rows: [
      ' x x x       x x',
      'x x x x     x x x',
      ' x x x     x x x',
      'x x x     x x x x',
      ' x x       x x x'
    ],
    tiles: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 2 },
    numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12],
    ports: ['3:1', '3:1', '3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'wool', 'grain', 'ore'],
    bank: 24,
    boats: true
  },
  {
    id: 'volcan',
    name: 'Le Volcan',
    players: '4-6 joueurs',
    desc: 'Une grande île de 37 tuiles : un volcan éteint au centre, cerné par toutes les montagnes de l’île.',
    rows: [
      '   x x x x',
      '  x x x x x',
      ' x x M M x x',
      'x x M D M x x',
      ' x x M M x x',
      '  x x x x x',
      '   x x x x'
    ],
    tiles: { forest: 8, pasture: 8, fields: 7, hills: 7 },
    numbers: [
      2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6,
      8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 12, 12
    ],
    ports: ['3:1', '3:1', '3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'wool', 'grain', 'ore'],
    bank: 30
  },
  {
    id: 'etoile',
    name: 'L’Étoile',
    players: '3-4 joueurs',
    desc: 'Six péninsules étroites autour d’un cœur central : la course au centre commence dès la mise en place.',
    rows: [
      '     x     x',
      '      x   x',
      '       x x',
      '  x x x x x x x',
      '       x x',
      '      x   x',
      '     x     x'
    ],
    tiles: { forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3, desert: 1 },
    numbers: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
    ports: ['3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore']
  },
  {
    id: 'sablier',
    name: 'Le Sablier',
    players: '3-5 joueurs',
    desc: 'Deux triangles reliés par un goulet de deux tuiles : qui tient le passage contrôle la carte.',
    rows: [
      'x x x x x',
      ' x x x x',
      '  x x x',
      '   x x',
      '  x x x',
      ' x x x x',
      'x x x x x'
    ],
    tiles: { forest: 5, pasture: 5, fields: 5, hills: 5, mountains: 4, desert: 2 },
    numbers: [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 11, 11, 12],
    ports: ['3:1', '3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore'],
    bank: 22
  }
];

/* verification des definitions au chargement */
for (const m of MAPS) {
  const text = m.rows.join('');
  const random = (text.match(/x/g) || []).length;
  const bag = Object.values(m.tiles).reduce((a, n) => a + n, 0);
  if (bag !== random) throw new Error('Carte ' + m.id + ' : ' + random + ' cases x pour ' + bag + ' tuiles.');
  const fixedProducing = (text.match(/[FPCHM]/g) || []).length;
  const producing = random - (m.tiles.desert || 0) + fixedProducing;
  let parity = null;
  m.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (!LAND.test(row[i])) continue;
      if (parity === null) parity = (i + j) % 2;
      else if ((i + j) % 2 !== parity) throw new Error('Carte ' + m.id + ' : case mal alignee rangee ' + j + ' colonne ' + i + '.');
    }
  });
  if (producing !== m.numbers.length) {
    throw new Error('Carte ' + m.id + ' : ' + producing + ' tuiles productives pour ' + m.numbers.length + ' jetons.');
  }
}

function getMap(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}

/** Resume envoye aux clients pour le choix de la carte. */
function mapList() {
  return MAPS.map((m) => {
    const text = m.rows.join('');
    return {
      id: m.id,
      name: m.name,
      players: m.players,
      desc: m.desc,
      tiles: (text.match(/[xDFPCHM]/g) || []).length,
      ports: m.ports.length,
      boats: !!m.boats
    };
  });
}

module.exports = { MAPS, FIXED, getMap, mapList };
