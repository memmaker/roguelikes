# Stats contract (shared by page, server, games)

Beacon (game → server, fire-and-forget, one per finished run):
  GET /roguelikes/beacon?g=<gamedir>&ev=death|win|quit&name=<char>&killer=<text>&depth=<int>&score=<int>&turns=<int>&lvl=<int>
  nginx answers 204, logs it. Missing fields = omit. `g` = folder name under /roguelikes/ (e.g. rogue54).

Server cron (every 10 min) writes into /var/www/ruzzoli.de/roguelikes/data/:
  visitors.json  {"updated":ISO,"areas":{"index":{"d7":n,"d30":n,"all":n},"shrines":{..},"games":{..}}}
      unique visitor = sha256(ip+UA+salt), bots filtered. index = / + tree; shrines = /shrine/*; games = /<gamedir>/*.
  runs.json      {"updated":ISO,"runs":[{"t":ISO,"g":..,"ev":..,"name":..,"killer":..,"depth":n,"score":n,"turns":n,"lvl":n}]}
      pages compute graveyard, top-10 killers, per-game leaderboards client-side.

Killer art: roguelikes-index/killers/<g>/<slug>.png, slug = killer lowercased, non-alnum → "-". Page falls back to text.

GOLDEN RULE: wins are never lost.
  Every ev=win beacon (any user agent, before dedupe/bot filters) is written by stats.py to
  /var/lib/roguelikes-stats/wins/<g>/<date>-<id>.json: write-once (O_EXCL), mode 0444, fsynced, chattr +i.
  id = hash(visitor+query), so a resent/re-read win maps to the same file and is skipped, never rewritten.
  Nothing may overwrite or delete these files. Leaderboard wins in runs.json come only from them
  (bot-flagged files are kept but not shown); they survive loss of state.json and rotated logs.
