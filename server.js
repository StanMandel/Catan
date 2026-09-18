'use strict';
/**
 * Catan - serveur de jeu en reseau local.
 * Aucune dependance externe : http + WebSocket maison.
 *
 *   node server.js [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WSServer } = require('./src/ws-server');
const { Game, LIMITS, ROBBER_THRESHOLD } = require('./src/game');
const { modList, sanitizeMods } = require('./src/mods');
const { createBoard, boardPreview } = require('./src/board');
const { getMap, mapList } = require('./src/maps');
const Bot = require('./src/bot');

const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const SAVE_DIR = path.join(__dirname, 'saves');
const AUTOSAVE_DELAY = 2000;

const COLORS = [
  { id: 'red', label: 'Rouge', hex: '#d6383a' },
  { id: 'blue', label: 'Bleu', hex: '#2f6fd0' },
  { id: 'white', label: 'Blanc', hex: '#eceff3' },
  { id: 'orange', label: 'Orange', hex: '#e8862a' },
  { id: 'green', label: 'Vert', hex: '#3a9c56' },
  { id: 'purple', label: 'Violet', hex: '#8d5bd6' }
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg'
};

/* ---------------------------------------------------------------- */
/* Serveur HTTP statique                                            */
/* ---------------------------------------------------------------- */

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Interdit');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 - introuvable');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

/* ---------------------------------------------------------------- */
/* Etat du lobby                                                    */
/* ---------------------------------------------------------------- */

const rooms = new Map();   // roomId -> room
const clients = new Map(); // playerId -> client

function uid(n) {
  return crypto.randomBytes(n || 8).toString('hex');
}

function roomCode() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  } while (rooms.has(code));
  return code;
}

// caracteres de controle + chevrons (anti-injection HTML)
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f<>]", "g");

function sanitize(str, max) {
  return String(str == null ? '' : str).replace(CONTROL_CHARS, '').trim().slice(0, max || 20);
}

function freeColor(room) {
  const taken = new Set(room.members.map((m) => m.color));
  const c = COLORS.find((c) => !taken.has(c.id));
  return c ? c.id : COLORS[0].id;
}

function colorHex(id) {
  const c = COLORS.find((c) => c.id === id);
  return c ? c.hex : '#888';
}

const intIn = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

/** Reglages par defaut d un salon (valeurs du jeu de base sauf mention). */
function defaultSettings(msg) {
  return {
    targetVP: intIn(msg.targetVP, 8, 20, 10),
    map: getMap(sanitize(msg.map, 16)).id,
    randomBoard: msg.randomBoard !== false,
    fairBoard: msg.fairBoard !== false,
    startSettlements: 1,
    startRoads: 1,
    friendlyRobber: false,
    robberThreshold: ROBBER_THRESHOLD,
    limits: { road: LIMITS.road, settlement: LIMITS.settlement, city: LIMITS.city },
    mods: []
  };
}

/** Applique les reglages envoyes par l hote. Renvoie true si le plateau doit etre regenere. */
function applySettings(settings, msg) {
  let board = false;
  if (msg.targetVP !== undefined) settings.targetVP = intIn(msg.targetVP, 8, 20, settings.targetVP);
  if (msg.randomBoard !== undefined) { settings.randomBoard = !!msg.randomBoard; board = true; }
  if (msg.fairBoard !== undefined) { settings.fairBoard = !!msg.fairBoard; board = true; }
  if (msg.map !== undefined) { settings.map = getMap(sanitize(msg.map, 16)).id; board = true; }
  if (msg.friendlyRobber !== undefined) settings.friendlyRobber = !!msg.friendlyRobber;
  if (msg.robberThreshold !== undefined) settings.robberThreshold = intIn(msg.robberThreshold, 3, 30, settings.robberThreshold);
  if (msg.limits && typeof msg.limits === 'object') {
    const l = settings.limits;
    if (msg.limits.road !== undefined) l.road = intIn(msg.limits.road, 5, 40, l.road);
    if (msg.limits.settlement !== undefined) l.settlement = intIn(msg.limits.settlement, 2, 15, l.settlement);
    if (msg.limits.city !== undefined) l.city = intIn(msg.limits.city, 0, 12, l.city);
  }
  if (msg.startSettlements !== undefined) settings.startSettlements = intIn(msg.startSettlements, 1, 5, settings.startSettlements);
  if (msg.startRoads !== undefined) settings.startRoads = intIn(msg.startRoads, 0, 10, settings.startRoads);
  // le depart ne peut pas depasser le stock de pieces
  settings.startSettlements = Math.min(settings.startSettlements, settings.limits.settlement);
  settings.startRoads = Math.min(settings.startRoads, settings.limits.road);
  if (msg.mods !== undefined) settings.mods = sanitizeMods(msg.mods);
  return board;
}

