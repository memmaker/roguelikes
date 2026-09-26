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
// as soon as it exists. Monsters and items work the same way: add an entry, and give
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
    kobold: { hp: 20, dmg: 9, glyph: { unix: 'K', epyx: 'K' } },  // 4 sword; kills in 5, in 9 vs armour
  };

  // Items are picked up by walking over them. Optional hooks:
  //   onPickup(g) → message (default: msg)   attack → your damage per hit (best one counts)
  //   defend(dmg, monster) → damage you actually take
  const ITEMS = {
    sword: { msg: 'You wield the sword.', attack: 5, glyph: { unix: ')', epyx: '↑' } },
    armour: { msg: 'You put on leather armour.', defend: (dmg) => dmg - 4,
      glyph: { unix: ']', epyx: '◘' } },
  };

  // Each level: setup(g, arrival) fills the fresh map; optional onMove(g, pos) runs after
  // every player step and may return a message. `g.lv` is scratch state for this level only.
  const LEVELS = [
    { // 1: a sword and a bat; stairs down in the bat's room
      start: [2, 3],
      setup(g) {
        g.spawn('bat', [2, 25]);
        g.drop('sword', [3, 4]);
        g.stairsAt([3, 26]);
      },
    },
    { // 2: arrive where the stairs were, no way up; kobold and armour anywhere.
      // Halfway along the corridor westwards a wall seals the way back.
      setup(g) {
        g.stairsAt([1, 3]);
        g.drop('armour', g.randomFloor());
        g.spawn('kobold', g.randomFloor());
      },
      onMove(g, [r, c]) {
        const half = (CORRIDOR.from + CORRIDOR.to) >> 1;
        if (g.lv.sealed || r !== CORRIDOR.row || c < CORRIDOR.from || c > half) return;
        for (let wc = half + 1; wc <= CORRIDOR.to; wc++) {  // first free tile behind you
          if (g.occupied([r, wc])) continue;
          g.setTile([r, wc], '|');
          g.lv.sealed = true;
          return 'A stone wall grinds shut behind you.';
        }
      },
    },
  ];

  // ---------------------------------------------------------------- engine
  let s;  // run state: { depth, map, p, hp, has, mons, items, stairs, lv, dead, killer, msg }
  const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  const at = (r, c) => (s.map[r] || '')[c] || ' ';
  const walkable = (r, c) => '.+#'.includes(at(r, c));
  const monAt = (p) => s.mons.find((m) => same(m.pos, p));
  const itemAt = (p) => s.items.find((i) => same(i.pos, p));

  // what a level's setup/onMove may use
  const g = {
    get lv() { return s.lv; },
    get player() { return s.p; },
    has: (kind) => !!s.has[kind],
    adjacent: (m) => adjacent(m.pos, s.p),
    chase(m) { m.pos = stepTowardsPlayer(m.pos); },
    wander(m) {  // one step to a random free neighbouring tile
      const opts = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]
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
    stairsAt(pos) { s.stairs = pos; },
    occupied: (p) => same(p, s.p) || same(p, s.stairs) || !!monAt(p) || !!itemAt(p),
    setTile([r, c], ch) { s.map[r] = s.map[r].slice(0, c) + ch + s.map[r].slice(c + 1); },
    randomFloor() {  // any free floor or corridor tile
      const free = [];
      s.map.forEach((row, r) => [...row].forEach((ch, c) => {
        if ('.#'.includes(ch) && !g.occupied([r, c])) free.push([r, c]);
      }));
      return free[Math.floor(Math.random() * free.length)];
    },
  };

  function enter(depth, arrival) {
    Object.assign(s, { depth, map: [...MAP], hp: PLAYER_HP, mons: [], items: [], stairs: null, lv: {} });
    s.p = arrival || LEVELS[depth - 1].start;
    LEVELS[depth - 1].setup(g, s.p);
  }

  function reset() {
    s = { has: {}, dead: false, msg: '' };
    enter(1);
    draw();
  }

  function stepTowardsPlayer(from) {
    // BFS over walkable tiles; monsters block each other
    const key = ([r, c]) => r * 100 + c, prev = new Map([[key(from), null]]), q = [from];
    while (q.length) {
      const cur = q.shift();
      if (same(cur, s.p)) break;
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const n = [cur[0] + dr, cur[1] + dc];
        if (!walkable(...n) || prev.has(key(n)) || (monAt(n) && !same(n, s.p))) continue;
        if (dr && dc && (at(...cur) === '+' || at(...n) === '+')) continue;  // Rogue: no diagonal doors
        prev.set(key(n), cur); q.push(n);
      }
    }
    if (!prev.has(key(s.p))) return from;  // no way through: stay put
    let step = s.p;
    while (!same(prev.get(key(step)), from)) step = prev.get(key(step));
    return step;
  }

  function adjacent(a, b) {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1 &&
      !((a[0] !== b[0] && a[1] !== b[1]) && (at(...a) === '+' || at(...b) === '+'));
  }

  function turn(dr, dc) {
    if (s.dead) { reset(); return; }
    const n = [s.p[0] + dr, s.p[1] + dc];
    if (dr && dc && (at(...s.p) === '+' || at(...n) === '+')) { draw(); return; }
    const log = [], target = monAt(n);
    if (target) {
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
      if (same(n, s.stairs)) {
        if (s.depth < LEVELS.length) { enter(s.depth + 1, n); s.msg = `Level ${s.depth}`; draw(); return; }
        log.push('Under construction.');
      }
      const onMove = LEVELS[s.depth - 1].onMove;
      if (onMove) log.push(onMove(g, n));
    } else { draw(); return; }  // bumping a wall costs no turn
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
  function setTheme(t) { theme = t; el.dataset.theme = t; }
  setTheme(theme);

  // messages replace the page title (--more--) for 5 seconds
  const title = document.querySelector('h1 .more'), TITLE = title && title.textContent;
  let titleTimer;
  function say(msg) {
    if (!title || !msg) return;
    title.textContent = msg; title.classList.add('log');
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => { title.textContent = TITLE; title.classList.remove('log'); }, 5000);
  }

  function draw() {
    if (s.dead) {
      say('You die...');
      el.innerHTML = `<span class="mr-tomb">${esc(tomb())}</span>`;
      return;
    }
    const T = THEMES[theme];
    const rows = s.map.map((row, r) => [...row].map((ch, c) => {
      const p = [r, c], m = monAt(p), item = itemAt(p);
      if (same(p, s.p)) return `<b class="mr-at">${T.at}</b>`;
      if (m) return `<b class="mr-k">${MONSTERS[m.kind].glyph[theme]}</b>`;
      if (item) return `<b class="mr-it">${ITEMS[item.kind].glyph[theme]}</b>`;
      if (same(p, s.stairs)) return `<b class="mr-st">${T.stairs}</b>`;
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
    if (!d) return;
    e.preventDefault();
    turn(...d);
  });
  // tap/click: one step towards the clicked cell
  el.addEventListener('click', (e) => {
    if (s.dead) { reset(); return; }
    const r = el.getBoundingClientRect();
    const row = Math.floor((e.clientY - r.top) / (r.height / MAP.length));
    const col = Math.floor((e.clientX - r.left) / (r.width / MAP[0].length));
    if (row < 0 || row >= MAP.length) return;
    turn(Math.sign(row - s.p[0]), Math.sign(col - s.p[1]));
  });
  reset();
})();
