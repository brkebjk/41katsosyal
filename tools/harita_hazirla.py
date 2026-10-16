"""PeopleHere harita verisi: İstanbul, Kocaeli, İzmir.

Girdi (overture_indir.py ile indirilir):
  da_3il.parquet      Overture bölge sınırları (ilçe = county, mahalle = macrohood + neighborhood)
  places_3il.parquet  Overture yerleri
Çıktı:
  app/src/lib/maps/<şehir>.json    uygulamanın harita dosyaları (petekler, ilçe / mahalle sınırları, adlar)
  supabase/places_<şehir>.csv      yer listesi (Supabase'de places tablosuna CSV olarak yüklenir)
  supabase/map_land_ranges.sql     sunucudaki kara petekleri (şemaya eklenir)

Petek ızgarası: her şehir kendi merkezine göre metreye çevrilir (eşdikdörtgen izdüşüm, merkez enlemi şehrin
ortası). Böylece her şehirde petek 500 m'dir (şehrin en kuzey / güney ucunda en çok ~%1 sapma).
Peteğin numarası (q, r) tüm uygulamada tektir: şehrin r değerine kaydırma eklenir (Kocaeli 0, İstanbul 1000,
İzmir 2000). Hangi şehirde olduğu r'den anlaşılır: floor((r + 500) / 1000).
Aynı matematik uygulamada src/lib/hex.ts içindedir; ikisi birebir aynı sonucu vermelidir (yuvarlama dahil).

Kara: mahallelerin birleşimi (göller kara sayılmaz). Petek, alanının en az %25'i karaysa haritadadır; kıyıda kalan
bir yerin peteği de eklenir. Sınırlar: bütün mahalle sınırları tek bir çizgi ağında birleştirilir, ortak kenarlar bir
kez sadeleştirilir (komşu mahalleler arasında boşluk ya da üst üste binme olmaz). İlçe sınırı ve kıyı da bu ağdandır.

Kullanım (tools klasöründen): python3 harita_hazirla.py <da_3il.parquet> <places_3il.parquet>
Gerekenler: pip install pyarrow shapely numpy
"""
import collections
import csv
import json
import math
import os
import re
import sys

import numpy as np
import pyarrow.parquet as pq
import shapely
from shapely import STRtree, wkb
from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.ops import linemerge, unary_union

from yer_kurallari import fold, label_of, keep_place, rank_of, sensitive_name, tidy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SIZE = 500.0
SQ3 = math.sqrt(3)
M_LAT = 110574.0
LAND_MIN = 0.25  # peteğin en az bu kadarı karaysa haritada
UNIT = 10  # sınır koordinatları 10 m'lik tam sayı olarak saklanır (en yakın görünümde ~1 piksel)
TOL_HOOD = 6.0  # mahalle sınırı sadeleştirme (m)
TOL_FILL = 40.0  # uzaktan kara boyaması (m)

# Kocaeli'nin eski haritasıyla aynı başlangıç noktası: kayıtlı peteklerin numarası değişmez
CITIES = [
    {'key': 'kocaeli', 'name': 'Kocaeli', 'region': 'TR-41', 'lon0': 29.0, 'lat0': 40.8, 'rOff': 0,
     'districts': ['Karamürsel', 'Gölcük', 'Başiskele', 'Kartepe', 'Darıca', 'Çayırova', 'Gebze', 'Dilovası',
                   'Derince', 'Körfez', 'Kandıra', 'İzmit']},
    {'key': 'istanbul', 'name': 'İstanbul', 'region': 'TR-34', 'lon0': 29.0, 'lat0': 41.2, 'rOff': 1000},
    {'key': 'izmir', 'name': 'İzmir', 'region': 'TR-35', 'lon0': 27.2, 'lat0': 38.6, 'rOff': 2000},
]

TR_ORDER = 'abcçdefgğhıijklmnoöprsştuüvyz'


def tr_key(s):
    s = s.replace('İ', 'i').replace('I', 'ı').lower()
    return [TR_ORDER.index(c) if c in TR_ORDER else 100 + ord(c) for c in s]


def jround(x):
    """JavaScript Math.round ile aynı (0,5 yukarı)."""
    return math.floor(x + 0.5)


