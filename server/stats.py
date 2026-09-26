#!/usr/bin/env python3
"""Build roguelikes data/visitors.json + data/runs.json from nginx logs (see CONTRACT.md).
Usage: stats.py [--logs GLOB] [--out DIR] [--state FILE] | stats.py --test"""
import glob, gzip, hashlib, json, os, re, secrets, sys, tempfile
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, parse_qsl

LOGS = "/var/log/nginx/access.log*"
OUT = "/var/www/ruzzoli.de/roguelikes/data"
STATE = "/var/lib/roguelikes-stats/state.json"
MAX_RUNS = 2000
LINE = re.compile(r'(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"')
BOT = re.compile(r'bot|crawl|spider|slurp|scan|curl|wget|python|http|java|libwww|headless|preview|fetch|feed|monitor|facebookexternalhit|claude\/|^-?$', re.I)
INTS = ("depth", "score", "turns", "lvl")


def lines(pattern):
    for f in sorted(glob.glob(pattern)):
        if f.endswith(".gz"):
            with gzip.open(f, "rt", errors="replace") as fh: yield from fh
        else:
            with open(f, errors="replace") as fh: yield from fh


def area(path):
    p = path[len("/roguelikes/"):].split("/")
    if len(p) == 1: return "index"
    if p[0] == "shrine": return "shrines"
    if p[0] in ("data", "beacon"): return None
    return "games"


def update(state, pattern):
    salt = state.setdefault("salt", secrets.token_hex(16))
    days, runs = state.setdefault("days", {}), state.setdefault("runs", [])
    P = lambda iso: datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    times = {}  # k -> accepted run times, for 60 s dedupe
    for r in runs: times.setdefault(r["k"], []).append(P(r["t"]))
    seen = {(r["k"], r["t"]) for r in runs}
    for ln in lines(pattern):
        m = LINE.match(ln)
        if not m: continue
        ip, ts, method, url, status, ua = m.groups()
        if not url.startswith("/roguelikes/") or status[0] not in "23" or BOT.search(ua): continue
        t = datetime.strptime(ts, "%d/%b/%Y:%H:%M:%S %z").astimezone(timezone.utc)
        who = hashlib.sha256((ip + ua + salt).encode()).hexdigest()[:16]
        u = urlsplit(url)
        if u.path == "/roguelikes/beacon":
            q = dict(parse_qsl(u.query))
            if not q.get("g") or q.get("ev") not in ("death", "win", "quit"): continue
            k = hashlib.sha256((who + u.query).encode()).hexdigest()[:16]
            iso = t.strftime("%Y-%m-%dT%H:%M:%SZ")
            if (k, iso) in seen: continue  # already ingested on a previous run
            if any(abs((t - p).total_seconds()) < 60 for p in times.get(k, ())): continue
            run = {"t": iso, "k": k}
            for f in ("g", "ev", "name", "killer"):
                if f in q: run[f] = q[f][:80]
            for f in INTS:
                if q.get(f, "").lstrip("-").isdigit(): run[f] = int(q[f])
            runs.append(run); seen.add((k, iso)); times.setdefault(k, []).append(t)
            continue
        a = area(u.path)
        if a:
            d = days.setdefault(t.strftime("%Y-%m-%d"), {})
            s = d.setdefault(a, [])
            if who not in s: s.append(who)  # ponytail: list scan, set per run if traffic grows
    runs.sort(key=lambda r: r["t"])
    del runs[:-MAX_RUNS]


def build(state, now):
    areas = {}
    for a in ("index", "shrines", "games"):
        c = {"d7": set(), "d30": set(), "all": set()}
        for day, d in state.get("days", {}).items():
            ids = d.get(a, [])
            age = (now.date() - datetime.strptime(day, "%Y-%m-%d").date()).days
            c["all"].update(ids)
            if age < 30: c["d30"].update(ids)
            if age < 7: c["d7"].update(ids)
        areas[a] = {k: len(v) for k, v in c.items()}
    upd = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    return ({"updated": upd, "areas": areas},
            {"updated": upd, "runs": [{k: v for k, v in r.items() if k != "k"} for r in state.get("runs", [])]})


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp")
    with os.fdopen(fd, "w") as f: json.dump(obj, f, separators=(",", ":"))
    os.chmod(tmp, 0o644 if not path.endswith("state.json") else 0o600)
    os.replace(tmp, path)


