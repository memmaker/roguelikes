#!/usr/bin/env python3
"""Killer art (server/CONTRACT.md): crop each monster's tile from the sheet
the web port shows by default into killers/<g>/<slug>.png."""
import os, re, sys
from PIL import Image, ImageChops

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

def urogue():
    u = G + '/urogue'
    names = re.findall(r'^\{"([^"]+)"', open(u + '/monsdata.c').read(), re.M)
    cut('urogue', u + '/port/tiles.png', 16, list(zip(names, ints(open(u + '/port/tilemap.h').read(), 'mon_tile')))[1:])

def rogue36():
    r = G + '/rogue3.6'
    names = re.findall(r'^\s*\{ "([^"]+)",\s*\d', open(r + '/init.c').read(), re.M)[:26]
    cut('rogue36', r + '/port/tiles.png', 16, zip(names, ints(open(r + '/port/tilemap.h').read(), 'mon_tile')))

def srogue():
    r = G + '/srogue'
    names = re.findall(r'^\{"([^"]+)",\'', open(r + '/global.c').read(), re.M)
    cut('srogue', r + '/port/tiles.png', 16, zip(names, ints(open(r + '/port/tilemap.h').read(), 'mon_tile')))

def roguepc():
    """Oryx 1-bit 16x24 sprites (port/tiles.h), drawn in text-mode light grey like the port."""
    r = G + '/roguepc'
    h = open(r + '/port/tiles.h').read()
    bits = [[int(v, 16) for v in row.split(',')] for row in re.findall(r'\{(0x[^}]*)\}', h)]
    names = re.findall(r'^\s*\{ "([^"]+)",', open(r + '/src/extern.c').read().split('monsters[26]')[1], re.M)[:26]
    d = os.path.join(HERE, 'roguepc'); os.makedirs(d, exist_ok=True)
    for name, t in zip(names, ints(h.replace('t_mon[26]', 't_mon[]'), 't_mon')):
        img = Image.new('RGBA', (24, 24))
        for y, row in enumerate(bits[t]):
            for x in range(16):
                if row & (0x8000 >> x): img.putpixel((x + 4, y), (0xaa, 0xaa, 0xaa, 255))
        img.resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('roguepc', len(os.listdir(d)))