def cube_round(qf, rf):
    sf = -qf - rf
    q, r, s = jround(qf), jround(rf), jround(sf)
    dq, dr, ds = abs(q - qf), abs(r - rf), abs(s - sf)
    if dq > dr and dq > ds:
        q = -r - s
    elif dr > ds:
        r = -q - s
    return int(q) + 0, int(r) + 0


class Grid:
    def __init__(self, c):
        self.lon0, self.lat0, self.rOff = c['lon0'], c['lat0'], c['rOff']
        self.m_lon = 111320.0 * math.cos(math.radians(self.lat0))

    def proj(self, lon, lat):
        return (lon - self.lon0) * self.m_lon, (lat - self.lat0) * M_LAT

    def proj_geom(self, g):
        return shapely.transform(g, lambda a: np.column_stack([(a[:, 0] - self.lon0) * self.m_lon, (a[:, 1] - self.lat0) * M_LAT]))

    def cell_xy(self, x, y):
        """Yerel peteğin (q, r) numarası (kaydırma eklenmeden)."""
        return cube_round((SQ3 / 3 * x - y / 3) / SIZE, (2 / 3 * y) / SIZE)

    @staticmethod
    def center(q, r):
        return SIZE * SQ3 * (q + r / 2), SIZE * 1.5 * r

    @staticmethod
    def hexagon(q, r):
        cx, cy = Grid.center(q, r)
        return Polygon([(cx + SIZE * math.cos(math.radians(60 * i - 30)), cy + SIZE * math.sin(math.radians(60 * i - 30)))
                        for i in range(6)])


def short_hood(name):
    n = re.sub(r'\s+', ' ', name).strip()
    n = re.sub(r'\s+Mahallesi$', '', n)
    n = re.sub(r'\s+Mah\.?$', '', n)
    return n


B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'


def pack(nums):
    """Tam sayıları kısa metne çevirir: zigzag + 5 bitlik parçalar (6. bit: devamı var). Uygulamada unpack()."""
    out = []
    for n in nums:
        z = (n << 1) if n >= 0 else ((-n << 1) - 1)
        while True:
            part = z & 31
            z >>= 5
            out.append(B64[part | (32 if z else 0)])
            if not z:
                break
    return ''.join(out)


def enc(coords):
    """Çizgi: pack([x0, y0, dx1, dy1, ...]) (UNIT metre), ardışık aynı noktalar atılır."""
    e = enc_list(coords)
    return pack(e) if e else None


def enc_list(coords):
    out = []
    px = py = None
    for x, y in coords:
        ix, iy = jround(x / UNIT), jround(y / UNIT)
        if px is None:
            out += [ix, iy]
        elif ix != px or iy != py:
            out += [ix - px, iy - py]
        else:
            continue
        px, py = ix, iy
    return out if len(out) >= 4 else None


