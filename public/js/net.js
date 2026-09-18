/* ==========================================================================
   Connexion au serveur (WebSocket) + reconnexion automatique
   ========================================================================== */
(function () {
  'use strict';

  const listeners = {};
  let socket = null;
  let retry = 0;
  let queue = [];

  const Net = {
    connected: false,

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
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(proto + '//' + location.host);

      socket.onopen = function () {
        Net.connected = true;
        retry = 0;
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
        Net.emit('status', false);
        retry++;
        setTimeout(Net.connect, Math.min(500 * retry, 4000));
      };

      socket.onerror = function () { try { socket.close(); } catch (e) {} };
    }
  };

  window.Net = Net;
})();
