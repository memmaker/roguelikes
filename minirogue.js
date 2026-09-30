// Header mini-roguelike.
//
// GOLDEN RULE: no log message longer than roughly 5 words. Messages share one line
// in the title; say it short ("Thunk! Bridge extends."), never narrate.
//
// Layout of this file:
//   MAP       the two rooms and corridor every level shares
//   MONSTERS  one self-contained entry per monster type: stats, glyphs, optional behaviour
//   ITEMS     one self-contained entry per item type: glyphs, optional effects
//   EVENTS    named changes to the game state, fired by levers (and anything else)
//   LEVELS    one self-contained entry per level: what is in it, and its own rules
//   engine    movement, combat, stairs, drawing, input; knows nothing about levels
//
// To add a level, append an entry to LEVELS. Stairs down lead to the next entry;
// on the last level they say "Under construction.", so a new level is reachable
// as soon as it exists. Levers are placed by levels (g.lever). Stairs up lead back. A level you leave is remembered as it
// was, and every level change says "Level N". Monsters and items work the same way: add an entry, and give
// it hooks (act, attack, defend) for anything unusual it does.
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
  const PLAYER_HP = 10, FISTS = [1, 2];  // hp is restored on each new level

  // Damage is a number or a [min, max] range, rolled evenly on every hit.
  const roll = (d) => (Array.isArray(d) ? d[0] + Math.floor(Math.random() * (d[1] - d[0] + 1)) : d);
  const dmgText = (d) => (Array.isArray(d) ? d.join('-') : String(d));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];  // a random entry (undefined if none)
  const best = (ds) => ds.reduce((a, d) => ([].concat(d).at(-1) > [].concat(a).at(-1) ? d : a));  // highest max

  // Game memory: what the game has learned about the player, kept for the page's
  // lifetime (across deaths). Levels, monsters and items reach it as g.memory.
  const MEMORY = { name: null, quest: null, color: null };

  // Monsters: hp, dmg (per hit on you), glyph per theme, optional cls (extra CSS class), death (message), dies(g) (hook). Optional act(g, m) replaces the
  // default turn (hit if adjacent, else close in); optional bump(g, m) runs when you walk
  // into it and returns a message, or null to attack as usual. dmg may be a [min, max] range.
  // You have 10 hp, fists do 1-2, the sword 2-4, armour takes 1 off every hit.
  const MONSTERS = {
    bat: { hp: 4, dmg: [1, 2], glyph: { unix: 'B', epyx: 'B' },
      act(g, m) {  // flies erratically, as in Rogue: every third turn a random flap
        m.turns = (m.turns || 0) + 1;
        if (m.turns % 3 === 0) return g.wander(m);
        return g.adjacent(m) ? g.hurt(m, this.dmg) : g.chase(m);
      } },
    snake: { hp: 7, dmg: [1, 3], glyph: { unix: 's', epyx: 's' } },

    // Scurries about at random; bites only if you happen to be next to it.
    rat: { hp: 3, dmg: [1, 2], glyph: { unix: 'r', epyx: 'r' },
      act(g, m) { return g.adjacent(m) && Math.random() < 0.5 ? g.hurt(m, this.dmg) : g.wander(m); } },

    // 2 hp. Its 1 damage gets through any armour.
    slime: { hp: 2, dmg: 1, glyph: { unix: 'j', epyx: 'j' }, cls: 'mr-slime',
      act(g, m) { return g.adjacent(m) ? g.hurt(m, this.dmg, { pierce: true }) : g.chase(m); } },

    // Never moves; every third turn a slime oozes out next to it or next to any slime,
    // until no such tile is free. 4 sword hits (or
    // throws) break it.
    // Breaking it beats the game.
    machine: { hp: 10, glyph: { unix: '&', epyx: '☼' }, cls: 'mr-machine', death: 'The machine breaks!',
      // it bursts: light rays and a rumble, a boom, and only then the win
      dies(g, m) {
        const wreck = g.spawn('machine', m.pos);
        wreck.dying = true; g.monsterFx(wreck, 'mr-burst'); g.lock(); boom();
        g.later(2600, () => { g.remove(wreck); g.unlock(); g.report({ won: true }); });
      },
      act(g, m) {
        if (m.dying) return;
        m.turns = (m.turns || 0) + 1;
        const at = pick([m, ...g.monsters('slime')].map((x) => g.freeNextTo(x.pos)).filter(Boolean));
        if (m.turns % 3 === 0 && at) { g.spawn('slime', at); return 'Blorp.'; }
      } },

    // Guards the bridge. Walking into him starts his three questions (answers go to
    // MEMORY); a walk-away (Esc, or clicking the map) ends them. The third bump is an
    // attack, and from then on he fights: 16 hp, 2-6 per hit (~10% for sword and armour). Answer all three and he
    // walks into the west room to wait by a wall, as soon as you let him past. The
    // colour must be HTML hex (#fcba03); a second wrong colour sends you into the gorge.
    knight: { hp: 16, dmg: [2, 6], glyph: { unix: '@', epyx: '☻' }, cls: 'mr-knight',
      questions: [['name', 'What is your name?'], ['quest', 'What is your quest?'],
        ['color', 'What is your favorite color?']],
      wrong: [  // short: one line in the title (the question stays in the prompt)
        'Hex, peasant!',
        'Not a colour.',
        'Wrong. #RRGGBB!',
        'Nice try.',
        'Blue? #0000ff!',
        'Speak CSS!',
      ],
      bump(g, m) {
        if (m.falling) return '';
        if (m.hostile) return null;
        if (m.passed) return 'The knight nods.';
        m.bumps = (m.bumps || 0) + 1;
        if (m.bumps >= 3) { m.hostile = true; return null; }
        return this.ask(g, m, 0);
      },
      say(g, text) { return g.speak(this.glyph[g.theme], 'mr-knight', text); },  // a speech line in his colour
      ask(g, m, i) {  // asks question i; returns its text as the message
        const [key, question] = this.questions[i];
        g.ask(question, (answer) => {
          if (key === 'color' && !/^#([0-9a-f]{3}){1,2}$/i.test(answer)) {
            m.wrong = (m.wrong || 0) + 1;
            if (m.wrong >= 2) return this.throwOff(g);  // one second try only
            this.ask(g, m, i);
            return this.say(g, pick(this.wrong));
          }
          g.memory[key] = answer;
          if (i + 1 < this.questions.length) return this.ask(g, m, i + 1);
          m.passed = true;
          return this.say(g, 'Right. Off you go.');
        }, () => 'The knight waits.');
        return this.say(g, question);
      },
      throwOff(g) {  // up, spinning, then down into the gorge
        g.lock();
        g.playerFx('mr-thrown');
        g.later(1700, () => g.hidePlayer());
        g.later(2300, () => g.die('knight'));
        return this.say(g, 'Nope');
      },
      act(g, m) {
        if (m.falling) return;
        if (m.hostile) return g.adjacent(m) ? g.hurt(m, this.dmg) : g.chase(m);
        if (!m.passed) return;  // stands his ground
        if (!m.goal) {  // a spot by a wall of the west room, away from the door row
          const spots = g.tiles((ch, [r, c]) => ch === '.' && c < CORRIDOR.from && r !== CORRIDOR.row);
          m.goal = pick(spots);
        }
        const step = g.stepTowards(m.pos, m.goal);
        if (!same(step, g.player)) m.pos = step;  // you are in the way: he waits
      } },
  };

  // Items are picked up by walking over them. Optional hooks:
  //   msg → the pickup message   attack → your damage per hit (best one counts)
  //   defend(dmg) → damage you actually take   cls → extra CSS class
  // In the inventory (i) each item shows as `name`, with Angband's symbol and colour, and
  // its real numbers: (attack) for weapons, [damage taken off a hit] for anything with defend.
  const ITEMS = {
    sword: { msg: 'You wield the sword.', attack: [2, 4], glyph: { unix: ')', epyx: '↑' },
      name: 'a Short Sword', inv: { sym: '|', color: '#ffffff' } },
    armour: { msg: 'You put on leather armour.', defend: (dmg) => dmg - 1,
      glyph: { unix: ']', epyx: '◘' }, name: 'Soft Leather Armour', inv: { sym: '(', color: '#8f5a2b' } },
    sandal: { msg: 'You put on the sandal.', cls: 'mr-sandal', defend: (dmg) => dmg,  // worn; takes nothing off
      glyph: { unix: '[', epyx: '∩' },
      name: 'a Sandal', inv: { sym: ']', color: '#c7a36b' } },
  };

  // Events: named changes to the game state, fired as EVENTS[name](g, source) → message,
  // where source is what fired it (a lever). Anything may change: the map, monsters,
  // items, the player, the level's own state (g.lv). Levels hand out names, so any
  // lever, anywhere, can fire any event.
  const EVENTS = {
    // Stairs up appear at source.at.
    openStairsUp(g, source) { g.stairsUp(source.at); return '*click*'; },

    // You fell into a chasm (after g.fall's animation). For now: death.
    fallIntoChasm(g) { g.die('fall'); },

    // A thrown item came down on a chasm tile (source: {kind, pos}). For now: it is gone.
    itemIntoChasm(g, source) { return `The ${source.kind} is gone.`; },

    // The knight, wherever he stands, is thrown into the gorge and leaves a sandal.
    knightIntoGorge(g) {
      const knight = g.monsters('knight')[0];
      if (knight) {
        knight.falling = true;
        g.monsterFx(knight, 'mr-thrown');
        g.lock();  // a redraw would restart the fall: hold still and watch
        g.later(1700, () => { g.remove(knight); g.drop('sandal', knight.pos); g.unlock(); });
      }
      return '*click*';
    },

    // The corridor as a bridge (drawn brown by the level's overlay): it extends plank by
    // plank from the west door, or retracts back towards it. Items on it fall into the
    // gorge, and so do you if you stand on it (g.fall).
    toggleBridge(g) {
      const lv = g.lv, out = lv.bridgeOut = !lv.bridgeOut, row = CORRIDOR.row, cols = [];
      for (let c = CORRIDOR.from; c <= CORRIDOR.to; c++) cols.push(c);
      if (!out) cols.reverse();
      g.lock();
      cols.forEach((c, i) => g.later(90 * (i + 1), () => {
        g.setTile([row, c], out ? '#' : ':');
        if (!out) {
          g.dropInto([row, c]);
          if (same(g.player, [row, c])) return g.fall();
        }
        if (i === cols.length - 1 && !g.falling) g.unlock();
      }));
      return out ? 'Bridge extends.' : 'Bridge retracts.';
    },
  };

  // Each level: start (first level only), setup(g, arrival) fills the fresh map on the
  // first visit. Optional hooks, each may return a message:
  //   onTurn(g)          after every player action (move, attack, search), before monsters
  //   overlay(g, pos, T) extra glyph drawn at pos (HTML), under the player and monsters
  // `g.lv` is this level's own scratch state; it is kept while you are away.
  // Levers: g.lever(pos, event, options) places one and returns it. Pulling it flips it
  // (/ ↔ \) and fires EVENTS[event] with the lever as source. A visible lever stands on a
  // floor tile: walking into it pulls it, and so does anything thrown at it. Options:
  //   hidden  sits unseen in a wall; searching next to it pulls it
  //   once    fires only the first time
  //   ...     anything else is data for the event (e.g. at: for openStairsUp)
  // `lever.on` is its state (off at first), `lever.pulls` how often it was pulled.
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
      // a pale double of you appears beyond it. It heads for a hidden lever in the east
      // room (unless you found it first: search next to it), which opens stairs up where
      // you came in, and leaves by them. The stairs down in the west room are unfinished.
      setup(g, arrival) {
        g.lv.upAt = arrival;
        // the lever hides in a wall of the east room, next to its floor
        g.lv.lever = g.lever(g.randomWall(([, c]) => c >= 22), 'openStairsUp', { hidden: true, once: true, at: arrival });
        g.stairsDown([1, 3]);
        g.drop('armour', g.randomFloor());
        g.spawn('snake', g.randomFloor());
      },
      onTurn(g) {
        const lv = g.lv, [r, c] = g.player, half = (CORRIDOR.from + CORRIDOR.to) >> 1;
        if (!lv.sealed && r === CORRIDOR.row && c >= CORRIDOR.from && c <= half) {
          for (let wc = half + 1; wc < CORRIDOR.to; wc++) {  // first free tile behind you
            if (g.occupied([r, wc])) continue;
            g.setTile([r, wc], '|');
            lv.sealed = true;
            lv.double = { pos: [r, wc + 1], phase: 'appear' };
            return 'A stone wall slams shut!';
          }
        }
        const d = lv.double;
        if (!d || d.phase === 'gone') return;
        if (d.phase === 'appear') { d.phase = 'walk'; return g.speak(g.playerGlyph, 'mr-ghost', 'So it begins..'); }  // after the fade-in
        if (d.phase === 'leave') { d.phase = 'gone'; return; }
        const pulled = lv.lever.pulls > 0;
        const goal = pulled ? lv.upAt : g.floorNextTo(lv.lever.pos);
        if (!same(d.pos, goal)) {
          const step = g.stepTowards(d.pos, goal, { throughMonsters: true });
          if (!same(step, g.player)) d.pos = step;
          return;
        }
        if (!pulled) return g.pull(lv.lever);
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
    { // 3: the bridge. You arrive in the west room; the knight stands in the corridor,
      // right outside the door. The corridor is drawn brown: it is a bridge over a gorge.
      // A lever hides in a wall of the west room: searching next to it throws the knight
      // into the gorge, and he leaves a sandal behind.
      setup(g, arrival) {
        digGorge(g);
        g.stairsUp(arrival);
        g.spawn('knight', [CORRIDOR.row, CORRIDOR.from]);
        g.stairsDown([2, 26]);
        g.lever(g.randomWall(([, c]) => c < CORRIDOR.from), 'knightIntoGorge', { hidden: true, once: true });
      },
      overlay: (g, p, T) => bridge(g, p, T),
    },
    { // 4: the retracted bridge. You arrive in the east room; the corridor is gorge, and a
      // lever stands in the west room across it. Anything that hits the lever (throw
      // something over the gorge) flips it and fires toggleBridge.
      setup(g, arrival) {
        g.stairsUp(arrival);
        g.stairsDown([3, 3]);
        g.lever([CORRIDOR.row, 2], 'toggleBridge');
        digGorge(g, { bridge: false });
        g.spawn('rat', g.randomFloor(([, c]) => c < CORRIDOR.from));  // waits in the west room
      },
      overlay: (g, p, T) => bridge(g, p, T),
    },
    { // 5: the slime machine, in the room opposite your arrival. It spawns a slime every
      // third turn until something thrown at it breaks it.
      setup(g, arrival) {
        g.stairsUp(arrival);
        const east = arrival[1] < CORRIDOR.from;
        g.spawn('machine', g.randomFloor(([, c]) => (east ? c > CORRIDOR.to : c < CORRIDOR.from)));
      },
    },
  ];
  // the gorge between the rooms (levels 3 and 4): chasm tiles (':') along the corridor,
  // which is left as a bridge over it unless bridge: false
  function digGorge(g, { bridge = true } = {}) {
    for (let c = CORRIDOR.from; c <= CORRIDOR.to; c++) {
      for (const r of [CORRIDOR.row - 1, CORRIDOR.row + 1]) g.setTile([r, c], ':');
      if (!bridge) g.setTile([CORRIDOR.row, c], ':');
    }
  }
  // the brown wooden bridge: corridor tiles without an item on them
  function bridge(g, [r, c], T) {
    if (g.tileAt([r, c]) === '#' && !g.itemAt([r, c])) return `<i class="mr-bridge">${T.tile(r, c, '#')}</i>`;
  }

  // ---------------------------------------------------------------- engine
  let s;  // run: { depth, p, hp, has, dead, killer, msg, saved } + the level: { map, mons, items, down, up, lv }
  const LEVEL_KEYS = ['map', 'mons', 'items', 'levers', 'down', 'up', 'lv'];
  const DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  const at = (r, c) => (s.map[r] || '')[c] || ' ';
  const leverAt = (p) => s.levers.find((l) => !l.hidden && same(l.pos, p));  // visible ones
  const walkable = (r, c) => '.+#'.includes(at(r, c)) && !leverAt([r, c]);
  const monAt = (p) => s.mons.find((m) => same(m.pos, p));
  const itemAt = (p) => s.items.find((i) => same(i.pos, p));

  // what levels, monsters and items may use
  const g = {
    get lv() { return s.lv; },
    // progress for the page (unlock.js): a 'minirogue' event with { depth } or { won }, plus max
    report(detail) {  // progress for the page (unlock.js); held back until a level transition is over
      const fire = () => document.dispatchEvent(new CustomEvent('minirogue', { detail: { ...detail, max: LEVELS.length } }));
      if (transitioning) afterTransition.push(fire); else fire();
    },
    get player() { return s.p; },
    get playerGlyph() { return THEMES[theme].at; },  // @ or ☺, for speech lines
    get theme() { return theme; },
    // a speech line, `glyph: "text"`, shown in the log in the speaker's colour (a CSS class);
    // anything that returns a message may return one, or an array of messages
    speak: (glyph, cls, text) => ({ text: `${glyph}: "${text}"`, cls }),
    memory: MEMORY,
    tileAt: ([r, c]) => at(r, c),
    itemAt,
    ask(question, onAnswer, onCancel) {  // a question in the prompt widget; handlers return a message
      asking = { onAnswer, onCancel };
      emit('ask', question);
    },
    // a yes/no question in the prompt: y/yes/n/no in any case; anything else asks again
    confirm(question, onYes, onNo) {
      g.ask(question, (a) => {
        if (/^y(es)?$/i.test(a)) return onYes();
        if (/^no?$/i.test(a)) return onNo && onNo();
        return g.confirm(question, onYes, onNo);
      }, onNo);
    },
    // you fall into a chasm: spin and shrink away, then EVENTS.fallIntoChasm decides what
    // happens. You stay locked; the event unlocks if you live on.
    fall() {
      s.falling = true; g.lock(); g.playerFx('mr-fall');
      g.later(1000, () => { g.hidePlayer(); s.falling = false; EVENTS.fallIntoChasm(g); });
      return 'Aaaah!';
    },
    get falling() { return !!s.falling; },
    lock() { s.locked = true; },
    unlock() { s.locked = false; },
    monsters: (kind) => s.mons.filter((m) => m.kind === kind),
    remove(m) { s.mons = s.mons.filter((x) => x !== m); },
    monsterFx(m, cls) { m.fx = cls; },            // extra CSS class on a monster's glyph
    randomWall(inside) {  // a random wall tile next to floor, with inside(pos) true (hidden things)
      const walls = g.tiles((ch, p) => '-|'.includes(ch) && inside(p) && !!g.floorNextTo(p));
      return pick(walls);
    },
    playerFx(cls) { s.playerFx = cls; },           // extra CSS class on the player glyph
    hidePlayer() { s.hidden = true; },
    die(killer) { s.dead = true; s.killer = killer; },
    adjacent: (m) => adjacent(m.pos, s.p),
    chase(m) { m.pos = stepTowards(m.pos, s.p); },
    stepTowards,
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
      if (opts.length) m.pos = pick(opts);
    },
    hurt(m, dmg, { pierce = false } = {}) {  // a monster hits the player; worn items may soften it
      dmg = roll(dmg);
      if (!pierce) for (const k of worn()) if (ITEMS[k].defend) dmg = ITEMS[k].defend(dmg);
      if (dmg <= 0) return `Armour stops the ${m.kind}.`;
      s.hp -= dmg;
      if (s.hp <= 0) { s.dead = true; s.killer = m.kind; }
      return `The ${m.kind} hits you.`;
    },
    spawn(kind, pos) { const m = { kind, pos, hp: MONSTERS[kind].hp }; s.mons.push(m); return m; },
    drop(kind, pos) { s.items.push({ kind, pos }); },
    lever(pos, event, options) {
      const lever = { ...options, pos, event, on: false, pulls: 0 };
      s.levers.push(lever);
      return lever;
    },
    pull,
    dropInto(pos) { s.items = s.items.filter((i) => !same(i.pos, pos)); },  // items there fall into the gorge
    later(ms, fn) {  // run fn after ms and redraw, unless the game restarted or the level changed
      const run = s, depth = s.depth;
      setTimeout(() => { if (s === run && s.depth === depth && !s.dead) { fn(); draw(); } }, ms);
    },
    stairsDown(pos) { s.down = pos; },
    stairsUp(pos) { s.up = pos; },
    occupied: (p) => same(p, s.p) || same(p, s.down) || same(p, s.up) || !!monAt(p) || !!itemAt(p) || !!leverAt(p),
    setTile([r, c], ch) { s.map[r] = s.map[r].slice(0, c) + ch + s.map[r].slice(c + 1); },
    freeNextTo(p) {  // a random free walkable neighbour of p (or nothing)
      const opts = DIRS.map(([dr, dc]) => [p[0] + dr, p[1] + dc])
        .filter((n) => walkable(...n) && adjacent(p, n) && !g.occupied(n));
      return pick(opts);
    },
    randomFloor(inside = () => true) {  // any free floor or corridor tile, with inside(pos) true
      const free = g.tiles((ch, p) => '.#'.includes(ch) && !g.occupied(p) && inside(p));
      return pick(free);
    },
  };

  function enter(depth, arrival) {
    if (s.depth) s.saved[s.depth] = Object.fromEntries(LEVEL_KEYS.map((k) => [k, s[k]]));
    if (depth > (s.deepest || 0)) { s.deepest = depth; s.hp = PLAYER_HP; g.report({ depth }); }  // heals once per new depth
    s.depth = depth;
    s.p = arrival || LEVELS[depth - 1].start;
    if (s.saved[depth]) Object.assign(s, s.saved[depth]);
    else {
      Object.assign(s, { map: [...MAP], mons: [], items: [], levers: [], down: null, up: null, lv: {} });
      LEVELS[depth - 1].setup(g, s.p);
    }
    return `Level ${depth}`;
  }

  let asking = null;  // the open question: { onAnswer, onCancel }
  function answer(text, cancelled) {  // from the prompt widget
    const q = asking;
    asking = null;
    const msg = cancelled ? q.onCancel && q.onCancel() : q.onAnswer(text);
    if (!asking) emit('askDone');
    s.msg = msg || '';
    draw();
  }

  function reset() {
    if (asking) { asking = null; emit('askDone'); }
    aiming = null;
    s = { has: {}, dead: false, msg: '', saved: {} };
    enter(1);
    draw();
  }

  function stepTowards(from, to, { throughMonsters = false } = {}) {
    if (same(from, to)) return from;
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

  function stats() {  // for the status widget
    const held = worn().map((k) => ITEMS[k]);
    return {
      level: s.depth, hp: Math.max(0, s.hp), maxHp: PLAYER_HP,
      arm: held.reduce((a, i) => a + (i.defend ? 10 - i.defend(10) : 0), 0),  // damage armour takes off a hit
      dmg: dmgText(best([FISTS, ...held.map((i) => i.attack || 0)])),
      items: Object.keys(s.has).map((kind) => ({ kind, worn: s.has[kind] })),
    };
  }

  // one player action: a step/attack in direction (dr, dc), or a search
  function turn(dr, dc, search = false) {
    emit('played');
    if (s.dead) { reset(); return; }
    const n = [s.p[0] + dr, s.p[1] + dc];
    if (!search && dr && dc && (at(...s.p) === '+' || at(...n) === '+')) { draw(); return; }
    const log = [], target = !search && monAt(n), lever = !search && leverAt(n);
    let bumped;
    if (search) {
      log.push('Searching..');
      for (const l of s.levers) if (l.hidden && g.touching(l.pos)) log.push(pull(l));
    } else if (target && (bumped = MONSTERS[target.kind].bump?.(g, target)) != null) {
      log.push(bumped);  // the monster handled being walked into
    } else if (target) {
      hit(target, roll(best([FISTS, ...worn().map((k) => ITEMS[k].attack || 0)])), 'You hit.', log);
    } else if (lever) {
      log.push('Clunk.', pull(lever));
    } else if (at(...n) === ':') {  // the edge of a chasm: ask first (costs no turn)
      g.confirm('Step into the chasm? (y/n)', () => { s.p = n; return g.fall(); });
      draw(); return;
    } else if (walkable(...n)) {
      s.p = n;
      const item = (dr || dc) && itemAt(n);  // resting on a dropped item leaves it be
      if (item) {
        s.items = s.items.filter((i) => i !== item);
        s.has[item.kind] = true;
        log.push(ITEMS[item.kind].msg);
      }
      if ((dr || dc) && same(n, s.down)) {  // resting on stairs stays put
        if (s.depth < LEVELS.length) { changeLevel(s.depth + 1, n); return; }
        log.push('Under construction.');
      }
      if ((dr || dc) && same(n, s.up)) { changeLevel(s.depth - 1, s.saved[s.depth - 1].down); return; }
    } else { draw(); return; }  // bumping a wall costs no turn
    endTurn(log);
  }

  // the machine's end, in WebAudio noise: a rumble swelling for 1.8s, then the boom
  function boom() {
    try {
      const ac = new AudioContext(), t = ac.currentTime, sr = ac.sampleRate;
      const buf = ac.createBuffer(1, sr * 3, sr), d = buf.getChannelData(0);
      for (let i = 0, b = 0; i < d.length; i++) d[i] = b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;  // brown noise
      const noise = (start, len, freq, gain) => {  // [[time, level], ...] envelope
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), v = ac.createGain();
        src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq;
        v.gain.setValueAtTime(0.0001, t);
        for (const [at, lv] of gain) v.gain.exponentialRampToValueAtTime(lv, t + at);
        src.connect(f).connect(v).connect(ac.destination); src.start(t + start, 0, len);
      };
      noise(0, 1.85, 160, [[1.7, 3], [1.85, 0.0001]]);
      noise(1.8, 1.2, 900, [[1.82, 8], [3, 0.0001]]);
      const o = ac.createOscillator(), v = ac.createGain();  // the thump under it
      o.frequency.setValueAtTime(90, t + 1.8); o.frequency.exponentialRampToValueAtTime(28, t + 2.6);
      v.gain.setValueAtTime(0.9, t + 1.8); v.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      o.connect(v).connect(ac.destination); o.start(t + 1.8); o.stop(t + 2.9);
      setTimeout(() => ac.close(), 3500);
    } catch {}  // no audio: the light show alone
  }

  const worn = () => Object.keys(s.has).filter((k) => s.has[k]);
  function hit(m, dmg, msg, log) {  // you (or something you threw) hit a monster
    m.hp -= dmg;
    if (m.hp > 0) log.push(msg);
    else { log.push(MONSTERS[m.kind].death || `The ${m.kind} dies!`); g.remove(m); MONSTERS[m.kind].dies?.(g, m); }
  }

  function pull(lever) {
    if (lever.once && lever.pulls) return '';
    lever.pulls++; lever.on = !lever.on;
    return EVENTS[lever.event](g, lever);
  }

  // after the player's action: the level's turn, then the monsters', then the redraw
  function endTurn(log) {
    const L = LEVELS[s.depth - 1];
    if (L.onTurn) log.push(L.onTurn(g));
    for (const m of [...s.mons]) {
      const def = MONSTERS[m.kind];
      log.push(def.act ? def.act(g, m) : g.adjacent(m) ? g.hurt(m, def.dmg) : g.chase(m));
      if (s.dead) break;
    }
    s.msg = log;
    draw();
  }

  // Inventory actions (from the inventory widget); each costs a turn. Throw first asks
  // for a direction: the next direction key throws, anything else puts it away.
  let aiming = null;  // the item kind waiting for a throw direction
  function itemAction(kind, action) {
    if (s.dead || s.locked || asking || !(kind in s.has)) return;
    const def = ITEMS[kind];
    if (action === 'equip') { s.has[kind] = true; endTurn([def.msg]); return; }
    if (action === 'unequip') {
      s.has[kind] = false;
      endTurn([`You ${def.attack ? 'put away' : 'take off'} the ${kind}.`]); return;
    }
    if (action === 'drop') {
      if (itemAt(s.p)) { s.msg = 'There is already something here.'; draw(); return; }
      delete s.has[kind]; g.drop(kind, [...s.p]);
      endTurn([`You drop the ${kind}.`]); return;
    }
    if (action === 'throw') { aiming = kind; s.msg = 'Which direction?'; draw(); }
  }
  // It flies (animated, a tile every 40ms) until a wall, over the gorge too; hits the first
  // monster (weapons for their attack, anything else for 1) or lever in its way; and lands
  // on the last free tile it passed (under a monster it hit), or is lost over the gorge.
  // With a target (a clicked tile) it steps towards it and comes down there.
  function throwItem(dr, dc, target) {
    const kind = aiming;
    aiming = null;
    if (!dr && !dc) { s.msg = 'Never mind.'; draw(); return; }
    delete s.has[kind];
    const path = [];
    let p = s.p, lever = null, mon = null;
    for (let i = 0; i < MAP[0].length; i++) {
      if (target && same(p, target)) break;
      if (target) { dr = Math.sign(target[0] - p[0]); dc = Math.sign(target[1] - p[1]); }
      const n = [p[0] + dr, p[1] + dc];
      if ((lever = leverAt(n))) break;  // lands in front
      if (!(walkable(...n) || ' :'.includes(at(...n))) || !adjacent(p, n)) break;
      path.push(n);
      if ((mon = monAt(n))) break;
      p = n;
    }
    const STEP = 40;
    g.lock();
    s.flying = { kind, pos: s.p };
    path.forEach((q, i) => g.later(STEP * (i + 1), () => { s.flying.pos = q; }));
    g.later(STEP * (path.length + 1), () => {
      s.flying = null;
      g.unlock();
      const log = lever ? ['Thunk!', pull(lever)] : [`You throw the ${kind}.`];  // short: the event speaks
      if (mon) hit(mon, roll(ITEMS[kind].attack || 1), `The ${kind} hits the ${mon.kind}.`, log);
      const land = [...path].reverse().find((q) => !itemAt(q)) || [...s.p];
      if (at(...land) === ':') {  // it tumbles down like a falling actor, then the event
        s.flying = { kind, pos: land, fx: 'mr-fall' };
        g.lock();
        g.later(1000, () => {
          s.flying = null;
          g.unlock();
          log.push(EVENTS.itemIntoChasm(g, { kind, pos: land }));
          endTurn(log);
        });
        draw();
        return;
      }
      if (at(...land) === ' ') log.push(`The ${kind} is lost.`);
      else g.drop(kind, land);
      endTurn(log);
    });
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
    unix: { at: '@', stairs: '%', tile: (r, c, ch) => ch === ':' ? '<i class="mr-gorge">:</i>' : esc(ch) },
    epyx: { at: '☺', stairs: '≡', tile: (r, c, ch) => {
      if (ch === ':') return '<i class="mr-gorge">░</i>';
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
  let theme = pick(['unix', 'epyx']);
  function setTheme(t) { theme = t; el.dataset.theme = t; emit('theme', t); }

  // ---------------------------------------------------------------- UI widgets
  // Everything around the map lives here, apart from the game. Each widget is a
  // self-contained entry with optional hooks the engine calls through `emit`:
  //   init(ui)          once, at start
  //   message(ui, parts) every message the game emits: [{ text, cls }], cls the speaker's colour
  //   played(ui)        once, on the player's first action
  //   theme(ui, name)   when the theme changes
  //   status(ui, stats) after every redraw: { level, hp, maxHp, arm, dmg, items } (items in pickup order)
  // `ui.widget(name)` reaches another widget; `ui.map` is the map element.
  const WIDGETS = {
    // Once you have played, the subtitle quietly becomes clickable (same look) and
    // toggles between itself and a Rogue-style status line.
    status: {
      init() { this.el = document.querySelector('header .sub'); this.text = this.el && this.el.textContent; },
      played() {
        if (!this.el) return;
        this.el.addEventListener('click', () => { this.on = !this.on; this.show(); });
      },
      status(ui, stats) { this.stats = stats; if (this.on) this.show(); },
      show() {
        const t = this.stats;
        this.el.textContent = this.on && t
          ? `Level: ${t.level}/${LEVELS.length}  Hp: ${t.hp}(${t.maxHp})  Arm: ${t.arm}  Dmg: ${t.dmg}`
          : this.text;
      },
    },

    // Questions: while the game asks something (ask), the two view buttons below the
    // map turn into the question (left) and an input with a blinking cursor (right).
    // Enter on a non-empty answer replies, Esc walks away; askDone puts the buttons back.
    // Answers are only ever shown as text (textContent / input value), never as HTML.
    prompt: {
      init() { this.buttons = [...document.querySelectorAll('.views button')]; },
      ask(ui, question) {
        const [left, right] = this.buttons;
        if (!left || !right) return;
        if (!this.input) {
          this.saved = left.innerHTML;
          left.dataset.prompt = '';
          right.hidden = true;
          this.input = document.createElement('input');
          this.input.className = 'mr-answer';
          this.input.maxLength = 40;
          this.input.autocomplete = 'off'; this.input.spellcheck = false;
          this.input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); ui.cancel(); }
            if (e.key === 'Enter' && this.input.value.trim()) {
              e.preventDefault();
              const text = this.input.value.trim();
              this.input.value = '';
              ui.answer(text);
            }
          });
          right.after(this.input);
        }
        left.textContent = question;
        this.input.setAttribute('aria-label', question);
        this.input.value = '';
        this.input.focus();
      },
      askDone(ui) {
        if (!this.input) return;
        const [left, right] = this.buttons;
        left.innerHTML = this.saved; delete left.dataset.prompt;
        this.input.remove(); this.input = null;
        right.hidden = false;
        ui.map.focus();
      },
    },

    // Messages replace the page title (--more--) for 5 seconds. Once you have played,
    // the title quietly becomes a link (same look) that toggles the message log.
    title: {
      init(ui) {
        this.el = document.querySelector('h1 .more'); this.text = this.el && this.el.textContent;
        this.h1 = this.el && this.el.closest('h1');
        this.oneLine = this.h1 && this.h1.offsetHeight;  // height of the title on one line
      },
      message(ui, parts) {
        if (!this.el) return;
        const text = parts.map((p) => p.text).join(' ');
        this.el.textContent = text; this.el.classList.add('log');
        this.fit();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.el.textContent = this.text; this.el.classList.remove('log'); this.el.style.fontSize = '';
        }, 5000);
      },
      fit() {  // never wrap (the torches would jump): shrink the text until it fits one line
        this.el.style.fontSize = '';
        let size = parseFloat(getComputedStyle(this.el).fontSize);
        while (this.h1.offsetHeight > this.oneLine * 1.2 && size > 8) this.el.style.fontSize = `${--size}px`;
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
      init() { this.lines = [[{ text: 'Nova Rogue V1' }]]; },
      message(ui, parts) {
        this.lines.push(parts);
        if (this.box) { this.list.append(this.line(parts)); this.list.scrollTop = 1e9; }
      },
      theme(ui, name) { if (this.box) this.box.dataset.theme = name; },
      line(parts) {  // each part in its speaker's colour
        const d = document.createElement('div');
        parts.forEach((p, i) => {
          if (i) d.append(' ');
          d.append(Object.assign(document.createElement('span'), { className: p.cls || '', textContent: p.text }));
        });
        return d;
      },
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

    // Inventory: once you have played, i (on the map) slides a traditional roguelike
    // inventory in from the right: a) letter, Angband symbol and colour, name. While open
    // it takes the keyboard: a letter (or ↑/↓, whose cursor shows from the first press,
    // then Enter/Space) opens the item's menu; ↑/↓ and Enter/Space pick an entry there.
    // Esc closes the menu, then the inventory; i closes it too. Picking an entry acts
    // (a turn) and closes the inventory.
    inventory: {
      status(ui, stats) { this.items = stats.items; if (this.box) this.fill(ui); },
      options: (it) => [it.worn ? ['unequip', 'Unequip'] : ['equip', 'Equip'], ['throw', 'Throw'], ['drop', 'Drop']],
      fill(ui) {
        const div = (cls, text) => Object.assign(document.createElement('div'), { className: cls, textContent: text || '' });
        if (!this.items.length) { this.list.replaceChildren(div('mr-inv-none', 'You have nothing.')); return; }
        this.list.replaceChildren(...this.items.flatMap((it, n) => {
          const def = ITEMS[it.kind], row = div(n === this.cursor ? 'mr-inv-cur' : '');
          const sym = document.createElement('b'), name = document.createElement('span');
          sym.textContent = def.inv.sym; sym.style.color = def.inv.color;
          name.textContent = def.name + (def.attack ? ` (${dmgText(def.attack)})` : '') + (def.defend ? ` [${10 - def.defend(10)}]` : '') +
            (it.worn ? (def.attack ? ' (wielded)' : ' (worn)') : '');
          name.style.color = def.inv.color;
          row.append(`${String.fromCharCode(97 + n)}) `, sym, ' ', name);
          row.addEventListener('click', () => { this.open(ui, n); ui.map.focus(); });
          if (this.menu == null || this.menu.item !== n) return [row];
          const menu = div('mr-inv-menu');
          menu.append(...this.options(it).map(([action, label], m) => {
            const e = div(m === this.menu.cursor ? 'mr-inv-cur' : '', label);
            e.addEventListener('click', () => { this.choose(ui, action); ui.map.focus(); });
            return e;
          }));
          return [row, menu];
        }));
      },
      open(ui, n) { this.cursor = n; this.menu = { item: n, cursor: 0 }; this.fill(ui); },
      choose(ui, action) {
        const kind = this.items[this.menu.item].kind;
        this.toggle(ui);
        ui.itemAction(kind, action);
      },
      key(ui, e) {  // true when the inventory handled the key
        const k = e.key, down = k === 'ArrowDown', up = k === 'ArrowUp', pick = k === 'Enter' || k === ' ';
        if (k === 'Tab') return false;
        e.preventDefault();
        if (this.menu) {
          const n = this.options(this.items[this.menu.item]).length;
          if (k === 'Escape') { this.menu = null; this.fill(ui); }
          else if (up || down) { this.menu.cursor = (this.menu.cursor + (down ? 1 : n - 1)) % n; this.fill(ui); }
          else if (pick) this.choose(ui, this.options(this.items[this.menu.item])[this.menu.cursor][0]);
          return true;
        }
        const len = this.items.length, letter = k.length === 1 ? k.charCodeAt(0) - 97 : -1;
        if (k === 'Escape' || k === 'i') this.toggle(ui);
        else if (letter >= 0 && letter < len) this.open(ui, letter);
        else if ((up || down) && len) {
          this.cursor = this.cursor == null ? 0 : Math.min(len - 1, Math.max(0, this.cursor + (down ? 1 : -1)));
          this.fill(ui);
        } else if (pick && this.cursor != null) this.open(ui, this.cursor);
        return true;
      },
      toggle(ui) {
        if (this.box) {  // slide back out
          const box = this.box;
          this.box = null;
          box.classList.remove('mr-open');
          setTimeout(() => box.remove(), 400);  // after the .35s slide (transitionend is not reliable)
          return;
        }
        this.cursor = null; this.menu = null;
        this.box = document.createElement('aside');
        this.box.id = 'mr-inv'; this.box.setAttribute('aria-label', 'Inventory');
        const head = document.createElement('div');
        head.className = 'mr-inv-head'; head.textContent = 'Inventory';
        this.list = document.createElement('div');
        this.box.append(head, this.list);
        this.fill(ui);
        document.body.append(this.box);
        this.box.getBoundingClientRect();  // start off-screen, then slide in
        this.box.classList.add('mr-open');
      },
    },
  };
  const ui = { map: el, get theme() { return theme; }, widget: (name) => WIDGETS[name],
    answer, cancel: () => answer('', true), itemAction };
  let played = false;
  function emit(hook, ...args) {
    if (hook === 'played') { if (played) return; played = true; }
    for (const w of Object.values(WIDGETS)) if (w[hook]) w[hook](ui, ...args);
  }
  const say = (msg) => {  // msg: a string, a speech line, or an array of them
    const parts = [msg].flat(Infinity).filter(Boolean).map((p) => (typeof p === 'string' ? { text: p } : p));
    if (parts.length) emit('message', parts);
  };

  function draw() {
    if (s.dead) {
      say('You die...');
      el.innerHTML = `<span class="mr-tomb">${esc(tomb())}</span>`;
      return;
    }
    say(s.msg);
    emit('status', stats());
    s.msg = '';
    if (!transitioning) el.innerHTML = html(cells());
  }
  const html = (grid) => grid.map((row) => row.join('')).join('\n');
  function cells() {  // the map as rows of tile HTML
    const T = THEMES[theme], L = LEVELS[s.depth - 1];
    return s.map.map((row, r) => [...row].map((ch, c) => {
      const p = [r, c], m = monAt(p), item = itemAt(p);
      if (same(p, s.p) && !s.hidden) return `<b class="mr-at ${s.playerFx || ''}">${T.at}</b>`;
      if (s.flying && same(p, s.flying.pos)) {  // a thrown item in the air
        const def = ITEMS[s.flying.kind];
        return `<b class="mr-it ${def.cls || ''} ${s.flying.fx || ''}">${def.glyph[theme]}</b>`;
      }
      if (m) return `<b class="mr-k ${MONSTERS[m.kind].cls || ''} ${m.fx || ''}">${MONSTERS[m.kind].glyph[theme]}</b>`;
      const lever = leverAt(p);
      if (lever) return `<b class="mr-lever">${lever.on ? '\\' : '/'}</b>`;
      const extra = L.overlay && L.overlay(g, p, T);
      if (extra) return extra;
      if (item) return `<b class="mr-it ${ITEMS[item.kind].cls || ''}">${ITEMS[item.kind].glyph[theme]}</b>`;
      if (same(p, s.down) || same(p, s.up)) return `<b class="mr-st">${T.stairs}</b>`;
      return T.tile(r, c, ch);
    }));
  }

  // ---------------------------------------------------------------- level transition
  // Every level change, a small reward for getting there: the map collapses to a gold line,
  // LEVEL N flashes on it, and it opens up on the new level. Input is locked meanwhile,
  // and draw() leaves the map to it.
  const H = MAP.length, W = MAP[0].length, SPACE = ' ';
  let transitioning = false, afterTransition = [];
  async function titleCard(from, to, depth, show) {
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const squeeze = (grid, k) => grid.map((row, r) => (Math.abs(r - (H >> 1)) > H / 2 - k ? Array(W).fill(SPACE) : row));
    const line = (text) => {
      const grid = Array.from({ length: H }, () => Array(W).fill(SPACE)), pad = (W - text.length) >> 1;
      grid[H >> 1] = [...'═'.repeat(pad) + text + '═'.repeat(W - pad - text.length)].map((ch) => `<i class="mr-card">${ch}</i>`);
      return grid;
    };
    for (let k = 1; k <= 2; k++) { show(squeeze(from, k)); await wait(90); }
    show(line('')); await wait(120);
    for (let i = 0; i < 2; i++) {  // flash
      show(line(` LEVEL ${depth} `)); await wait(260);
      show(line('')); await wait(90);
    }
    show(line(` LEVEL ${depth} `)); await wait(300);
    for (let k = 2; k >= 1; k--) { show(squeeze(to, k)); await wait(90); }
  }

  function changeLevel(depth, arrival) {
    const from = cells(), run = s;
    transitioning = true; g.lock();
    s.msg = enter(depth, arrival);
    draw();  // the message and status now; the map is the transition's
    titleCard(from, cells(), depth, (grid) => { if (s === run) el.innerHTML = html(grid); }).finally(() => {
      transitioning = false;
      if (s === run) g.unlock();  // else restarted meanwhile
      draw();
      for (const fire of afterTransition.splice(0)) fire();
    });
  }

  // ---------------------------------------------------------------- input
  const KEYS = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1],
    h:[0,-1], j:[1,0], k:[-1,0], l:[0,1], y:[-1,-1], u:[-1,1], b:[1,-1], n:[1,1],
    Home:[-1,-1], PageUp:[-1,1], End:[1,-1], PageDown:[1,1], '.':[0,0] };
  const NUMPAD = { 8:[-1,0], 2:[1,0], 4:[0,-1], 6:[0,1], 7:[-1,-1], 9:[-1,1], 1:[1,-1], 3:[1,1] };
  el.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 't' || e.key === 'T') {  // hidden: switch theme, costs no turn
      e.preventDefault(); setTheme(theme === 'unix' ? 'epyx' : 'unix'); draw(); return;
    }
    const inv = WIDGETS.inventory;
    if (inv.box) { inv.key(ui, e); return; }
    if (played && !asking && !aiming && !s.dead && !s.locked && e.key === 'i') { e.preventDefault(); inv.toggle(ui); return; }  // costs no turn
    const d = KEYS[e.key];
    if (s.dead) { if (e.key.length === 1 || d) { e.preventDefault(); reset(); } return; }
    if (s.locked) { e.preventDefault(); return; }
    if (aiming) {  // throw direction: arrows, hjkl/yubn, or the numpad (NumLock on or off)
      e.preventDefault();
      const aim = NUMPAD[e.key] || d;
      if (aim) throwItem(...aim);
      else if (e.key.length === 1 || e.key === 'Escape') throwItem(0, 0);
      return;
    }
    if (asking) { if (d || e.key === 's') { e.preventDefault(); answer('', true); } return; }  // walk away
    if (e.key === 's') { e.preventDefault(); turn(0, 0, true); return; }  // search, as in Rogue
    if (!d) return;
    e.preventDefault();
    turn(...d);
  });
  // tap/click: one step towards the clicked cell; on yourself: search
  el.addEventListener('click', (e) => {
    if (s.dead) { reset(); return; }
    if (s.locked) return;
    if (asking) { answer('', true); return; }  // walk away from the question
    const r = el.getBoundingClientRect();
    const row = Math.floor((e.clientY - r.top) / (r.height / MAP.length));
    const col = Math.floor((e.clientX - r.left) / (r.width / MAP[0].length));
    if (row < 0 || row >= MAP.length) return;
    const dr = Math.sign(row - s.p[0]), dc = Math.sign(col - s.p[1]);
    if (aiming) { throwItem(dr, dc, [row, col]); return; }  // aimed at that tile; yourself: put away
    turn(dr, dc, !dr && !dc);
  });
  emit('init');
  setTheme(theme);
  reset();
})();