/* ---------------------------------------------------------------- */
/* Sauvegardes                                                      */
/* ---------------------------------------------------------------- */

const SAVE_ID = /^[a-z0-9-]{4,60}$/;

function savePath(id) {
  return SAVE_ID.test(id) ? path.join(SAVE_DIR, id + '.json') : null;
}

function saveSummary(room, game) {
  return {
    name: room.name,
    map: getMap(game.board.map).name,
    solo: !!room.solo,
    turn: game.turnCount,
    phase: game.phase,
    targetVP: game.targetVP,
    players: game.players.map((p) => ({ id: p.id, name: p.name, color: p.color, vp: game.publicVP(p), bot: !!p.bot, left: !!p.left }))
  };
}

/** Ecrit la partie d un salon sur disque. kind : 'auto' (ecrasee a chaque fois) ou 'manual' (instantane). */
function writeSave(room, kind) {
  const game = room.game;
  if (!game) return null;
  if (!room.saveId) room.saveId = Date.now().toString(36) + '-' + room.id.toLowerCase();
  const id = kind === 'manual' ? room.saveId + '-m' + Date.now().toString(36) : room.saveId;
  const data = {
    version: 1,
    id,
    gameId: room.saveId,
    kind,
    savedAt: Date.now(),
    summary: saveSummary(room, game),
    room: { name: room.name, solo: !!room.solo, settings: room.settings },
    game: game.toSave()
  };
  try {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    const file = savePath(id);
    fs.writeFileSync(file + '.tmp', JSON.stringify(data));
    fs.renameSync(file + '.tmp', file);
    return data;
  } catch (e) {
    console.error('Sauvegarde impossible :', e.message);
    return null;
  }
}

function deleteSaveFile(id) {
  const file = savePath(id);
  if (file) try { fs.unlinkSync(file); } catch (e) { /* deja absente */ }
}

/** Sauvegarde automatique, regroupee pour ne pas ecrire a chaque clic. */
function scheduleAutosave(room) {
  if (!room.game) return;
  if (room.game.phase === 'ended') {
    // partie terminee : plus rien a reprendre
    clearTimeout(room.autosaveTimer);
    if (room.saveId) deleteSaveFile(room.saveId);
    return;
  }
  if (room.autosaveTimer) return;
  room.autosaveTimer = setTimeout(() => {
    room.autosaveTimer = null;
    if (room.game && room.game.phase !== 'ended') writeSave(room, 'auto');
  }, AUTOSAVE_DELAY);
}

function listSaves() {
  let files = [];
  try { files = fs.readdirSync(SAVE_DIR).filter((f) => f.endsWith('.json')); } catch (e) { return []; }
  const out = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SAVE_DIR, f), 'utf8'));
      out.push({ id: data.id, kind: data.kind, savedAt: data.savedAt, summary: data.summary });
    } catch (e) { /* fichier illisible : ignore */ }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** Places d une partie reprise, a attribuer dans le salon. */
