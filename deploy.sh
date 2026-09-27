#!/bin/sh
# Selection page → ruzzoli.de/roguelikes/. No --delete: game folders live there too.
cd "$(dirname "$0")" && ./order.py && git fetch -q && [ -z "$(git status --porcelain)" ] && [ "$(git rev-parse @)" = "$(git rev-parse @{u})" ] || { echo "commit + push first"; exit 1; }
# minirogue.js ships minified: no comments or readable names to spoil the game
build=$(mktemp -d) && trap 'rm -rf "$build"' EXIT
npx --yes terser@5 minirogue.js -c passes=2 -m --toplevel -o "$build/minirogue.js" || { echo "minify failed (needs node/npx)"; exit 1; }
rsync -rtz --exclude minirogue.js --exclude .git --exclude deploy.sh --exclude README.md --exclude server --exclude data --exclude make.py --exclude og.py --exclude order.py --exclude years.json ./ ruzzoli.de:/var/www/ruzzoli.de/roguelikes/
rsync -tz "$build/minirogue.js" ruzzoli.de:/var/www/ruzzoli.de/roguelikes/minirogue.js
# the one rvip-wm.js / rvip-sound.js every game loads from ../
rsync -tz "$HOME/Games/rvip-tools/web/rvip-wm.js" "$HOME/Games/rvip-tools/web/rvip-sound.js" ruzzoli.de:/var/www/ruzzoli.de/roguelikes/
