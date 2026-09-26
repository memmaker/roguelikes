// Header mini-roguelike: two rooms, a corridor, a sword and a kestrel.
// Bare hands: 5 hits kill the kestrel; with the sword: 2. The kestrel kills in 5.
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
  const START = { p: [2, 3], k: [2, 25], sword: [3, 4] };  // opposite rooms
  let s;

  function reset() {
    // kestrel: 10 hp, fists do 2 (5 hits), the sword 5 (2 hits); player: 5 hp, 1 per hit
    s = { p: [...START.p], k: [...START.k], kHp: 10, pHp: 5, sword: false,
          swordAt: [...START.sword], dead: false, won: false, msg: '' };
    draw();
  }
  const at = (r, c) => (MAP[r] || '')[c] || ' ';
  const walkable = (r, c) => '.+#'.includes(at(r, c));
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];

  function kestrelStep() {
    // BFS from the kestrel to the player over walkable tiles
    const key = ([r, c]) => r * 100 + c, prev = new Map([[key(s.k), null]]), q = [s.k];
    while (q.length) {
      const cur = q.shift();
      if (same(cur, s.p)) break;
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const n = [cur[0] + dr, cur[1] + dc];
        if (!walkable(...n) || prev.has(key(n))) continue;
        // like Rogue: no diagonal moves through doors
        if (dr && dc && (at(...cur) === '+' || at(...n) === '+')) continue;
        prev.set(key(n), cur); q.push(n);
      }
    }
    let step = s.p;
    while (prev.get(key(step)) && !same(prev.get(key(step)), s.k)) step = prev.get(key(step));
    return step;
  }

  function adjacent(a, b) {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1 &&
      !((a[0] !== b[0] && a[1] !== b[1]) && (at(...a) === '+' || at(...b) === '+'));
  }

  function turn(dr, dc) {
    if (s.dead || s.won) { reset(); return; }
    const n = [s.p[0] + dr, s.p[1] + dc];
    const diagDoor = dr && dc && (at(...s.p) === '+' || at(...n) === '+');
    s.msg = '';
    if (same(n, s.k) && !diagDoor) {
      s.kHp -= s.sword ? 5 : 2;
      if (s.kHp <= 0) {
        s.won = true; s.msg = 'The kestrel dies!'; draw(); return;
      }
      s.msg = 'You hit.';
    } else if (walkable(...n) && !diagDoor) {
      s.p = n;
      if (s.swordAt && same(n, s.swordAt)) {
        s.swordAt = null; s.sword = true;
        s.msg = 'You wield the sword.';
      }
    } else { draw(); return; } // bumping a wall costs no turn
    if (adjacent(s.k, s.p)) {
      s.msg = (s.msg ? s.msg + ' ' : '') + 'The kestrel hits you.';
      if (--s.pHp <= 0) s.dead = true;
    } else {
      const k = kestrelStep();
      if (!same(k, s.p)) s.k = k;
    }
    draw();
  }

  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function tomb() {  // same height as the map, so the header does not jump
    const year = String(new Date().getFullYear());
    return [
      '          ____________',
      '         /    REST    \\',
      '        |   IN PEACE   |',
      '        |  killed by a |',
      '     ___|_kestrel_' + year + '_|___',
    ].join('\n');
  }

  // Themes: Unix Rogue (plain ASCII) and IBM PC Epyx Rogue (CP437 glyphs, CGA colours).
  // Picked at random per page load; hidden hotkey: t (while the map has focus).
  const THEMES = {
    unix: { at: '@', k: 'k', sword: ')', tile: (r, c, ch) => esc(ch) },
    epyx: { at: '\u263A', k: 'K', sword: '\u2191', tile: (r, c, ch) => {
      if (ch === '-') {  // corners: a wall below or above makes this a corner
        const down = at(r + 1, c) === '|', up = at(r - 1, c) === '|';
        const left = at(r, c + 1) === '-';  // wall continues right → left-hand corner
        ch = down ? (left ? '\u2554' : '\u2557') : up ? (left ? '\u255A' : '\u255D') : '\u2550';
        return `<i class="mr-w">${ch}</i>`;
      }
      if (ch === '|') return '<i class="mr-w">\u2551</i>';
      if (ch === '+') return '<i class="mr-w">\u256C</i>';
      if (ch === '#') return '<i class="mr-c">\u2592</i>';
      if (ch === '.') return '<i class="mr-f">\u00B7</i>';
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
    const rows = MAP.map((row, r) => [...row].map((ch, c) => {
      const p = [r, c], T = THEMES[theme];
      if (same(p, s.p)) return `<b class="mr-at">${T.at}</b>`;
      if (!s.won && same(p, s.k)) return `<b class="mr-k">${T.k}</b>`;
      if (s.swordAt && same(p, s.swordAt)) return `<b class="mr-it">${T.sword}</b>`;
      return T.tile(r, c, ch);
    }).join(''));
    say(s.msg);
    el.innerHTML = rows.join('\n');
  }

  const KEYS = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1],
    h:[0,-1], j:[1,0], k:[-1,0], l:[0,1], y:[-1,-1], u:[-1,1], b:[1,-1], n:[1,1],
    Home:[-1,-1], PageUp:[-1,1], End:[1,-1], PageDown:[1,1], '.':[0,0] };
  el.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 't' || e.key === 'T') {  // hidden: switch theme, costs no turn
      e.preventDefault(); setTheme(theme === 'unix' ? 'epyx' : 'unix'); draw(); return;
    }
    const d = KEYS[e.key];
    if (s.dead || s.won) { if (e.key.length === 1 || d) { e.preventDefault(); reset(); } return; }
    if (!d) return;
    e.preventDefault();
    turn(...d);
  });
  // tap/click: one step towards the clicked cell
  el.addEventListener('click', (e) => {
    if (s.dead || s.won) { reset(); return; }
    const r = el.getBoundingClientRect();
    const row = Math.floor((e.clientY - r.top) / (r.height / MAP.length));
    const col = Math.floor((e.clientX - r.left) / (r.width / MAP[0].length));
    if (row < 0 || row >= MAP.length) return;
    turn(Math.sign(row - s.p[0]), Math.sign(col - s.p[1]));
  });
  reset();
})();
