// Unlockable games (index page only; after nav.js, which owns window.progress).
// A new player first gives a name. Games are hidden until their family is unlocked in the
// header game (minirogue.js reports a 'minirogue' event): each new depth past the first
// unlocks one random family, and beating the game (the last depth) the final one.
// ?f=Family filters the cards and the tree to one unlocked family.
(() => {
  const FAMILIES = {  // the menu order (by age) is progress.families in nav.js
    'Rogue': ['rogue36', 'srogue', 'rogue54', 'arogue58', 'urogue', 'roguepc', 'arogue77', 'xrogue'],
    'Moria': ['umoria', 'boss', 'hengband', 'easyband', 'zangband', 'tome2', 'tinyangband', 'nppangband',
      'sangband', 'quickband', 'frogcomposband', 'faangband', 'sil-q', 'tactical-angband'],
    'Hack': ['hack', 'nethack13d', 'slashem', 'zapm', 'prime', 'dynahack', 'evilhack', 'zeldhack', 'nethack50'],
    '2nd Generation': ['larn', 'mag', 'ularn', 'omega', 'alphaman'],
    'Modern': ['avanor', 'crawl-linley', 'decker', 'slimy', 'nlarn', 'alienhack', 'ia', 'lambdarogue', 'prospector', 'traumarl', 'tggw', 'forays', 'grog'],
  };
  const familyOf = {};
  for (const [f, games] of Object.entries(FAMILIES)) for (const g of games) familyOf[g] = f;
  const gameOf = (a) => a && a.getAttribute('href').replace(/\/$/, '');

  const style = document.createElement('style');
  style.textContent = `
.locked { display:none !important; }
#tree li.last::after { bottom:auto; height:18px; }  /* the rail stops at the last visible entry */
#locked-msg { text-align:center; color:var(--dim); margin:32px 16px 64px; }
body.ask-name > :not(#ask-name) { display:none !important; }
#ask-name { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; padding:16px;
  font:20px/1.4 "IBM CGA",monospace; color:var(--text); cursor:text; }
#ask-name input { position:absolute; opacity:0; pointer-events:none; }
#ask-name .cur { color:var(--gold); animation:blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity:0; } }
@media (max-width:520px){ #ask-name { font-size:14px; } }
#unlocking { position:fixed; inset:0; z-index:100; cursor:wait; }
.card.pending, #tree li.dark { visibility:hidden; } #tree li:not(.dark) { visibility:visible; }
.card .back { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center;
  background:repeating-linear-gradient(45deg,#15121a 0 10px,#1b1720 10px 20px); border:2px solid var(--gold); border-radius:inherit;
  font:800 96px Cinzel,serif; color:var(--gold); text-shadow:0 0 24px rgba(224,178,79,.6); }
#announce { position:fixed; inset:0; z-index:101; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:8px; padding:16px; text-align:center; pointer-events:none; background:radial-gradient(ellipse at center,rgba(0,0,0,.75),transparent 70%);
  font:800 clamp(22px,5vw,48px) Cinzel,serif; color:var(--gold); }
#announce span { display:inline-block; animation:letter .5s cubic-bezier(.2,1.6,.4,1) backwards; }
@keyframes letter { from { opacity:0; transform:translateY(.6em) scale(1.8); color:#fff; text-shadow:0 0 24px #ffb45a,0 0 48px #ff7a2a; } }
#announce div { text-shadow:0 0 18px rgba(224,178,79,.55),0 2px 0 #000; }
#tree { position:relative; }
#torch { position:absolute; left:-10%; right:-10%; height:140px; margin-top:-70px; pointer-events:none; z-index:3;
  background:radial-gradient(ellipse at center,rgba(255,170,70,.28),rgba(255,122,42,.1) 45%,transparent 70%); }
#tree li.lit > :not(ul) { animation:lit 1.6s ease-out; }
@keyframes lit { from { color:#ffd27a; text-shadow:0 0 12px rgba(255,170,70,.95),0 0 28px rgba(255,122,42,.6); } }`;
  document.head.append(style);

  // ---- the name prompt (first visit)
  function askName() {
    document.body.classList.add('ask-name');
    const box = document.createElement('div');
    box.id = 'ask-name';
    box.innerHTML = '<label>What is your name? <span class="txt"></span><span class="cur">█</span><input maxlength="24" autocomplete="off" spellcheck="false"></label>';
    const input = box.querySelector('input'), txt = box.querySelector('.txt');
    input.addEventListener('input', () => { txt.textContent = input.value; });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      progress.save({ ...progress.get(), name: input.value.trim() });
      box.remove();
      document.body.classList.remove('ask-name');
      document.getElementById('minirogue')?.focus();
    });
    box.addEventListener('click', () => input.focus());
    document.body.append(box);
    input.focus();
  }

  // ---- filtering: cards and tree entries of unlocked (and chosen) families only
  const msg = document.createElement('p');
  msg.id = 'locked-msg';
  msg.textContent = 'Descend the dungeon above to unlock games.';
  document.querySelector('header').after(msg);

  function apply() {
    const p = progress.get(), unlocked = p.families || [];
    const f = new URLSearchParams(location.search).get('f');
    const shown = unlocked.includes(f) ? [f] : unlocked;
    const visible = (a) => shown.includes(familyOf[gameOf(a)]);
    for (const card of document.querySelectorAll('main .card')) card.classList.toggle('locked', !visible(card.querySelector('a.play')));
    // a tree entry shows if it or anything below it is a visible game; everything once all is unlocked
    const all = !unlocked.includes(f) && unlocked.length === Object.keys(FAMILIES).length;
    for (const li of document.querySelectorAll('#tree li')) {
      li.classList.toggle('locked', !all && ![...li.querySelectorAll('a.n')].some(visible));
    }
    for (const ul of document.querySelectorAll('#tree ul')) {
      const lis = [...ul.children].filter((li) => !li.classList.contains('locked'));
      for (const li of ul.children) li.classList.toggle('last', li === lis.at(-1));
    }
    msg.hidden = unlocked.length > 0;
    document.querySelector('#tree .legend').classList.toggle('locked', !unlocked.length);
  }

  // ---- unlocking, from the header game
  document.addEventListener('minirogue', ({ detail }) => {
    const p = progress.get(), had = (p.families || []).length;
    p.max = detail.max;
    const before = p.deepest || 0;
    if (detail.depth) p.deepest = Math.max(before, detail.depth);
    let earned = Math.max(0, (p.deepest || 1) - 1);  // one per depth past the first
    if (detail.won) p.beaten = true;
    if (p.beaten) earned++;
    p.families = p.families || [];
    const locked = Object.keys(FAMILIES).filter((x) => !p.families.includes(x));
    while (p.families.length < earned && locked.length) {
      p.families.push(locked.splice(Math.floor(Math.random() * locked.length), 1)[0]);
    }
    if (p.families.length === had) progress.save(p); else unlock(p);
  });
  function unlock(p) {  // save p, announcing its new families and animating the games they show
    const names = p.families.filter((x) => !(progress.get().families || []).includes(x));
    const hidden = new Set(document.querySelectorAll('.card.locked, #tree li.locked'));
    progress.save(p);  // apply() runs now: the newly shown cards and entries wait hidden for their animation
    const tree = document.body.classList.contains('tree');
    const fresh = [...document.querySelectorAll(tree ? '#tree li' : 'main .card')].filter((x) => hidden.has(x) && !x.classList.contains('locked'));
    fresh.forEach((x) => x.classList.add(tree ? 'dark' : 'pending'));
    reveal(names, fresh, tree);
  }

  // debug keys: F5 unlocks every family, F10 forgets everything this page stored
  addEventListener('keydown', (e) => {
    if (e.key === 'F5') {
      e.preventDefault();
      const p = progress.get();
      if ((p.families || []).length < progress.families.length) unlock({ ...p, families: [...progress.families] });
    } else if (e.key === 'F10') {
      e.preventDefault();
      if (!confirm('Reset all progress and stored state?')) return;
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
      location.reload();
    }
  });

  // ---- the unlock animation: page blocked, scroll the new games into view, then deal + flip the
  // cards, or sweep a torch down the tree
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const block = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  async function reveal(names, fresh, tree) {
    const shield = document.createElement('div');
    shield.id = 'unlocking';
    document.body.append(shield);
    for (const ev of ['keydown', 'wheel', 'touchmove']) addEventListener(ev, block, { capture: true, passive: false });
    try {
      if (tree || !fresh.length) await announce(names);  // the tree: first the news, then the light
      if (!fresh.length) return;
      if (tree) { await scrollTo(fresh); await torch(fresh); }
      else await deal(fresh, () => announce(names));  // the cards: between dealing and turning
    } finally {
      for (const ev of ['keydown', 'wheel', 'touchmove']) removeEventListener(ev, block, { capture: true });
      shield.remove();
      window.scrollTo({ top: 0, behavior: 'smooth' });  // back to the game, ready to play on
      document.getElementById('minirogue')?.focus({ preventScroll: true });
    }
  }

  async function announce(names) {  // "Rogue family unlocked!" mid screen, letter by letter
    const box = document.createElement('div');
    box.id = 'announce';
    let n = 0;
    box.innerHTML = names.map((f) => '<div>' + [...`${f} family unlocked!`]
      .map((ch) => `<span style="animation-delay:${n++ * 45}ms">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('') + '</div>').join('');
    document.body.append(box);
    await wait(n * 45 + 1400);
    await box.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(1.08)' }], { duration: 400, easing: 'ease-in' }).finished;
    box.remove();
  }

  function scrollTo(els) {  // smoothly bring all of els into view (their top, if they don't fit)
    const rs = els.map((x) => x.getBoundingClientRect());
    const top = Math.min(...rs.map((r) => r.top)), bottom = Math.max(...rs.map((r) => r.bottom)), m = 24;
    const dy = bottom - top + 2 * m > innerHeight ? top - m : top < m ? top - m : bottom > innerHeight - m ? bottom - innerHeight + m : 0;
    if (Math.abs(dy) < 2) return Promise.resolve();
    return new Promise((ok) => {
      addEventListener('scrollend', ok, { once: true });
      setTimeout(ok, 1500);  // no scrollend (older browsers) or it didn't move
      window.scrollBy({ top: dy, behavior: 'smooth' });
    });
  }

  async function deal(cards, between) {  // row by row, left to right, the view following: thrown face-down
    // from the bottom edge, between(), then turned over in the same order
    const top = (c) => Math.round(c.getBoundingClientRect().top + scrollY);
    const rows = [];
    for (const c of [...cards].sort((a, b) => top(a) - top(b) || a.getBoundingClientRect().left - b.getBoundingClientRect().left)) {
      if (rows.length && top(rows.at(-1)[0]) === top(c)) rows.at(-1).push(c); else rows.push([c]);
    }
    const backs = new Map(cards.map((c) => {
      const b = document.createElement('div');
      b.className = 'back';
      b.textContent = '?';
      c.append(b);
      return [c, b];
    }));
    for (const row of rows) {
      await scrollTo(row);
      await Promise.all(row.map((c, i) => {
        const r = c.getBoundingClientRect();
        const dx = innerWidth / 2 - (r.left + r.width / 2) + (Math.random() - 0.5) * 120, dy = innerHeight + 40 - r.top;
        const spin = (Math.random() - 0.5) * 60;
        const a = c.animate([
          { transform: `translate(${dx}px,${dy}px) rotate(${spin}deg) scale(.7)` },
          { transform: `rotate(${-spin / 12}deg)`, offset: 0.85 },
          { transform: 'none' },
        ], { duration: 520, delay: i * 140, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
        c.classList.remove('pending');
        return a.finished;
      }));
    }
    await between();
    for (const row of rows) {
      await scrollTo(row);
      await Promise.all(row.map(async (c, i) => {
        await wait(i * 160);
        await c.animate([{ transform: 'perspective(900px) rotateY(0)' }, { transform: 'perspective(900px) rotateY(90deg)' }],
          { duration: 180, easing: 'ease-in' }).finished;
        backs.get(c).remove();
        await c.animate([{ transform: 'perspective(900px) rotateY(-90deg)' }, { transform: 'perspective(900px) rotateY(0)' }],
          { duration: 220, easing: 'ease-out' }).finished;
      }));
    }
  }


  async function torch(lis) {  // a light sweeps down the tree, lighting the new entries it passes, the view following
    const tree = document.getElementById('tree'), t0 = tree.getBoundingClientRect().top;
    const y = (li) => li.getBoundingClientRect().top - t0 + 12;
    const from = Math.min(...lis.map(y)) - 60, to = Math.max(...lis.map(y)) + 60, speed = 0.5;  // px per ms
    const light = document.createElement('div');
    light.id = 'torch';
    tree.append(light);
    const duration = Math.max(600, (to - from) / speed);
    const sweep = light.animate([{ top: from + 'px', opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.9 }, { top: to + 'px', opacity: 0 }],
      { duration, easing: 'linear' });
    for (const li of lis) {
      setTimeout(() => { li.classList.remove('dark'); li.classList.add('lit'); }, (y(li) - from) / (to - from) * duration);
    }
    const follow = () => {  // the view keeps the light a little above the middle, only ever scrolling down
      if (sweep.playState !== 'running') return;
      const want = light.getBoundingClientRect().top + 70 + scrollY - innerHeight * 0.45;
      if (want > scrollY) window.scrollTo({ top: want, behavior: 'instant' });
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
    await sweep.finished;
    light.remove();
    await wait(1600);  // the last glow fades
    lis.forEach((li) => li.classList.remove('lit'));
  }
  document.addEventListener('progress', apply);

  // family links in the menu filter in place (keeping the cards/tree view)
  document.getElementById('nav')?.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || !a.getAttribute('href').startsWith('./')) return;
    e.preventDefault();
    const url = new URL(a.href);
    history.pushState(null, '', url.pathname + url.search + location.hash);
    apply();
    document.dispatchEvent(new Event('progress'));  // the menu marks the current entry
    document.getElementById('navbtn')?.click();  // close it
  });
  addEventListener('popstate', () => document.dispatchEvent(new Event('progress')));

  apply();
  if (!progress.get().name) askName();
})();