function resumeDetail(room) {
  const r = room.resume;
  if (!r) return null;
  return {
    turn: r.game.turnCount,
    savedAt: r.savedAt,
    kind: r.kind,
    seats: r.game.players.map((p) => {
      const m = r.seats[p.index] ? room.members.find((x) => x.id === r.seats[p.index]) : null;
      return {
        index: p.index, name: p.name, color: p.color, vp: r.game.publicVP(p), bot: !!p.bot, left: !!p.left,
        claimedBy: m ? m.id : null, claimedName: m ? m.name : null
      };
    })
  };
}

function humans(room) {
  return room.members.filter((m) => !m.bot);
}

/** (Re)genere le plateau du salon : l apercu est exactement le plateau joue. */
function regenerateBoard(room) {
  room.board = createBoard({
    map: room.settings.map,
    random: room.settings.randomBoard,
    fair: room.settings.fairBoard
  });
}

function addBot(room) {
  if (room.members.length >= room.maxPlayers) return false;
  const usedNames = new Set(room.members.map((m) => m.name));
  const base = Bot.BOT_NAMES.find((n) => !usedNames.has(n + ' (IA)')) || ('Bot ' + room.members.length);
  room.members.push({ id: 'bot-' + uid(4), name: base + ' (IA)', color: freeColor(room), ready: true, bot: true });
  return true;
}

function roomSummary(room) {
  return {
    id: room.id,
    name: room.name,
    host: (room.members.find((m) => m.id === room.hostId) || {}).name || '?',
    players: room.members.length,
    maxPlayers: room.maxPlayers,
    started: room.game !== null,
    resume: !!room.resume,
    locked: !!room.password,
    targetVP: room.settings.targetVP,
    map: getMap(room.settings.map).name,
    spectators: room.spectators.length
  };
}

function roomDetail(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    started: room.game !== null,
    locked: !!room.password,
    settings: room.settings,
    members: room.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      colorHex: colorHex(m.color),
      ready: m.ready,
      bot: !!m.bot,
      connected: !!m.bot || !!(clients.get(m.id) && clients.get(m.id).conn),
      host: m.id === room.hostId
    })),
    solo: !!room.solo,
    resume: resumeDetail(room),
    maps: mapList(),
    mods: modList(),
    preview: room.game || !room.board ? null : boardPreview(room.board),
    colors: COLORS,
    chat: room.chat.slice(-60)
  };
}

function broadcastRooms() {
  const list = Array.from(rooms.values())
    .filter((r) => humans(r).length > 0 && !r.solo)
    .map(roomSummary)
    .sort((a, b) => Number(a.started) - Number(b.started));
  for (const c of clients.values()) {
    if (c.conn && !c.roomId) c.conn.send({ type: 'rooms', rooms: list });
  }
}

function sendRoom(room) {
  const detail = roomDetail(room);
  for (const m of room.members) {
    const c = clients.get(m.id);
    if (c && c.conn) c.conn.send({ type: 'room', room: detail });
  }
  broadcastRooms();
}

function sendGame(room) {
  if (!room.game) return;
  for (const m of room.members) {
    const c = clients.get(m.id);
    if (c && c.conn) c.conn.send({ type: 'game', state: room.game.state(m.id), room: roomDetail(room) });
  }
  scheduleBots(room);
  scheduleAutosave(room);
}

/** Fait jouer les IA, une action a la fois, avec un delai lisible. */
function scheduleBots(room) {
  if (room.botTimer || !room.game || !Bot.needsAction(room.game)) return;
  const game = room.game;
  const delay = game.phase === 'setup' ? 700 : game.phase === 'roll' ? 900 : 650;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (rooms.get(room.id) !== room || room.game !== game) return;
    if (Bot.step(game)) sendGame(room);
  }, delay);
}

function deleteRoom(room) {
  if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
  // derniere sauvegarde avant de fermer le salon
  if (room.autosaveTimer) { clearTimeout(room.autosaveTimer); room.autosaveTimer = null; }
  if (room.game && room.game.phase !== 'ended') writeSave(room, 'auto');
  rooms.delete(room.id);
}

