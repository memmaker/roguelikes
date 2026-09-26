#!/usr/bin/env python3
"""Social link previews: Open Graph/Twitter tags + a 1200x630 screenshot per page.
Re-run after adding a page or game: ./og.py (needs Google Chrome; shots come from the live site)."""
import html, re, subprocess, pathlib

BASE = 'https://ruzzoli.de/roguelikes/'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
here = pathlib.Path(__file__).parent
index = (here / 'index.html').read_text()
n = index.count('class="play" href=')

pages = {  # file: (title, description[, image]); no image = screenshot of the live page
    'index.html': ('--More-- · classic roguelikes in your browser',
                   f'{n} classic roguelikes, from Rogue and Hack to NetHack, Angband and Crawl, playable in your browser with tiles, sound and auto-explore. Plus a family tree of the genre.'),
    'stats.html': ('Visitors · --More--', 'How many adventurers found their way into the dungeons, the shrines and the family tree.'),
    'graveyard.html': ('Graveyard · --More--', 'Fallen heroes of every game and the ten deadliest monsters of the roguelike world, ranked by kills.'),
    'leaderboard.html': ('Leaderboards · --More--', 'Top ten per game: highest scores, deepest dives and quickest wins.'),
}
# Shrines: title from <title>, description from the game's card text on the index page.
for card in re.findall(r'<div class="card">.*?</div></div>', index, re.S):
    m = re.search(r'href="shrine/([^"]+)"', card)
    if not m: continue
    t = re.search(r'<title>(.*?)</title>', (here / 'shrine' / m[1]).read_text())[1]
    pages['shrine/' + m[1]] = (html.unescape(t), html.unescape(re.sub('<[^>]+>', '', re.search(r'<p>(.*?)</p>', card, re.S)[1])).strip(),
                               re.search(r'<img src="([^"]+)"', card)[1])

for f, (title, desc, *card) in pages.items():
    url = BASE + ('' if f == 'index.html' else f)
    if card:
        img = card[0]
    else:
        img = 'og/' + f.replace('.html', '.png')
        (here / img).unlink(missing_ok=True)
        try:  # ponytail: Chrome writes the shot in ~3s, then its updater lingers; kill after 15s
            subprocess.run([CHROME, '--headless=new', '--user-data-dir=/tmp/og-chrome', '--hide-scrollbars', '--window-size=1200,630',
                          '--virtual-time-budget=4000', f'--screenshot={here / img}', url], capture_output=True, timeout=15)
        except subprocess.TimeoutExpired: pass
        assert (here / img).exists(), f'no screenshot for {url}'
    e = lambda s: html.escape(s, quote=True)
    tags = (f'<!--og-->\n<meta name="description" content="{e(desc)}">\n'
            f'<meta property="og:type" content="website">\n<meta property="og:site_name" content="--More--">\n'
            f'<meta property="og:title" content="{e(title)}">\n<meta property="og:description" content="{e(desc)}">\n'
            f'<meta property="og:url" content="{url}">\n<meta property="og:image" content="{BASE}{img}">\n'
            + (f'<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n' if not card else '')
            + f'<meta name="twitter:card" content="summary_large_image">\n<!--/og-->\n')
    p = here / f
    s = re.sub(r'<!--og-->.*?<!--/og-->\n', '', p.read_text(), flags=re.S)
    p.write_text(s.replace('</title>\n', '</title>\n' + tags, 1))
    print(f, img)

# Gameplay pages live in each game's repo (web/index.html); they reuse the card image.
repo = {re.search(r'roguelikes/([\w-]+)', d.read_text())[1]: d.parent / 'index.html'
        for d in here.parent.glob('*/web/deploy.sh') if re.search(r'roguelikes/([\w-]+)', d.read_text())}
for card in re.findall(r'<div class="card">.*?</div></div>', index, re.S):
    g = re.search(r'class="play" href="([^"/]+)/"', card)
    if not g or g[1] not in repo or not repo[g[1]].exists(): print('skip', g and g[1]); continue
    name = html.unescape(re.search(r'<h2>(.*?)</h2>', card)[1])
    desc = f'Play {name} in your browser. ' + html.unescape(re.sub('<[^>]+>', '', re.search(r'<p>(.*?)</p>', card, re.S)[1])).strip()
    e = lambda s: html.escape(s, quote=True)
    tags = (f'<!--og-->\n<meta name="description" content="{e(desc)}">\n<meta property="og:type" content="website">\n'
            f'<meta property="og:site_name" content="--More--">\n<meta property="og:title" content="{e(name)} · --More--">\n'
            f'<meta property="og:description" content="{e(desc)}">\n<meta property="og:url" content="{BASE}{g[1]}/">\n'
            f'<meta property="og:image" content="{BASE}{re.search(chr(60)+"img src=\"([^\"]+)\"", card)[1]}">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n<!--/og-->\n')
    p = repo[g[1]]
    s = re.sub(r'<!--og-->.*?<!--/og-->\n', '', p.read_text(), flags=re.S)
    if '</title>\n' not in s: print('no </title>', p); continue
    p.write_text(s.replace('</title>\n', '</title>\n' + tags, 1))
    print(p)
