#!/bin/sh
# Selection page → ruzzoli.de/roguelikes/. No --delete: game folders live there too.
cd "$(dirname "$0")" && rsync -rtz --exclude .git --exclude deploy.sh --exclude README.md ./ ruzzoli.de:/var/www/ruzzoli.de/roguelikes/
