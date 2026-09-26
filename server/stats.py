#!/usr/bin/env python3
"""Build roguelikes data/visitors.json + data/runs.json from nginx logs (see CONTRACT.md).
Usage: stats.py [--logs GLOB] [--out DIR] [--state FILE] | stats.py --test"""
import glob, gzip, hashlib, json, os, re, secrets, subprocess, sys, tempfile
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, parse_qsl

LOGS = "/var/log/nginx/access.log*"
BEACON_LOG = "/var/lib/roguelikes-stats/beacon.log"  # never rotated; read on every run
OUT = "/var/www/ruzzoli.de/roguelikes/data"
STATE = "/var/lib/roguelikes-stats/state.json"
WINS = "/var/lib/roguelikes-stats/wins"  # GOLDEN RULE: one write-once file per win, never overwritten or deleted
MAX_RUNS = 2000
LINE = re.compile(r'(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"')
BOT = re.compile(r'bot|crawl|spider|slurp|scan|curl|wget|python|http|java|libwww|headless|preview|fetch|feed|monitor|facebookexternalhit|claude\/|^-?$', re.I)
INTS = ("depth", "score", "turns", "lvl")


def lines(pattern):
    for f in sorted(glob.glob(pattern)) + ([BEACON_LOG] if pattern == LOGS and os.path.exists(BEACON_LOG) else []):
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


def save_win(wins, iso, who, ua, query):
    """Write-once raw record of a win: wins/<g>/<id>.json. Same report again -> same id -> left alone."""
    q = dict(parse_qsl(query))
    g = re.sub(r"[^a-z0-9-]", "", q.get("g", "").lower())[:40] or "unknown"
    wid = hashlib.sha256((who + query).encode()).hexdigest()[:16]
    d = os.path.join(wins, g)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, f"{iso[:10]}-{wid}.json")
    if glob.glob(os.path.join(d, f"*-{wid}.json")): return  # already saved (a resend or a re-read log line)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o444)  # O_EXCL: never overwrite
    with os.fdopen(fd, "w") as f:
        json.dump({"t": iso, "who": who, "ua": ua, "bot": bool(BOT.search(ua)), "query": query, "fields": q}, f)
        f.flush(); os.fsync(f.fileno())
    dfd = os.open(d, os.O_RDONLY); os.fsync(dfd); os.close(dfd)
    try: subprocess.run(["chattr", "+i", path], capture_output=True)  # immutable where supported (root, ext4)
    except OSError: pass  # no chattr (macOS test run)


def load_wins(wins):
    out = []
    for f in sorted(glob.glob(os.path.join(wins, "*", "*.json"))):
        try: w = json.load(open(f))
        except (OSError, ValueError): continue  # unreadable record: skip for the board, file stays untouched
        if w.get("bot"): continue
        run = {"t": w["t"], "ev": "win"}
        q = w.get("fields", {})
        for k in ("g", "name", "killer"):
            if k in q: run[k] = q[k][:80]
        for k in INTS:
            if str(q.get(k, "")).lstrip("-").isdigit(): run[k] = int(q[k])
        out.append(run)
    return out


def update(state, pattern, wins=WINS, games=None):
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
        if not url.startswith("/roguelikes/") or status[0] not in "23": continue
        t = datetime.strptime(ts, "%d/%b/%Y:%H:%M:%S %z").astimezone(timezone.utc)
        who = hashlib.sha256((ip + ua + salt).encode()).hexdigest()[:16]
        u = urlsplit(url)
        if u.path == "/roguelikes/beacon" and status[0] == "2" and "ev=win" in u.query:
            save_win(wins, t.strftime("%Y-%m-%dT%H:%M:%SZ"), who, ua, u.query)  # before bot/dup filters: keep everything
        if BOT.search(ua): continue
        if u.path == "/roguelikes/beacon":
            q = dict(parse_qsl(u.query))
            if not q.get("g") or q.get("ev") not in ("death", "win", "quit"): continue
            if games is not None and q["g"] not in games: continue  # not a game on the site (spam/probe); wins are on disk anyway
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


def build(state, now, wins=WINS):
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
            {"updated": upd, "runs": sorted([{k: v for k, v in r.items() if k != "k"} for r in state.get("runs", []) if r.get("ev") != "win"]
                                            + load_wins(wins), key=lambda r: r["t"])})  # wins come only from the win files


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp")
    with os.fdopen(fd, "w") as f: json.dump(obj, f, separators=(",", ":"))
    os.chmod(tmp, 0o644 if not path.endswith("state.json") else 0o600)
    os.replace(tmp, path)


def main(logs, out, statef, wins=WINS):
    state = json.load(open(statef)) if os.path.exists(statef) else {}
    site = os.path.dirname(out)  # web root: one folder per game
    games = {d for d in os.listdir(site) if os.path.isdir(os.path.join(site, d))} if os.path.isdir(site) else None
    update(state, logs, wins, games)
    vis, runs = build(state, datetime.now(timezone.utc), wins)
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
        L("2.2.2.2", ts(minutes=3), "/roguelikes/beacon?g=hack&ev=win"),  # resend of the same win
        L("3.3.3.4", ts(minutes=2), "/roguelikes/beacon?g=hack&ev=win&name=Bot", ua="Claude/1.0"),  # kept on disk, not on board
        "garbage line\n"])
    st, out = f"{d}/state.json", f"{d}/data"
    for g in ("rogue54", "hack"): os.makedirs(f"{d}/{g}")  # game folders next to data/, like the web root
    W = f"{d}/wins"
    vis, runs = main(f"{d}/access.log*", out, st, W)
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
    vis2, runs2 = main(f"{d}/access.log*", out, st, W)
    assert vis2["areas"] == a and len(runs2["runs"]) == 3, (vis2, runs2)
    # golden rule: wins live in write-once files; the board survives losing state and logs
    wf = sorted(glob.glob(f"{W}/hack/*.json"))
    assert len(wf) == 2 and all(os.stat(f).st_mode & 0o222 == 0 for f in wf), wf
    before = [open(f).read() for f in wf]
    os.remove(st); os.remove(f"{d}/access.log")
    _, runs3 = main(f"{d}/access.log*", out, st, W)
    assert [r for r in runs3["runs"] if r["ev"] == "win"] == [r for r in runs2["runs"] if r["ev"] == "win"], runs3
    assert [open(f).read() for f in wf] == before
    assert json.load(open(f"{out}/runs.json")) == runs3
    print("ok")


if __name__ == "__main__":
    if "--test" in sys.argv: test(); sys.exit()
    arg = lambda n, dflt: sys.argv[sys.argv.index(n) + 1] if n in sys.argv else dflt
    main(arg("--logs", LOGS), arg("--out", OUT), arg("--state", STATE))
