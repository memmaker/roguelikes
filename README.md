# roguelikes

Selection page for https://ruzzoli.de/roguelikes/ (later: ladder, chat).
Deploy: `./deploy.sh`. Process: `~/Games/rogue2wasm.md`.

Rule: game cards and every level of the family tree are sorted by release
year, earliest first. `years.json` is the single source of truth: per game the release year of the
historical version the played build is based on (not a modern
restoration or fork of it) and a source URL. `./order.py --fix` writes those years
(linked to the source, unstyled) into the cards and the matching tree entries
and re-sorts; `./order.py` checks, and deploy refuses otherwise. Tree entries
without a game of their own keep a hand-set `data-year`.
