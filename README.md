# roguelikes

Selection page for https://ruzzoli.de/roguelikes/ (later: ladder, chat).
Deploy: `./deploy.sh`. Process: `~/Games/rogue2wasm.md`.

Rule: game cards and every level of the family tree are sorted by release
year, earliest first. Each card and tree `<li>` carries `data-year` (first
release; decade-only dates count as the decade's first year). `./order.py`
checks this (deploy refuses otherwise); `./order.py --fix` re-sorts.