def larn():
    l = G + '/larn'                                   # Amiga tiles are 8x16: centre on a square, 2x
    names = re.findall(r'^\s*\{"([^"]*)",', open(l + '/data.c').read().split('monster[] =')[1], re.M)
    img, d = Image.open(l + '/port/tiles.png').convert('RGBA'), os.path.join(HERE, 'larn')
    os.makedirs(d, exist_ok=True)
    for name, t in zip(names, map(int, re.search(r'mon_tile\[\d+\] = \{([^}]*)', open(l + '/port/tilemap.h').read()).group(1).split(','))):
        if not name: continue
        sq = Image.new('RGBA', (16, 16)); sq.paste(img.crop((t % 32 * 8, t // 32 * 16, t % 32 * 8 + 8, t // 32 * 16 + 16)), (4, 0))
        sq.resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('larn', len(os.listdir(d)))


def ularn():                                          # same Amiga set, loose files; ULarn art as port/mktiles.py MON_REMAP
    u = G + '/ularn'
    tab = open(u + '/src/data.c', encoding='latin-1').read().split('struct monst monster[]')[1].split('\n};')[0]
    names = re.findall(r'^\{\s*"([^"]*)"', tab, re.M)
    remap = {1: 'm1u', 19: 'm19u', 34: 'm34u', 39: 'm39v', **{i: 'm%dv' % i for i in range(57, 66)}}
    d = os.path.join(HERE, 'ularn'); os.makedirs(d, exist_ok=True)
    for i, name in enumerate(names):
        if not name.strip(): continue
        sq = Image.new('RGBA', (16, 16)); sq.paste(Image.open('%s/port/amiga/%s.png' % (u, remap.get(i, 'm%d' % i))).convert('RGBA'), (4, 0))
        sq.resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('ularn', len(os.listdir(d)))

def angband(g, game, rinfo, tag, prf, sheet, size, the=False):
    """Angband family: R:<idx>:0xAA/0xCC in the graf prf -> tile row AA&0x7F, col CC&0x7F."""
    src = open(G + '/' + game + '/lib/edit/' + rinfo, encoding='latin-1').read()
    idx = [int(i) for i in re.findall(r'^N:(\d+):', src, re.M)]
    names = dict(zip(idx, re.findall(r'^%s:(?:\d+:)?(.+)$' % tag, src, re.M)))
    img = Image.open(G + '/' + game + '/' + sheet).convert('RGBA')
    d = os.path.join(HERE, g); os.makedirs(d, exist_ok=True)
    for i, a, c in re.findall(r'^R:(\d+):0x(\w\w)[/:]0x(\w\w)', open(G + '/' + game + '/lib/pref/' + prf).read(), re.M):
        n = names.get(int(i))
        if not n or i == '0': continue
        if the: n = re.sub(r'^(the|The) ', '', n)   # web_run_end() strips a/an/the
        x, y = (int(c, 16) & 0x7F) * size, (int(a, 16) & 0x7F) * size
        img.crop((x, y, x + size, y + size)).resize((32, 32), Image.NEAREST if size <= 32 else Image.LANCZOS) \
           .save(os.path.join(d, slug(n.strip()) + '.png'), optimize=True)
    print(g, len(os.listdir(d)))

def tome2(): angband('tome2', 'tome-2.3.11', 'r_info.txt', 'N', 'graf-new.prf', 'lib/xtra/graf/16x16.bmp', 16)
def tinyangband(): angband('tinyangband', 'tinyangband', 'r_info.txt', 'E', 'graf-new.prf', 'lib/xtra/graf/16x16.bmp', 16)
def quickband(): angband('quickband', 'quickband', 'monster.txt', 'N', 'graf-dvg.prf', 'lib/xtra/graf/32x32.png', 32)
def nppangband(): angband('nppangband', 'nppangband', 'monster.txt', 'N', 'graf-shb.prf', 'web/tiles.webp', 64, True)   # Shockbolt 64px (web/mkgraf-shb.py)

def arogue(g, d, src):
    """Advanced Rogue family: monsters[] names (comments stripped) -> mon_tile, NetHack sheet."""
    s = open(G + '/' + d + '/' + src).read(); m = re.search(r'\bmonsters\s*\[[^]]*\]\s*=\s*\{', s)
    body = re.sub(r'/\*.*?\*/', '', s[m.end():s.index('};', m.end())], flags=re.S)
    names = re.findall(r'\{\s*"([^"]*)"', body)
    cut(g, G + '/' + d + '/port/tiles.png', 16, list(zip(names, ints(open(G + '/' + d + '/port/tilemap.h').read(), 'mon_tile')))[1:])
def arogue58(): arogue('arogue58', 'arogue5.8', 'rogue.c')
def arogue77(): arogue('arogue77', 'arogue7.7', 'rogue.c')
def xrogue(): arogue('xrogue', 'xrogue', 'mons_def.c')


def boss():                                           # text only: glyph in the page's grey, Menlo
    from PIL import ImageDraw, ImageFont
    L = open(G + '/boss/dat/monsters.dat').read().split('\n')
    font, d = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 28), os.path.join(HERE, 'boss')
    os.makedirs(d, exist_ok=True)
    for i in range(1, int(L[0]) * 10, 10):
        name, ch = L[i].strip(), L[i + 6].strip()
        img = Image.new('RGBA', (32, 32), '#000'); ImageDraw.Draw(img).text((16, 16), ch, '#aaaaaa', font, 'mm')
        img.save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('boss', len(os.listdir(d)))

def omega():                                          # WinOmega sheet, 128 x 32px tiles; port/tiles.c wc_tile()
    o = G + '/omega'
    col = {k: int(v, 16) for k, v in re.findall(r'#define (COL_\w+) (0x[0-9a-f]+)', open(o + '/defs.h').read())[:25]}
    def code(ch, cols): return ord(ch) | sum(col[c] for c in cols.split('|') if c)
    tile = {}
    for ch, cols, x, y in re.findall(r"^\s*'(\\?.)'((?:\|COL_\w+)*),(\d+),(\d+)", open(o + '/port/map.inc').read(), re.M):
        tile.setdefault(code(ch[-1], cols), (int(x), int(y)))
    tile[code('o', '|COL_WHITE')], tile[code('!', '|COL_RED')] = (69, 1), (67, 21)   # dungeon special cases
    img, d = Image.open(o + '/web/tiles.png').convert('RGBA'), os.path.join(HERE, 'omega')
    os.makedirs(d, exist_ok=True)
    for ch, cols, name in re.findall(r"'(\\?.)'((?:\|COL_\w+)*),\"([^\"]+)\"", open(o + '/minit.h').read()):
        t = tile.get(code(ch[-1], cols) & 0x7fff)
        if t: img.crop((t[0] * 32, t[1] * 32, t[0] * 32 + 32, t[1] * 32 + 32)).save(
            os.path.join(d, slug(re.sub(r'^(an?|the) ', '', name, flags=re.I)) + '.png'), optimize=True)
    print('omega', len(os.listdir(d)))

def prime():                                          # port/tiles.png (32px); tile per Monsters.txt, as Monster.cpp/XUI.cpp layer()
    from PIL import ImageChops
    pr = G + '/prime'
    enum = re.search(r'enum shTileRow \{(.*?)\}', open(pr + '/src/ObjectType.h').read(), re.S).group(1)
    rows, n = {}, 0
    for e in re.sub(r'/\*.*?\*/', '', enum, flags=re.S).replace('\n', '').split(','):
        if not e.strip(): continue
        k, _, v = e.partition('='); n = eval(v, {}, rows) if v.strip() else n; rows[k.strip()] = n; n += 1
    pal = [(0,0,0),(0,0,170),(0,170,0),(0,170,170),(170,0,0),(170,0,170),(170,85,0),(170,170,170),(85,85,85),(85,85,255),(85,255,85),(85,255,255),(255,85,85),(255,85,255),(255,255,85),(255,255,255)]
    cols = ['kBlack','kBlue','kGreen','kCyan','kRed','kMagenta','kBrown','kGray','kDarkGray','kNavy','kLime','kAqua','kOrange','kPink','kYellow','kWhite']
    img, d = Image.open(pr + '/port/tiles.png').convert('RGBA'), os.path.join(HERE, 'prime')
    os.makedirs(d, exist_ok=True)
    for b in re.split(r'^MonsterIlk ', open(pr + '/src/Monsters.txt').read(), flags=re.M)[1:]:
        f = dict(re.findall(r'^ (name|sym|color|tile_row|tile_col) +("[^"]*"|\S+)', b, re.M))
        if 'name' not in f or 'sym' not in f: continue
        sym = 'Z' if f['sym'] == 'kSymZerg' else f['sym'].strip("'")
        r = f.get('tile_row'); r = rows[r] if r in rows else int(r) if r else 2 if sym == '@' else rows['kRowBigA'] + ord(sym) - 65 if sym <= 'Z' else rows['kRowLittleA'] + ord(sym) - 97
        c = int(f.get('tile_col', 0))
        t = img.crop((c * 32, r * 32, c * 32 + 32, r * 32 + 32))
        if not c:                                     # letter in its colour (NotEye recMult)
            t = ImageChops.multiply(t, Image.new('RGBA', t.size, pal[cols.index(f.get('color', 'kGray'))] + (255,)))
        Image.alpha_composite(Image.new('RGBA', t.size, (0, 0, 0, 255)), t).save(os.path.join(d, slug(f['name'].strip('"')) + '.png'), optimize=True)
    print('prime', len(os.listdir(d)))

def dynahack():                                       # web/gen (build.sh): symbols.tsv names + tiletab.c tile_mon -> tiles.png, 16px, 40/row
    w = G + '/dynahack/web'
    names = [l.split('\t')[2] for l in open(w + '/gen/symbols.tsv') if l.startswith('mon\t')]
    img, d = Image.open(w + '/dist/tiles.png').convert('RGBA'), os.path.join(HERE, 'dynahack')
    os.makedirs(d, exist_ok=True)
    for name, t in zip(names, ints(open(w + '/gen/src/tiletab.c').read(), 'tile_mon')):
        x, y = t % 40 * 16, t // 40 * 16
        Image.alpha_composite(Image.new('RGBA', (16, 16), (0, 0, 0, 255)), img.crop((x, y, x + 16, y + 16))) \
             .resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('dynahack', len(os.listdir(d)))


def zangband():                                       # Shockbolt 64px (web/tiles.webp, web/mkgraf-shb.py)
    angband('zangband', 'zangband', 'r_info.txt', 'N', 'graf-shb.prf', 'web/tiles.webp', 64)
    d = os.path.join(HERE, 'zangband')                # main-web.c web_run_end() strips "The " from killers
    for f in os.listdir(d):
        if f.startswith('the-'): os.replace(os.path.join(d, f), os.path.join(d, f[4:]))
def silq():                                           # N:1-3 are more <player> entries
    angband('sil-q', 'sil-q-1.5.0', 'monster.txt', 'N', 'graf-new.prf', 'lib/xtra/graf/16x16_microchasm.png', 16)
    os.remove(os.path.join(HERE, 'sil-q', '-player-.png'))

def tactical(g='tactical-angband'):                   # Shockbolt Dark (WEB_TILESET 5): monster:<name>:0xAA:0xCC, 64px
    t = G + '/' + g + '/lib/tiles/shockbolt/'
    img, d = Image.open(t + '64x64.png').convert('RGBA'), os.path.join(HERE, g)
    os.makedirs(d, exist_ok=True)
    for n, a, c in re.findall(r'^monster:([^:]+):0x(\w\w):0x(\w\w)', open(t + 'graf-shb-dark.prf').read(), re.M):
        if n == '<player>': continue
        x, y = (int(c, 16) & 0x7F) * 64, (int(a, 16) & 0x7F) * 64
        img.crop((x, y, x + 64, y + 64)).resize((32, 32), Image.LANCZOS).save(os.path.join(d, slug(n) + '.png'), optimize=True)
    print(g, len(os.listdir(d)))

def crawl():                                          # tiles/tile.png, 32px, 30/row; tiles.cc tileidx_monster(), English mon-data.h names
    c = G + '/crawl-linley/source/'
    rd = lambda f: open(c + f, encoding='latin-1').read()
    enum = re.findall(r'^\s*(TILE_\w+)\s*,', rd('tiledef.h').split('enum TILEIDX')[1].split('};')[0], re.M)
    tile = {m: enum.index(t) for m, t in re.findall(r'case (MONS_\w+): ch=(TILE_\w+);', rd('tiles.cc').split('int tileidx_monster(')[1].split('\n}')[0]) if t in enum}   # some cases sit in #if 0
    names = dict(re.findall(r'(MONS_\w+), \'.\', \w+, "([ -~]+)"', rd('mon-data.h')))   # ASCII only: the English table
    img, d = Image.open(G + '/crawl-linley/tiles/tile.png').convert('RGBA'), os.path.join(HERE, 'crawl-linley')
    os.makedirs(d, exist_ok=True)
    for m, t in tile.items():
        if not re.search('[a-z]', names.get(m, '')): continue   # pandemonium demons are named '&'
        x, y = t % 30 * 32, t // 30 * 32
        Image.alpha_composite(Image.new('RGBA', (32, 32), (0, 0, 0, 255)), img.crop((x, y, x + 32, y + 32))) \
             .save(os.path.join(d, slug(names[m]) + '.png'), optimize=True)
    print('crawl-linley', len(os.listdir(d)))


def zapm():                                           # text only: glyph in the port's colour (web/zapm.js PAL), Menlo bold
    from PIL import ImageDraw, ImageFont
    pal = [['#000', '#c82828', '#28b428', '#c8a028', '#3c5ae6', '#be3cbe', '#28b4be', '#c8c8c8'],
           ['#6e6e6e', '#ff5a5a', '#64ff64', '#ffff5a', '#7896ff', '#ff6eff', '#6effff', '#fff'],
           ['#000', '#641414', '#145a14', '#645014', '#1e2d73', '#5f1e5f', '#145a5f', '#6e6e6e']]
    cols = re.search(r'enum shColor \{(.*?)\}', open(G + '/zapm/Global.h').read(), re.S).group(1)
    cols = [c.split('=')[0].strip() for c in cols.split(',') if c.strip()]
    def fg(c):                                        # Interface.cpp ColorMap (non-Win32): 1-7 normal, 8-14 bold, 15-21 dim
        i = cols.index(c)
        return pal[0][i] if i < 8 else pal[1][i - 7] if i < 15 else pal[2][i - 14]
    font, d = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 28, index=1), os.path.join(HERE, 'zapm')
    os.makedirs(d, exist_ok=True)
    for name, ch, c in re.findall(r'shMonsterIlk \("([^"]+)".*\'(.)\', (k\w+)\);', open(G + '/zapm/MonsterData.h').read()):
        img = Image.new('RGBA', (32, 32), '#000'); ImageDraw.Draw(img).text((16, 16), ch, fg(c), font, 'mm')
        img.save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('zapm', len(os.listdir(d)))

def alphaman():                                       # text only: data/alphaman.2 records (name, sym + 1000 * colour), VGA 9x16 font, 2x
    from PIL import ImageColor
    a = G + '/alphaman'
    pal = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
           '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff']
    glyphs = [[int(v, 16) for v in row.split(',')] for row in re.findall(r'\{(0x[^}]*)\}', open(a + '/port/fb/vgafont.h').read())]
    data, d = open(a + '/data/alphaman.2', 'rb').read(), os.path.join(HERE, 'alphaman')
    os.makedirs(d, exist_ok=True)
    for t in range(len(data) // 50):
        r, name = data[t * 50:t * 50 + 50], ''
        for k in range(1, 21):                        # CreatNam$: XOR k*6 until 242
            if r[k - 1] == 242: break
            name += chr(r[k - 1] ^ (k * 6) & 255)
        name = re.sub(r'^(an?|the) ', '', name.strip(), flags=re.I)   # SUB Dead strips articles for the beacon
        v = int.from_bytes(r[24:26], 'little', signed=True)
        g, c = glyphs[v % 1000 & 255], pal[v // 1000 & 15] if v // 1000 else pal[8]   # black ones as the detect-mutation grey
        img = Image.new('RGBA', (9, 16), '#000')
        for y in range(16):
            for x in range(9):
                if g[y] & (0x100 >> x): img.putpixel((x, y), ImageColor.getrgb(c))
        sq = Image.new('RGBA', (32, 32), '#000'); sq.paste(img.resize((18, 32), Image.NEAREST), (7, 0))
        sq.save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('alphaman', len(os.listdir(d)))

def decker():                                         # res/il_ice.bmp, 24px ICE images, 10 per row, magenta = transparent
    s = open(G + '/decker/Ice.cpp').read()
    ig = {k: int(v) for k, v in re.findall(r'#define (IG_\w+)\s+(\d+)', s)}
    img, d = Image.open(G + '/decker/res/il_ice.bmp').convert('RGB'), os.path.join(HERE, 'decker')
    os.makedirs(d, exist_ok=True)
    for name, g in re.findall(r'\{"([^"]+)",\s*(IG_\w+)\}', s):
        t = ig[g]; x, y = t % 10 * 24, t // 10 * 24
        c = img.crop((x, y, x + 24, y + 24))
        px = c.load()
        for i in range(24 * 24):
            if px[i % 24, i // 24] == (255, 0, 255): px[i % 24, i // 24] = (0, 0, 0)
        c.resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('decker', len(os.listdir(d)))


def nhsheet(g, txt, png):                             # win/share/monsters.txt order = tile index, 16px, 40/row (nhtiles / web/mktiles.py)
    img, d, seen = Image.open(png).convert('RGB'), os.path.join(HERE, g), set()
    os.makedirs(d, exist_ok=True)
    for t, name in re.findall(r'^# tile (\d+) \(([^,)]+)', open(txt).read(), re.M):
        if name in seen: continue
        seen.add(name); t = int(t); x, y = t % 40 * 16, t // 40 * 16
        img.crop((x, y, x + 16, y + 16)).resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print(g, len(os.listdir(d)))

def nethack13d():                                     # DawnLike (default): tile_key "M:<mname>", like hack()
    h = G + '/nethack13d'
    keys = re.findall(r'"([^"]*)"', open(h + '/port/tilemap.h').read().split('tile_key[]')[1].split('};')[0])
    cut('nethack13d', h + '/port/tiles-dawn.png', 16, [(k[2:], i) for i, k in enumerate(keys) if k.startswith('M:')])
def nethack50(): nhsheet('nethack50', G + '/nethack50/win/share/monsters.txt', G + '/nethack50/web/dist/tiles.png')
def zhsheet(g, txt, png):                             # same as nhsheet(), sheet at 32px (ZeldHack 32), no resize
    img, d, seen = Image.open(png).convert('RGB'), os.path.join(HERE, g), set()
    os.makedirs(d, exist_ok=True)
    for t, name in re.findall(r'^# tile (\d+) \(([^,)]+)', open(txt).read(), re.M):
        if name in seen: continue
        seen.add(name); t = int(t); x, y = t % 40 * 32, t // 40 * 32
        img.crop((x, y, x + 32, y + 32)).save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print(g, len(os.listdir(d)))
def zeldhack(): zhsheet('zeldhack', G + '/zeldhack/win/share/monsters.txt', G + '/zeldhack/web/dist/tiles.png')
def slashem(): nhsheet('slashem', G + '/slashem/win/share/monsters.txt', G + '/slashem/web/dist/tiles.png')

def evilhack():                                       # web/gen (build.sh): glyph2tile[PM] in src/tile.c, name at that tile in win/share/monsters.txt; tiles.png 16px, 40/row
    h = G + '/evilhack'
    n = int(re.search(r'#define\s+NUMMONS\s+(\d+)', open(h + '/web/gen/include/pm.h').read()).group(1))
    g2t = [int(v) for v in open(h + '/web/gen/src/tile.c').read().split('glyph2tile[MAX_GLYPH] = {')[1].split('}')[0].split(',') if v.strip()]
    names = {int(t): m for t, m in re.findall(r'^# tile (\d+) \(([^)]+)\)', open(h + '/win/share/monsters.txt').read(), re.M)}
    img, d, seen = Image.open(h + '/web/dist/tiles.png').convert('RGB'), os.path.join(HERE, 'evilhack'), set()
    os.makedirs(d, exist_ok=True)
    for t in g2t[:n]:
        if slug(names[t]) in seen: continue          # werejackal etc.: both forms share the name
        seen.add(slug(names[t])); x, y = t % 40 * 16, t // 40 * 16
        img.crop((x, y, x + 16, y + 16)).resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(names[t]) + '.png'), optimize=True)
    print('evilhack', len(os.listdir(d)))

def frogcomposband():                                 # Shockbolt 64px (web/tiles.webp, web/mkgraf-shb.py); main-web.c web_run_end() strips "The "
    angband('frogcomposband', 'frogcomposband', 'r_info.txt', 'N', 'graf-shb.prf', 'web/tiles.webp', 64)
    d = os.path.join(HERE, 'frogcomposband')
    for f in os.listdir(d):
        if f.startswith('the-'): os.replace(os.path.join(d, f), os.path.join(d, f[4:]))

def hengband():                                       # Adam Bolt 16x16 (web/tiles.webp); ids from MonraceDefinitions.jsonc, R: in graf-new.prf + graf-ab.prf (stand-ins)
    h = G + '/hengband/lib'
    names = {int(i): n for i, n in re.findall(r'"id": (\d+),\s*"name": \{[^}]*?"en": "([^"]+)"', open(h + '/edit/MonraceDefinitions.jsonc', encoding='utf-8').read())}
    img, d = Image.open(G + '/hengband/web/tiles.webp').convert('RGBA'), os.path.join(HERE, 'hengband')
    os.makedirs(d, exist_ok=True)
    prf = open(h + '/pref/graf-new.prf').read() + open(h + '/pref/graf-ab.prf').read()
    for i, a, c in re.findall(r'^R:(\d+):0x(\w\w)/0x(\w\w)', prf, re.M):
        n = names.get(int(i))
        if not n or i == '0': continue
        n = re.sub(r'^(the|The) ', '', n)             # main-web.cpp web_run_end() strips a/an/the
        x, y = (int(c, 16) & 0x7F) * 16, (int(a, 16) & 0x7F) * 16
        img.crop((x, y, x + 16, y + 16)).resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(n) + '.png'), optimize=True)
    print('hengband', len(os.listdir(d)))