def build_city(c, da, places_tb, out_places):
    g = Grid(c)
    reg = c['region']
    rows = [r for r in da if r['region'] == reg and r['is_land']]
    counties = [(r['names']['primary'], g.proj_geom(wkb.loads(r['geometry'])).buffer(0)) for r in rows if r['subtype'] == 'county']
    names = c.get('districts') or sorted({n for n, _ in counties}, key=tr_key)
    assert sorted(names, key=tr_key) == sorted({n for n, _ in counties}, key=tr_key), (c['key'], names)
    cpoly = {n: p for n, p in counties}
    hoods = []
    for r in rows:
        if r['subtype'] not in ('macrohood', 'neighborhood'):
            continue
        p = g.proj_geom(wkb.loads(r['geometry'])).buffer(0)
        if p.is_empty or p.area < 1:
            continue
        # İlçesi: en çok örtüştüğü ilçe
        best = max(names, key=lambda n: cpoly[n].intersection(p).area)
        hoods.append({'name': short_hood(r['names']['primary']), 'full': re.sub(r'\s+', ' ', r['names']['primary']).strip(),
                      'd': names.index(best), 'poly': p})
    # Örtüşen küçük parçaları temizle: her mahalle, önceki mahallelerden arta kalan alandır
    hoods.sort(key=lambda h: (h['d'], tr_key(h['name'])))
    acc = None
    for h in hoods:
        if acc is not None and h['poly'].intersects(acc):
            h['poly'] = h['poly'].difference(acc).buffer(0)
        acc = h['poly'] if acc is None else unary_union([acc, h['poly']])
    hoods = [h for h in hoods if not h['poly'].is_empty and h['poly'].area >= 1]
    land = unary_union([h['poly'] for h in hoods]).buffer(0)
    print(c['key'], 'ilçe', len(names), 'mahalle', len(hoods), 'kara km2', round(land.area / 1e6, 1))
    htree = STRtree([h['poly'] for h in hoods])

    # --- Petekler -------------------------------------------------------------------------------------
    minx, miny, maxx, maxy = land.bounds
    land_s = land.simplify(5)
    shapely.prepare(land_s)
    hexarea = 1.5 * SQ3 * SIZE * SIZE
    cells = {}
    rmin = int(math.floor(miny / (1.5 * SIZE))) - 1
    rmax = int(math.ceil(maxy / (1.5 * SIZE))) + 1
    for r in range(rmin, rmax + 1):
        qmin = int(math.floor(minx / (SQ3 * SIZE) - r / 2)) - 1
        qmax = int(math.ceil(maxx / (SQ3 * SIZE) - r / 2)) + 1
        for q in range(qmin, qmax + 1):
            hx = Grid.hexagon(q, r)
            if not land_s.intersects(hx):
                continue
            if land_s.intersection(hx).area >= LAND_MIN * hexarea:
                cells[(q, r)] = None
    print(c['key'], 'kara peteği', len(cells))

    def hood_at(x, y, hx=None):
        pt = Point(x, y)
        hit = htree.query(pt, predicate='within')
        if len(hit):
            return int(hit[0])
        if hx is None:
            return None
        cand = htree.query(hx)
        if len(cand) == 0:
            return None
        return int(max(cand, key=lambda i: hoods[i]['poly'].intersection(hx).area))

    for (q, r) in list(cells):
        cx, cy = Grid.center(q, r)
        cells[(q, r)] = hood_at(cx, cy, Grid.hexagon(q, r))

    # --- Yerler ---------------------------------------------------------------------------------------
    pts_geo = shapely.from_wkb(places_tb['geometry'])
    # Dosyaya 6 basamakla yazılan koordinat kullanılır: petek, yazılan konumdan hesaplanınca da aynı çıksın
    lon = np.round(shapely.get_x(pts_geo), 6)
    lat = np.round(shapely.get_y(pts_geo), 6)
    x = (lon - g.lon0) * g.m_lon
    y = (lat - g.lat0) * M_LAT
    pts = shapely.points(x, y)
    inside = htree.query(pts, predicate='within')
    hood_of = np.full(len(pts), -1)
    hood_of[inside[0]] = inside[1]
    # Mahalle sınırının hemen dışında (iskele, sahil) kalanlar: 150 m içindeki en yakın mahalle
    near_ix = np.where(hood_of < 0)[0]
    if len(near_ix):
        bb = shapely.box(minx - 200, miny - 200, maxx + 200, maxy + 200)
        cand = near_ix[shapely.contains_xy(bb, x[near_ix], y[near_ix])]
        if len(cand):
            nn = htree.query_nearest(pts[cand], max_distance=150, return_distance=False, all_matches=False)
            hood_of[cand[nn[0]]] = nn[1]
    keep_ix = np.where(hood_of >= 0)[0]
    added = 0
    seen = {}
    n_out = 0
    for i in keep_ix:
        rec = places_tb['rows'][i]
        name = tidy(rec['name'])[:80]
        f = fold(name)
        if len(f) < 2 or sensitive_name(f):
            continue
        key = (f, round(lat[i] * 800), round(lon[i] * 800))  # ~140 m'lik kutu: aynı ad aynı yerde bir kez
        if key in seen:
            continue
        seen[key] = 1
        q, r = g.cell_xy(x[i], y[i])
        h = int(hood_of[i])
        if (q, r) not in cells:
            cells[(q, r)] = h
            added += 1
        cat = rec['cat']
        # Arama metni: ad + ilçe + mahalle (sunucuda tek sütunda, trigram dizinli aranır)
        st = f + ' ' + fold(names[hoods[h]['d']]) + ' ' + fold(hoods[h]['name'])
        out_places.append([rec['id'], name, st, cat, label_of(cat, rec['l2']), names[hoods[h]['d']], hoods[h]['name'],
                           tidy(rec['addr'])[:90] if rec['addr'] else '', f'{lat[i]:.6f}', f'{lon[i]:.6f}', q, r + g.rOff,
                           rank_of(cat, rec['l2']), f"{rec['conf']:.2f}", c['key']])
        n_out += 1
    print(c['key'], 'yer', n_out, 'kıyı için eklenen petek', added, 'toplam petek', len(cells))

    # --- Sınır çizgileri -------------------------------------------------------------------------------
    net = unary_union([h['poly'].boundary for h in hoods])
    merged = linemerge(net)
    lines = list(merged.geoms) if isinstance(merged, MultiLineString) else [merged]
    ptree = htree
    d_lines, h_lines = [], []
    for ln in lines:
        if ln.length < 1:
            continue
        mid = ln.interpolate(0.5, normalized=True)
        a = ln.interpolate(max(0.0, ln.project(mid) - 1.0))
        b = ln.interpolate(min(ln.length, ln.project(mid) + 1.0))
        dx, dy = b.x - a.x, b.y - a.y
        nrm = math.hypot(dx, dy) or 1.0
        ox, oy = -dy / nrm * 2.0, dx / nrm * 2.0
        left = ptree.query(Point(mid.x + ox, mid.y + oy), predicate='within')
        right = ptree.query(Point(mid.x - ox, mid.y - oy), predicate='within')
        hl = int(left[0]) if len(left) else None
        hr = int(right[0]) if len(right) else None
        s = ln.simplify(TOL_HOOD, preserve_topology=False)
        e = enc(s.coords)
        if e is None:
            continue
        if hl is None or hr is None or hoods[hl]['d'] != hoods[hr]['d']:
            d_lines.append(e)
        else:
            h_lines.append(e)

    # Uzaktan bakınca kara boyaması (göller delik)
    fill = []
    fs = land.simplify(TOL_FILL)
    for p in getattr(fs, 'geoms', [fs]):
        if p.area < 2e5:
            continue
        for ring in [p.exterior] + [i for i in p.interiors if Polygon(i).area >= 2e5]:
            e = enc(ring.coords)
            if e:
                fill.append(e)

    # --- Adlar ----------------------------------------------------------------------------------------
    dlabels = []
    for di, n in enumerate(names):
        u = unary_union([h['poly'] for h in hoods if h['d'] == di])
        rp = u.representative_point() if not u.is_empty else cpoly[n].representative_point()
        dlabels.append([n, jround(rp.x), jround(rp.y), round(u.area / 1e6, 1)])
    hlist = []
    for h in hoods:
        rp = h['poly'].representative_point()
        hlist.append([h['name'], h['d'], jround(rp.x), jround(rp.y), round(h['poly'].area / 1e6, 2)])

    # --- Petek aralıkları: aynı satırda, aynı mahallede yan yana petekler --------------------------------
    srt = sorted(cells.items(), key=lambda kv: (kv[0][1], kv[0][0]))
    ranges = []
    for (q, r), h in srt:
        h = -1 if h is None else h
        if ranges and ranges[-1][0] == r and ranges[-1][2] == q - 1 and ranges[-1][3] == h:
            ranges[-1][2] = q
        else:
            ranges.append([r, q, q, h])
    # Mahallesi bulunamayan (çok küçük kıyı) petek: en yakın mahalle
    for rg in ranges:
        if rg[3] < 0:
            cx, cy = Grid.center(rg[1], rg[0])
            rg[3] = int(htree.query_nearest(Point(cx, cy))[0])
    # Aralıklar da kısa metin: [satır farkı, q başlangıcı (aynı satırda öncekinin sonundan fark), uzunluk-1, mahalle]
    flat, pr, pq1 = [], 0, 0
    for r, q0, q1, h in ranges:
        dr = r - pr
        flat += [dr, q0 - pq1 if dr == 0 else q0, q1 - q0, h]
        pr, pq1 = r, q1
    out = {
        'v': 2, 'key': c['key'], 'name': c['name'], 'size': SIZE, 'lon0': c['lon0'], 'lat0': c['lat0'], 'rOff': c['rOff'],
        'unit': UNIT, 'districts': names, 'districtLabels': dlabels, 'hoods': hlist, 'ranges': pack(flat),
        'districtLines': d_lines, 'hoodLines': h_lines, 'fill': fill,
    }
    # Sunucu için: aynı satırdaki aynı ilçe petekleri tek aralık
    srv = []
    for (q, r), h in srt:
        d = hoods[h]['d'] if h is not None else hoods[int(htree.query_nearest(Point(*Grid.center(q, r)))[0])]['d']
        if srv and srv[-1][0] == r + g.rOff and srv[-1][2] == q - 1 and srv[-1][3] == d:
            srv[-1][2] = q
        else:
            srv.append([r + g.rOff, q, q, d])
    return out, srv, names


