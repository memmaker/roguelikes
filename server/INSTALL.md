# Install stats pipeline on ruzzoli.de

Logs are root/adm-only (0640 www-data:adm), so cron runs as root.

```sh
scp server/stats.py server/nginx-beacon.conf ruzzoli.de:/tmp/
ssh ruzzoli.de
sudo install -m 755 /tmp/stats.py /usr/local/bin/roguelikes-stats.py
sudo install -m 644 /tmp/nginx-beacon.conf /etc/nginx/snippets/roguelikes-beacon.conf
sudo install -d -m 700 /var/lib/roguelikes-stats
sudo /usr/local/bin/roguelikes-stats.py --test
# add inside the `listen 443` server{} block, e.g. right above `location ^~ /roguelikes/ {`:
#     include /etc/nginx/snippets/roguelikes-beacon.conf;
sudo sed -i 's|^    location ^~ /roguelikes/ {|    include /etc/nginx/snippets/roguelikes-beacon.conf;\n&|' /etc/nginx/sites-enabled/ruzzoli.de.conf
sudo nginx -t && sudo systemctl reload nginx
echo '*/10 * * * * root /usr/local/bin/roguelikes-stats.py' | sudo tee /etc/cron.d/roguelikes-stats
sudo /usr/local/bin/roguelikes-stats.py && curl -sI https://ruzzoli.de/roguelikes/data/visitors.json | head -1
curl -s -o /dev/null -w '%{http_code}\n' 'https://ruzzoli.de/roguelikes/beacon'   # 204 (no g/ev, so not recorded as a run)
```

State (salt, per-day hashed visitor ids, runs) lives in /var/lib/roguelikes-stats/state.json; delete it to reset.