def forays():                                         # text only: Actor.cs Define() glyph from ForaysImages/font8x16.png (as the card), GL palette (Color.cs ConvertColor), 2x
    f = G + '/forays/Forays'
    pal = {'Blue': (35, 35, 255), 'Cyan': (0, 255, 255), 'DarkBlue': (15, 15, 149), 'DarkCyan': (0, 139, 139), 'DarkGray': (105, 105, 105),
           'DarkGreen': (0, 100, 0), 'DarkMagenta': (139, 0, 139), 'DarkRed': (139, 0, 0), 'DarkYellow': (184, 134, 11), 'Gray': (211, 211, 211),
           'Green': (0, 255, 0), 'Magenta': (255, 0, 255), 'Red': (255, 0, 0), 'White': (255, 255, 255), 'Yellow': (255, 248, 0),
           'RandomLightning': (255, 248, 0), 'RandomDark': (139, 0, 139), 'RandomBright': (255, 0, 255), 'RandomDoom': (139, 0, 139), 'RandomIce': (0, 255, 255)}
    sheet, d = Image.open(f + '/ForaysImages/font8x16.png').convert('RGBA'), os.path.join(HERE, 'forays')   # 128 glyphs, 8px + 1px gap, alpha mask
    os.makedirs(d, exist_ok=True)
    for name, ch, c in re.findall(r'Define\(ActorType\.\w+,"([^"]+)",\'(.)\',Color\.(\w+)', open(f + '/Actor.cs').read()):
        a = sheet.crop((ord(ch) * 9, 0, ord(ch) * 9 + 8, 16)).getchannel('A')
        img = Image.new('RGBA', (8, 16), '#000'); img.paste(pal[c], mask=a)
        sq = Image.new('RGBA', (32, 32), '#000'); sq.paste(img.resize((16, 32), Image.NEAREST), (8, 0))
        sq.save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('forays', len(os.listdir(d)))