def main(logs, out, statef):
    state = json.load(open(statef)) if os.path.exists(statef) else {}
    update(state, logs)
    vis, runs = build(state, datetime.now(timezone.utc))
    write(statef, state)
    write(os.path.join(out, "visitors.json"), vis)
    write(os.path.join(out, "runs.json"), runs)
    return vis, runs


def test():
    d = tempfile.mkdtemp()
    L = lambda ip, t, url, st=200, ua="Mozilla/5.0 Firefox": f'{ip} - - [{t} +0200] "GET {url} HTTP/2.0" {st} 5 "-" "{ua}"\n'
    now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=2)))
    ts = lambda **kw: (now - timedelta(**kw)).strftime("%d/%b/%Y:%H:%M:%S")
    b = "/roguelikes/beacon?g=rogue54&ev=death&name=Rodney&killer=bat&depth=3&score=120&turns=900&lvl=4"
    old = [L("1.1.1.1", ts(days=20), "/roguelikes/"), L("9.9.9.9", ts(days=20), "/roguelikes/shrine/x.html")]
    with gzip.open(f"{d}/access.log.2.gz", "wt") as f: f.writelines(old)
    with open(f"{d}/access.log", "w") as f: f.writelines([
        L("1.1.1.1", ts(hours=1), "/roguelikes/"),
        L("2.2.2.2", ts(hours=1), "/roguelikes/index.html"),
        L("2.2.2.2", ts(hours=1), "/roguelikes/rogue54/index.html"),
        L("3.3.3.3", ts(hours=1), "/roguelikes/", ua="Googlebot/2.1"),
        L("3.3.3.4", ts(hours=1), "/roguelikes/", ua="Mozilla/5.0 Chrome/140 Claude/1.2.3"),
        L("4.4.4.4", ts(hours=1), "/roguelikes/", st=404),
        L("5.5.5.5", ts(hours=1), "/other/"),
        L("2.2.2.2", ts(minutes=10), b), L("2.2.2.2", ts(minutes=9, seconds=40), b),  # dup within 1 min
        L("2.2.2.2", ts(minutes=5), b),  # same run again >1 min later: counts
        L("2.2.2.2", ts(minutes=4), "/roguelikes/beacon?g=hack&ev=win"),
        "garbage line\n"])
    st, out = f"{d}/state.json", f"{d}/data"
    vis, runs = main(f"{d}/access.log*", out, st)
    a = vis["areas"]
    assert a["index"] == {"d7": 2, "d30": 2, "all": 2}, a
    assert a["games"] == {"d7": 1, "d30": 1, "all": 1}, a
    assert a["shrines"] == {"d7": 0, "d30": 1, "all": 1}, a
    assert len(runs["runs"]) == 3, runs
    r = runs["runs"][0]
    assert r["g"] == "rogue54" and r["killer"] == "bat" and r["depth"] == 3 and "k" not in r, r
    assert runs["runs"][2] == {"t": runs["runs"][2]["t"], "g": "hack", "ev": "win"}
    # rotation: old gz gone, rerun keeps uniques + runs from state, no double counting
    os.remove(f"{d}/access.log.2.gz")
    vis2, runs2 = main(f"{d}/access.log*", out, st)
    assert vis2["areas"] == a and len(runs2["runs"]) == 3, (vis2, runs2)
    assert json.load(open(f"{out}/runs.json")) == runs2
    print("ok")


if __name__ == "__main__":
    if "--test" in sys.argv: test(); sys.exit()
    arg = lambda n, dflt: sys.argv[sys.argv.index(n) + 1] if n in sys.argv else dflt
    main(arg("--logs", LOGS), arg("--out", OUT), arg("--state", STATE))
