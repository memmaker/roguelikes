// Header mini-roguelike.
//
// Layout of this file:
//   MAP       the two rooms and corridor every level shares
//   MONSTERS  one self-contained entry per monster type: stats, glyphs, optional behaviour
//   ITEMS     one self-contained entry per item type: glyphs, optional effects
//   LEVELS    one self-contained entry per level: what is in it, and its own rules
//   engine    movement, combat, stairs, drawing, input; knows nothing about levels
//
// To add a level, append an entry to LEVELS. Stairs down lead to the next entry;
// on the last level they say "Under construction.", so a new level is reachable
// as soon as it exists. Stairs up lead back. A level you leave is remembered as it
// was, and every level change says "Level N". Monsters and items work the same way: add an entry, and give
// it hooks (act, onPickup, attack, defend) for anything unusual it does.
(() => {
  const el = document.getElementById('minirogue');
  if (!el) return;

  const MAP = [
    ' ------               ------- ',
    ' |....|               |.....| ',
    ' |....+###############+.....| ',
    ' |....|               |.....| ',
    ' ------               ------- ',
  ];
  const CORRIDOR = { row: 2, from: 7, to: 21 };  // row 2, doors at cols 6 and 22
  const PLAYER_HP = 45, FISTS = 2;  // hp is restored on each new level

  // Monsters: hp, dmg (per hit on you), glyph per theme. Optional act(g, m) replaces the
  // default turn (hit if adjacent, else close in). Numbers give exact hit counts:
  // you have 45 hp, fists do 2, the sword 5, armour takes 4 off every hit.
  const MONSTERS = {
    bat: { hp: 10, dmg: 9, glyph: { unix: 'B', epyx: 'B' },  // 5 fists / 2 sword; kills in 5
      act(g, m) {  // flies erratically, as in Rogue: every third turn a random flap
        m.turns = (m.turns || 0) + 1;
        if (m.turns % 3 === 0) return g.wander(m);
        return g.adjacent(m) ? g.hurt(m, this.dmg) : g.chase(m);
      } },
    snake: { hp: 20, dmg: 9, glyph: { unix: 's', epyx: 's' } },  // 4 sword; kills in 5, in 9 vs armour
  };

  // Items are picked up by walking over them. Optional hooks:
  //   onPickup(g) → message (default: msg)   attack → your damage per hit (best one counts)
  //   defend(dmg, monster) → damage you actually take
  const ITEMS = {
    sword: { msg: 'You wield the sword.', attack: 5, glyph: { unix: ')', epyx: '↑' } },
    armour: { msg: 'You put on leather armour.', defend: (dmg) => dmg - 4,
      glyph: { unix: ']', epyx: '◘' } },
  };

  // Each level: start (first level only), setup(g, arrival) fills the fresh map on the
  // first visit. Optional hooks, each may return a message:
  //   onTurn(g)          after every player action (move, attack, search), before monsters
  //   onSearch(g)        when the player searches (s key, or tapping yourself)
  //   overlay(g, pos, T) extra glyph drawn at pos (HTML), under the player and monsters
  // `g.lv` is this level's own scratch state; it is kept while you are away.
  const LEVELS = [
    { // 1: a sword and a bat; stairs down in the bat's room
      start: [2, 3],
      setup(g) {
        g.spawn('bat', [2, 25]);
        g.drop('sword', [3, 4]);
        g.stairsDown([3, 26]);
      },
    },
    { // 2: you arrive where the stairs were, with no way up; a snake and leather armour
      // lie anywhere. Halfway along the corridor westwards a wall seals the way back, and
      // a pale double of you appears beyond it. It heads for a hidden switch in the east
      // room (unless you found it first: search next to it), which opens stairs up where
      // you came in, and leaves by them. The stairs down in the west room are unfinished.
      setup(g, arrival) {
        g.lv.upAt = arrival;
        g.stairsDown([1, 3]);
        g.drop('armour', g.randomFloor());
        g.spawn('snake', g.randomFloor());
        // the switch hides in a wall of the east room, next to its floor
        const walls = g.tiles((ch, p) => '-|'.includes(ch) && p[1] >= 22 && !!g.floorNextTo(p));
        g.lv.switchAt = walls[Math.floor(Math.random() * walls.length)];
      },
      click(g) {  // the switch opens the stairs up
        if (g.lv.clicked) return '';
        g.lv.clicked = true;
        g.stairsUp(g.lv.upAt);
        return '*click*';
      },
      onSearch(g) {
        if (g.touching(g.lv.switchAt)) return this.click(g);
      },
      onTurn(g) {
        const lv = g.lv, [r, c] = g.player, half = (CORRIDOR.from + CORRIDOR.to) >> 1;
        if (!lv.sealed && r === CORRIDOR.row && c >= CORRIDOR.from && c <= half) {
          for (let wc = half + 1; wc < CORRIDOR.to; wc++) {  // first free tile behind you
            if (g.occupied([r, wc])) continue;
            g.setTile([r, wc], '|');
            lv.sealed = true;
            lv.double = { pos: [r, wc + 1], phase: 'appear' };
            return 'A stone wall grinds shut behind you.';
          }
        }
        const d = lv.double;
        if (!d || d.phase === 'gone') return;
        if (d.phase === 'appear') { d.phase = 'walk'; return 'So it begins..'; }  // after the fade-in
        if (d.phase === 'leave') { d.phase = 'gone'; return; }
        const goal = lv.clicked ? lv.upAt : g.floorNextTo(lv.switchAt);
        if (!same(d.pos, goal)) {
          const step = g.stepTowards(d.pos, goal, { throughMonsters: true });
          if (!same(step, g.player)) d.pos = step;
          return;
        }
        if (!lv.clicked) return this.click(g);
        d.phase = 'leave';  // on the stairs: fade out, then the stairs show again
        g.later(1200, () => { d.phase = 'gone'; });
      },
      overlay(g, pos, T) {
        const d = g.lv.double;
        if (!d || d.phase === 'gone' || !same(d.pos, pos)) return;
        const fade = { appear: ' mr-fadein', leave: ' mr-fadeout' }[d.phase] || '';
        return `<b class="mr-ghost${fade}">${T.at}</b>`;
      },
    },
  ];

  // ---------------------------------------------------------------- engine
  let s;  // run: { depth, p, hp, has, dead, killer, msg, saved } + the level: { map, mons, items, down, up, lv }
  const LEVEL_KEYS = ['map', 'mons', 'items', 'down', 'up', 'lv'];
  const DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  const at = (r, c) => (s.map[r] || '')[c] || ' ';
  const walkable = (r, c) => '.+#'.includes(at(r, c));
  const monAt = (p) => s.mons.find((m) => same(m.pos, p));
  const itemAt = (p) => s.items.find((i) => same(i.pos, p));

  // what levels, monsters and items may use
  const g = {
    get lv() { return s.lv; },
    get player() { return s.p; },
    has: (kind) => !!s.has[kind],
    adjacent: (m) => adjacent(m.pos, s.p),
    chase(m) { m.pos = stepTowards(m.pos, s.p); },
    stepTowards: (from, to, opts) => stepTowards(from, to, opts),
    touching: (p) => Math.max(Math.abs(p[0] - s.p[0]), Math.abs(p[1] - s.p[1])) === 1,
    floorNextTo: (p) => DIRS.slice(0, 4).map(([dr, dc]) => [p[0] + dr, p[1] + dc]).find((n) => at(...n) === '.'),
    tiles(pred) {  // every [r, c] whose map character passes pred(ch, pos)
      const out = [];
      s.map.forEach((row, r) => [...row].forEach((ch, c) => { if (pred(ch, [r, c])) out.push([r, c]); }));
      return out;
    },
    wander(m) {  // one step to a random free neighbouring tile
      const opts = DIRS
        .map(([dr, dc]) => [m.pos[0] + dr, m.pos[1] + dc])
        .filter((n) => walkable(...n) && adjacent(m.pos, n) && !same(n, s.p) && !monAt(n));
      if (opts.length) m.pos = opts[Math.floor(Math.random() * opts.length)];
    },
    hurt(m, dmg) {  // a monster hits the player; worn items may soften it
      for (const k of Object.keys(s.has)) if (ITEMS[k].defend) dmg = ITEMS[k].defend(dmg, m);
      s.hp -= Math.max(0, dmg);
      if (s.hp <= 0) { s.dead = true; s.killer = m.kind; }
      return `The ${m.kind} hits you.`;
    },
    spawn(kind, pos) { s.mons.push({ kind, pos, hp: MONSTERS[kind].hp }); },
    drop(kind, pos) { s.items.push({ kind, pos }); },
    later(ms, fn) {  // run fn after ms and redraw, unless the game restarted meanwhile
      const run = s;
      setTimeout(() => { if (s === run && !s.dead) { fn(); draw(); } }, ms);
    },
    stairsDown(pos) { s.down = pos; },
    stairsUp(pos) { s.up = pos; },
    occupied: (p) => same(p, s.p) || same(p, s.down) || same(p, s.up) || !!monAt(p) || !!itemAt(p),
    setTile([r, c], ch) { s.map[r] = s.map[r].slice(0, c) + ch + s.map[r].slice(c + 1); },
    randomFloor() {  // any free floor or corridor tile
      const free = g.tiles((ch, p) => '.#'.includes(ch) && !g.occupied(p));
      return free[Math.floor(Math.random() * free.length)];
    },
  };

  function enter(depth, arrival) {
    if (s.depth) s.saved[s.depth] = Object.fromEntries(LEVEL_KEYS.map((k) => [k, s[k]]));
    s.depth = depth; s.hp = PLAYER_HP;
    s.p = arrival || LEVELS[depth - 1].start;
    if (s.saved[depth]) Object.assign(s, s.saved[depth]);
    else {
      Object.assign(s, { map: [...MAP], mons: [], items: [], down: null, up: null, lv: {} });
      LEVELS[depth - 1].setup(g, s.p);
    }
    return `Level ${depth}`;
  }

  function reset() {
    s = { has: {}, dead: false, msg: '', saved: {} };
    enter(1);
    draw();
  }

  function stepTowards(from, to, { throughMonsters = false } = {}) {
    // BFS over walkable tiles; monsters block the way unless throughMonsters
    const key = ([r, c]) => r * 100 + c, prev = new Map([[key(from), null]]), q = [from];
    while (q.length) {
      const cur = q.shift();
      if (same(cur, to)) break;
      for (const [dr, dc] of DIRS) {
        const n = [cur[0] + dr, cur[1] + dc];
        if (!walkable(...n) || prev.has(key(n))) continue;
        if (!throughMonsters && monAt(n) && !same(n, to)) continue;
        if (dr && dc && (at(...cur) === '+' || at(...n) === '+')) continue;  // Rogue: no diagonal doors
        prev.set(key(n), cur); q.push(n);
      }
    }
    if (!prev.has(key(to))) return from;  // no way through: stay put
    let step = to;
    while (!same(prev.get(key(step)), from)) step = prev.get(key(step));
    return step;
  }

  function adjacent(a, b) {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1 &&
      !((a[0] !== b[0] && a[1] !== b[1]) && (at(...a) === '+' || at(...b) === '+'));
  }

  // one player action: a step/attack in direction (dr, dc), or a search
  function turn(dr, dc, search = false) {
    emit('played');
    if (s.dead) { reset(); return; }
    const L = LEVELS[s.depth - 1];
    const n = [s.p[0] + dr, s.p[1] + dc];
    if (!search && dr && dc && (at(...s.p) === '+' || at(...n) === '+')) { draw(); return; }
    const log = [], target = !search && monAt(n);
    if (search) {
      if (L.onSearch) log.push(L.onSearch(g));
    } else if (target) {
      target.hp -= Math.max(FISTS, ...Object.keys(s.has).map((k) => ITEMS[k].attack || 0));
      if (target.hp > 0) log.push('You hit.');
      else { log.push(`The ${target.kind} dies!`); s.mons = s.mons.filter((m) => m !== target); }
    } else if (walkable(...n)) {
      s.p = n;
      const item = itemAt(n);
      if (item) {
        const def = ITEMS[item.kind];
        s.items = s.items.filter((i) => i !== item);
        s.has[item.kind] = true;
        log.push(def.onPickup ? def.onPickup(g) : def.msg);
      }
      if (same(n, s.down)) {
        if (s.depth < LEVELS.length) { s.msg = enter(s.depth + 1, n); draw(); return; }
        log.push('Under construction.');
      }
      if (same(n, s.up)) { s.msg = enter(s.depth - 1, s.saved[s.depth - 1].down); draw(); return; }
    } else { draw(); return; }  // bumping a wall costs no turn
    if (L.onTurn) log.push(L.onTurn(g));
    for (const m of [...s.mons]) {
      const def = MONSTERS[m.kind];
      log.push(def.act ? def.act(g, m) : g.adjacent(m) ? g.hurt(m, def.dmg) : g.chase(m));
      if (s.dead) break;
    }
    s.msg = log.filter(Boolean).join(' ');
    draw();
  }

  // ---------------------------------------------------------------- drawing
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function tomb() {  // same height as the map, so the header does not jump
    const cause = `_${s.killer}_${new Date().getFullYear()}_`;
    return [
      '          ____________',
      '         /    REST    \\',
      '        |   IN PEACE   |',
      '        |  killed by a |',
      '     ___|' + cause.padEnd(14, '_') + '|___',
    ].join('\n');
  }

  // Themes: Unix Rogue (plain ASCII) and IBM PC Epyx Rogue (CP437 glyphs, CGA colours).
  // Picked at random per page load; hidden hotkey: t (while the map has focus).
  const THEMES = {
    unix: { at: '@', stairs: '%', tile: (r, c, ch) => esc(ch) },
    epyx: { at: '☺', stairs: '≡', tile: (r, c, ch) => {
      if (ch === '-') {  // corners: a wall below or above makes this a corner
        const down = at(r + 1, c) === '|', up = at(r - 1, c) === '|';
        const left = at(r, c + 1) === '-';  // wall continues right → left-hand corner
        ch = down ? (left ? '╔' : '╗') : up ? (left ? '╚' : '╝') : '═';
        return `<i class="mr-w">${ch}</i>`;
      }
      if (ch === '|') return '<i class="mr-w">║</i>';
      if (ch === '+') return '<i class="mr-w">╬</i>';
      if (ch === '#') return '<i class="mr-c">▒</i>';
      if (ch === '.') return '<i class="mr-f">·</i>';
      return esc(ch);
    } },
  };
  let theme = Math.random() < 0.5 ? 'unix' : 'epyx';
  function setTheme(t) { theme = t; el.dataset.theme = t; emit('theme', t); }

  // ---------------------------------------------------------------- UI widgets
  // Everything around the map lives here, apart from the game. Each widget is a
  // self-contained entry with optional hooks the engine calls through `emit`:
  //   init(ui)          once, at start
  //   message(ui, text) every message the game emits
  //   played(ui)        once, on the player's first action
  //   theme(ui, name)   when the theme changes
  // `ui.widget(name)` reaches another widget; `ui.map` is the map element.
  const WIDGETS = {
    // Messages replace the page title (--more--) for 5 seconds. Once you have played,
    // the title quietly becomes a link (same look) that toggles the message log.
    title: {
      init(ui) { this.el = document.querySelector('h1 .more'); this.text = this.el && this.el.textContent; },
      message(ui, text) {
        if (!this.el) return;
        this.el.textContent = text; this.el.classList.add('log');
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.el.textContent = this.text; this.el.classList.remove('log'); }, 5000);
      },
      played(ui) {
        if (!this.el) return;
        const a = document.createElement('a');
        a.className = this.el.className; a.href = '#'; a.textContent = this.el.textContent;
        a.addEventListener('click', (e) => { e.preventDefault(); ui.widget('log').toggle(ui); });
        this.el.replaceWith(a); this.el = a;
      },
    },

    // Every message, kept for the page's lifetime; opens below the map as a small
    // terminal: a dot grows into a line as wide as the map, opens downwards, and the
    // text fades in. Its first line is never shown in the title.
    log: {
      init() { this.lines = ['Nova Rogue V1']; },
      message(ui, text) {
        this.lines.push(text);
        if (this.box) { this.list.append(this.line(text)); this.list.scrollTop = 1e9; }
      },
      theme(ui, name) { if (this.box) this.box.dataset.theme = name; },
      line(text) { const d = document.createElement('div'); d.textContent = text; return d; },
      toggle(ui) {
        if (this.box) {  // close: the opening animation, backwards
          const box = this.box;
          this.box = null;
          box.classList.add('mr-closing');
          box.addEventListener('animationend', () => box.remove(), { once: true });
          return;
        }
        this.box = document.createElement('div');
        this.list = document.createElement('div');
        this.box.id = 'mr-log'; this.box.dataset.theme = ui.theme;
        this.list.className = 'mr-lines';
        this.list.append(...this.lines.map((t) => this.line(t)));
        this.box.append(this.list);
        ui.map.after(this.box);
        this.list.scrollTop = 1e9;
      },
    },
  };
  const ui = { map: el, get theme() { return theme; }, widget: (name) => WIDGETS[name] };
  let played = false;
  function emit(hook, ...args) {
    if (hook === 'played') { if (played) return; played = true; }
    for (const w of Object.values(WIDGETS)) if (w[hook]) w[hook](ui, ...args);
  }
  const say = (msg) => { if (msg) emit('message', msg); };

  function draw() {
    if (s.dead) {
      say('You die...');
      el.innerHTML = `<span class="mr-tomb">${esc(tomb())}</span>`;
      return;
    }
    const T = THEMES[theme], L = LEVELS[s.depth - 1];
    const rows = s.map.map((row, r) => [...row].map((ch, c) => {
      const p = [r, c], m = monAt(p), item = itemAt(p);
      if (same(p, s.p)) return `<b class="mr-at">${T.at}</b>`;
      if (m) return `<b class="mr-k">${MONSTERS[m.kind].glyph[theme]}</b>`;
      const extra = L.overlay && L.overlay(g, p, T);
      if (extra) return extra;
      if (item) return `<b class="mr-it">${ITEMS[item.kind].glyph[theme]}</b>`;
      if (same(p, s.down) || same(p, s.up)) return `<b class="mr-st">${T.stairs}</b>`;
      return T.tile(r, c, ch);
    }).join(''));
    say(s.msg);
    s.msg = '';
    el.innerHTML = rows.join('\n');
  }

  // ---------------------------------------------------------------- input
  const KEYS = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1],
    h:[0,-1], j:[1,0], k:[-1,0], l:[0,1], y:[-1,-1], u:[-1,1], b:[1,-1], n:[1,1],
    Home:[-1,-1], PageUp:[-1,1], End:[1,-1], PageDown:[1,1], '.':[0,0] };
  el.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 't' || e.key === 'T') {  // hidden: switch theme, costs no turn
      e.preventDefault(); setTheme(theme === 'unix' ? 'epyx' : 'unix'); draw(); return;
    }
    const d = KEYS[e.key];
    if (s.dead) { if (e.key.length === 1 || d) { e.preventDefault(); reset(); } return; }
    if (e.key === 's') { e.preventDefault(); turn(0, 0, true); return; }  // search, as in Rogue
    if (!d) return;
    e.preventDefault();
    turn(...d);
  });
  // tap/click: one step towards the clicked cell; on yourself: search
  el.addEventListener('click', (e) => {
    if (s.dead) { reset(); return; }
    const r = el.getBoundingClientRect();
    const row = Math.floor((e.clientY - r.top) / (r.height / MAP.length));
    const col = Math.floor((e.clientX - r.left) / (r.width / MAP[0].length));
    if (row < 0 || row >= MAP.length) return;
    const dr = Math.sign(row - s.p[0]), dc = Math.sign(col - s.p[1]);
    turn(dr, dc, !dr && !dc);
  });
  emit('init');
  setTheme(theme);
  reset();
})();