def lambdarogue():                                    # own sheet the port shows (tileset-2-small-m-soldier.png, 20x40, cell = ord(Letter) - 32), centred on 40x40
    l = G + '/lambdarogue'
    mons = re.findall(r'^NewMonster:\r?\n(.+?)\r?\n.*?^Letter:\r?\n(.)', open(l + '/data/monsters.txt', encoding='latin-1').read(), re.M | re.S)
    img, d = Image.open(l + '/graphics/tiles/tileset-2-small-m-soldier.png').convert('RGBA'), os.path.join(HERE, 'lambdarogue')
    os.makedirs(d, exist_ok=True)
    for name, ch in mons:
        t = (ord(ch) - 32) * 20
        sq = Image.new('RGBA', (40, 40)); sq.paste(img.crop((t, 0, t + 20, 40)), (10, 0))
        sq.resize((32, 32), Image.LANCZOS).save(os.path.join(d, slug(name.strip()) + '.png'), optimize=True)
    print('lambdarogue', len(os.listdir(d)))

def easyband():                                       # Shockbolt 64px (web/tiles.webp, web/mkgraf-shb.py); r_info "N:name" numbered in file order from 0
    e = G + '/easyband'
    names = [n.strip() for n in re.findall(r'^N:(.+)$', open(e + '/lib/edit/r_info.txt', encoding='latin-1').read(), re.M)]
    img, d = Image.open(e + '/web/tiles.webp').convert('RGBA'), os.path.join(HERE, 'easyband')
    os.makedirs(d, exist_ok=True)
    for i, a, c in re.findall(r'^R:(\d+):0x(\w\w)/0x(\w\w)', open(e + '/lib/user/graf-shb.prf').read(), re.M):
        if i == '0' or int(i) >= len(names): continue
        n = re.sub(r'^(the|The) ', '', names[int(i)])   # main-web.c web_run_end() strips a/an/the
        x, y = (int(c, 16) & 0x7F) * 64, (int(a, 16) & 0x7F) * 64
        img.crop((x, y, x + 64, y + 64)).resize((32, 32), Image.LANCZOS).save(os.path.join(d, slug(n) + '.png'), optimize=True)
    print('easyband', len(os.listdir(d)))

