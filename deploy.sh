#!/bin/sh
# Selection page → ruzzoli.de/roguelikes/. No --delete: game folders live there too.
cd "$(dirname "$0")" && git fetch -q && [ -z "$(git status --porcelain)" ] && [ "$(git rev-parse @)" = "$(git rev-parse @{u})" ] || { echo "commit + push first"; exit 1; }
rsync -rtz --exclude .git --exclude deploy.sh --exclude README.md --exclude server --exclude data --exclude make.py --exclude og.py ./ ruzzoli.de:/var/www/ruzzoli.de/roguelikes/
