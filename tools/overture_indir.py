"""Overture Maps verisinden bölge kutusundaki kayıtları indirir (yalnızca istatistiği kutuyla kesişen satır grupları).

Kullanım (tools klasöründen):
  python3 overture_indir.py theme=divisions/type=division_area da_3il.parquet id,geometry,country,subtype,names,is_land,region
  python3 overture_indir.py theme=places/type=place places_3il.parquet id,geometry,confidence,names,operating_status,basic_category,taxonomy,brand,addresses
Gerekenler: pip install pyarrow s3fs
"""
import sys
import time

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import s3fs

REL = '2026-09-23.1'  # Overture sürümü: her yenilemede en yenisi yazılır
BOX = (25.6, 37.6, 30.8, 41.75)  # İzmir .. İstanbul / Kocaeli

typ, out, cols = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
fs = s3fs.S3FileSystem(anon=True, client_kwargs={'region_name': 'us-west-2'})
files = fs.ls(f'overturemaps-us-west-2/release/{REL}/{typ}/')
tables = []
t = time.time()
for f in files:
    pf = pq.ParquetFile(fs.open(f, block_size=8 * 1024 * 1024))
    md = pf.metadata
    names = [md.schema.column(i).path for i in range(md.num_columns)]
    ix = {n: names.index(n) for n in ('bbox.xmin', 'bbox.xmax', 'bbox.ymin', 'bbox.ymax')}
    keep = []
    for g in range(md.num_row_groups):
        rg = md.row_group(g)
        s = {k: rg.column(i).statistics for k, i in ix.items()}
        if any(v is None or not v.has_min_max for v in s.values()):
            keep.append(g)
            continue
        if (s['bbox.xmax'].max < BOX[0] or s['bbox.xmin'].min > BOX[2]
                or s['bbox.ymax'].max < BOX[1] or s['bbox.ymin'].min > BOX[3]):
            continue
        keep.append(g)
    if not keep:
        continue
    tb = pf.read_row_groups(keep, columns=cols + ['bbox'])
    bb = tb.column('bbox')
    m = pc.and_(
        pc.and_(pc.greater_equal(pc.struct_field(bb, 'xmax'), BOX[0]), pc.less_equal(pc.struct_field(bb, 'xmin'), BOX[2])),
        pc.and_(pc.greater_equal(pc.struct_field(bb, 'ymax'), BOX[1]), pc.less_equal(pc.struct_field(bb, 'ymin'), BOX[3])),
    )
    tb = tb.filter(m)
    tables.append(tb)
    print(f.split('/')[-1][:12], 'grup', len(keep), '/', md.num_row_groups, 'kayıt', tb.num_rows, round(time.time() - t), 'sn',
          flush=True)
res = pa.concat_tables(tables)
pq.write_table(res, out)
print('toplam', res.num_rows)
