# roguelikes

Selection page for https://ruzzoli.de/roguelikes/ (later: ladder, chat).
Deploy: `./deploy.sh`. Process: `~/Games/rogue2wasm.md`.

Rule: game cards and every level of the family tree are sorted by release
year, earliest first. `years.json` is the single source of truth: per game the release year of the
historical version the played build is based on (not a modern
restoration or fork of it) and a source URL. `./order.py --fix` writes those years
(linked to the source, unstyled) into the cards and the matching tree entries
and re-sorts; `./order.py` checks (also that no tree entry predates its parent),
and deploy refuses otherwise. Tree entries
without a game of their own take their year (and optional label such as
"1990s") from the `tree` section of years.json.

Header mini-roguelike: `minirogue.js`. Font `fonts/Web437_IBM_CGA.woff` is from
VileR's Oldschool PC Font Pack (int10h.org), CC BY-SA 4.0.