def load_places(path, box):
    import pyarrow.compute as pc
    tb = pq.read_table(path, columns=['id', 'geometry', 'confidence', 'names', 'operating_status', 'taxonomy', 'addresses'])
    tb = tb.filter(pc.greater_equal(pc.fill_null(tb.column('confidence'), 0.0), 0.5))
    rows_out, geoms = [], []
    for rec in tb.to_pylist():
        if (rec['confidence'] or 0) < 0.5 or rec['operating_status'] in ('permanently_closed', 'temporarily_closed'):
            continue
        nm = (rec['names'] or {}).get('primary')
        if not nm or len(nm.strip()) < 2:
            continue
        tx = rec['taxonomy'] or {}
        cat = tx.get('primary')
        hier = tx.get('hierarchy') or []
        if not cat or not keep_place(cat, hier):
            continue
        addr = ''
        if rec['addresses']:
            addr = (rec['addresses'][0] or {}).get('freeform') or ''
        rows_out.append({'id': rec['id'], 'name': nm, 'cat': cat, 'l2': hier[1] if len(hier) > 1 else (hier[0] if hier else ''),
                         'addr': addr, 'conf': rec['confidence']})
        geoms.append(rec['geometry'])
    # Güven puanı yüksek olan önce (aynı yer iki kez gelirse güvenilir olan kalır)
    order = sorted(range(len(rows_out)), key=lambda i: -(rows_out[i]['conf'] or 0))
    return {'rows': [rows_out[i] for i in order], 'geometry': np.array([geoms[i] for i in order], dtype=object)}