def sangband():                                       # own Gervais 32x32 (web/tiles.png from lib/xtra/graf/32x32.bmp + mask, web/mkgraf.py); graf32-g.prf R:<idx>:+row:+col (decimal, + = |0x80)
    e = G + '/sangband'
    src = open(e + '/lib/edit/monster.txt', encoding='latin-1').read()
    names = {int(i): n.strip() for i, n in re.findall(r'^N:(\d+):(.+)$', src, re.M)}
    img, d = Image.open(e + '/web/tiles.png').convert('RGBA'), os.path.join(HERE, 'sangband')
    os.makedirs(d, exist_ok=True)
    done = set()
    for i, a, c in re.findall(r'^R:(\d+):\+(\d+)[/:]\+(\d+)', open(e + '/lib/pref/graf32-g.prf').read(), re.M):
        n = names.get(int(i))
        if not n or i == '0': continue
        n = re.sub(r'^(the|The|an?|An?) ', '', n)          # main-web.c web_run_end() strips a/an/the ("The Queen Ant")
        if slug(n) in done: continue                      # same name twice (Novice mage ...): first entry wins
        done.add(slug(n))
        x, y = int(c) * 32, int(a) * 32
        img.crop((x, y, x + 32, y + 32)).save(os.path.join(d, slug(n) + '.png'), optimize=True)
    print('sangband', len(os.listdir(d)))

