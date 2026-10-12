import duckdb, math, json, numpy as np, time
import shapely
from shapely import wkt, Polygon
from shapely.ops import unary_union, transform
from hexgrid import *
SIZE=500.0
import csv, sys
PLACES = sys.argv[1] if len(sys.argv) > 1 else '../supabase/places_kocaeli.csv'
con=duckdb.connect()
cty=con.execute("select name, wkt from 'da_kocaeli.parquet' where subtype='county' and region='TR-41' and is_land").fetchall()
names=[c[0] for c in cty]
polys=[]
for n,w in cty:
    g=wkt.loads(w)
    g=transform(lambda x,y,z=None:(np.array(x)-LON0)*M_LON, g) if False else shapely.transform(g, lambda a: np.column_stack([(a[:,0]-LON0)*M_LON,(a[:,1]-LAT0)*M_LAT]))
    polys.append(g.buffer(0))
land=unary_union(polys)
print('land area km2', land.area/1e6, 'bounds', land.bounds)
minx,miny,maxx,maxy=land.bounds
rmin=int(math.floor(miny/(1.5*SIZE)))-1; rmax=int(math.ceil(maxy/(1.5*SIZE)))+1
cells=[]
t=time.time()
land_s=land.simplify(25)
prep=shapely.prepared.PreparedGeometry if False else None
import shapely.prepared as sp
P=sp.prep(land_s)
hexarea=1.5*SQ3*SIZE*SIZE
for r in range(rmin,rmax+1):
    qmin=int(math.floor(minx/(SQ3*SIZE)-r/2))-1; qmax=int(math.ceil(maxx/(SQ3*SIZE)-r/2))+1
    for q in range(qmin,qmax+1):
        cx,cy=center_xy(q,r,SIZE)
        if cx<minx-SIZE or cx>maxx+SIZE: continue
        ang=[math.radians(60*i-30) for i in range(6)]
        hexp=Polygon([(cx+SIZE*math.cos(a),cy+SIZE*math.sin(a)) for a in ang])
        if not P.intersects(hexp): continue
        a=land_s.intersection(hexp).area
        if a>=0.25*hexarea:
            cells.append((q,r,cx,cy,a/hexarea))
print('cells',len(cells), time.time()-t)
# district of cell: county containing centre, else largest overlap
from shapely import STRtree, Point
tree=STRtree(polys)
dist=[]
for q,r,cx,cy,f in cells:
    hit=tree.query(Point(cx,cy),predicate='within')
    if len(hit): dist.append(int(hit[0])); continue
    hexp=Polygon([(cx+SIZE*math.cos(math.radians(60*i-30)),cy+SIZE*math.sin(math.radians(60*i-30))) for i in range(6)])
    best=max(range(len(polys)),key=lambda i: polys[i].intersection(hexp).area)
    dist.append(best)
import collections
print(collections.Counter(names[d] for d in dist))
# Yer listesindeki her yerin peteği haritada olmalı (kıyıdaki mekânlar %25 kara eşiğinin altında kalabilir)
have = {(c[0], c[1]) for c in cells}
extra = 0
for row in csv.DictReader(open(PLACES, encoding='utf-8')):
    q, r = int(row['q']), int(row['r'])
    if (q, r) not in have and row['district'] in names:
        cx, cy = center_xy(q, r, SIZE)
        cells.append((q, r, cx, cy, 0.0))
        dist.append(names.index(row['district']))
        have.add((q, r))
        extra += 1
print('yer icin eklenen kiyi petegi', extra, 'toplam petek', len(cells))
# ranges
cells_sorted=sorted(zip(cells,dist),key=lambda t:(t[0][1],t[0][0]))
ranges=[]
for (q,r,cx,cy,f),d in cells_sorted:
    if ranges and ranges[-1][0]==r and ranges[-1][2]==q-1 and ranges[-1][3]==d:
        ranges[-1][2]=q
    else: ranges.append([r,q,q,d])
print('ranges',len(ranges))
# labels: centroid of each county's cells (pole of inaccessibility approx via representative point)
labels=[]
for i,p in enumerate(polys):
    rp=p.representative_point()
    labels.append([names[i], round(rp.x), round(rp.y), round(p.area/1e6,1)])
# outlines: simplified county rings, metres, rounded to 10 m
rings=[]
for i,p in enumerate(polys):
    s=p.simplify(120)
    geoms=[s] if s.geom_type=='Polygon' else list(s.geoms)
    for g in geoms:
        if g.area<2e5: continue
        rings.append([int(round(v/10)) for xy in g.exterior.coords for v in xy])
print('rings',len(rings),'pts',sum(len(r)//2 for r in rings))
out={'v':1,'size':SIZE,'lon0':LON0,'lat0':LAT0,'districts':names,'ranges':ranges,'labels':labels,'rings':rings,'ringUnit':10}
json.dump(out,open('kocaeli_cells.json','w'),separators=(',',':'),ensure_ascii=False)
import os;print(os.path.getsize('kocaeli_cells.json'))
print(land.bounds, min(c[0] for c in cells),max(c[0] for c in cells),min(c[1] for c in cells),max(c[1] for c in cells))
