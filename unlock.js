// Unlockable games (index page only; after nav.js, which owns window.progress).
// A new player first gives a name. Games are hidden until their family is unlocked in the
// header game (minirogue.js reports a 'minirogue' event): each new depth past the first
// unlocks one random family, and beating the game (the last depth) the final one.
// ?f=Family filters the cards and the tree to one unlocked family.
(() => {
  const FAMILIES = {
    'Rogue': ['rogue36', 'srogue', 'rogue54', 'arogue58', 'urogue', 'roguepc', 'arogue77', 'xrogue'],
    'Moria': ['umoria', 'boss', 'hengband', 'easyband', 'zangband', 'tome2', 'tinyangband', 'nppangband',
      'sangband', 'quickband', 'frogcomposband', 'faangband', 'sil-q', 'tactical-angband'],
    'Hack': ['hack', 'nethack13d', 'slashem', 'zapm', 'prime', 'dynahack', 'evilhack', 'zeldhack', 'nethack50'],
    '2nd Generation': ['larn', 'mag', 'ularn', 'omega', 'alphaman'],
    'Modern': ['crawl-linley', 'decker', 'nlarn', 'ia', 'lambdarogue', 'prospector', 'tggw', 'forays', 'grog'],
  };
  const familyOf = {};
  for (const [f, games] of Object.entries(FAMILIES)) for (const g of games) familyOf[g] = f;
  const gameOf = (a) => a && a.getAttribute('href').replace(/\/$/, '');

  const style = document.createElement('style');
  style.textContent = `
.locked { display:none !important; }
#locked-msg { text-align:center; color:var(--dim); margin:32px 16px 64px; }
body.ask-name > :not(#ask-name) { display:none !important; }
#ask-name { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; padding:16px;
  font:20px/1.4 "IBM CGA",monospace; color:var(--text); cursor:text; }
#ask-name input { position:absolute; opacity:0; pointer-events:none; }
#ask-name .cur { color:var(--gold); animation:blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity:0; } }
@media (max-width:520px){ #ask-name { font-size:14px; } }`;
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
    msg.hidden = unlocked.length > 0;
    document.querySelector('#tree .legend').classList.toggle('locked', !unlocked.length);
  }

  // ---- unlocking, from the header game
  document.addEventListener('minirogue', ({ detail }) => {
    const p = progress.get();
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
    progress.save(p);
  });
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
