/* ==========================================================================
   Interface : accueil, salon, partie
   ========================================================================== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];
  const RES_FR = { lumber: 'Bois', brick: 'Argile', wool: 'Laine', grain: 'Blé', ore: 'Minerai' };
  const RES_BG = {
    lumber: ['#4c8b3f', '#26551f'],
    brick: ['#d08a4a', '#9a5324'],
    wool: ['#a9d97a', '#6fa348'],
    grain: ['#f0d167', '#c39c31'],
    ore: ['#b6c0c6', '#79858d']
  };
  const DEV_INFO = {
    knight: { icon: '⚔️', img: 'img/dev/knight.png', name: 'Chevalier', desc: 'Déplacez le voleur et volez une carte.' },
    roadBuilding: { icon: '🛤️', img: 'img/dev/roadBuilding.png', name: 'Construction de routes', desc: '2 routes gratuites.' },
    yearOfPlenty: { icon: '🎁', img: 'img/dev/yearOfPlenty.png', name: 'Invention', desc: '2 ressources au choix.' },
    monopoly: { icon: '💰', img: 'img/dev/monopoly.png', name: 'Monopole', desc: 'Toutes les cartes d une ressource.' },
    victoryPoint: { icon: '🏆', img: 'img/dev/victoryPoint.png', name: 'Point de victoire', desc: '+1 point (secret).' }
  };

  const S = {
    me: null,
    name: '',
    room: null,
    state: null,
    mode: null,
    modalKind: null,
    lastDice: null,
    tab: 'log'
  };

  /* ------------------------------------------------------------------ */
  /* utilitaires                                                        */
  /* ------------------------------------------------------------------ */

  function showScreen(name) {
    ['home', 'lobby', 'game'].forEach((s) => $('screen-' + s).classList.toggle('active', s === name));
    $('btn-players').classList.toggle('hidden', name !== 'game');
    $('btn-save').classList.toggle('hidden', name !== 'game');
    $('btn-quit').classList.toggle('hidden', name !== 'game');
  }

  function toast(text, isError) {
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' err' : '');
    t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function openModal(kind, title, contentHTML, actions, onMount) {
    S.modalKind = kind;
    $('modal-box').classList.remove('modal-wide');
    $('modal-title').textContent = title;
    $('modal-content').innerHTML = contentHTML;
    const bar = $('modal-actions');
    bar.innerHTML = '';
    (actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.className = a.cls || 'ghost';
      b.textContent = a.label;
      b.disabled = !!a.disabled;
      b.onclick = a.onClick;
      if (a.id) b.id = a.id;
      bar.appendChild(b);
    });
    $('modal-root').classList.remove('hidden');
    if (onMount) onMount();
  }

  function closeModal() {
    S.modalKind = null;
    $('modal-box').classList.remove('modal-wide');
    $('modal-root').classList.add('hidden');
    $('modal-content').innerHTML = '';
  }

  function resSwatch(r) {
    return '<span class="res-swatch" style="background:' + RES_BG[r][0] + '"></span>';
  }

  function resChip(r, n) {
    return '<span class="res-chip">' + resSwatch(r) + (n !== undefined ? n + ' ' : '') + RES_FR[r] + '</span>';
  }

  function offerText(obj) {
    const parts = RES.filter((r) => obj[r] > 0).map((r) => obj[r] + ' ' + RES_FR[r]);
    return parts.length ? parts.join(', ') : 'rien';
  }

  function canAfford(cost) {
    const you = S.state && S.state.you;
    if (!you) return false;
    return RES.every((r) => !cost[r] || you.resources[r] >= cost[r]);
  }

  const COSTS = {
    road: { brick: 1, lumber: 1 },
    settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
    city: { grain: 2, ore: 3 },
    dev: { wool: 1, grain: 1, ore: 1 }
  };

  /* ------------------------------------------------------------------ */
  /* ACCUEIL                                                            */
  /* ------------------------------------------------------------------ */

  const VP_MIN = 8, VP_MAX = 20;

  function paceLabel(v) {
    if (v <= 9) return 'partie rapide';
    if (v <= 12) return 'partie standard';
    if (v <= 16) return 'partie longue';
    return 'très longue';
  }

  /** Curseur des points : remplissage, graduations cliquables, valeur et rythme de partie. */
  function bindVPSlider(input, onCommit) {
    const box = input.closest('.vp-slider');
    const out = box.querySelector('.vp-out');
    const pace = box.querySelector('.vp-pace');
    const ticks = box.querySelector('.vp-ticks');
    const min = Number(input.min), max = Number(input.max);
    for (let v = min; v <= max; v++) {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'vp-tick' + ((v - min) % 2 ? ' minor' : '');
      t.style.left = ((v - min) / (max - min)) * 100 + '%';
      t.textContent = v;
      t.dataset.v = v;
      t.tabIndex = -1;
      t.onclick = () => {
        if (input.disabled) return;
        input.value = v;
        show();
        if (onCommit) onCommit(v);
      };
      ticks.appendChild(t);
    }
    const show = () => {
      const v = Number(input.value);
      out.textContent = v;
      pace.textContent = paceLabel(v);
      input.style.setProperty('--pct', ((v - min) / (max - min)) * 100 + '%');
      ticks.querySelectorAll('.vp-tick').forEach((t) => {
        t.classList.toggle('on', Number(t.dataset.v) <= v);
        t.disabled = input.disabled;
      });
    };
    input.addEventListener('input', show);
    if (onCommit) input.addEventListener('change', () => onCommit(Number(input.value)));
    show();
    return show;
  }

  const ARROW_UP = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 8 L6 3.5 L10 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ARROW_DOWN = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4 L6 8.5 L10 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /**
   * Remplace les fleches natives d un champ numerique par deux boutons.
   * Maintenir un bouton enfonce fait defiler la valeur ; `commit` est appele
   * une fois la saisie terminee.
   */
  function makeSpinner(input, commit) {
    const wrap = document.createElement('span');
    wrap.className = 'spin';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const arrows = document.createElement('span');
    arrows.className = 'spin-arrows';
    const up = document.createElement('button');
    const down = document.createElement('button');
    up.type = down.type = 'button';
    up.className = down.className = 'spin-btn';
    up.innerHTML = ARROW_UP;
    down.innerHTML = ARROW_DOWN;
    up.setAttribute('aria-label', 'Augmenter');
    down.setAttribute('aria-label', 'Diminuer');
    arrows.appendChild(up);
    arrows.appendChild(down);
    wrap.appendChild(arrows);

    const clamp = (v) => Math.max(Number(input.min), Math.min(Number(input.max), Math.round(Number(v) || 0)));
    let timer = null, repeat = null, sendTimer = null;
    const schedule = () => {
      clearTimeout(sendTimer);
      sendTimer = setTimeout(() => commit(clamp(input.value)), 350);
    };
    const step = (d) => {
      const v = clamp(Number(input.value) + d);
      if (v === Number(input.value)) return;
      input.value = v;
      input.dataset.dirty = '1';
      refresh();
      schedule();
    };
    const stop = () => { clearTimeout(timer); clearInterval(repeat); };
    [[up, 1], [down, -1]].forEach(([btn, d]) => {
      btn.addEventListener('pointerdown', (e) => {
        if (btn.disabled) return;
        e.preventDefault();
        step(d);
        timer = setTimeout(() => { repeat = setInterval(() => step(d), 90); }, 380);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
      btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(d); } });
    });
    input.addEventListener('change', () => { input.value = clamp(input.value); refresh(); clearTimeout(sendTimer); commit(clamp(input.value)); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
    });
    const refresh = () => {
      const v = Number(input.value);
      up.disabled = input.disabled || v >= Number(input.max);
      down.disabled = input.disabled || v <= Number(input.min);
    };
    input.refreshSpinner = refresh;
    refresh();
  }

  /** Étapes de l accueil : pseudo → choix → créer / rejoindre. */
  function showHomeStep(step) {
    S.homeStep = step;
    ['name', 'choice', 'create', 'join'].forEach((k) => $('home-' + k).classList.toggle('hidden', k !== step));
    if (step === 'name') setTimeout(() => $('input-name').focus(), 0);
    if (step === 'choice') $('hello-name').textContent = S.name || '';
    if (step === 'join') Net.send({ type: 'listRooms' });
    if (step === 'create') Net.send({ type: 'listSaves' });
  }

  function initHome() {
    bindVPSlider($('create-vp'));
    bindVPSlider($('solo-vp'));

    $('input-name').value = localStorage.getItem('catan.name') || '';
    $('name-form').onsubmit = (e) => {
      e.preventDefault();
      const n = $('input-name').value.trim();
      if (!n) { toast('Entrez un pseudo pour continuer.', true); $('input-name').focus(); return; }
      S.name = n;
      Net.send({ type: 'setName', name: n });
      showHomeStep('choice');
    };
    $('btn-change-name').onclick = () => showHomeStep('name');
    $('btn-go-create').onclick = () => showHomeStep('create');
    $('btn-go-join').onclick = () => showHomeStep('join');
    document.querySelectorAll('#screen-home .btn-back').forEach((b) => { b.onclick = () => showHomeStep('choice'); });
    showHomeStep('name');

    $('btn-create').onclick = () => {
      Net.send({
        type: 'createRoom',
        name: $('create-name').value.trim(),
        maxPlayers: Number($('create-max').value),
        targetVP: Number($('create-vp').value),
        password: $('create-pass').value.trim(),
        randomBoard: $('create-random').checked,
        fairBoard: $('create-fair').checked
      });
    };

    $('btn-solo').onclick = () => {
      const bots = Number($('solo-bots').value);
      Net.send({
        type: 'createRoom',
        solo: true,
        bots,
        maxPlayers: Math.max(1, bots + 1),
        targetVP: Number($('solo-vp').value),
        randomBoard: true,
        fairBoard: true
      });
    };

    const joinByCode = (password) => {
      const code = $('join-code').value.trim().toUpperCase();
      if (code.length < 3) { toast('Entrez le code du salon.', true); return; }
      S.lastJoinCode = code;
      Net.send({ type: 'joinRoom', roomId: code, password: password || '' });
    };
    S.retryJoinWithPassword = () => {
      if (!S.lastJoinCode) return false;
      const pass = prompt('Ce salon est protege. Mot de passe :');
      if (pass === null) return true;
      Net.send({ type: 'joinRoom', roomId: S.lastJoinCode, password: pass });
      return true;
    };
    $('btn-refresh-saves').onclick = () => Net.send({ type: 'listSaves' });
    $('btn-join-code').onclick = () => joinByCode();
    $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinByCode(); });
  }

  function timeAgo(t) {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'à l’instant';
    const m = Math.round(s / 60);
    if (m < 60) return 'il y a ' + m + ' min';
    const h = Math.round(m / 60);
    if (h < 24) return 'il y a ' + h + ' h';
    return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' +
      new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function renderSaves(saves) {
    const box = $('save-list');
    if (!saves.length) { box.innerHTML = '<p class="empty">Aucune partie sauvegardée.</p>'; return; }
    box.innerHTML = '';
    saves.forEach((sv) => {
      const sm = sv.summary || {};
      const row = document.createElement('div');
      row.className = 'save-row';
      const mine = (sm.players || []).some((p) => p.id === S.me);
      row.innerHTML =
        '<div><div class="save-title">' + esc(sm.name || 'Partie') +
        '<span class="save-kind ' + (sv.kind === 'manual' ? 'manual">💾 manuelle' : 'auto">⟳ automatique') + '</span>' +
        (mine ? '<span class="tag host">vous y jouiez</span>' : '') + '</div>' +
        '<div class="save-meta">' + esc(sm.map || '') + ' · tour ' + (sm.turn || 0) + ' · objectif ' + (sm.targetVP || 10) +
        ' PV · ' + timeAgo(sv.savedAt) + '</div>' +
        '<div class="save-players">' + (sm.players || []).map((p) =>
          '<span class="save-player"><i style="background:' + p.color + '"></i>' + esc(p.name) + ' <b>' + p.vp + '</b></span>').join('') +
        '</div></div>';
      const actions = document.createElement('div');
      actions.className = 'save-actions';
      actions.appendChild(btn('Reprendre', 'primary small', () => Net.send({ type: 'loadSave', id: sv.id })));
      actions.appendChild(btn('🗑', 'ghost small', () => {
        if (confirm('Supprimer cette sauvegarde ?')) Net.send({ type: 'deleteSave', id: sv.id });
      }, false, 'Supprimer'));
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  function renderRooms(rooms) {
    const box = $('room-list');
    if (!rooms.length) { box.innerHTML = '<p class="empty">Aucune partie pour le moment.</p>'; return; }
    box.innerHTML = '';
    rooms.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'room-row';
      row.innerHTML =
        '<div><div class="name">' + esc(r.name) + ' <span class="code-badge">' + r.id + '</span></div>' +
        '<div class="meta">Hôte : ' + esc(r.host) + ' · ' + r.players + '/' + r.maxPlayers + ' joueurs · ' +
        r.targetVP + ' PV · ' + esc(r.map || 'Classique') + (r.locked ? ' · 🔒' : '') + (r.started ? ' · en cours' : '') + '</div></div>';
      const btn = document.createElement('button');
      btn.className = 'primary small';
      btn.textContent = r.started ? 'En cours' : 'Rejoindre';
      btn.disabled = r.started || r.players >= r.maxPlayers;
      btn.onclick = () => {
        const password = r.locked ? prompt('Mot de passe du salon :') || '' : '';
        Net.send({ type: 'joinRoom', roomId: r.id, password });
      };
      row.appendChild(btn);
      box.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------ */
  /* SALON                                                              */
  /* ------------------------------------------------------------------ */

  function initLobby() {
    $('btn-leave').onclick = () => Net.send({ type: 'leaveRoom' });
    $('btn-ready').onclick = () => {
      const me = S.room.members.find((m) => m.id === S.me);
      Net.send({ type: 'setReady', ready: !(me && me.ready) });
    };
    $('btn-start').onclick = () => Net.send({ type: 'startGame' });
    $('lobby-chat-form').onsubmit = (e) => {
      e.preventDefault();
      const v = $('lobby-chat-input').value.trim();
      if (v) Net.send({ type: 'chat', text: v });
      $('lobby-chat-input').value = '';
    };
    S.showLobbyVP = bindVPSlider($('set-vp'), (v) => Net.send({ type: 'updateSettings', targetVP: v }));
    $('set-friendly').onchange = () => Net.send({ type: 'updateSettings', friendlyRobber: $('set-friendly').checked });
    document.querySelectorAll('#game-settings input[type=number]').forEach((input) => {
      makeSpinner(input, (v) => {
        delete input.dataset.dirty;
        if (input.dataset.limit) Net.send({ type: 'updateSettings', limits: { [input.dataset.limit]: v } });
        else Net.send({ type: 'updateSettings', [input.dataset.setting]: v });
      });
    });
    let showBalance = false;
    try { showBalance = localStorage.getItem('catan.showBalance') === '1'; } catch (e) { /* stockage indisponible */ }
    S.showBalance = showBalance;
    $('btn-balance').onclick = () => {
      S.showBalance = !S.showBalance;
      try { localStorage.setItem('catan.showBalance', S.showBalance ? '1' : '0'); } catch (e) { /* ignore */ }
      renderBalance(S.room && S.room.preview && S.room.preview.balance);
    };
    $('btn-mods').onclick = showMods;
    const stepMap = (dir) => {
      const room = S.room;
      if (!room || room.hostId !== S.me || !(room.maps || []).length) return;
      const i = room.maps.findIndex((m) => m.id === room.settings.map);
      const next = room.maps[(i + dir + room.maps.length) % room.maps.length];
      Net.send({ type: 'updateSettings', map: next.id });
    };
    $('map-prev').onclick = () => stepMap(-1);
    $('map-next').onclick = () => stepMap(1);
    $('set-random').onchange = () => Net.send({ type: 'updateSettings', randomBoard: $('set-random').checked });
    $('set-fair').onchange = () => Net.send({ type: 'updateSettings', fairBoard: $('set-fair').checked });
    $('btn-reshuffle').onclick = () => Net.send({ type: 'reshuffleBoard' });
    $('btn-add-bot').onclick = () => Net.send({ type: 'addBot' });
    BoardPreview.init($('map-preview'));
  }

  function renderMapCard(room) {
    const isHost = room.hostId === S.me;
    const maps = room.maps || [];
    const index = maps.findIndex((m) => m.id === room.settings.map);
    const info = maps[index] || { name: 'Classique', desc: '' };
    $('map-name').textContent = info.name + (maps.length ? ' (' + (index + 1) + '/' + maps.length + ')' : '');
    $('map-meta').textContent = [
      info.players, info.tiles ? info.tiles + ' tuiles' : '', info.ports ? info.ports + ' ports' : '',
      room.settings.targetVP + ' PV',
      room.settings.randomBoard ? 'disposition aléatoire' : 'disposition fixe'
    ].filter(Boolean).join(' · ');
    $('map-desc').textContent = info.desc || '';
    $('btn-reshuffle').classList.toggle('hidden', !isHost || !room.settings.randomBoard);
    $('map-prev').classList.toggle('locked', !isHost);
    $('map-next').classList.toggle('locked', !isHost);

    $('set-random').checked = !!room.settings.randomBoard;
    $('set-fair').checked = !!room.settings.fairBoard;

    if (room.preview) BoardPreview.preview(room.preview);
    renderBalance(room.preview && room.preview.balance);
  }

  function renderBalance(b) {
    $('btn-balance').classList.toggle('hidden', !b);
    $('btn-balance').textContent = S.showBalance ? '📊 Masquer l\'indice d\'équilibrage' : '📊 Afficher l\'indice d\'équilibrage';
    $('balance').classList.toggle('hidden', !b || !S.showBalance);
    if (!b) return;
    const grade = (v) => (v >= 70 ? 'good' : v >= 55 ? 'mid' : 'bad');
    $('balance-score').textContent = b.score;
    $('balance-label').textContent = b.label;
    $('balance-label').className = 'tag ' + grade(b.score);
    [['bal-res', b.resources], ['bal-num', b.numbers], ['bal-port', b.ports]].forEach(([id, v]) => {
      $(id).style.width = v + '%';
      $(id).className = grade(v);
      $(id + '-v').textContent = v;
    });
    $('balance-details').innerHTML = (b.details || []).map((d) => '<li>' + esc(d) + '</li>').join('');
  }

  /** Remplit les reglages sans ecraser un champ en cours d edition. */
  function renderSettings(room) {
    const st = room.settings;
    const isHost = room.hostId === S.me;
    // ne pas ecraser un champ en cours d edition ou une valeur pas encore envoyee
    const setVal = (el, v) => { if (document.activeElement !== el && !el.dataset.dirty) el.value = v; };
    setVal($('set-vp'), st.targetVP);
    if (S.showLobbyVP) S.showLobbyVP();
    setVal($('set-start-settlements'), st.startSettlements);
    setVal($('set-start-roads'), st.startRoads);
    setVal($('set-threshold'), st.robberThreshold);
    setVal($('set-limit-road'), st.limits.road);
    setVal($('set-limit-settlement'), st.limits.settlement);
    setVal($('set-limit-city'), st.limits.city);
    $('set-start-settlements').max = Math.min(5, st.limits.settlement);
    $('set-start-roads').max = Math.min(10, st.limits.road);
    $('set-friendly').checked = !!st.friendlyRobber;
    $('game-settings').querySelectorAll('input').forEach((el) => { el.disabled = !isHost; });
    // voleur amical : le seuil ne sert plus
    $('set-threshold').disabled = !isHost || !!st.friendlyRobber;
    $('row-threshold').classList.toggle('off', !!st.friendlyRobber);
    $('threshold-hint').textContent = st.friendlyRobber
      ? 'Voleur amical : aucune carte n’est prise.'
      : 'Sur un 7, chaque main de plus de ' + st.robberThreshold + ' cartes en perd la moitié, puis le voleur vole une carte.';
    $('game-settings').querySelectorAll('input[type=number]').forEach((el) => { if (el.refreshSpinner) el.refreshSpinner(); });
    $('settings-note').classList.toggle('hidden', isHost);

    // points atteignables avec les pieces : villes x2 + colonies + route la plus longue + armee
    const reachable = st.limits.city * 2 + st.limits.settlement + 4;
    $('vp-warn').classList.toggle('hidden', st.targetVP <= reachable);
    $('vp-warn').textContent = 'Objectif difficile : avec ' + st.limits.settlement + ' colonies et ' + st.limits.city +
      ' villes, les constructions et les bonus ne rapportent que ' + reachable + ' points au maximum. Augmentez les pièces par joueur.';

    const active = (st.mods || []).length;
    $('mods-count').textContent = active ? '(' + active + ')' : '';
    renderActiveMods(room);
    if (S.modalKind === 'mods') showMods();
  }

  const MOD_CATEGORY_HINT = {
    'Événement': 'Se déclenchent au hasard à chaque lancer de dés, avec un grand message rouge chez tous les joueurs.'
  };

  function showMods() {
    const room = S.room;
    if (!room) return;
    const isHost = room.hostId === S.me;
    const mods = room.mods || [];
    const active = new Set(room.settings.mods || []);

    if (!mods.length) {
      openModal('mods', 'Mods', '<div class="mod-empty"><span class="big-ico">🧩</span>Aucun mod disponible pour le moment.</div>',
        [{ label: 'Fermer', cls: 'ghost', onClick: closeModal }]);
      return;
    }

    const groups = {};
    mods.forEach((m) => { (groups[m.category] = groups[m.category] || []).push(m); });

    const card = (m) => {
      const on = active.has(m.id);
      return '<div class="mod-card' + (on ? ' on' : '') + (isHost ? ' editable' : '') + '" data-mod="' + esc(m.id) + '"' +
        (isHost ? ' role="switch" tabindex="0" aria-checked="' + on + '"' : '') + '>' +
        '<div class="mod-icon">' + esc(m.icon) + '</div>' +
        '<div class="mod-body">' +
        '<div class="mod-top"><span class="mod-name">' + esc(m.name) + '</span>' +
        '<span class="mod-switch" aria-hidden="true"><i></i></span></div>' +
        '<div class="mod-chips">' +
        (m.effect ? '<span class="mod-chip">' + esc(m.effect) + '</span>' : '') +
        (m.chance ? '<span class="mod-chip chance">🎲 ' + esc(m.chance) + '</span>' : '') +
        '</div>' +
        '<p class="mod-desc">' + esc(m.desc) + '</p>' +
        '<div class="mod-state">' + (on ? '✓ Activé' : 'Désactivé') + '</div>' +
        '</div></div>';
    };

    const body =
      '<div class="mods-head">' +
      '<p class="hint">Contenu additionnel pour rendre la partie plus complexe ou mieux adaptée aux longues parties.</p>' +
      '<div class="mods-toolbar">' +
      '<span class="mods-counter"><b>' + active.size + '</b> / ' + mods.length + ' actif' + (active.size > 1 ? 's' : '') + '</span>' +
      (isHost
        ? '<button class="ghost small" data-mods-all="on">Tout activer</button>' +
          '<button class="ghost small" data-mods-all="off"' + (active.size ? '' : ' disabled') + '>Tout désactiver</button>'
        : '<span class="hint">Seul l\'hôte peut activer des mods.</span>') +
      '</div></div>' +
      Object.keys(groups).map((cat) =>
        '<section class="mod-group">' +
        '<h4>' + esc(cat) + 's</h4>' +
        (MOD_CATEGORY_HINT[cat] ? '<p class="hint">' + MOD_CATEGORY_HINT[cat] + '</p>' : '') +
        '<div class="mod-grid">' + groups[cat].map(card).join('') + '</div>' +
        '</section>').join('');

    openModal('mods', '🧩 Mods', body, [{ label: 'Fermer', cls: 'primary', onClick: closeModal }], () => {
      $('modal-box').classList.add('modal-wide');
      if (!isHost) return;
      const send = (ids) => {
        room.settings.mods = ids; // affichage immediat, confirme par le serveur
        Net.send({ type: 'updateSettings', mods: ids });
        showMods();
      };
      const toggle = (id) => {
        const ids = new Set(room.settings.mods || []);
        if (ids.has(id)) ids.delete(id); else ids.add(id);
        send(mods.map((m) => m.id).filter((x) => ids.has(x)));
      };
      $('modal-content').querySelectorAll('.mod-card').forEach((c) => {
        c.onclick = () => toggle(c.dataset.mod);
        c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(c.dataset.mod); } };
      });
      $('modal-content').querySelectorAll('[data-mods-all]').forEach((b) => {
        b.onclick = () => send(b.dataset.modsAll === 'on' ? mods.map((m) => m.id) : []);
      });
    });
  }

  /** Mods actifs affiches sous les reglages du salon. */
  function renderActiveMods(room) {
    const mods = room.mods || [];
    const active = mods.filter((m) => (room.settings.mods || []).includes(m.id));
    $('mods-active').innerHTML = active.length
      ? active.map((m) => '<span class="mod-pill" title="' + esc(m.desc) + '">' + esc(m.icon) + ' ' + esc(m.name) + '</span>').join('')
      : '<span class="hint">Aucun mod actif.</span>';
  }

  function renderLobby(room) {
    S.room = room;
    $('lobby-name').textContent = room.name;
    $('lobby-code').textContent = room.id;

    const list = $('lobby-players');
    list.innerHTML = '';
    room.members.forEach((m) => {
      const d = document.createElement('div');
      d.className = 'lobby-player';
      d.innerHTML =
        '<span style="flex:1">' + esc(m.name) + (m.id === S.me ? ' <em>(vous)</em>' : '') + '</span>' +
        (m.host ? '<span class="tag host">hôte</span>' : '') +
        (m.bot ? '<span class="tag bot">ordinateur</span>' : '') +
        (m.connected ? '' : '<span class="tag off">hors ligne</span>') +
        (m.bot ? '' : '<span class="tag ' + (m.ready ? 'ready' : 'wait') + '">' + (m.ready ? 'prêt' : 'en attente') + '</span>');
      if (room.hostId === S.me && m.id !== S.me) {
        const k = document.createElement('button');
        k.className = 'ghost small';
        k.textContent = m.bot ? 'Retirer' : 'Exclure';
        k.onclick = () => Net.send({ type: 'kick', playerId: m.id });
        d.appendChild(k);
      }
      list.appendChild(d);
    });

    const me = room.members.find((m) => m.id === S.me);
    const isHost = room.hostId === S.me;
    renderSettings(room);
    renderResume(room);
    $('btn-ready').textContent = me && me.ready ? 'Annuler « prêt »' : 'Je suis prêt';
    $('btn-start').classList.toggle('hidden', !isHost);
    const ready = room.members.every((m) => m.ready || m.bot || m.id === room.hostId);
    const alone = room.members.length === 1;
    $('btn-start').disabled = !ready;
    $('btn-start').textContent = !ready ? 'En attente des joueurs…' : alone ? 'Lancer en solo' : 'Lancer la partie';
    $('btn-ready').classList.toggle('hidden', isHost && room.members.every((m) => m.bot || m.id === room.hostId));
    $('btn-add-bot').classList.toggle('hidden', !isHost || room.members.length >= 6);
    if (room.resume) {
      $('game-settings').classList.add('hidden');
      $('btn-add-bot').classList.add('hidden');
      $('btn-ready').classList.add('hidden');
      $('btn-start').disabled = false;
      $('btn-start').textContent = 'Reprendre la partie';
    } else {
      $('game-settings').classList.remove('hidden');
    }
    renderMapCard(room);
    if (room.resume) {
      $('map-prev').classList.add('locked');
      $('map-next').classList.add('locked');
      $('btn-reshuffle').classList.add('hidden');
    }

    renderChat($('lobby-chat-log'), room.chat);
    showScreen('lobby');
  }

  function renderResume(room) {
    const r = room.resume;
    $('resume-panel').classList.toggle('hidden', !r);
    if (!r) return;
    $('resume-info').textContent = 'Tour ' + r.turn + ' · sauvegarde ' + (r.kind === 'manual' ? 'manuelle' : 'automatique') + ' ' + timeAgo(r.savedAt) + '.';
    const box = $('resume-seats');
    box.innerHTML = '';
    r.seats.forEach((seat) => {
      const row = document.createElement('div');
      row.className = 'resume-seat';
      row.innerHTML = '<span class="dot" style="background:' + seat.color + '"></span>' +
        '<span class="seat-name">' + esc(seat.name) + '</span><span class="seat-vp">' + seat.vp + ' PV</span>';
      const status = document.createElement('span');
      if (seat.left) status.innerHTML = '<span class="tag off">a quitté</span>';
      else if (seat.bot) status.innerHTML = '<span class="tag bot">ordinateur</span>';
      else if (seat.claimedBy === S.me) {
        status.innerHTML = '<span class="tag ready">vous</span> ';
        status.appendChild(btn('Libérer', 'ghost small', () => Net.send({ type: 'claimSeat', index: seat.index, release: true })));
      } else if (seat.claimedBy) status.innerHTML = '<span class="tag ready">' + esc(seat.claimedName) + '</span>';
      else {
        status.innerHTML = '<span class="tag wait">libre</span> ';
        status.appendChild(btn('Prendre cette place', 'primary small', () => Net.send({ type: 'claimSeat', index: seat.index })));
      }
      row.appendChild(status);
      box.appendChild(row);
    });
  }

  function renderChat(box, chat) {
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const keep = box.scrollTop;
    box.innerHTML = '';
    (chat || []).forEach((c) => {
      const d = document.createElement('div');
      if (c.system) { d.className = 'sys'; d.textContent = c.text; }
      else {
        d.className = 'msg';
        d.innerHTML = '<b style="color:' + (c.color || '#ffd489') + '">' + esc(c.from) + '</b> : ' + esc(c.text);
      }
      box.appendChild(d);
    });
    box.scrollTop = atBottom ? box.scrollHeight : keep;
  }

  /* ------------------------------------------------------------------ */
  /* PARTIE                                                             */
  /* ------------------------------------------------------------------ */

  function initGame() {
    Board.init($('board'), {
      onVertex(vid, kind) {
        const st = S.state;
        if (!st) return;
        if (st.phase === 'setup') Net.action('placeSettlement', { vertex: vid });
        else if (kind === 'city') Net.action('buildCity', { vertex: vid });
        else Net.action('buildSettlement', { vertex: vid });
        setMode(null);
      },
      onEdge(eid) {
        const st = S.state;
        if (!st) return;
        if (st.phase === 'setup') Net.action('placeRoad', { edge: eid });
        else Net.action('buildRoad', { edge: eid });
        if (!(S.state.freeRoads > 1)) setMode(null);
      },
      onHex(hid) {
        const st = S.state;
        if (st && st.phase === 'robber' && st.you && st.you.isMyTurn) Net.action('moveRobber', { hex: hid });
      },
      onPort(portId) {
        Net.action('buildBoat', { port: portId });
        setMode(null);
      }
    });

    $('btn-zoom-in').onclick = () => Board.zoom(0.85);
    $('btn-zoom-out').onclick = () => Board.zoom(1.18);
    $('btn-zoom-reset').onclick = () => Board.reset();

    document.querySelectorAll('.tab').forEach((t) => {
      t.onclick = () => {
        S.tab = t.dataset.tab;
        document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
        $('tab-log').classList.toggle('hidden', S.tab !== 'log');
        $('tab-chat').classList.toggle('hidden', S.tab !== 'chat');
      };
    });

    $('game-chat-form').onsubmit = (e) => {
      e.preventDefault();
      const v = $('game-chat-input').value.trim();
      if (v) Net.send({ type: 'chat', text: v });
      $('game-chat-input').value = '';
    };

    $('btn-rules').onclick = showRules;
    $('btn-players').onclick = showPlayers;
    $('btn-quit').onclick = confirmLeaveGame;
    $('btn-save').onclick = () => Net.send({ type: 'saveGame' });
  }

  function setMode(mode) {
    S.mode = S.mode === mode ? null : mode;
    Board.setMode(S.mode);
    if (S.state) { Board.render(S.state); renderActions(S.state); }
  }

  function renderGame(state, room) {
    const first = !S.state;
    S.state = state;
    if (room) S.room = room;
    showScreen('game');

    Board.setMode(S.mode);
    Board.render(state);
    renderBuildGuide(state);
    renderHand(state);
    renderDockButtons(state);
    renderDev(state);
    renderActions(state);
    renderPhase(state);
    renderLog(state);
    renderSidePlayers(state);
    renderChat($('game-chat-log'), (room || S.room || {}).chat || []);
    handleDice(state);
    handleEvents(state, first);
    handleSounds(state, first);
    announceTurn(state);
    handleAutoModals(state);
    if (S.modalKind === 'players') showPlayers();
    if (first) Board.reset();
  }

  /* --- panneau de gauche : que peut-on construire --- */

  const BUILDS = [
    {
      key: 'road', mode: 'road', img: 'img/route.png', name: 'Route', vp: '',
      cost: { brick: 1, lumber: 1 },
      desc: 'Se pose sur une arête libre reliée à votre réseau. 5 routes continues donnent la Route la plus longue (+2 PV).',
      left: (s, me) => me.roadsLeft + ' route(s) en stock'
    },
    {
      key: 'settlement', mode: 'settlement', img: 'img/colonie.png', name: 'Colonie', vp: '1 PV',
      cost: { brick: 1, lumber: 1, wool: 1, grain: 1 },
      desc: 'Sur une intersection libre de votre réseau, à deux intersections au moins de toute construction. Rapporte 1 ressource par tuile voisine.',
      left: (s, me) => me.settlementsLeft + ' colonie(s) en stock'
    },
    {
      key: 'city', mode: 'city', img: 'img/ville.png', name: 'Ville', vp: '2 PV',
      cost: { grain: 2, ore: 3 },
      desc: 'Remplace une de vos colonies (rendue au stock). La tuile voisine lui rapporte alors 2 ressources.',
      left: (s, me) => me.citiesLeft + ' ville(s) en stock'
    },
    {
      key: 'boat', mode: 'boat', icon: '⛵', name: 'Bateau', vp: '', onlyIf: (s) => s.rules && s.rules.boats,
      cost: { lumber: 3, ore: 1, grain: 1 },
      desc: 'Part d une de vos constructions sur la côte et accoste à un port d une autre île : vous pouvez ensuite construire des routes depuis ce port.',
      left: (s, me) => (s.boats || []).filter((b) => me && b.owner === me.index).length + ' bateau(x) en mer'
    },
    {
      key: 'dev', mode: null, img: 'img/carte-dev.png', name: 'Carte développement', vp: '',
      cost: { wool: 1, grain: 1, ore: 1 },
      desc: 'Chevalier, point de victoire, invention, monopole ou construction de routes. Une seule carte jouable par tour, jamais celle achetée le tour même.',
      left: (s) => s.devDeckCount + ' carte(s) dans la pioche'
    }
  ];

  function costChips(cost, you) {
    return RES.filter((r) => cost[r]).map((r) => {
      const miss = you && you.resources[r] < cost[r];
      return '<span class="cost-chip' + (miss ? ' miss' : '') + '"><i style="background:' + RES_BG[r][0] + '"></i>' +
        cost[r] + ' ' + RES_FR[r] + '</span>';
    }).join('');
  }

  function renderBuildGuide(state) {
    hideTooltip();
    const box = $('build-guide');
    const you = state.you;
    const me = you ? state.players[you.index] : null;
    const v = (you && you.valid) || {};
    box.innerHTML = '';

    BUILDS.forEach((b) => {
      if (b.onlyIf && !b.onlyIf(state)) return;
      const affordable = you && canAfford(b.cost);
      let usable = false;
      if (you && you.isMyTurn && state.phase === 'main' && affordable) {
        if (b.key === 'road') usable = !!(v.roads && v.roads.length) && me.roadsLeft > 0;
        else if (b.key === 'settlement') usable = !!(v.settlements && v.settlements.length) && me.settlementsLeft > 0;
        else if (b.key === 'city') usable = !!(v.cities && v.cities.length) && me.citiesLeft > 0;
        else if (b.key === 'boat') usable = !!(v.boats && v.boats.length);
        else usable = state.devDeckCount > 0;
      }
      if (b.key === 'road' && state.freeRoads > 0 && you && you.isMyTurn) usable = !!(v.roads && v.roads.length);

      const d = document.createElement('div');
      d.className = 'build-item' + (affordable ? ' ok' : '') + (usable ? ' clickable' : '') +
        (S.mode === b.mode && b.mode ? ' selected' : '');
      d.innerHTML =
        '<div class="build-pic">' + (b.img ? '<img src="' + b.img + '" alt="' + b.name + '">' : '<span class="build-ico">' + b.icon + '</span>') + '</div>' +
        '<div class="bi-body">' +
        '<div class="bi-head"><span class="bi-name">' + b.name + '</span>' +
        (b.vp ? '<span class="bi-vp">' + b.vp + '</span>' : '') + '</div>' +
        '<div class="bi-cost">' +
        (b.key === 'road' && state.freeRoads > 0 ? '<span class="cost-chip">gratuite ×' + state.freeRoads + '</span>' : costChips(b.cost, you)) +
        '</div>' +
        '<div class="bi-left">' + (me || state.devDeckCount !== undefined ? b.left(state, me) : '') + '</div>' +
        '</div>';
      if (usable) {
        d.onclick = () => {
          if (b.key === 'dev') Net.action('buyDev');
          else setMode(b.mode);
        };
      }
      d.addEventListener('mouseenter', () => showTooltip(d, b, state, me));
      d.addEventListener('mouseleave', hideTooltip);
      box.appendChild(d);
    });
  }

  /* --- bulle d'aide au survol --- */

  function showTooltip(anchor, b, state, me) {
    const tip = $('tooltip');
    tip.innerHTML = '<b>' + b.name + (b.vp ? ' — ' + b.vp : '') + '</b>' + b.desc +
      '<div class="hint" style="margin-top:6px">' + b.left(state, me) + '</div>';
    tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const h = tip.offsetHeight;
    let top = r.top + r.height / 2 - h / 2;
    top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
    let left = r.right + 10;
    if (left + tip.offsetWidth > window.innerWidth - 8) left = r.left - tip.offsetWidth - 10;
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }

  function hideTooltip() {
    $('tooltip').classList.add('hidden');
  }

  /* --- joueurs du panneau de droite --- */

  function renderSidePlayers(state) {
    $('side-target').textContent = 'Objectif : ' + state.targetVP + ' PV';
    const stat = (label, value, title, award) =>
      '<span class="sp-stat' + (award ? ' award' : '') + '" title="' + title + '"><b>' + value + '</b>' + label + '</span>';
    const list = $('side-players');
    const keep = list.scrollTop;
    list.innerHTML = state.players.map((p) => {
      const me = state.you && state.you.index === p.index;
      const cur = state.currentPlayer === p.index && state.phase !== 'ended';
      const pct = Math.min(100, (p.vp / state.targetVP) * 100);
      const badges = [];
      if (p.hasLongestRoad) badges.push('<span class="badge" title="Route la plus longue">🛤️ +2</span>');
      if (p.hasLargestArmy) badges.push('<span class="badge" title="Armée la plus puissante">⚔️ +2</span>');
      if (p.left) badges.push('<span class="badge off">a quitté</span>');
      else if (!p.connected) badges.push('<span class="badge off">hors ligne</span>');
      return '<div class="sp' + (cur ? ' current' : '') + (me ? ' me' : '') + (p.left ? ' left' : '') +
        '" style="--pc:' + p.color + '">' +
        '<div class="sp-head"><span class="sp-dot"></span>' +
        '<span class="sp-name">' + esc(p.name) + (me ? ' <em>(vous)</em>' : '') + '</span>' +
        (cur ? '<span class="sp-turn">à son tour</span>' : '') +
        '<span class="sp-vp" title="Points de victoire visibles"><b>' + p.vp + '</b> PV</span></div>' +
        '<div class="sp-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="sp-stats">' +
        stat('cartes', p.resourceCount, 'Cartes ressources en main') +
        stat('dév.', p.devCount, 'Cartes développement en main') +
        stat('route', p.longestRoadLength, 'Longueur de sa plus longue route' + (p.hasLongestRoad ? ' (Route la plus longue : +2 PV)' : ''), p.hasLongestRoad) +
        stat('chev.', p.knights, 'Chevaliers joués' + (p.hasLargestArmy ? ' (Armée la plus puissante : +2 PV)' : ''), p.hasLargestArmy) +
        '</div>' +
        '<div class="sp-foot"><span title="Pièces encore disponibles">Stock : ' + p.roadsLeft + ' routes · ' +
        p.settlementsLeft + ' col. · ' + p.citiesLeft + ' villes</span>' + badges.join('') + '</div>' +
        '</div>';
    }).join('');
    list.scrollTop = keep;
  }

  /* --- fenêtre des joueurs --- */

  function playerCardHTML(state, p) {
    return '<div class="player-card' +
      (state.currentPlayer === p.index ? ' current' : '') +
      (state.you && state.you.index === p.index ? ' me' : '') +
      '" style="border-left-color:' + p.color + '">' +
      '<div class="pc-top"><span class="pname" style="color:' + p.color + '">' + esc(p.name) +
      (state.you && state.you.index === p.index ? ' (vous)' : '') +
      (state.currentPlayer === p.index ? ' — à son tour' : '') + '</span>' +
      '<span class="pvp" title="Points de victoire visibles">' + p.vp + ' PV</span></div>' +
      '<div class="pc-line">' +
      '<span title="Cartes ressources en main">Cartes ' + p.resourceCount + '</span>' +
      '<span title="Cartes développement en main">Dév. ' + p.devCount + '</span>' +
      '<span title="Chevaliers joués">Chevaliers ' + p.knights + '</span>' +
      '<span title="Longueur de sa plus longue route">Route ' + p.longestRoadLength + '</span>' +
      '</div>' +
      '<div class="pc-line">' +
      '<span>Routes ' + p.roadsLeft + '</span>' +
      '<span>Colonies ' + p.settlementsLeft + '</span>' +
      '<span>Villes ' + p.citiesLeft + '</span>' +
      '</div>' +
      '<div class="pc-line">' +
      (p.hasLongestRoad ? '<span class="badge">Route la plus longue +2</span>' : '') +
      (p.hasLargestArmy ? '<span class="badge">Armée la plus puissante +2</span>' : '') +
      (p.left ? '<span class="badge off">a quitté</span>' : p.connected ? '' : '<span class="badge off">hors ligne</span>') +
      '</div></div>';
  }

  function showPlayers() {
    const state = S.state;
    if (!state) return;
    const rows = state.players.slice()
      .sort((a, b) => b.vp - a.vp)
      .map((p) => playerCardHTML(state, p)).join('');
    openModal('players', 'Joueurs',
      rows +
      '<p class="hint">Les points de victoire affichés sont les points visibles : les cartes « point de victoire » restent secrètes jusqu\'à la victoire. ' +
      'Objectif : ' + state.targetVP + ' PV.</p>',
      [{ label: 'Fermer', cls: 'ghost', onClick: closeModal }]);
  }

  function resCardHTML(r, n) {
    return '<div class="res-card' + (n ? '' : ' zero') + '" title="' + RES_FR[r] + '">' +
      '<img src="img/ressources/' + r + '.png" alt="' + RES_FR[r] + '">' +
      '<span class="qty">' + n + '</span></div>';
  }

  function renderHand(state) {
    const you = state.you;
    if (!you) { $('hand').innerHTML = '<span class="hint">Spectateur</span>'; return; }
    const total = RES.reduce((a, r) => a + you.resources[r], 0);
    $('hand').innerHTML =
      RES.map((r) => resCardHTML(r, you.resources[r])).join('') +
      '<div class="hand-total" title="Taux de change : ' +
      RES.map((r) => RES_FR[r] + ' ' + you.ratios[r] + ':1').join(' · ') + '">' +
      '<b>' + total + '</b>carte' + (total > 1 ? 's' : '') +
      '</div>';
  }

  /** Boutons du socle : echanger (a gauche) et lancer les des / terminer le tour (a droite). */
  function renderDockButtons(state) {
    const you = state.you;
    const trade = $('btn-trade');
    const turn = $('btn-turn');
    const setBtn = (el, ico, label, cls, enabled, onClick) => {
      el.querySelector('.dock-ico').textContent = ico;
      el.querySelector('.dock-label').textContent = label;
      el.className = 'dock-btn ' + cls;
      el.disabled = !enabled;
      el.onclick = enabled ? onClick : null;
    };
    if (!you) {
      trade.classList.add('hidden');
      turn.classList.add('hidden');
      return;
    }
    trade.classList.remove('hidden');
    turn.classList.remove('hidden');
    const mine = you.isMyTurn;
    const cur = state.players[state.currentPlayer];

    // echange
    if (state.trade && state.trade.from === you.index) {
      setBtn(trade, '🤝', 'Mon échange', 'trade', true, () => showTradeResponses(S.state));
    } else if (state.trade && state.trade.from !== you.index && state.phase !== 'ended') {
      setBtn(trade, '📨', 'Voir l’offre', 'trade', true, () => showTradeResponse(S.state));
    } else {
      setBtn(trade, '🤝', 'Échanger', 'trade', mine && state.phase === 'main', () => showTrade('bank'));
    }

    // tour
    if (state.phase === 'ended') setBtn(turn, '🏆', 'Partie terminée', 'turn wait', false);
    else if (!mine) setBtn(turn, '⏳', 'Tour de ' + (cur ? cur.name : '…'), 'turn wait', false);
    else if (state.phase === 'roll') setBtn(turn, '🎲', 'Lancer les dés', 'turn roll', true, () => Net.action('roll'));
    else if (state.phase === 'main') {
      setBtn(turn, '➜', 'Terminer le tour', 'turn end', true, () => { setMode(null); Net.action('endTurn'); });
    } else if (state.phase === 'setup') setBtn(turn, '🏠', 'Placement', 'turn wait', false);
    else setBtn(turn, '🥷', 'Voleur…', 'turn wait', false);
  }

  /** Grande annonce rapide quand c est a vous de lancer les des. */
  function announceTurn(state) {
    const you = state.you;
    const rollNow = you && you.isMyTurn && state.phase === 'roll';
    const key = state.turnCount + ':' + state.currentPlayer;
    if (!rollNow) return;
    if (S.announcedTurn === key) return;
    S.announcedTurn = key;
    Sound.play('tonTour');
    const el = $('turn-announce');
    el.classList.add('hidden');
    void el.offsetWidth; // relance l animation
    el.classList.remove('hidden');
    clearTimeout(S.announceTimer);
    S.announceTimer = setTimeout(() => el.classList.add('hidden'), 1650);
  }

  function renderDev(state) {
    const box = $('dev-hand');
    const you = state.you;
    box.innerHTML = '';
    if (!you) return;
    if (!you.dev.length) return;
    // éventail : les cartes se chevauchent juste assez pour tenir dans la place restante du bandeau
    const CARD_W = 88, n = you.dev.length;
    const dock = $('hand-dock');
    const docked = getComputedStyle(dock).position === 'absolute';
    let used = 0;
    for (const child of dock.children) if (child !== box && !child.classList.contains('hidden')) used += child.offsetWidth + 12;
    const room = docked
      ? $('board-area').clientWidth - 24 - 24 - used - 13
      : dock.clientWidth - 24;
    // cartes plus petites s il manque vraiment de place, puis chevauchement
    const cardW = Math.max(58, Math.min(CARD_W, room - (n - 1) * (CARD_W - 70) * 0.6));
    const overlap = n > 1 ? Math.max(0, Math.min(cardW * 0.8, (n * cardW - Math.max(cardW, room)) / (n - 1))) : 0;
    box.style.setProperty('--dev-w', cardW + 'px');
    box.style.setProperty('--dev-overlap', overlap + 'px');
    you.dev.forEach((c) => {
      const info = DEV_INFO[c.type];
      const d = document.createElement('div');
      d.className = 'dev-card' + (info.img ? ' illus' : ' vp');
      d.title = (c.name || info.name) + ' : ' + info.desc;
      d.innerHTML = info.img
        ? '<img class="dev-img" src="' + info.img + '" alt="' + esc(c.name || info.name) + '">'
        : '<div class="dev-ico">' + info.icon + '</div><div>' + (c.name || info.name) + '</div>';
      if (c.type !== 'victoryPoint') {
        const b = document.createElement('button');
        b.className = 'primary';
        b.textContent = 'Jouer';
        b.disabled = !c.playable || !you.isMyTurn ||
          (state.phase !== 'main' && !(state.phase === 'roll' && c.type === 'knight'));
        b.onclick = () => playDev(c);
        d.appendChild(b);
      }
      box.appendChild(d);
    });
  }

  function btn(label, cls, onClick, disabled, title) {
    const b = document.createElement('button');
    b.className = cls;
    b.innerHTML = label;
    b.disabled = !!disabled;
    if (title) b.title = title;
    b.onclick = onClick;
    return b;
  }

  function renderActions(state) {
    const box = $('actions');
    box.innerHTML = '';
    const you = state.you;
    if (!you) return;
    const mine = you.isMyTurn;
    const v = you.valid || {};

    if (state.phase === 'ended') {
      box.appendChild(btn('Retour au salon', 'primary', () => Net.send({ type: 'restart' }),
        !S.room || S.room.hostId !== S.me, 'Seul l hôte peut relancer'));
      return;
    }

    if (state.phase === 'setup') {
      const label = state.setup.need === 'settlement' ? 'Placez une colonie sur le plateau' : 'Placez une route adjacente';
      box.innerHTML = '<span class="hint">' + (mine ? label : 'En attente des autres joueurs…') + '</span>';
      return;
    }

    if (mine && state.phase === 'roll') {
      const info = document.createElement('span');
      info.className = 'hint';
      info.textContent = 'Lancez les dés avec le bouton 🎲 à droite de vos cartes (ou jouez un Chevalier).';
      box.appendChild(info);
    }

    if (mine && state.phase === 'main') {
      if (S.mode) {
        const label = { road: 'une route', settlement: 'une colonie', city: 'une ville', boat: 'un bateau (cliquez sur un port en surbrillance)' }[S.mode];
        const info = document.createElement('span');
        info.className = 'hint';
        info.innerHTML = 'Cliquez sur le plateau pour placer <b>' + label + '</b>.';
        box.appendChild(info);
        box.appendChild(btn('Annuler', 'ghost', () => setMode(null)));
      } else {
        const info = document.createElement('span');
        info.className = 'hint';
        info.textContent = 'Construisez depuis « Que construire ? », échangez avec 🤝 à gauche de vos cartes, puis terminez le tour à droite.';
        box.appendChild(info);
      }
    }

    if (!mine) {
      const cur = state.players[state.currentPlayer];
      const info = document.createElement('span');
      info.className = 'hint';
      info.textContent = 'Tour de ' + (cur ? cur.name : '?') + '.';
      box.appendChild(info);
      if (state.trade && state.trade.from !== you.index) {
        box.appendChild(btn('Voir la proposition d échange', 'primary', () => showTradeResponse(state)));
      }
      if (S.room && S.room.hostId === S.me && cur && !cur.connected) {
        box.appendChild(btn('Passer le tour (joueur hors ligne)', 'ghost', () => Net.send({ type: 'forceEndTurn' })));
      }
    }

    if (mine && state.trade && state.trade.from === you.index) {
      box.appendChild(btn('Voir les réponses à mon échange', 'primary', () => showTradeResponses(state)));
    }
  }

  function renderPhase(state) {
    const el = $('phase-banner');
    const you = state.you;
    const cur = state.players[state.currentPlayer];
    const mine = you && you.isMyTurn;
    let txt = '';
    switch (state.phase) {
      case 'setup':
        txt = (mine ? 'À vous : ' : cur.name + ' : ') +
          (state.setup.need === 'settlement' ? 'placez une colonie'
            : 'placez une route' + (state.setup.roadsLeft > 1 ? ' (' + state.setup.roadsLeft + ' restantes)' : '')) +
          ' (placement ' + (state.setup.index + 1) + '/' + state.setup.total + ')';
        break;
      case 'roll': txt = mine ? 'À vous de lancer les dés' : cur.name + ' lance les dés…'; break;
      case 'main': txt = mine ? 'Votre tour : construisez, échangez…' : 'Tour de ' + cur.name; break;
      case 'robber': txt = mine ? 'Déplacez le voleur : cliquez sur une tuile' : cur.name + ' déplace le voleur'; break;
      case 'steal': txt = mine ? 'Choisissez votre victime' : cur.name + ' choisit une victime'; break;
      case 'ended': txt = '🏆 ' + state.players[state.winner].name + ' remporte la partie !'; break;
    }
    el.textContent = txt;
    el.classList.toggle('my-turn', !!mine);
    $('hand-dock').classList.toggle('my-turn', !!mine);
  }

  /* --- effets sonores pilotes par le journal de partie --- */

  // le serveur etiquette chaque ligne (voir addLog dans src/game.js)
  const LOG_SFX = {
    dice: 'des',
    build: 'construire',
    dev: 'carte',
    robber: 'voleur',
    win: 'victoire'
  };

  function logKey(l) {
    return l.t + '|' + l.text;
  }

  function handleSounds(state, first) {
    const log = state.log || [];
    if (!log.length) return;
    const last = logKey(log[log.length - 1]);

    // a l arrivee dans une partie on ne rejoue pas l historique
    if (first || S.soundCursor === undefined) { S.soundCursor = last; return; }
    if (S.soundCursor === last) return;

    // le serveur ne renvoie que les 80 dernieres lignes : on se repere sur le
    // contenu, pas sur un index qui glisse a chaque nouvelle ligne
    let from = -1;
    for (let i = log.length - 1; i >= 0; i--) {
      if (logKey(log[i]) === S.soundCursor) { from = i; break; }
    }
    S.soundCursor = last;
    if (from === -1) return; // repere perdu (reconnexion, reprise) : on resynchronise en silence

    // plusieurs lignes peuvent arriver d un coup : un seul son par type
    const played = {};
    for (let i = from + 1; i < log.length; i++) {
      const name = LOG_SFX[log[i].kind];
      if (name && !played[name]) { played[name] = true; Sound.play(name); }
    }
  }

  function renderLog(state) {
    const box = $('game-log');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const keep = box.scrollTop;
    box.innerHTML = '';
    state.log.forEach((l) => {
      const d = document.createElement('div');
      d.className = 'log-line ' + (l.kind || 'info');
      d.textContent = l.text;
      box.appendChild(d);
    });
    box.scrollTop = atBottom ? box.scrollHeight : keep;
  }

  function handleDice(state) {
    const box = $('dice-box');
    if (!state.dice) { box.classList.add('hidden'); S.lastDice = null; return; }
    box.classList.remove('hidden');
    const sig = state.dice.join('-') + ':' + state.turnCount;
    $('die1').textContent = state.dice[0];
    $('die2').textContent = state.dice[1];
    $('dice-total').textContent = state.dice[0] + state.dice[1];
    if (sig !== S.lastDice) {
      S.lastDice = sig;
      [$('die1'), $('die2')].forEach((d) => {
        d.classList.remove('rolling');
        void d.offsetWidth;
        d.classList.add('rolling');
      });
    }
  }

  /* --- evenements des mods : grand message rouge --- */

  function handleEvents(state, first) {
    const events = state.events || [];
    const lastId = events.length ? events[events.length - 1].id : 0;
    // en arrivant dans une partie, on ne rejoue pas les anciens evenements
    if (first || S.lastEventId === undefined || lastId < S.lastEventId) { S.lastEventId = lastId; return; }
    const fresh = events.filter((e) => e.id > S.lastEventId);
    S.lastEventId = lastId;
    if (!fresh.length) return;
    S.eventQueue = (S.eventQueue || []).concat(fresh);
    if (!S.eventShowing) showNextEvent();
  }

  function showNextEvent() {
    const banner = $('event-banner');
    const e = (S.eventQueue || []).shift();
    if (!e) { S.eventShowing = false; return; }
    S.eventShowing = true;
    $('eb-title').textContent = e.title;
    $('eb-text').textContent = e.text;
    banner.classList.remove('hidden', 'leaving');
    void banner.offsetWidth; // relance l animation
    clearTimeout(S.eventTimer);
    const close = () => {
      clearTimeout(S.eventTimer);
      banner.onclick = null;
      banner.classList.add('leaving');
      setTimeout(() => { banner.classList.add('hidden'); banner.classList.remove('leaving'); showNextEvent(); }, 300);
    };
    banner.onclick = close;
    S.eventTimer = setTimeout(close, 5500);
  }

  /* ------------------------------------------------------------------ */
  /* modales automatiques                                               */
  /* ------------------------------------------------------------------ */

  function handleAutoModals(state) {
    const you = state.you;
    if (!you) return;

    if (state.phase === 'ended' && S.modalKind !== 'victory') { showVictory(state); return; }
    if (state.phase === 'steal' && you.isMyTurn && S.modalKind !== 'steal') { showSteal(state); return; }
    if (S.modalKind === 'steal' && state.phase !== 'steal') closeModal();
    if (state.trade && state.trade.from !== you.index &&
        state.trade.responses[you.index] === undefined && S.modalKind !== 'tradeResp' && S.modalKind !== 'counter') {
      showTradeResponse(state);
      return;
    }
    if (!state.trade && (S.modalKind === 'tradeResp' || S.modalKind === 'tradeResponses' || S.modalKind === 'counter')) closeModal();
    if (state.trade && S.modalKind === 'tradeResponses') showTradeResponses(state);
  }

  function showVictory(state) {
    const w = state.players[state.winner];
    const rows = state.players.slice().sort((a, b) => b.vp - a.vp).map((p) =>
      '<div class="picker-row"><span style="color:' + p.color + '"><b>' + esc(p.name) + '</b></span>' +
      '<span>' + p.vp + ' PV · ⚔️ ' + p.knights + ' · 🛤️ ' + p.longestRoadLength + '</span></div>').join('');
    openModal('victory', '🏆 Victoire de ' + w.name,
      '<p>Partie terminée en ' + state.turnCount + ' tours.</p>' + rows,
      [{ label: 'Fermer', cls: 'ghost', onClick: closeModal }]);
  }

  function showSteal(state) {
    const list = state.stealTargets.map((t) =>
      '<button class="ghost big steal-btn" data-steal="' + t.index + '">' +
      '<span style="color:' + state.players[t.index].color + '">' + esc(t.name) + '</span>' +
      '<span>' + t.cards + ' carte(s)</span></button>').join('');
    openModal('steal', 'À qui volez-vous une carte ?', '<div class="steal-list">' + list + '</div>', [],
      () => {
        $('modal-content').querySelectorAll('[data-steal]').forEach((b) => {
          b.onclick = () => { Net.action('steal', { target: Number(b.dataset.steal) }); closeModal(); };
        });
      });
  }

  /* ------------------------------------------------------------------ */
  /* commerce                                                           */
  /* ------------------------------------------------------------------ */

  function tradeTabsHTML(active) {
    const st = S.state;
    const others = st.players.filter((p) => !p.left && (!st.you || p.index !== st.you.index)).length;
    const playersBlocked = !others || !!st.trade;
    return '<div class="trade-tabs">' +
      '<button class="trade-tab' + (active === 'bank' ? ' active' : '') + '" data-trade-tab="bank">🏦 Banque et ports</button>' +
      '<button class="trade-tab' + (active === 'players' ? ' active' : '') + '" data-trade-tab="players"' +
      (playersBlocked ? ' disabled title="' + (others ? 'Une proposition est déjà en cours' : 'Aucun autre joueur') + '"' : '') +
      '>👥 Joueurs</button></div>';
  }

  function bindTradeTabs() {
    $('modal-content').querySelectorAll('[data-trade-tab]').forEach((b) => {
      b.onclick = () => showTrade(b.dataset.tradeTab);
    });
  }

  function showTrade(tab) {
    if (tab === 'players') showTradeBuilder();
    else showBankTrade();
  }

  function showBankTrade() {
    const you = S.state.you;
    let give = null, want = null;
    const giveHTML = RES.map((r) =>
      '<button class="ghost small" data-give="' + r + '" ' + (you.resources[r] < you.ratios[r] ? 'disabled' : '') + '>' +
      RES_FR[r] + ' (' + you.ratios[r] + ':1)</button>').join(' ');
    const wantHTML = RES.map((r) =>
      '<button class="ghost small" data-want="' + r + '" ' + (S.state.bank[r] < 1 ? 'disabled' : '') + '>' +
      RES_FR[r] + '</button>').join(' ');
    openModal('bank', 'Échanger',
      tradeTabsHTML('bank') +
      '<p class="hint">Vos taux : ' + RES.map((r) => RES_FR[r] + ' ' + you.ratios[r] + ':1').join(' · ') +
      (you.ports.length ? '<br>Ports possédés : ' + you.ports.map((p) => p === '3:1' ? '3:1' : RES_FR[p] + ' 2:1').join(', ') : '') + '</p>' +
      '<h4>Vous donnez</h4><div>' + giveHTML + '</div>' +
      '<h4 style="margin-top:12px">Vous recevez</h4><div>' + wantHTML + '</div>',
      [{ label: 'Échanger', cls: 'primary', id: 'bank-ok', disabled: true, onClick: () => { Net.action('bankTrade', { give, receive: want }); closeModal(); } },
       { label: 'Annuler', cls: 'ghost', onClick: closeModal }],
      () => {
        bindTradeTabs();
        const upd = () => { $('bank-ok').disabled = !give || !want || give === want; };
        $('modal-content').querySelectorAll('[data-give]').forEach((b) => {
          b.onclick = () => {
            give = b.dataset.give;
            $('modal-content').querySelectorAll('[data-give]').forEach((x) => x.classList.toggle('active-mode', x === b));
            upd();
          };
        });
        $('modal-content').querySelectorAll('[data-want]').forEach((b) => {
          b.onclick = () => {
            want = b.dataset.want;
            $('modal-content').querySelectorAll('[data-want]').forEach((x) => x.classList.toggle('active-mode', x === b));
            upd();
          };
        });
      });
  }

  function stepperBlock(prefix, limits) {
    return RES.map((r) =>
      '<div class="picker-row">' + resChip(r) + '<span class="stepper">' +
      '<button class="ghost" data-m="' + prefix + '.' + r + '">−</button>' +
      '<span class="val" data-v="' + prefix + '.' + r + '">0</span>' +
      '<button class="ghost" data-p="' + prefix + '.' + r + '">+</button>' +
      (limits ? '<span class="hint">/ ' + limits[r] + '</span>' : '') +
      '</span></div>').join('');
  }

  function bindSteppers(give, receive, limits, onChange) {
    const box = $('modal-content');
    const upd = () => {
      RES.forEach((r) => {
        box.querySelector('[data-v="give.' + r + '"]').textContent = give[r];
        box.querySelector('[data-v="recv.' + r + '"]').textContent = receive[r];
      });
      if (onChange) onChange();
    };
    box.querySelectorAll('[data-p]').forEach((b) => {
      b.onclick = () => {
        const [side, r] = b.dataset.p.split('.');
        const target = side === 'give' ? give : receive;
        if (side === 'give' && limits && target[r] >= limits[r]) return;
        target[r]++; upd();
      };
    });
    box.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => {
        const [side, r] = b.dataset.m.split('.');
        const target = side === 'give' ? give : receive;
        if (target[r] > 0) target[r]--;
        upd();
      };
    });
    upd();
  }

  function showTradeBuilder() {
    const you = S.state.you;
    const give = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
    const receive = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
    openModal('tradeBuild', 'Échanger',
      tradeTabsHTML('players') +
      '<p class="hint">Proposez un échange : les autres joueurs acceptent, refusent ou font une contre-proposition.</p>' +
      '<div class="trade-cols">' +
      '<div class="trade-side offer-box"><h4>Vous donnez</h4>' + stepperBlock('give', you.resources) + '</div>' +
      '<div class="trade-side offer-box"><h4>Vous demandez</h4>' + stepperBlock('recv', null) + '</div>' +
      '</div>',
      [{ label: 'Proposer', cls: 'primary', id: 'trade-ok', onClick: () => { Net.action('offerTrade', { give, receive }); closeModal(); } },
       { label: 'Annuler', cls: 'ghost', onClick: closeModal }],
      () => {
        bindTradeTabs();
        bindSteppers(give, receive, you.resources, () => {
          const t = RES.reduce((a, r) => a + give[r] + receive[r], 0);
          $('trade-ok').disabled = t === 0;
        });
      });
  }

  function showTradeResponse(state) {
    const t = state.trade;
    const from = state.players[t.from];
    openModal('tradeResp', 'Proposition de ' + from.name,
      '<p><b style="color:' + from.color + '">' + esc(from.name) + '</b> donne : <b>' + offerText(t.give) + '</b></p>' +
      '<p>et demande : <b>' + offerText(t.receive) + '</b></p>',
      [
        { label: 'Accepter', cls: 'primary', onClick: () => { Net.action('respondTrade', { accept: true }); closeModal(); } },
        { label: 'Contre-proposition', cls: 'ghost', onClick: () => showCounter(state) },
        { label: 'Refuser', cls: 'ghost', onClick: () => { Net.action('respondTrade', { accept: false }); closeModal(); } }
      ]);
  }

  function showCounter(state) {
    const you = state.you;
    const give = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
    const receive = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
    const t = state.trade;
    RES.forEach((r) => { give[r] = Math.min(t.receive[r], you.resources[r]); receive[r] = t.give[r]; });
    openModal('counter', 'Contre-proposition',
      '<div class="trade-cols">' +
      '<div class="trade-side offer-box"><h4>Vous donnez</h4>' + stepperBlock('give', you.resources) + '</div>' +
      '<div class="trade-side offer-box"><h4>Vous demandez</h4>' + stepperBlock('recv', null) + '</div>' +
      '</div>',
      [{ label: 'Envoyer', cls: 'primary', onClick: () => { Net.action('counterTrade', { give, receive }); closeModal(); } },
       { label: 'Annuler', cls: 'ghost', onClick: closeModal }],
      () => bindSteppers(give, receive, you.resources));
  }

  function showTradeResponses(state) {
    const t = state.trade;
    const rows = state.players.filter((p) => p.index !== t.from).map((p) => {
      const r = t.responses[p.index];
      let status = 'en attente…';
      if (r === 'accept') status = '✅ accepte';
      if (r === 'decline') status = '❌ refuse';
      if (r === 'counter') {
        const c = t.counters[p.index];
        status = '🔄 propose : donne ' + offerText(c.give) + ' / demande ' + offerText(c.receive);
      }
      return '<div class="picker-row"><span style="color:' + p.color + '"><b>' + esc(p.name) + '</b></span>' +
        '<span>' + status + (r === 'accept' || r === 'counter'
          ? ' <button class="primary small" data-accept="' + p.index + '">Échanger</button>' : '') + '</span></div>';
    }).join('');
    openModal('tradeResponses', 'Votre proposition',
      '<p>Vous donnez : <b>' + offerText(t.give) + '</b> — vous demandez : <b>' + offerText(t.receive) + '</b></p>' + rows,
      [{ label: 'Annuler la proposition', cls: 'danger', onClick: () => { Net.action('cancelTrade'); closeModal(); } },
       { label: 'Fermer', cls: 'ghost', onClick: closeModal }],
      () => {
        $('modal-content').querySelectorAll('[data-accept]').forEach((b) => {
          b.onclick = () => { Net.action('confirmTrade', { with: Number(b.dataset.accept) }); closeModal(); };
        });
      });
  }

  /* ------------------------------------------------------------------ */
  /* cartes développement                                               */
  /* ------------------------------------------------------------------ */

  function playDev(card) {
    if (card.type === 'knight' || card.type === 'roadBuilding') {
      Net.action('playDev', { card: card.id });
      return;
    }
    if (card.type === 'yearOfPlenty') {
      const picks = [];
      openModal('yop', 'Invention : choisissez 2 ressources',
        '<div>' + RES.map((r) => '<button class="ghost" data-r="' + r + '">' + RES_FR[r] +
          ' <span class="hint">(banque ' + S.state.bank[r] + ')</span></button>').join(' ') + '</div>' +
        '<p style="margin-top:10px">Choix : <b id="yop-sel">—</b></p>',
        [{ label: 'Valider', cls: 'primary', id: 'yop-ok', disabled: true,
           onClick: () => { Net.action('playDev', { card: card.id, resources: picks }); closeModal(); } },
         { label: 'Annuler', cls: 'ghost', onClick: closeModal }],
        () => {
          $('modal-content').querySelectorAll('[data-r]').forEach((b) => {
            b.onclick = () => {
              if (picks.length >= 2) picks.length = 0;
              picks.push(b.dataset.r);
              $('yop-sel').textContent = picks.map((r) => RES_FR[r]).join(' + ');
              $('yop-ok').disabled = picks.length !== 2;
            };
          });
        });
      return;
    }
    if (card.type === 'monopoly') {
      openModal('mono', 'Monopole : choisissez une ressource',
        '<div>' + RES.map((r) => '<button class="ghost" data-r="' + r + '">' + RES_FR[r] + '</button>').join(' ') + '</div>',
        [{ label: 'Annuler', cls: 'ghost', onClick: closeModal }],
        () => {
          $('modal-content').querySelectorAll('[data-r]').forEach((b) => {
            b.onclick = () => { Net.action('playDev', { card: card.id, resource: b.dataset.r }); closeModal(); };
          });
        });
    }
  }

  /* ------------------------------------------------------------------ */

  function confirmLeaveGame() {
    openModal('leave', 'Quitter la partie ?',
      '<p>Vous abandonnez la partie en cours. Vos routes, colonies et villes restent sur le plateau ' +
      'mais ne produisent plus rien, et les autres joueurs continuent sans vous.</p>' +
      '<p class="hint">Cette action est définitive : vous ne pourrez pas revenir dans cette partie.</p>' +
      '<p class="hint">Pour la continuer plus tard, choisissez « Sauvegarder et quitter » : la partie sera reprenable ' +
      'depuis « Créer une partie → Reprendre une partie ».</p>',
      [
        { label: '💾 Sauvegarder et quitter', cls: 'primary', onClick: () => {
          S.leavingAfterSave = true;
          Net.send({ type: 'saveGame' });
          closeModal();
        } },
        { label: 'Abandonner', cls: 'danger', onClick: () => { Net.send({ type: 'leaveGame' }); closeModal(); } },
        { label: 'Rester', cls: 'ghost', onClick: closeModal }
      ]);
  }

  function showRules() {
    const rules = (S.state && S.state.rules) || { robberThreshold: 7 };
    openModal('rules', 'Règles &amp; coûts',
      '<h4>Constructions</h4>' +
      '<div class="picker-row"><span>Route</span><span>' + resChip('brick', 1) + ' + ' + resChip('lumber', 1) + '</span></div>' +
      '<div class="picker-row"><span>Colonie (1 PV)</span><span>' + resChip('brick', 1) + ' ' + resChip('lumber', 1) + ' ' + resChip('wool', 1) + ' ' + resChip('grain', 1) + '</span></div>' +
      '<div class="picker-row"><span>Ville (2 PV)</span><span>' + resChip('grain', 2) + ' + ' + resChip('ore', 3) + '</span></div>' +
      '<div class="picker-row"><span>Carte développement</span><span>' + resChip('wool', 1) + ' ' + resChip('grain', 1) + ' ' + resChip('ore', 1) + '</span></div>' +
      '<h4>Cartes développement (25)</h4>' +
      '<p class="hint">14 Chevaliers · 5 Points de victoire · 2 Construction de routes · 2 Invention · 2 Monopole.<br>' +
      'Une seule carte par tour, jamais celle achetée le tour même.</p>' +
      '<h4>Points de victoire</h4>' +
      '<p class="hint">Colonie 1 · Ville 2 · Route la plus longue (5+) 2 · Armée la plus puissante (3 chevaliers) 2 · carte PV 1.<br>' +
      'Objectif : ' + (S.state ? S.state.targetVP : 10) + ' points, atteints pendant votre tour.</p>' +
      '<h4>Le 7 et le voleur</h4>' +
      '<p class="hint">' + (rules.friendlyRobber
        ? 'Voleur amical : sur un 7, le lanceur déplace le voleur mais personne ne perd de cartes.<br>'
        : 'Sur un 7, chaque joueur qui a plus de ' + rules.robberThreshold + ' cartes en perd la moitié (au hasard). ' +
          'Le lanceur déplace ensuite le voleur et vole une carte à un joueur adjacent.<br>') +
      'La tuile occupée par le voleur ne produit plus.</p>' +
      (rules.boats ? '<h4>Bateaux</h4><p class="hint">3 bois + 1 minerai + 1 blé. Depuis une construction sur la côte, ' +
        'le bateau accoste à un port d une autre île : vous pouvez y construire des routes, puis des colonies.</p>' : '') +
      (rules.mods && rules.mods.length ? '<h4>Mods actifs</h4><p class="hint">' +
        rules.mods.map((m) => '<b>' + esc(m.name) + '</b> : ' + esc(m.desc)).join('<br>') + '</p>' : '') +
      '<h4>Commerce</h4>' +
      '<p class="hint">4:1 avec la banque, 3:1 sur un port générique, 2:1 sur un port spécialisé. ' +
      'Échanges libres entre joueurs pendant votre tour.</p>' +
      '<h4>Limites</h4><p class="hint">' + (S.state && S.state.limits
        ? S.state.limits.road + ' routes, ' + S.state.limits.settlement + ' colonies, ' + S.state.limits.city + ' villes'
        : '15 routes, 5 colonies, 4 villes') + ' par joueur. 19 cartes par ressource dans la banque (davantage sur les grandes cartes).</p>',
      [{ label: 'Fermer', cls: 'ghost', onClick: closeModal }]);
  }

  /* ------------------------------------------------------------------ */
  /* démarrage                                                          */
  /* ------------------------------------------------------------------ */

  function initSound() {
    const btn = $('btn-sound');
    const slider = $('sound-volume');

    const paint = () => {
      const on = Sound.enabled;
      btn.textContent = on ? (Sound.volume < 0.35 ? '🔉' : '🔊') : '🔇';
      btn.setAttribute('aria-pressed', on ? 'false' : 'true');
      btn.title = on ? 'Couper les effets sonores' : 'Remettre les effets sonores';
      $('sound-wrap').classList.toggle('muted', !on);
    };

    slider.value = Math.round(Sound.volume * 100);
    btn.onclick = () => { Sound.toggle(); paint(); if (Sound.enabled) Sound.play('carte'); };
    slider.oninput = () => {
      Sound.volume = Number(slider.value) / 100;
      if (!Sound.enabled) { Sound.enabled = true; }
      paint();
    };
    slider.onchange = () => Sound.play('carte'); // apercu quand on lache le curseur
    paint();
  }

  function boot() {
    initHome();
    initLobby();
    initGame();
    initSound();

    $('modal-root').querySelector('.modal-backdrop').onclick = () => {
      if (S.modalKind === 'steal') return; // choix obligatoire
      closeModal();
    };
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && S.modalKind && S.modalKind !== 'steal') closeModal();
    });

    Net.on('status', (ok) => {
      const el = $('conn-status');
      // les hebergeurs gratuits mettent le serveur en veille apres inactivite :
      // le premier reveil peut demander une bonne minute, autant le dire
      const waking = !ok && Net.retries >= 3;
      el.textContent = ok ? 'Connecté' : (waking ? 'Réveil du serveur…' : 'Reconnexion…');
      el.title = waking
        ? 'Le serveur de jeu sort de veille, cela peut prendre jusqu à une minute. La connexion se fera toute seule.'
        : '';
      el.className = 'conn ' + (ok ? 'online' : 'offline');
    });
    Net.on('welcome', (m) => {
      S.me = m.playerId;
      S.name = m.name;
      if (!$('input-name').value) $('input-name').value = m.name;
      if (S.homeStep === 'choice') $('hello-name').textContent = m.name;
    });
    Net.on('rooms', (m) => renderRooms(m.rooms || []));
    Net.on('room', (m) => {
      S.state = null;
      renderLobby(m.room);
    });
    Net.on('game', (m) => renderGame(m.state, m.room));
    Net.on('left', (m) => {
      S.room = null; S.state = null;
      closeModal();
      showScreen('home');
      showHomeStep(S.name ? 'choice' : 'name');
      Net.send({ type: 'listRooms' });
      if (m && m.reason) toast(m.reason, true);
    });
    Net.on('saves', (m) => renderSaves(m.saves || []));
    Net.on('saved', () => {
      toast('💾 Partie sauvegardée.');
      if (S.leavingAfterSave) {
        S.leavingAfterSave = false;
        // on quitte le salon sans abandonner : la sauvegarde garde votre place
        Net.send({ type: 'leaveRoom' });
      }
    });
    Net.on('error', (m) => {
      if (/[Mm]ot de passe/.test(m.message) && S.retryJoinWithPassword && S.retryJoinWithPassword()) return;
      toast(m.message, true);
    });

    Net.connect();
    setInterval(() => { if (!S.room) Net.send({ type: 'listRooms' }); }, 4000);
  }

  // point d entree de debogage (rendu d un etat de partie sans serveur)
  window.CatanUI = { renderGame, renderLobby, state: S };

  document.addEventListener('DOMContentLoaded', boot);
})();
