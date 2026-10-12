import math
LON0, LAT0 = 29.0, 40.8
M_LAT = 110574.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))
SQ3 = math.sqrt(3)
def proj(lon, lat):
    return (lon - LON0) * M_LON, (lat - LAT0) * M_LAT      # x east, y north (metres)
def unproj(x, y):
    return LON0 + x / M_LON, LAT0 + y / M_LAT
def cell_of_xy(x, y, size):
    qf = (SQ3 / 3 * x - y / 3) / size
    rf = (2 / 3 * y) / size
    return cube_round(qf, rf)
def cube_round(qf, rf):
    sf = -qf - rf
    q, r, s = round(qf), round(rf), round(sf)
    dq, dr, ds = abs(q - qf), abs(r - rf), abs(s - sf)
    if dq > dr and dq > ds: q = -r - s
    elif dr > ds: r = -q - s
    return int(q), int(r)
def cell_of(lon, lat, size):
    x, y = proj(lon, lat)
    return cell_of_xy(x, y, size)
def center_xy(q, r, size):
    return size * SQ3 * (q + r / 2), size * 1.5 * r
