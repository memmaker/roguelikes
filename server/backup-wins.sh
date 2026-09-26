#!/bin/sh
# Push new win files to github.com/memmaker/roguelikes-wins (deploy key /root/.ssh/roguelikes-wins, this repo only).
# GOLDEN RULE: copy-only. rsync --ignore-existing, no --delete; git never removes a file.
set -e
B=/var/lib/roguelikes-stats/backup
export GIT_SSH_COMMAND="ssh -i /root/.ssh/roguelikes-wins -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
[ -d $B/.git ] || { git init -q -b main $B; git -C $B remote add origin git@github.com:memmaker/roguelikes-wins.git; }
mkdir -p $B/wins
rsync -r --ignore-existing /var/lib/roguelikes-stats/wins/ $B/wins/
cd $B
git add -A wins
git diff --cached --quiet && [ -z "$(git log origin/main..main 2>/dev/null)" ] && git rev-parse -q --verify main >/dev/null && exit 0
git -c user.name=ruzzoli.de -c user.email=roguelikes@ruzzoli.de commit -qm "wins $(date -u +%FT%TZ)" --allow-empty
git push -q origin main