function findRoomOf(playerId) {
  for (const room of rooms.values()) {
    if (room.members.some((m) => m.id === playerId)) return room;
  }
  return null;
}

function leaveRoom(client, silent) {
  const room = client.roomId ? rooms.get(client.roomId) : null;
  client.roomId = null;
  if (!room) return;
  const member = room.members.find((m) => m.id === client.id);
  if (!member) return;
  if (room.game) {
    // Partie en cours : on garde le siege pour une reconnexion
    if (!silent) {
      room.chat.push({ system: true, text: member.name + ' a quitte la partie.' });
      const gp = room.game.playerById(client.id);
      if (gp) gp.connected = false;
    }
    sendGame(room);
    broadcastRooms();
    return;
  }
  room.members = room.members.filter((m) => m.id !== client.id);
  if (!humans(room).length) {
    deleteRoom(room);
  } else {
    if (room.hostId === client.id) room.hostId = humans(room)[0].id;
    room.chat.push({ system: true, text: member.name + ' a quitte le salon.' });
    sendRoom(room);
  }
  broadcastRooms();
}

/* ---------------------------------------------------------------- */
/* WebSocket                                                        */
/* ---------------------------------------------------------------- */

const wss = new WSServer(server);

wss.on('connection', (conn) => {
  let client = null;

  const fail = (msg) => conn.send({ type: 'error', message: msg });

  conn.on('message', (msg) => {
    if (!msg || typeof msg.type !== 'string') return;

    /* --- identification --- */
    if (msg.type === 'hello') {
      const wanted = sanitize(msg.playerId, 32);
      let id = wanted && /^[a-f0-9]{16,32}$/.test(wanted) ? wanted : uid(8);
      const existing = clients.get(id);
      if (existing && existing.conn && existing.conn !== conn) existing.conn.close();
      client = existing || { id, name: '', roomId: null, conn: null };
      client.conn = conn;
      client.name = sanitize(msg.name, 16) || client.name || 'Joueur';
      clients.set(id, client);
      conn.send({ type: 'welcome', playerId: id, name: client.name, colors: COLORS });

      const room = findRoomOf(id);
      if (room) {
        client.roomId = room.id;
        const member = room.members.find((m) => m.id === id);
        if (member) member.name = client.name;
        if (room.game) {
          const gp = room.game.playerById(id);
          if (gp) { gp.connected = true; gp.name = client.name; }
          sendGame(room);
        } else {
          sendRoom(room);
        }
      } else {
        broadcastRooms();
      }
      return;
    }

    if (!client) { fail('Non identifie.'); return; }
    const room = client.roomId ? rooms.get(client.roomId) : null;

    switch (msg.type) {
      case 'setName': {
        client.name = sanitize(msg.name, 16) || client.name;
        if (room) {
          const m = room.members.find((m) => m.id === client.id);
          if (m) m.name = client.name;
          if (room.game) { const gp = room.game.playerById(client.id); if (gp) gp.name = client.name; sendGame(room); }
          else sendRoom(room);
        }
        conn.send({ type: 'welcome', playerId: client.id, name: client.name, colors: COLORS });
        break;
      }

      case 'listRooms':
        conn.send({
          type: 'rooms',
          rooms: Array.from(rooms.values()).filter((r) => humans(r).length > 0 && !r.solo).map(roomSummary)
        });
        break;

      case 'createRoom': {
        if (room) leaveRoom(client, true);
        const id = roomCode();
        const solo = !!msg.solo;
        const maxPlayers = Math.max(1, Math.min(6, Number(msg.maxPlayers) || 4));
        const newRoom = {
          id,
          name: sanitize(msg.name, 24) || ((solo ? 'Solo de ' : 'Partie de ') + client.name),
          hostId: client.id,
          maxPlayers,
          solo,
          password: sanitize(msg.password, 16) || null,
          settings: defaultSettings(msg),
          members: [{ id: client.id, name: client.name, color: COLORS[0].id, ready: true }],
          spectators: [],
          game: null,
          chat: [{ system: true, text: 'Salon cree. Code : ' + id }],
          emptySince: null,
          createdAt: Date.now()
        };
        if (solo) {
          newRoom.chat = [{ system: true, text: 'Partie solo : ajoutez ou retirez des adversaires IA, choisissez la carte puis lancez.' }];
          const bots = Math.max(0, Math.min(maxPlayers - 1, Number(msg.bots) || 0));
          for (let i = 0; i < bots; i++) addBot(newRoom);
        }
        regenerateBoard(newRoom);
        rooms.set(id, newRoom);
        client.roomId = id;
        sendRoom(newRoom);
        break;
      }

      case 'joinRoom': {
        const target = rooms.get(sanitize(msg.roomId, 8).toUpperCase());
        if (!target) { fail('Salon introuvable.'); break; }
        if (target.members.some((m) => m.id === client.id)) {
          client.roomId = target.id;
          if (target.game) sendGame(target); else sendRoom(target);
          break;
        }
        if (target.game) { fail('La partie a deja commence.'); break; }
        if (target.members.length >= target.maxPlayers) { fail('Salon complet.'); break; }
        if (target.password && sanitize(msg.password, 16) !== target.password) { fail('Mot de passe incorrect.'); break; }
        if (room) leaveRoom(client, true);
        target.members.push({ id: client.id, name: client.name, color: freeColor(target), ready: false });
        target.chat.push({ system: true, text: client.name + ' rejoint le salon.' });
        if (target.resume) {
          const seat = target.resume.game.players.find((p) => p.id === client.id && !p.bot && !target.resume.seats[p.index]);
          if (seat) target.resume.seats[seat.index] = client.id;
        }
        client.roomId = target.id;
        sendRoom(target);
        break;
      }

      case 'leaveRoom':
        leaveRoom(client);
        conn.send({ type: 'left' });
        broadcastRooms();
        break;

      case 'setColor': {
        if (!room || room.game) break;
        const wanted = sanitize(msg.color, 10);
        if (!COLORS.some((c) => c.id === wanted)) break;
        if (room.members.some((m) => m.color === wanted && m.id !== client.id)) { fail('Couleur deja prise.'); break; }
        const m = room.members.find((m) => m.id === client.id);
        if (m) m.color = wanted;
        sendRoom(room);
        break;
      }

      case 'setReady': {
        if (!room || room.game) break;
        const m = room.members.find((m) => m.id === client.id);
        if (m) m.ready = !!msg.ready;
        sendRoom(room);
        break;
      }

      case 'updateSettings': {
        if (!room || room.game || room.hostId !== client.id) break;
        const boardChanged = applySettings(room.settings, msg);
        if (msg.maxPlayers !== undefined) {
          const n = Math.max(1, Math.min(6, Number(msg.maxPlayers) || 4));
          if (n >= room.members.length) room.maxPlayers = n;
        }
        if (boardChanged) regenerateBoard(room);
        sendRoom(room);
        break;
      }

      case 'reshuffleBoard': {
        if (!room || room.game || room.hostId !== client.id) break;
        regenerateBoard(room);
        sendRoom(room);
        break;
      }

      case 'addBot': {
        if (!room || room.game || room.hostId !== client.id) break;
        if (room.members.length >= room.maxPlayers) {
          if (room.maxPlayers >= 6) { fail('Salon complet (6 joueurs max).'); break; }
          room.maxPlayers++;
        }
        addBot(room);
        sendRoom(room);
        break;
      }

      case 'kick': {
        if (!room || room.game || room.hostId !== client.id) break;
        const targetId = sanitize(msg.playerId, 32);
        const victim = clients.get(targetId);
        room.members = room.members.filter((m) => m.id !== targetId);
        if (victim) { victim.roomId = null; if (victim.conn) victim.conn.send({ type: 'left', reason: 'Exclu du salon.' }); }
        sendRoom(room);
        break;
      }

      case 'listSaves':
        conn.send({ type: 'saves', saves: listSaves() });
        break;

      case 'saveGame': {
        if (!room || !room.game) { fail('Aucune partie a sauvegarder.'); break; }
        if (room.game.phase === 'ended') { fail('La partie est terminee.'); break; }
        const saved = writeSave(room, 'manual');
        if (!saved) { fail('La sauvegarde a echoue.'); break; }
        writeSave(room, 'auto');
        room.chat.push({ system: true, text: client.name + ' a sauvegarde la partie.' });
        conn.send({ type: 'saved', id: saved.id, savedAt: saved.savedAt });
        sendGame(room);
        break;
      }

      case 'deleteSave': {
        const id = sanitize(msg.id, 64);
        if (!savePath(id)) break;
        deleteSaveFile(id);
        conn.send({ type: 'saves', saves: listSaves() });
        break;
      }

      case 'loadSave': {
        const file = savePath(sanitize(msg.id, 64));
        let data = null;
        try { data = file && JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { data = null; }
        if (!data || !data.game) { fail('Sauvegarde introuvable ou illisible.'); break; }
        // une partie deja reprise dans un salon ouvert : on le rejoint
        const open = Array.from(rooms.values()).find((r) => (r.resume && r.resume.gameId === data.gameId) ||
          (r.game && r.saveId === data.gameId));
        if (open) {
          if (open.members.some((m) => m.id === client.id)) { client.roomId = open.id; if (open.game) sendGame(open); else sendRoom(open); break; }
          const someoneThere = humans(open).some((m) => { const c = clients.get(m.id); return c && c.conn && c.roomId === open.id; });
          if (someoneThere) { fail('Cette partie est en cours dans le salon ' + open.id + ' : rejoignez-le.'); break; }
          // plus personne dans l ancien salon : on le ferme (avec une derniere sauvegarde) et on reprend
          deleteRoom(open);
          for (const m of humans(open)) { const c = clients.get(m.id); if (c && c.roomId === open.id) c.roomId = null; }
        }
        if (room) leaveRoom(client, true);
        const game = Game.fromSave(data.game);
        game.players.forEach((p) => { if (!p.bot) p.connected = false; });
        const id = roomCode();
        const restored = {
          id,
          name: sanitize((data.room && data.room.name) || 'Partie reprise', 24),
          hostId: client.id,
          maxPlayers: Math.max(1, game.players.filter((p) => !p.bot).length),
          solo: !!(data.room && data.room.solo),
          password: null,
          settings: Object.assign(defaultSettings({}), (data.room && data.room.settings) || {}),
          members: [{ id: client.id, name: client.name, color: COLORS[0].id, ready: true }],
          spectators: [],
          game: null,
          board: game.board,
          resume: { game, gameId: data.gameId, savedAt: data.savedAt, kind: data.kind, seats: {} },
          chat: [{ system: true, text: 'Reprise de la partie (tour ' + game.turnCount + '). Chaque joueur prend sa place, puis l hote relance.' }],
          emptySince: null,
          createdAt: Date.now()
        };
        // l hote retrouve sa place, ou la seule place humaine d une partie solo
        const humanSeats = game.players.filter((p) => !p.bot && !p.left);
        const own = humanSeats.find((p) => p.id === client.id) || (humanSeats.length === 1 ? humanSeats[0] : null);
        if (own) restored.resume.seats[own.index] = client.id;
        rooms.set(id, restored);
        client.roomId = id;
        sendRoom(restored);
        break;
      }

      case 'claimSeat': {
        if (!room || !room.resume || room.game) break;
        const idx = Number(msg.index);
        const seat = room.resume.game.players[idx];
        if (!seat || seat.bot || seat.left) { fail('Place indisponible.'); break; }
        const taken = room.resume.seats[idx];
        if (taken && taken !== client.id) { fail('Cette place est deja prise.'); break; }
        for (const k of Object.keys(room.resume.seats)) if (room.resume.seats[k] === client.id) delete room.resume.seats[k];
        if (!msg.release) room.resume.seats[idx] = client.id;
        sendRoom(room);
        break;
      }

      case 'startGame': {
        if (!room) break;
        if (room.hostId !== client.id) { fail('Seul l hote peut lancer la partie.'); break; }
        if (room.game) { fail('Partie deja lancee.'); break; }
        if (room.resume) {
          const r = room.resume;
          const game = r.game;
          const botMembers = [];
          for (const p of game.players) {
            const memberId = r.seats[p.index];
            const member = memberId ? room.members.find((m) => m.id === memberId) : null;
            if (member) {
              p.id = member.id;
              p.name = member.name;
              p.bot = false;
              p.connected = true;
            } else if (!p.left) {
              // place libre : jouee par l ordinateur
              if (!p.bot) {
                p.bot = true;
                p.id = 'bot-' + uid(4);
                if (!/\(IA\)$/.test(p.name)) p.name += ' (IA)';
              }
              botMembers.push({ id: p.id, name: p.name, color: COLORS[0].id, ready: true, bot: true });
            }
          }
          room.members = room.members.concat(botMembers);
          room.maxPlayers = Math.max(room.maxPlayers, room.members.length);
          room.game = game;
          room.saveId = r.gameId;
          room.resume = null;
          room.board = null;
          game.addLog('Partie reprise.', 'turn');
          room.chat.push({ system: true, text: 'La partie reprend !' });
          sendGame(room);
          broadcastRooms();
          break;
        }
        if (!room.members.every((m) => m.ready || m.bot || m.id === room.hostId)) { fail('Tous les joueurs doivent etre prets.'); break; }
        const order = room.members.slice();
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = order[i]; order[i] = order[j]; order[j] = t;
        }
        room.members = order;
        // couleurs attribuees automatiquement dans l ordre de jeu
        order.forEach((m, i) => { m.color = COLORS[i % COLORS.length].id; });
        if (!room.board) regenerateBoard(room);
        room.game = new Game(
          order.map((m) => ({ id: m.id, name: m.name, color: colorHex(m.color), bot: !!m.bot })),
          Object.assign({}, room.settings, { board: room.board })
        );
        room.board = null;
        room.chat.push({ system: true, text: 'La partie commence !' });
        sendGame(room);
        broadcastRooms();
        break;
      }

      case 'action': {
        if (!room || !room.game) { fail('Aucune partie en cours.'); break; }
        const result = room.game.act(client.id, sanitize(msg.action, 24), msg.payload || {});
        if (result.error) { fail(result.error); break; }
        sendGame(room);
        break;
      }

      case 'forceEndTurn': {
        // L hote peut passer le tour d un joueur deconnecte
        if (!room || !room.game || room.hostId !== client.id) break;
        const g = room.game;
        const cur = g.current();
        const c = clients.get(cur.id);
        if (c && c.conn) { fail('Ce joueur est toujours connecte.'); break; }
        if (g.phase === 'roll') g.act(cur.id, 'roll', {});
        if (g.phase === 'robber') {
          g.act(cur.id, 'moveRobber', { hex: g.validRobberHexes()[0] });
        }
        if (g.phase === 'steal' && g.stealTargets.length) g.act(cur.id, 'steal', { target: g.stealTargets[0] });
        if (g.phase === 'main') g.act(cur.id, 'endTurn', {});
        g.addLog('Tour passe automatiquement (joueur deconnecte).', 'warn');
        sendGame(room);
        break;
      }

      case 'leaveGame': {
        if (!room || !room.game) { fail('Aucune partie en cours.'); break; }
        const gp = room.game.playerById(client.id);
        if (!gp) break;
        room.game.act(client.id, 'leaveGame', {});
        room.members = room.members.filter((m) => m.id !== client.id);
        client.roomId = null;
        room.chat.push({ system: true, text: gp.name + ' a quitte la partie.' });
        if (!humans(room).length) {
          deleteRoom(room);
        } else {
          if (room.hostId === client.id) room.hostId = humans(room)[0].id;
          sendGame(room);
        }
        conn.send({ type: 'left', reason: 'Vous avez quitte la partie.' });
        broadcastRooms();
        break;
      }

      case 'restart': {
        if (!room || room.hostId !== client.id || !room.game) break;
        if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
        room.game = null;
        room.saveId = null;
        room.members.forEach((m) => { m.ready = m.bot || m.id === room.hostId; });
        regenerateBoard(room);
        room.chat.push({ system: true, text: 'Retour au salon : nouvelle partie possible.' });
        sendRoom(room);
        break;
      }

      case 'chat': {
        if (!room) break;
        const text = sanitize(msg.text, 200);
        if (!text) break;
        room.chat.push({ from: client.name, color: colorHex((room.members.find((m) => m.id === client.id) || {}).color), text, t: Date.now() });
        if (room.chat.length > 200) room.chat.shift();
        if (room.game) sendGame(room); else sendRoom(room);
        break;
      }

      case 'ping':
        conn.send({ type: 'pong' });
        break;
    }
  });

  conn.on('close', () => {
    if (!client) return;
    if (client.conn === conn) client.conn = null;
    const room = client.roomId ? rooms.get(client.roomId) : null;
    if (!room) return;
    if (room.game) {
      const gp = room.game.playerById(client.id);
      if (gp) gp.connected = false;
      sendGame(room);
    } else {
      // en salon : retrait apres un court delai (tolerance au rechargement)
      setTimeout(() => {
        const c = clients.get(client.id);
        if (c && !c.conn) leaveRoom(c);
      }, 8000);
    }
    broadcastRooms();
  });
});

