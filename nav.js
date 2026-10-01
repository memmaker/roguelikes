// Shared sidebar + footer: <script src="nav.js"></script> at the end of <body> on every root page
// (not deferred: the footer's #upd must exist before the page's fetch fills it).
// Player progress (localStorage 'progress'): { name, deepest, max, beaten, families: [unlocked, in unlock order] }.
// unlock.js writes it on the index page and fires 'progress' on document; the menu redraws.
window.progress = {
  get() { try { return JSON.parse(localStorage.getItem('progress')) || {}; } catch { return {}; } },
  families: ['Rogue', 'Hack', 'Moria', '2nd Generation', 'Modern'],  // by age; the menu keeps a ? slot for each locked one
  save(p) { try { localStorage.setItem('progress', JSON.stringify(p)); } catch {} document.dispatchEvent(new Event('progress')); },
};
(()=>{
const s=document.createElement('style');
s.textContent=`
#navbtn{position:fixed;top:12px;left:12px;z-index:50;font:600 20px/1 "IBM Plex Mono",monospace;color:var(--gold);
  background:var(--stone);border:1px solid var(--line);border-radius:6px;padding:8px 11px;cursor:pointer}
#navbtn:hover{border-color:var(--gold)} #navbtn:focus-visible,#nav a:focus-visible{outline:2px solid var(--ember);outline-offset:2px}
#nav{position:fixed;inset:0 auto 0 0;width:min(260px,80vw);z-index:40;background:linear-gradient(#1c1a20,#121015);
  border-right:1px solid var(--line);box-shadow:10px 0 40px rgba(0,0,0,.7);padding:64px 20px 20px;transform:translateX(-105%);
  transition:transform .2s;visibility:hidden}
#nav.open{transform:none;visibility:visible}
#nav a{display:block;font:600 18px Cinzel,serif;color:var(--gold);text-decoration:none;padding:10px 4px;border-bottom:1px solid var(--line)}
#nav a:hover,#nav a[aria-current]{color:var(--ember)}
#nav .slot{display:block;font:600 18px Cinzel,serif;color:var(--dim);padding:10px 4px;border-bottom:1px solid var(--line)}
#nav a:has(+hr),#nav .slot:has(+hr){border-bottom:0}
#nav hr{border:0;height:2px;margin:14px 0;background:linear-gradient(90deg,transparent,var(--gold),transparent);opacity:.6}
#nav .depth{position:absolute;left:20px;bottom:20px;color:var(--dim);font:12px "IBM Plex Mono",monospace}
#nav .pname{color:var(--gold);font:600 14px Cinzel,serif;margin-bottom:4px}
#navshade{position:fixed;inset:0;z-index:35;background:rgba(0,0,0,.5)} #navshade[hidden]{display:none}
footer a{color:var(--gold)}`;
document.head.append(s);
const here=location.pathname.split('/').pop()||'index.html';
document.body.insertAdjacentHTML('afterbegin',`<button id="navbtn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav">☰</button>
<div id="navshade" hidden></div><nav id="nav" aria-label="Site"></nav>`);
document.body.insertAdjacentHTML('beforeend',`<footer>ruzzoli.de · play in your browser, no install · <a href="https://github.com/memmaker/roguelikes/issues">bugs/contact</a><span id="upd"></span></footer>`);
const b=document.getElementById('navbtn'),n=document.getElementById('nav'),sh=document.getElementById('navshade');
function menu(){  // family filters (./?f=Name) come first, then the other pages
  const p=progress.get(), f=here==='index.html'&&new URLSearchParams(location.search).get('f');
  const link=(h,t,cur)=>`<a href="${h}"${cur?' aria-current="page"':''}>${t}</a>`;
  n.innerHTML=link('./','All games',here==='index.html'&&!f)
    +progress.families.map(x=>(p.families||[]).includes(x)?link('./?f='+encodeURIComponent(x),x,f===x):'<span class="slot">?</span>').join('')
    +'<hr>'+[['stats.html','Visitors'],['graveyard.html','Graveyard'],['leaderboard.html','Leaderboards'],['abilities/','Abilities'],['trivia-rogue-family/','Rogue trivia']].map(([h,t])=>link(h,t,h===here)).join('')
    +`<div class="depth">${p.name?`<div class="pname">${p.name.replace(/[&<>"]/g,c=>`&#${c.charCodeAt(0)};`)}</div>`:''}Reached depth ${p.deepest||1} of ${p.max||5}</div>`;
}
menu(); document.addEventListener('progress',menu);
const set=o=>{n.classList.toggle('open',o);sh.hidden=!o;b.setAttribute('aria-expanded',o);if(o)n.querySelector('a').focus();};
b.onclick=()=>set(!n.classList.contains('open')); sh.onclick=()=>set(false);
addEventListener('keydown',e=>{if(e.key==='Escape'&&n.classList.contains('open')){set(false);b.focus();}});
})();
// Game titles from the index cards (single source): {rogue36:"Rogue 3.6", ...}
window.gameNames = fetch('index.html').then(r => r.text()).then(h => {
  const m = {};
  for (const c of new DOMParser().parseFromString(h, 'text/html').querySelectorAll('.card')) {
    const a = c.querySelector('a.play'), t = c.querySelector('h2');
    if (a && t) m[a.getAttribute('href').replace(/\/$/, '')] = t.textContent;
  }
  return m;
}).catch(() => ({}));
