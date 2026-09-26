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