/* Nettoyage des salons reellement abandonnes.
   On ne supprime qu apres 5 minutes sans aucun joueur connecte, pour ne pas
   detruire une partie pendant un rechargement de page. */
const ABANDON_DELAY = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const room of Array.from(rooms.values())) {
    const anyone = room.members.some((m) => {
      const c = clients.get(m.id);
      return c && c.conn;
    });
    if (anyone) { room.emptySince = null; continue; }
    if (!room.emptySince) { room.emptySince = now; continue; }
    if (now - room.emptySince > ABANDON_DELAY) deleteRoom(room);
  }
}, 30000);

/* ---------------------------------------------------------------- */

function localAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push({ name, address: net.address });
    }
  }
  return out;
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error('  Le port ' + PORT + ' est deja utilise.');
    console.error('  Un serveur Catan tourne peut-etre deja : ouvrez http://localhost:' + PORT);
    console.error('  Sinon, lancez-le sur un autre port :  node server.js 3001');
    console.error('');
  } else if (err.code === 'EACCES') {
    console.error('');
    console.error('  Acces refuse sur le port ' + PORT + ' : choisissez un port au-dessus de 1024.');
    console.error('');
  } else {
    console.error('Erreur du serveur :', err.message);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const addrs = localAddresses();
  console.log('');
  console.log('  =====================================================');
  console.log('    CATAN  -  serveur de jeu en reseau local');
  console.log('  =====================================================');
  console.log('');
  console.log('    Sur cet ordinateur :   http://localhost:' + PORT);
  if (addrs.length) {
    console.log('');
    console.log('    Pour les autres joueurs du reseau local :');
    for (const a of addrs) console.log('      http://' + a.address + ':' + PORT + '   (' + a.name + ')');
  } else {
    console.log('    (aucune interface reseau detectee)');
  }
  console.log('');
  console.log('    Ctrl+C pour arreter le serveur.');
  console.log('');
});

/* Arret du serveur (Ctrl+C) : on sauvegarde les parties en cours avant de quitter. */
function saveAllAndExit() {
  for (const room of rooms.values()) {
    if (room.game && room.game.phase !== 'ended') writeSave(room, 'auto');
  }
  process.exit(0);
}
process.on('SIGINT', saveAllAndExit);
process.on('SIGTERM', saveAllAndExit);
