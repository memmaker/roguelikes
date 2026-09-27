# Install stats pipeline on ruzzoli.de

Logs are root/adm-only (0640 www-data:adm), so cron runs as root.

```sh
scp server/stats.py server/nginx-beacon.conf server/nginx-beacon-zone.conf server/roguelikes-stats.service server/roguelikes-stats.path ruzzoli.de:/tmp/
ssh ruzzoli.de
sudo install -m 755 /tmp/stats.py /usr/local/bin/roguelikes-stats.py
sudo install -m 644 /tmp/nginx-beacon.conf /etc/nginx/snippets/roguelikes-beacon.conf
sudo install -m 644 /tmp/nginx-beacon-zone.conf /etc/nginx/conf.d/roguelikes-beacon-zone.conf
sudo install -d -m 700 /var/lib/roguelikes-stats
sudo /usr/local/bin/roguelikes-stats.py --test
# add inside the `listen 443` server{} block, e.g. right above `location ^~ /roguelikes/ {`:
#     include /etc/nginx/snippets/roguelikes-beacon.conf;
sudo sed -i 's|^    location ^~ /roguelikes/ {|    include /etc/nginx/snippets/roguelikes-beacon.conf;\n&|' /etc/nginx/sites-enabled/ruzzoli.de.conf
sudo nginx -t && sudo systemctl reload nginx
# every beacon triggers a run (systemd path unit); cron every 10 min is the backstop (visitor counts, log rotation)
sudo install -m 644 /tmp/roguelikes-stats.service /tmp/roguelikes-stats.path /etc/systemd/system/
sudo touch /var/lib/roguelikes-stats/beacon.log && sudo systemctl daemon-reload && sudo systemctl enable --now roguelikes-stats.path
echo '*/10 * * * * root flock -w 120 /run/lock/roguelikes-stats.lock /usr/local/bin/roguelikes-stats.py' | sudo tee /etc/cron.d/roguelikes-stats
sudo /usr/local/bin/roguelikes-stats.py && curl -sI https://ruzzoli.de/roguelikes/data/visitors.json | head -1
curl -s -o /dev/null -w '%{http_code}\n' 'https://ruzzoli.de/roguelikes/beacon'   # 204 (no g/ev, so not recorded as a run)
```

Overlap: nginx appends beacon lines atomically; runs are serialised by the flock (a trigger during a run
queues one more run); runs.json is replaced atomically, so pages see the old or the new file, never a partial one.
Check: `curl -s 'https://ruzzoli.de/roguelikes/beacon?g=x&ev=quit'` then `systemctl status roguelikes-stats` shows a run.

State (salt, per-day hashed visitor ids, runs) lives in /var/lib/roguelikes-stats/state.json; delete it to reset.
