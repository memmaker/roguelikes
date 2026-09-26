#!/usr/bin/env python3
"""Rule: game cards and every level of the family tree in index.html are sorted
by release year, earliest first. Each .card <div> and each tree <li> carries
data-year (the game's first release; decade-only dates use the decade's first
year). Ties keep their current order.

  ./order.py        check, exit 1 if out of order (deploy.sh runs this)
  ./order.py --fix  re-sort in place
"""
import re, sys

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
def fix_ul(text, start, what):
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
                text, close = fix_ul(text, t.end(), what)
                i = close + len('</ul>')
            elif t.group() == '</li>':
                i = t.end(); break
            else:
                raise ValueError(f'unexpected {t.group()} at {t.start()}')
        spans.append((li_start, i))
    text2 = reorder(text, spans, what)
    return text2, tok.search(text2, spans[-1][1] if spans else start).start()

def main():
    fix = '--fix' in sys.argv
    text = open(PATH, encoding='utf-8').read()
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