def mag():                                            # DawnLike 16px (port/tiles-dawn.png, port/mkdawn.py): MONSTER.H pmon order -> mon_tile
    m = G + '/mag'
    names = re.findall(r'^"([^"]+)",\s*\'.\'', open(m + '/src/MONSTER.H', encoding='latin-1').read().replace('\r', ''), re.M)
    cut('mag', m + '/port/tiles-dawn.png', 16, zip(names, ints(re.sub(r'mon_tile\[\d+\]', 'mon_tile[]', open(m + '/port/tiles.h').read()), 'mon_tile')))

def prospector():                                     # graphics/critters.bmp (tile 1000 + n, 20 per row, 24px, magenta = transparent); names/tiles from monster.bas makemonster blocks
    p = G + '/prospector'
    src = open(p + '/monster.bas', encoding='latin-1').read().replace('\r', '')
    sp = dict((int(a), b) for a, b in re.findall(r'species\((\d+)\)="([^"]+)"', open(p + '/globals.bas', encoding='latin-1').read()))
    tiles = {}
    for g, n in sp.items(): tiles[n] = tiles['vicious ' + n] = 1001 + g      # species critters: ti_no=g+1001, prefix "vicious "
    for block in re.split(r'\n    [Ii]f a=', src):
        ti = [(m.start(), int(m.group(1))) for m in re.finditer(r'ti_no=(\d+)', block)]
        for m in re.finditer(r"""sdesc="([^"]+)"[ \t]*(?:'.*)?$""", block, re.M):
            before = [t for i, t in ti if i < m.start()]
            t = before[-1] if before else next((t for i, t in ti if i > m.start()), -1)
            n = m.group(1).strip(' .')
            if 1000 <= t < 1100 and re.search('[a-z]', n.lower()): tiles.setdefault(n, t)
    img, d = Image.open(p + '/graphics/critters.bmp').convert('RGB'), os.path.join(HERE, 'prospector')
    os.makedirs(d, exist_ok=True)
    for name, t in tiles.items():
        x, y = (t - 1000) % 20 * 24, (t - 1000) // 20 * 24
        c = img.crop((x, y, x + 24, y + 24)); px = c.load()
        for i in range(24 * 24):
            if px[i % 24, i // 24] == (255, 0, 255): px[i % 24, i // 24] = (0, 0, 0)
        c.resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('prospector', len(os.listdir(d)))

def grog():                                           # text only, black on white (default ScreenColor.BlackOnWhite): MonsterPool.cs glyph, Menlo like the card; killer = "<christened> the <type>" or type
    from PIL import ImageDraw, ImageFont
    font, d = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 28), os.path.join(HERE, 'grog')
    os.makedirs(d, exist_ok=True)
    src = open(G + '/grog/src/Grog.Dungeons.Generators.Monsters/MonsterPool.cs').read()
    for cn, ty, ch in re.findall(r'new Being\(MonsterType\.\w+, Race\.\w+, "([^"]*)", "([^"]+)", RevengeMonsterProgression\.\w+, \'(.)\'', src):
        img = Image.new('RGBA', (32, 32), '#fff'); ImageDraw.Draw(img).text((16, 16), ch, '#000', font, 'mm')
        img.save(os.path.join(d, slug(cn + ' the ' + ty if cn else ty) + '.png'), optimize=True)
    print('grog', len(os.listdir(d)))

