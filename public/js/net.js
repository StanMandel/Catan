/* ==========================================================================
   Connexion au serveur (WebSocket) + reconnexion automatique
   ========================================================================== */
(function () {
  'use strict';

  const listeners = {};
  let socket = null;
  let retry = 0;
  let queue = [];

  /* Adresse du serveur de jeu.
     Priorite : ?server=... (essai ponctuel) > config.js > meme origine.
     Voir public/js/config.js. */
  function serverUrl() {
    let raw = '';
    try { raw = new URLSearchParams(location.search).get('server') || ''; } catch (e) {}
    if (!raw) raw = ((window.CATAN_CONFIG || {}).server || '');
    raw = String(raw).trim();

    const pageSecure = location.protocol === 'https:';
    if (!raw) return (pageSecure ? 'wss://' : 'ws://') + location.host;

    let u = raw;
    if (u.indexOf('://') === -1) u = (pageSecure ? 'wss://' : 'ws://') + u;
    else if (u.slice(0, 7).toLowerCase() === 'http://') u = 'ws://' + u.slice(7);
    else if (u.slice(0, 8).toLowerCase() === 'https://') u = 'wss://' + u.slice(8);
    while (u.endsWith('/')) u = u.slice(0, -1);

    // une page en HTTPS ne peut pas ouvrir une WebSocket en clair : le
    // navigateur bloquerait la connexion pour contenu mixte
    if (pageSecure && u.slice(0, 5).toLowerCase() === 'ws://') {
      u = 'wss://' + u.slice(5);
      console.warn('Serveur force en wss:// : une page HTTPS ne peut pas ouvrir une WebSocket non chiffree.');
    }
    return u;
  }

  const Net = {
    connected: false,
    retries: 0,      // tentatives echouees d affilee : l interface s en sert pour
                     // expliquer l attente quand l hebergeur sort de veille

    on(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },

    emit(type, data) {
      (listeners[type] || []).forEach((fn) => fn(data));
    },

    send(obj) {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
      else queue.push(obj);
    },

    action(action, payload) {
      Net.send({ type: 'action', action, payload: payload || {} });
    },

    connect() {
      socket = new WebSocket(serverUrl());

      socket.onopen = function () {
        Net.connected = true;
        retry = 0;
        Net.retries = 0;
        Net.emit('status', true);
        Net.send({
          type: 'hello',
          playerId: localStorage.getItem('catan.playerId') || '',
          name: localStorage.getItem('catan.name') || ''
        });
        const q = queue; queue = [];
        q.forEach((m) => Net.send(m));
      };

      socket.onmessage = function (ev) {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.type === 'welcome' && msg.playerId) {
          localStorage.setItem('catan.playerId', msg.playerId);
          localStorage.setItem('catan.name', msg.name);
        }
        Net.emit(msg.type, msg);
        Net.emit('*', msg);
      };

      socket.onclose = function () {
        Net.connected = false;
        retry++;
        Net.retries = retry;
        Net.emit('status', false);
        setTimeout(Net.connect, Math.min(500 * retry, 4000));
      };

      socket.onerror = function () { try { socket.close(); } catch (e) {} };
    }
  };

  Net.serverUrl = serverUrl;
  window.Net = Net;
})();
