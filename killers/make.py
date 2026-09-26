#!/usr/bin/env python3
"""Killer art (server/CONTRACT.md): crop each monster's tile from the sheet
the web port shows by default into killers/<g>/<slug>.png."""
import os, re
from PIL import Image

G = os.path.expanduser('~/Games')
HERE = os.path.dirname(os.path.abspath(__file__))

def slug(s): return re.sub('[^a-z0-9]', '-', s.lower())

def ints(src, name):
    return [int(v) for v in re.search(r'%s\[\]\s*=\s*\{([^}]*)' % name, src).group(1).split(',') if v.strip()]

def cut(g, sheet, size, names_tiles, out=32):
    img = Image.open(sheet)
    d = os.path.join(HERE, g); os.makedirs(d, exist_ok=True)
    for name, t in names_tiles:
        if t < 0: continue
        x, y = t % 32 * size, t // 32 * size          # all three sheets are 32 tiles wide
        img.crop((x, y, x + size, y + size)).resize((out, out), Image.NEAREST if size < out else Image.LANCZOS) \
           .save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print(g, len(os.listdir(d)))

def rogue():
    r = G + '/rogue5.4'
    names = re.findall(r'^\{ "([^"]+)"', open(r + '/extern.c').read(), re.M)[:26]
    cut('rogue54', r + '/port/tiles.png', 16, zip(names, ints(open(r + '/port/tilemap.h').read(), 'mon_tile')))

def hack():
    h = G + '/hack'
    keys = re.findall(r'"([^"]*)"', open(h + '/port/tilemap.h').read().split('tile_key[]')[1].split('};')[0])
    cut('hack', h + '/port/tiles-dawn.png', 16, [(k[2:], i) for i, k in enumerate(keys) if k.startswith('M:')])

def umoria():
    u = G + '/umoria'
    names = re.findall(r'^\s*\{"([^"]+)"', open(u + '/src/data_creatures.cpp').read(), re.M)
    cut('umoria', u + '/port/tiles.png', 64, zip(names, ints(open(u + '/port/tilemap.h').read(), 'mon_tile')))

rogue(); hack(); umoria()
