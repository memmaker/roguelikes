// Shared sidebar: <script src="nav.js" defer></script> on every root page.
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
#navshade{position:fixed;inset:0;z-index:35;background:rgba(0,0,0,.5)} #navshade[hidden]{display:none}`;
document.head.append(s);
const here=location.pathname.split('/').pop()||'index.html';
document.body.insertAdjacentHTML('afterbegin',`<button id="navbtn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav">☰</button>
<div id="navshade" hidden></div><nav id="nav" aria-label="Site">${[['index.html','Index'],['stats.html','Visitors'],['graveyard.html','Graveyard'],['leaderboard.html','Leaderboards']]
 .map(([h,t])=>`<a href="${h==='index.html'?'./':h}"${h===here?' aria-current="page"':''}>${t}</a>`).join('')}</nav>`);
const b=document.getElementById('navbtn'),n=document.getElementById('nav'),sh=document.getElementById('navshade');
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