def main():
    da_path, pl_path = sys.argv[1], sys.argv[2]
    da = [r for r in pq.read_table(da_path).to_pylist() if r['region'] in ('TR-34', 'TR-35', 'TR-41')]
    places = load_places(pl_path, None)
    print('yer adayı', len(places['rows']))
    os.makedirs(os.path.join(ROOT, 'app/src/lib/maps'), exist_ok=True)
    all_places, srv_all = [], []
    d0 = 0
    for c in CITIES:
        out, srv, names = build_city(c, da, places, all_places)
        out['d0'] = d0
        for s in srv:
            s[3] += d0
        srv_all += srv
        d0 += len(names)
        p = os.path.join(ROOT, f"app/src/lib/maps/{c['key']}.json")
        json.dump(out, open(p, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
        print(c['key'], 'dosya', round(os.path.getsize(p) / 1024), 'KB', 'ilçe çizgisi', len(out['districtLines']),
              'mahalle çizgisi', len(out['hoodLines']))
    # Yer listesi (aynı yer iki şehrin kenarında iki kez çıkmasın: ilk şehir kalır)
    ids = set()
    rows = []
    for row in all_places:
        if row[0] in ids:
            continue
        ids.add(row[0])
        rows.append(row)
    rows.sort(key=lambda x: (x[14], tr_key(x[5]), tr_key(x[1])))
    # Her şehir ayrı dosya (Supabase'de tabloya CSV olarak yüklenir; tek dosya çok büyük olur)
    for c in CITIES:
        p = os.path.join(ROOT, f"supabase/places_{c['key']}.csv")
        with open(p, 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            w.writerow(['id', 'name', 'search_text', 'cat', 'cat_label', 'district', 'hood', 'address', 'lat', 'lon', 'q', 'r',
                        'rank', 'confidence', 'city'])
            w.writerows([x for x in rows if x[14] == c['key']])
        print('yer listesi', c['key'], sum(1 for x in rows if x[14] == c['key']), round(os.path.getsize(p) / 1e6, 1), 'MB')
    with open(os.path.join(ROOT, 'supabase/map_land_ranges.sql'), 'w', encoding='utf-8') as fh:
        vals = ',\n'.join(f'({r},{q0},{q1},{d})' for r, q0, q1, d in srv_all)
        fh.write(f'insert into public.map_land_ranges (r, q0, q1, district) values\n{vals};\n')
    print('sunucu aralığı', len(srv_all), 'ilçe', d0)


if __name__ == '__main__':
    main()