def nlarn():                                          # Amiga 8x16 sheet (web/tiles.png), port/tilemap.h mon_tile[] by MONSTER_TYPE_ENUM order; name = monster_data .name
    n = G + '/nlarn'
    hdr = open(n + '/inc/monsters.h').read().split('#define MONSTER_TYPE_ENUM')[1].split('DECLARE_ENUM')[0]
    ids = [i for i in re.findall(r'MT\((MT_\w+),', hdr) if i != 'MT_MAX']
    names = dict(re.findall(r'/\* (MT_\w+) \*/\s*\.name = N_\("([^"]+)"\)', open(n + '/src/monsters.c').read()))
    tiles = list(map(int, re.search(r'mon_tile\[\d+\] = \{([^}]*)', open(n + '/port/tilemap.h').read()).group(1).split(',')))
    img, d = Image.open(n + '/web/tiles.png').convert('RGBA'), os.path.join(HERE, 'nlarn')
    os.makedirs(d, exist_ok=True)
    for i, t in zip(ids, tiles):
        if i not in names or t < 0: continue
        sq = Image.new('RGBA', (16, 16)); sq.paste(img.crop((t % 32 * 8, t // 32 * 16, t % 32 * 8 + 8, t // 32 * 16 + 16)), (4, 0))
        sq.resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(names[i]) + '.png'), optimize=True)
    print('nlarn', len(os.listdir(d)))

def ia():                                             # own 20x20 tiles (one PNG per TileId, white on black), tinted by monsters.xml <color> like the game's colour mod
    a = G + '/ia'
    src = open(a + '/src/gfx.cpp').read()
    ids = dict(re.findall(r'\{"(TILE_\w+)", gfx::TileId::(\w+)\}', src))
    files = dict(re.findall(r'\{gfx::TileId::(\w+), "([^"]+)"\}', src))
    cols = dict(re.findall(r'name="(\w+)" rgb_hex="(\w+)"', open(a + '/installed_files/data/colors/colors.xml').read()))
    d = os.path.join(HERE, 'ia'); os.makedirs(d, exist_ok=True)
    for m in re.findall(r'<monster id=.*?</monster>', open(a + '/installed_files/data/monsters.xml').read(), re.S):
        name = re.sub(r'^(an?|the) ', '', re.search(r'<name_a>(.*?)</name_a>', m).group(1), flags=re.I)
        tile, col = re.search(r'<tile>(\w+)</tile>', m), re.search(r'<color>(\w+)</color>', m)
        if not name or not tile: continue
        im = Image.open('%s/installed_files/gfx/tiles/20x20/%s' % (a, files[ids[tile.group(1)]])).convert('RGB')
        out = ImageChops.multiply(im, Image.new('RGB', im.size, '#' + cols[col.group(1)])).convert('RGBA')
        out.putalpha(im.convert('L').point(lambda v: 255 if v else 0))   # black = the game's colour key
        out.resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('ia', len(os.listdir(d)))

def traumarl():                                       # TraumaSprites.png (16px, 16 per row, id = GetRepresentation char), white -> RepresentationColor, magenta -> black like the map; robots only (letter glyphs = unused fantasy leftovers)
    from PIL import ImageColor
    t = G + '/traumarl/RogueBasin'
    img, d = Image.open(t + '/TraumaRL/bin/Debug/TraumaSprites.png').convert('RGBA'), os.path.join(HERE, 'traumarl')
    os.makedirs(d, exist_ok=True)
    for fn in sorted(os.listdir(t + '/RogueBasin/Creatures')):
        src = open(t + '/RogueBasin/Creatures/' + fn, encoding='utf-8-sig').read()
        n = re.search(r'SingleDescription\s*\{\s*get\s*\{\s*return "([^"]+)"', src)
        r = re.search(r'GetRepresentation\(\)\s*\{\s*return \(char\)(\d+);', src)
        c = re.search(r'RepresentationColor\(\)\s*\{\s*return System\.Drawing\.Color\.(\w+);', src)
        if not (n and r and c): continue
        i, col = int(r.group(1)), ImageColor.getrgb(c.group(1).lower())
        sp = img.crop((i % 16 * 16, i // 16 * 16, i % 16 * 16 + 16, i // 16 * 16 + 16)); px = sp.load()
        for y in range(16):
            for x in range(16):
                p = px[x, y]
                if p[:3] == (255, 0, 255): px[x, y] = (0, 0, 0, 255)
                elif p[:3] == (255, 255, 255): px[x, y] = col + (p[3],)
        name = re.sub(r'^(an?|the) ', '', n.group(1).strip(), flags=re.I)
        sp.resize((32, 32), Image.NEAREST).save(os.path.join(d, slug(name) + '.png'), optimize=True)
    print('traumarl', len(os.listdir(d)))

if sys.argv[1:]:
    for a in sys.argv[1:]: globals()[a]()
else:
    rogue(); hack(); umoria(); urogue(); larn(); ularn(); rogue36(); srogue(); roguepc(); tome2(); tinyangband(); quickband(); arogue58(); arogue77(); xrogue(); boss(); omega(); prime(); dynahack(); silq(); tactical(); crawl(); zapm(); alphaman(); decker(); nethack13d(); nethack50(); zeldhack(); slashem(); zangband(); frogcomposband(); forays(); lambdarogue(); hengband(); easyband(); mag(); tactical('faangband'); nppangband(); prospector(); sangband(); nlarn(); evilhack(); ia(); traumarl()
