#!/usr/bin/env python3
"""Rule: game cards and every level of the family tree in index.html are sorted
by release year, earliest first. Each .card <div> and each tree <li> carries
data-year (release of the historical version the played build is based on; decade-only dates use the decade's first
year). Ties keep their current order.

Release years live in years.json only (slug -> {year, src}): --fix writes each
card's data-year and tag year, and the data-year and leading year of the tree
<li> that links to the same game, all linked (unstyled) to src.

  ./order.py        check, exit 1 if out of order or out of sync (deploy.sh runs this)
  ./order.py --fix  sync from years.json and re-sort in place
"""
import json, re, sys

import os
PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'index.html')
YEAR = re.compile(r'data-year="(\d{4})"')
errors = []

def year(chunk, what):
    m = YEAR.search(chunk.split('>', 1)[0])
    if not m:
        errors.append(f'missing data-year: {what} {chunk[:80]!r}')
        return 0
    return int(m.group(1))

def name(chunk):
    m = re.search(r'<h2>(.*?)</h2>|class="n"[^>]*>(.*?)</', chunk)
    return (m.group(1) or m.group(2)) if m else chunk[:40]

def sort_items(items, what):
    """items: list of raw chunks; returns sorted list, records disorder."""
    keyed = [(year(c, what), c) for c in items]
    for (a, ca), (b, cb) in zip(keyed, keyed[1:]):
        if b < a:
            errors.append(f'{what}: {name(cb)} ({b}) after {name(ca)} ({a})')
    return [c for _, c in sorted(keyed, key=lambda t: t[0])]

def reorder(text, spans, what):
    """spans: list of (start, end) of sibling chunks in text; separators stay put."""
    new = sort_items([text[s:e] for s, e in spans], what)
    out, pos = [], 0
    for (s, e), c in zip(spans, new):
        out += [text[pos:s], c]; pos = e
    return ''.join(out) + text[pos:]

# --- cards: top-level <div class="card"> blocks inside <main>
def card_spans(text):
    spans, i = [], 0
    for m in re.finditer(r'<div class="card"', text):
        if m.start() < i: continue
        depth, j = 0, m.start()
        for t in re.finditer(r'<div\b|</div>', text[m.start():]):
            depth += 1 if t.group() != '</div>' else -1
            if depth == 0:
                j = m.start() + t.end(); break
        spans.append((m.start(), j)); i = j
    return spans

# --- tree: nested <ul>/<li>
def fix_ul(text, start, what, parent_year=None):
    """text[start:] begins right after '<ul>'. Sorts this ul's children recursively.
    Returns (new_text, index of this ul's closing '</ul>')."""
    spans, i = [], start
    tok = re.compile(r'<li\b|</li>|<ul>|</ul>')
    while True:
        m = tok.search(text, i)
        if m.group() == '</ul>':
            break
        assert m.group() == '<li', m.group()
        li_start = m.start(); i = m.end()
        while True:
            t = tok.search(text, i)
            if t.group() == '<ul>':
                text, close = fix_ul(text, t.end(), what, year(text[li_start:], what))
                i = close + len('</ul>')
            elif t.group() == '</li>':
                i = t.end(); break
            else:
                raise ValueError(f'unexpected {t.group()} at {t.start()}')
        spans.append((li_start, i))
    for s_, e in spans:  # no entry predates its parent
        if parent_year is not None and year(text[s_:e], what) < parent_year:
            errors.append(f'{what}: {name(text[s_:e])} ({year(text[s_:e], what)}) predates its parent ({parent_year})')
    text2 = reorder(text, spans, what)
    return text2, tok.search(text2, spans[-1][1] if spans else start).start()

_DATA = json.load(open(os.path.join(os.path.dirname(PATH), 'years.json'), encoding='utf-8'))
YEARS, TREE = _DATA['games'], _DATA['tree']  # games: slug -> {year, src}; tree: name -> {year, label?}

def yr_link(y, src):
    return f'<a class="yr" href="{src}">{y}</a>'

def sync_card(c):
    slug = re.search(r'class="play" href="([^"/]+)/"', c).group(1)
    if slug not in YEARS:
        errors.append(f'years.json: no entry for card {slug}'); return c
    y, src = YEARS[slug]['year'], YEARS[slug]['src']
    c = YEAR.sub(f'data-year="{y}"', c, count=1)
    return re.sub(r'(<div class="tag">[^<]*· )(?:<a class="yr"[^>]*>)?\d{4}(?:s|–\d\d)?(?:</a>)?',
                  lambda t: t.group(1) + yr_link(y, src), c, count=1)

def sync_li(m):
    li, slug, name = m.group(0), m.group(1), m.group(2)
    if slug:
        if slug not in YEARS:
            errors.append(f'years.json: no games entry for tree {slug}'); return li
        y = YEARS[slug]['year']; shown = yr_link(y, YEARS[slug]['src'])
    else:
        if name not in TREE:
            errors.append(f'years.json: no tree entry for {name}'); return li
        y = TREE[name]['year']; shown = str(TREE[name].get('label', y))
    li = YEAR.sub(f'data-year="{y}"', li, count=1) if YEAR.search(li.split('>', 1)[0]) \
        else re.sub(r'^<li([^>]*)>', lambda t: f'<li{t.group(1)} data-year="{y}">', li)
    return re.sub(r'(<span class="y">)(?:<a class="yr"[^>]*>)?\d{4}(?:s|–\d\d)?(?:</a>)?',
                  lambda t: t.group(1) + shown, li, count=1)

def sync(text):
    spans = card_spans(text)
    out, pos = [], 0
    for s_, e in spans:
        out += [text[pos:s_], sync_card(text[s_:e])]; pos = e
    text = ''.join(out) + text[pos:]
    ts = text.index('<section id="tree"')
    return text[:ts] + re.sub(r'<li[^>]*>(?:<a class="n" href="([^"/]+)/"|<span class="n">([^<]*)</span>)[^\n]*',
                                     sync_li, text[ts:])

def main():
    fix = '--fix' in sys.argv
    orig = open(PATH, encoding='utf-8').read()
    text = sync(orig)
    if text != orig and not fix:
        errors.append('index.html years differ from years.json')
    text = reorder(text, card_spans(text), 'cards')
    ts = text.index('<section id="tree"')
    text, _ = fix_ul(text, text.index('<ul>', ts) + 4, 'tree')
    if fix:
        open(PATH, 'w', encoding='utf-8').write(text)
    for e in errors:
        print(e, file=sys.stderr)
    if errors and not fix:
        print('index.html out of release order: run ./order.py --fix', file=sys.stderr)
        sys.exit(1)

main()
