import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import {
  EVENT_COLOR,
  GAME_COLOR,
  HoneycombMap,
  LEVEL_COLORS,
  MapButton,
  OFFICIAL_COLOR,
  SEA,
  VENUE_COLOR,
} from '@/components/HoneycombMap';
import { PresenceSheet, RenameCellSheet } from '@/components/MapSheets';
import { NotificationBell, NotificationPanel } from '@/components/NotificationCenter';
import { CellLeaders } from '@/components/CellLeaders';
import { TreasureCellSection } from '@/components/TreasureCellSection';
import { listTreasures, TREASURE_COLORS, type Treasure } from '@/lib/treasure';
import { eventImageUrl } from '@/lib/eventImage';
import { useNotices } from '@/lib/notices';
import { ListRow, Panel } from '@/components/Panel';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useSponsorMenu } from '@/components/useSponsorMenu';
import { VenueAdminModal } from '@/components/VenueAdminModal';
import { CloseX } from '@/components/CloseX';
import { MapEventPopup } from '@/components/MapEventPopup';
import { FINDER_CATEGORIES, FinderButton, FinderMenu, MapSearchBar, type FinderOption } from '@/components/MapSearch';
import { GAMES } from '@/lib/gameCatalog';
import { useAuth } from '@/lib/auth';
import { cellName, loadCellNames, onCellNamesChanged } from '@/lib/cellNames';
import { confirmAction, notify } from '@/lib/dialog';
import { eventCellMarks, listEvents, showsImageOnMap, type EventItem } from '@/lib/events';
import { districtOf, hexDistance, isLand, type Cell } from '@/lib/hex';
import { locateMyCell, myCellNow, nearCell, useMyCell } from '@/lib/myCell';
import { formatWhen } from '@/lib/labels';
import { getDensity, getMapStatus, type DensityCell, type MapStatus } from '@/lib/map';
import { gameCellMarks, listOpenRooms, type OpenRoom } from '@/lib/rooms';
import { isBackendReady } from '@/lib/supabase';
import {
  adminListSponsors,
  adminRemoveVenueFromMap,
  listMapVenues,
  starsText,
  type MapVenue,
  type SponsorRow,
} from '@/lib/venues';
import { venueImageUrl } from '@/lib/venueImage';
import { useTabResetKey } from '@/lib/tabReset';
import { useBackClose } from '@/lib/backPress';
import { colors, fonts, fontSizes, radii, spacing } from '@/theme';

const LEVEL_NAME = { 1: 'Hareketli', 2: 'Çok hareketli', 3: 'En hareketli' } as const;

/** Haritanın üstündeki düğmelerin ve altındaki filtre kartının yaklaşık yüksekliği (açılış görünümü için) */
const TOP_OVERLAY = 80;
const BOTTOM_OVERLAY = 170;
/** Harita açıkken etkinlik, oyun ve yoğunluk bu aralıkla kendiliğinden yenilenir */
const AUTO_REFRESH_MS = 20 * 60 * 1000;
/** “Yakınımda” filtresi: bulunduğun peteğe en çok kaç petek uzaklık */
const NEAR_RADIUS = 4;

type Kind = 'all' | 'konser' | 'games' | 'events' | 'venues';
type When = 'today' | 'week' | 'near' | null;

const KIND_CHIPS: {
  value: Exclude<Kind, 'all'>;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { value: 'konser', label: 'Konser & Festival', icon: 'mic' },
  { value: 'games', label: 'Oyunlar', icon: 'game-controller' },
  { value: 'events', label: 'Etkinlikler', icon: 'calendar' },
  { value: 'venues', label: 'Mekânlar', icon: 'storefront' },
];
const WHEN_CHIPS: { value: Exclude<When, null>; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] =
  [
    { value: 'today', label: 'Bugün', icon: 'today' },
    { value: 'week', label: 'Bu hafta', icon: 'calendar-number' },
    { value: 'near', label: 'Yakınımda', icon: 'navigate' },
  ];

/** Bugünün ve bu haftanın (Pazar gece yarısına kadar) bitiş anı, telefonun saatine göre */
function periodEnds(now: number): { today: number; week: number } {
  const d = new Date(now);
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const dow = d.getDay(); // 0 = Pazar
  const week = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (dow === 0 ? 1 : 8 - dow)).getTime();
  return { today, week };
}

/**
 * Harita sekmesi: uygulamanın ilk açılan ekranı. Üstte bildirim kutusu vardır. Harita açıkken ekranı tamamen kaplar ve kaydırılmaz (kaydırma, harita hareketleriyle
 * çakışıp donmaya yol açıyordu). Renk açıklaması haritanın içindedir; “Harita nasıl çalışır?” açılır penceredir.
 */
/** Konumum: harita bulunduğun peteğe bu genişlikte (px) yaklaşır (çevresi de görünsün diye biraz uzaktan) */
const LOCATE_FAR_PX = 40;

/** Haritadan gelen “göster” yönlendirmesinden sonra bu süre boyunca kendiliğinden konuma gidilmez */
class LocateGate {
  until = 0;
  hold(ms: number) {
    this.until = Date.now() + ms;
  }
}

/**
 * Paket 33: harita sekmesi başka sekmeye geçince baştan kurulmaz (görünüm korunur); yalnızca açık pencereler kapanır.
 * Sekmeye her dönüşte ve ilk açılışta konum bir kez alınır, harita bulunduğun peteğe gider ve “Buradasın” yazar.
 */
export default function MapScreenTab() {
  const resetKey = useTabResetKey('index');
  return <MapScreen resetKey={resetKey} />;
}

function MapScreen({ resetKey }: { resetKey: number }) {
  const { height } = useWindowDimensions();
  const [status, setStatus] = useState<MapStatus | null>(null);
  const [density, setDensity] = useState<DensityCell[]>([]);
  const [loaded, setLoaded] = useState(!isBackendReady);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Cell | null>(null);
  /** Dokunulan ama henüz incelenmeyen petek: 3 boyutlu yükselir, üstünde “İNCELE” çıkar */
  const [preview, setPreview] = useState<Cell | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [focus, setFocus] = useState<{ cell: Cell; key: number; farPx?: number } | null>(null);
  const [appliedParam, setAppliedParam] = useState<string | null>(null);
  const [appliedBell, setAppliedBell] = useState<string | null>(null);
  const [venues, setVenues] = useState<MapVenue[]>([]);
  const [treasures, setTreasures] = useState<Treasure[]>([]);
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);
  const [venueForm, setVenueForm] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('all');
  const [when, setWhen] = useState<When>(null);
  /** “Yakınımda” ve “Konumum” için telefonda kalan petek (sunucuya gönderilmez) */
  const myCell = useMyCell();
  const [locating, setLocating] = useState(false);
  /** Konumum düğmesinden sonra 3 saniye görünen petek adı */
  const [hereName, setHereName] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  /** Alttaki filtre + renk açıklaması yüksekliği (harita düğmeleri bunun üstünde durur) */
  const [bottomH, setBottomH] = useState(120);
  const [sheet, setSheet] = useState<'presence' | 'checkin' | 'rename' | null>(null);
  const [, setNamesTick] = useState(0);
  /** Büyüteç menüsü ve seçilen türün peteklerinde 10 saniye zıplayan oklar */
  const [finderOpen, setFinderOpen] = useState(false);
  const [pointers, setPointers] = useState<{ cells: Cell[]; key: number } | null>(null);
  /** Haritadaki etkinlik görseline dokununca açılan pencere (etkinlik kimlikleri) */
  const [eventPopup, setEventPopup] = useState<string[] | null>(null);
  const seq = useRef(0);
  const { profile } = useAuth();
  const isModerator = profile?.role === 'admin';
  const isSponsor = profile?.role === 'sponsor';

  // Petek adları (moderatörün verdikleri) gelince ekran yenilenir
  useEffect(() => onCellNamesChanged(() => setNamesTick((n) => n + 1)), []);
  const sponsorMenu = useSponsorMenu(isModerator);

  // Etkinlik kartındaki “Haritada gör” bir petek numarası gönderir: harita o peteğe gider ve onu seçer
  const params = useLocalSearchParams<{ q?: string; r?: string; t?: string; bell?: string; arrow?: string }>();
  // Üstten kayan bildirime dokununca: bildirim kutusu açılır
  const bellKey = params.bell ?? null;
  if (bellKey !== appliedBell) {
    setAppliedBell(bellKey);
    if (bellKey) setNotifOpen(true);
  }
  const paramKey = params.q && params.r ? `${params.q},${params.r},${params.t ?? ''}` : null;
  if (paramKey !== appliedParam) {
    setAppliedParam(paramKey);
    const q = Number(params.q);
    const r = Number(params.r);
    if (paramKey && Number.isInteger(q) && Number.isInteger(r) && isLand(q, r)) {
      // “Haritada gör”: menü açılmaz; petek 3 boyutlu “İNCELE” haliyle, biraz uzaktan gösterilir
      setSelected(null);
      setPreview({ q, r });
      setFocus((f) => ({ cell: { q, r }, key: (f?.key ?? 0) + 1, farPx: 30 }));
      // Oyun davetinden: odanın peteği 10 saniye sarı okla gösterilir
      if (params.arrow === '1') setPointers((pt) => ({ cells: [{ q, r }], key: (pt?.key ?? 0) + 1 }));
    }
  }
  // Bir peteği göstermek için gelindiyse (davet, Haritada gör) kendiliğinden konuma gidilmez
  const [gate] = useState(() => new LocateGate());
  useEffect(() => {
    if (paramKey) gate.hold(5000);
  }, [paramKey, gate]);

  // Başka sekmeye geçince yalnızca açık pencereler kapanır; harita görünümü ve veriler korunur
  const [seenReset, setSeenReset] = useState(resetKey);
  if (seenReset !== resetKey) {
    setSeenReset(resetKey);
    setSelected(null);
    setSheet(null);
    setNotifOpen(false);
    setInfoOpen(false);
    setFinderOpen(false);
    setEventPopup(null);
    setVenueForm(false);
    setLegendOpen(false);
  }

  const load = useCallback(async () => {
    if (!isBackendReady) return;
    const my = ++seq.current;
    void loadCellNames();
    // Etkinlik katmanı yoğunluktan bağımsızdır; harita üyelere kapalıyken de etkinlikler görünür
    const evs = await listEvents();
    if (my !== seq.current) return;
    if (!evs.error) setEvents(evs.data);
    // Oyun katmanı: yan yana oynanan, katılıma açık odalar (yalnızca bölge ve adres tarifi; kod hiç görünmez)
    const rms = await listOpenRooms();
    if (my !== seq.current) return;
    if (!rms.error) setRooms(rms.data);
    // Mekânlar yalnızca petek penceresinde (etkinliklerin altında) görünür; haritada işaret yoktur
    const vns = await listMapVenues();
    if (my !== seq.current) return;
    if (!vns.error) setVenues(vns.data);
    // Hazineler: petek, zorluk ve ipucu (kod hiç gelmez)
    const trs = await listTreasures();
    if (my !== seq.current) return;
    setTreasures(trs);
    const st = await getMapStatus();
    if (my !== seq.current) return;
    if (st.error || !st.data) {
      setError(st.error ?? 'Harita okunamadı.');
      setLoaded(true);
      return;
    }
    setStatus(st.data);
    if (st.data.open) {
      const d = await getDensity();
      if (my !== seq.current) return;
      if (d.error) {
        setError(d.error);
      } else {
        setError(null);
        setDensity(d.data);
      }
    } else {
      setError(null);
      setDensity([]);
    }
    setLoaded(true);
  }, []);

  // Sekmeye her gelişte harita tazelenir, açıkken 20 dakikada bir yenilenir; başka ekrana geçilince filtre sıfırlanır
  useFocusEffect(
    useCallback(() => {
      void load();
      setNowTick(Date.now());
      const t = setInterval(() => {
        setNowTick(Date.now());
        void load();
      }, AUTO_REFRESH_MS);
      return () => {
        clearInterval(t);
        setKind('all');
        setWhen(null);
      };
    }, [load]),
  );

  // Android geri tuşu / geri hareketi: önce petek menüsü, sonra öne çıkan petek (İncele) kapanır
  useBackClose(selected !== null, () => setSelected(null));
  useBackClose(selected === null && preview !== null, () => setPreview(null));

  // Oklar 10 saniye sonra kaybolur
  useEffect(() => {
    if (!pointers) return;
    const t = setTimeout(() => setPointers(null), 10000);
    return () => clearTimeout(t);
  }, [pointers]);

  // Petek adı 3 saniye görünür
  useEffect(() => {
    if (!hereName) return;
    const t = setTimeout(() => setHereName(null), 3000);
    return () => clearTimeout(t);
  }, [hereName]);

  /** Konumu bir kez alır ve peteğe çevirir (yalnızca telefonda kalır). */
  async function locateMe(reuse: boolean): Promise<Cell | null> {
    if (locating) return null;
    setLocating(true);
    const c = await locateMyCell('locate', reuse);
    setLocating(false);
    return c;
  }

  async function onLocate() {
    const c = await locateMe(false);
    if (!c) return;
    setFocus((f) => ({ cell: c, key: (f?.key ?? 0) + 1, farPx: LOCATE_FAR_PX }));
    setHereName(`Buradasın: ${cellName(c)}`);
    // Bulunduğun petek öne çıkar ve üstünde “İncele” düğmesi açılır
    setSelected(null);
    setPreview(c);
  }

  // Sekmeye her gelişte (ilk açılış dahil) Konumum kendiliğinden çalışır: konum bir kez alınır, harita peteğe gider,
  // “Buradasın” yazar. Sessizdir: konum alınamazsa hata penceresi açmaz. Bir peteği göstermek için gelindiyse çalışmaz.
  useFocusEffect(
    useCallback(() => {
      if (Date.now() < gate.until) return;
      let alive = true;
      void locateMyCell('locate', false, true).then((c) => {
        if (!alive || !c) return;
        setFocus((f) => ({ cell: c, key: (f?.key ?? 0) + 1, farPx: LOCATE_FAR_PX }));
        setHereName(`Buradasın: ${cellName(c)}`);
        setSelected(null);
        setPreview(c);
      });
      return () => {
        alive = false;
      };
    }, [gate]),
  );

  /** Arama sonucu: harita o peteğe gider, petek öne çıkar ve üstünde “İncele” düğmesi açılır */
  function onSearchPick(c: Cell, label: string) {
    setSelected(null);
    setPreview(c);
    setFocus((f) => ({ cell: c, key: (f?.key ?? 0) + 1 }));
    setHereName(label);
  }

  function onFinderPick(o: FinderOption) {
    setFinderOpen(false);
    setSelected(null);
    setPreview(null);
    setPointers((p) => ({ cells: o.cells, key: (p?.key ?? 0) + 1 }));
    setHereName(`${o.title} · ${o.cells.length} petek`);
  }

  /** Petek akışı: önce konuma bir kez bakılır (yakın değilse akış yine açılır ve nedenini söyler). */
  async function openCellFeed(c: Cell) {
    await locateMyCell('cellfeed');
    router.navigate({ pathname: '/akis', params: { cq: String(c.q), cr: String(c.r), t: String(Date.now()) } });
  }

  /** Peteğe dokunuldu: harita yakınlaşmaz, yalnızca petek menüsü (pencere) açılır. */
  function onSelectCell(c: Cell | null) {
    Keyboard.dismiss();
    setSelected(null);
    setPreview(c);
  }

  async function onWhen(v: Exclude<When, null>) {
    if (when === v) {
      setWhen(null);
      return;
    }
    if (v === 'near' && !myCellNow()) {
      const c = await locateMe(true);
      if (!c) return;
    }
    setWhen(v);
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Filtre: yalnızca seçilen tür görünür; 41. Kat Özel etkinlik/oyunlar ve yoğunluk her zaman görünür
  const near = useCallback(
    (q: number | null, r: number | null) =>
      when !== 'near' || (myCell !== null && q !== null && r !== null && hexDistance({ q, r }, myCell) <= NEAR_RADIUS),
    [when, myCell],
  );
  const shownEvents = useMemo(() => {
    const ends = periodEnds(nowTick);
    return events.filter((e) => {
      if (e.is_official) return true;
      if (kind === 'konser' && e.category !== 'konser_festival') return false;
      if (kind !== 'all' && kind !== 'events' && kind !== 'konser') return false;
      const t = new Date(e.starts_at).getTime();
      if (when === 'today' && !(t < ends.today)) return false;
      if (when === 'week' && !(t < ends.week)) return false;
      return near(e.cell_q, e.cell_r);
    });
  }, [events, kind, when, near, nowTick]);
  // Oyun odaları şu an açıktır; “Bugün” ve “Bu hafta” filtrelerinde de görünür
  const shownRooms = useMemo(
    () => rooms.filter((r) => r.is_official || ((kind === 'all' || kind === 'games') && near(r.place_q, r.place_r))),
    [rooms, kind, near],
  );
  const shownVenues = useMemo(
    () => venues.filter((v) => (kind === 'all' || kind === 'venues') && near(v.cell_q, v.cell_r)),
    [venues, kind, near],
  );
  const filterOn = kind !== 'all' || when !== null;
  // Şehrin Temposu (eski adıyla genel aktiflik): tüm harita (yoğunluk, yaklaşan etkinlikler, açık odalar, hazineler) birlikte sayılır
  const activity = useMemo(() => {
    const dayEnd = nowTick + 24 * 3600 * 1000;
    const score =
      density.reduce((n, d) => n + d.level, 0) +
      events.filter((e) => new Date(e.starts_at).getTime() < dayEnd).length * 2 +
      rooms.length * 3 +
      treasures.length;
    if (score >= 60) return { label: 'Çok yoğun', color: '#FF5C7A' };
    if (score >= 30) return { label: 'Kalabalık', color: '#FF9F43' };
    if (score >= 10) return { label: 'Hareketli', color: '#5BE37D' };
    return { label: 'Sakin', color: '#8EA2C8' };
  }, [density, events, rooms, treasures, nowTick]);
  const marks = useMemo(() => eventCellMarks(shownEvents), [shownEvents]);
  // Görselli öne çıkan etkinlikler: yalnızca Konser & Festival ve 41. Kat Özel etkinlikler peteğin üstünde kart görsel
  const imageMarks = useMemo(() => {
    const by = new Map<string, { q: number; r: number; uris: string[]; ids: string[] }>();
    for (const e of shownEvents) {
      if (e.cell_q === null || e.cell_r === null || !showsImageOnMap(e)) continue;
      const uri = eventImageUrl(e.image_path);
      if (!uri) continue;
      const k = `${e.cell_q},${e.cell_r}`;
      const cur = by.get(k) ?? { q: e.cell_q, r: e.cell_r, uris: [], ids: [] };
      cur.uris.push(uri);
      cur.ids.push(e.id);
      by.set(k, cur);
    }
    return [...by.values()];
  }, [shownEvents]);
  const gameMarks = useMemo(() => gameCellMarks(shownRooms), [shownRooms]);
  const venueCells = useMemo(() => shownVenues.map((v) => ({ q: v.cell_q, r: v.cell_r })), [shownVenues]);
  const treasureCells = useMemo(
    () => treasures.map((t) => ({ q: t.cell_q, r: t.cell_r, difficulty: t.difficulty })),
    [treasures],
  );
  const officialCells = useMemo(() => {
    const out: Cell[] = [];
    for (const e of events) {
      if (e.is_official && e.cell_q !== null && e.cell_r !== null) out.push({ q: e.cell_q, r: e.cell_r });
    }
    for (const r of rooms) {
      if (r.is_official && r.place_q !== null && r.place_r !== null) out.push({ q: r.place_q, r: r.place_r });
    }
    return out;
  }, [events, rooms]);
  // Büyüteç menüsü: filtreden bağımsız, haritadaki bütün oyun odaları, hazineler ve etkinlikler
  const finder = useMemo(() => {
    const uniq = (list: Cell[]) => {
      const seen = new Set<string>();
      return list.filter((c) => {
        const k = `${c.q},${c.r}`;
        if (!isLand(c.q, c.r) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };
    const games: FinderOption[] = (Object.keys(GAMES) as (keyof typeof GAMES)[])
      .filter((g) => g !== 'quiz') // Bilgi Yarışması uzaktan oynanır, haritada yeri yok
      .map((g) => ({
        key: g,
        title: GAMES[g].title,
        cells: uniq(
          g === 'treasure_hunt'
            ? treasures.map((t) => ({ q: t.cell_q, r: t.cell_r }))
            : rooms
                .filter((r) => r.game_type === g && r.place_q !== null && r.place_r !== null)
                .map((r) => ({ q: r.place_q as number, r: r.place_r as number })),
        ),
      }));
    const categories: FinderOption[] = FINDER_CATEGORIES.map((c) => ({
      key: c.key,
      title: c.title,
      cells: uniq(
        events
          .filter((e) => e.category === c.key && e.cell_q !== null && e.cell_r !== null)
          .map((e) => ({ q: e.cell_q as number, r: e.cell_r as number })),
      ),
    }));
    return { games, categories };
  }, [rooms, events, treasures]);

  const hereEvents = selected ? shownEvents.filter((e) => e.cell_q === selected.q && e.cell_r === selected.r) : [];
  const hereRooms = selected ? shownRooms.filter((r) => r.place_q === selected.q && r.place_r === selected.r) : [];
  const hereVenues = selected ? shownVenues.filter((v) => v.cell_q === selected.q && v.cell_r === selected.r) : [];

  async function openVenueForm() {
    const res = await adminListSponsors();
    if (res.error) {
      notify('Mekân eklenemedi', res.error);
      return;
    }
    setSponsors(res.data);
    setVenueForm(true);
  }

  async function removeVenue(v: MapVenue) {
    const ok = await confirmAction(
      'Mekân haritadan kaldırılsın mı?',
      `“${v.name}” bu petekte görünmeyecek. Hesap ve yorumlar silinmez; istersen sonra yeniden eklenir.`,
      'Kaldır',
      true,
    );
    if (!ok) return;
    const res = await adminRemoveVenueFromMap(v.user_id);
    if (res.error) {
      notify('Kaldırılamadı', res.error);
      return;
    }
    void load();
  }

  const levelOf = (c: Cell): 0 | 1 | 2 | 3 => density.find((d) => d.cell_q === c.q && d.cell_r === c.r)?.level ?? 0;

  // Harita henüz açık değilse (üye hesabında) ya da yükleniyorsa sade, kaydırılabilir bir ekran
  if (!isBackendReady || !loaded || !status) {
    return (
      <Screen
        title="Harita"
        subtitle="Kocaeli’de bu hafta nerede hareket var?"
        onRefresh={onRefresh}
        refreshing={refreshing}
        headerRight={isBackendReady ? <NotificationBell onPress={() => setNotifOpen(true)} /> : undefined}
      >
        {notifOpen ? <NotificationPanel onClose={() => setNotifOpen(false)} /> : null}
        {!isBackendReady ? (
          <Panel>
            <ListRow
              icon="cloud-offline-outline"
              title="Sunucu bağlantısı kurulmadı"
              subtitle="Harita için bağlantı gerekir."
            />
          </Panel>
        ) : !loaded ? (
          <Text style={styles.muted}>Harita yükleniyor…</Text>
        ) : (
          <View style={styles.gap}>
            <Text style={styles.error}>{error ?? 'Harita okunamadı.'}</Text>
            <PrimaryButton label="Tekrar dene" variant="ghost" onPress={() => void onRefresh()} />
          </View>
        )}
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.mapArea}>
          <HoneycombMap
            density={density}
            selected={selected}
            onSelect={onSelectCell}
            raised={selected ? null : preview}
            onRaisedPress={() => {
              setSelected(preview);
              setPreview(null);
            }}
            eventCells={marks}
            gameCells={gameMarks}
            venueCells={venueCells}
            officialCells={officialCells}
            treasureCells={treasureCells}
            focus={focus}
            pointers={pointers}
            imageMarks={imageMarks}
            plainCloseUp
            onImagePress={(ids) => setEventPopup([...ids])}
            leadingControls={<FinderButton onPress={() => setFinderOpen(true)} active={pointers !== null} />}
            topInset={TOP_OVERLAY}
            bottomInset={BOTTOM_OVERLAY}
            controlsBottom={bottomH + 4}
            hideControls={selected !== null}
            extraControls={
              <MapButton
                icon={locating ? 'hourglass-outline' : 'locate'}
                label="Konumum: bulunduğum peteğe git"
                onPress={() => void onLocate()}
                disabled={locating}
                testID="map-locate"
              />
            }
          />

          {!selected ? (
            <>
              {/* Sol üst: bilgi düğmesi ve harita durumu */}
              <View style={styles.topBar} pointerEvents="box-none">
                {!status.open ? (
                  <View style={[styles.chip, styles.chipWarn]} pointerEvents="none" testID="map-density-soon-chip">
                    <Ionicons name="time-outline" size={14} color={colors.accent} />
                    <Text style={styles.chipText}>Yoğunluk yakında</Text>
                  </View>
                ) : !status.is_public ? (
                  <View style={[styles.chip, styles.chipWarn]} pointerEvents="none" testID="map-closed-chip">
                    <Ionicons name="shield-checkmark-outline" size={14} color={colors.accent} />
                    <Text style={styles.chipText}>Üyelere kapalı</Text>
                  </View>
                ) : null}
              </View>

              {/* Üst orta: yüzen arama çubuğu (yer ve petek adı) */}
              <MapSearchBar onPick={onSearchPick} />

              {/* Sağ üst: büyük bildirim zili (harita düğmelerinden ayrı) */}
              <View style={styles.bellWrap} pointerEvents="box-none">
                <BigBell onPress={() => setNotifOpen(true)} />
              </View>

              {/* Konumum: petek adı 3 saniye sarı yazıyla */}
              {hereName ? (
                <View style={styles.hereBanner} pointerEvents="none" testID="map-here-name">
                  <Ionicons name="location" size={18} color={OFFICIAL_COLOR} />
                  <Text style={styles.hereText} numberOfLines={2}>
                    {hereName}
                  </Text>
                </View>
              ) : null}

              {/* Sol: dikey renk açıklaması (dokununca sağa açılır) */}
              <View style={styles.legendWrap} pointerEvents="box-none">
                <View style={styles.legendStack} pointerEvents="box-none">
                  {/* Küçük bilgi düğmesi: renk açıklamasının hemen üstünde */}
                  <BreathingInfo onPress={() => setInfoOpen(true)} />
                  <Legend densityOpen={status.open} open={legendOpen} onToggle={() => setLegendOpen((o) => !o)} />
                </View>
              </View>

              {/* En alt: kaydırmalı filtreler (arka kutu yok): üstte zaman, altta tür */}
              <View
                style={styles.bottomStack}
                pointerEvents="box-none"
                onLayout={(e) => setBottomH(Math.round(e.nativeEvent.layout.height))}
              >
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {/* Tüm haritanın genel aktifliği (filtrelerin hemen üstünde) */}
                <View style={styles.activityWrap} pointerEvents="none">
                  <View style={[styles.activityBox, { borderColor: activity.color }]} testID="map-activity">
                    <View style={[styles.activityDot, { backgroundColor: activity.color }]} />
                    <Text style={styles.activityLabel}>Şehrin Temposu</Text>
                    <Text style={[styles.activityValue, { color: activity.color }]}>{activity.label}</Text>
                  </View>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.filterRow, styles.filterRowCenter]}
                  testID="map-filter-when"
                >
                  {WHEN_CHIPS.map((c) => {
                    const on = when === c.value;
                    return (
                      <Pressable
                        key={c.value}
                        onPress={() => void onWhen(c.value)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        testID={`map-when-${c.value}`}
                        style={({ pressed }) => [
                          styles.fChip,
                          on && styles.fChipWhenOn,
                          pressed && styles.eventRowPressed,
                        ]}
                      >
                        <Ionicons name={c.icon} size={13} color={on ? '#FFFFFF' : colors.text} />
                        <Text style={[styles.fChipText, on && styles.fChipTextWhenOn]}>{c.label}</Text>
                      </Pressable>
                    );
                  })}
                  {filterOn ? (
                    <Pressable
                      onPress={() => {
                        setKind('all');
                        setWhen(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Filtreyi temizle"
                      testID="map-filter-clear"
                      style={({ pressed }) => [styles.fChip, pressed && styles.eventRowPressed]}
                    >
                      <Ionicons name="close" size={14} color={colors.textMuted} />
                      <Text style={styles.fChipText}>Temizle</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                  testID="map-filter-kind"
                >
                  {KIND_CHIPS.map((c) => {
                    const on = kind === c.value;
                    return (
                      <Pressable
                        key={c.value}
                        onPress={() => setKind(on ? 'all' : c.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        testID={`map-kind-${c.value}`}
                        style={({ pressed }) => [styles.fChip, on && styles.fChipOn, pressed && styles.eventRowPressed]}
                      >
                        <Ionicons name={c.icon} size={13} color={on ? colors.primaryText : colors.text} />
                        <Text style={[styles.fChipText, on && styles.fChipTextOn]}>{c.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </>
          ) : (
            /* Petek menüsü: ortada açılan pencere; açıkken haritadaki diğer her şey gizlenir */
            <View style={styles.cellMenuWrap} pointerEvents="box-none">
              <View style={[styles.cellMenu, { maxHeight: Math.round(height * 0.72) }]} testID="map-cell-menu">
                <View style={styles.cellMenuHead}>
                  <View style={styles.flex1}>
                    <View style={styles.nameRow}>
                      <Text style={styles.cellMenuName} numberOfLines={2} testID="map-cell-name">
                        {cellName(selected)}
                      </Text>
                      {isModerator ? (
                        <Pressable
                          onPress={() => setSheet('rename')}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel="Petek adını değiştir"
                          testID="map-cell-rename"
                        >
                          <Ionicons name="create-outline" size={18} color={colors.primary} />
                        </Pressable>
                      ) : null}
                    </View>
                    <Text
                      style={styles.cellMenuDistrict}
                    >{`${districtOf(selected.q, selected.r) ?? 'Kocaeli'} bölgesi`}</Text>
                  </View>
                  <Pressable
                    onPress={() => setSelected(null)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Petek menüsünü kapat"
                    testID="map-cell-close"
                    style={({ pressed }) => [styles.cellClose, pressed && styles.eventRowPressed]}
                  >
                    <CloseX size={16} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.cellMenuBody} nestedScrollEnabled>
                  <SelectedInfo cell={selected} level={levelOf(selected)} densityOpen={status.open} />
                  {!isSponsor ? (
                    <Pressable
                      onPress={() => void openCellFeed(selected)}
                      accessibilityRole="button"
                      accessibilityLabel="Petek akışına git"
                      testID="map-cell-feed"
                      style={({ pressed }) => [styles.feedBtn, pressed && styles.eventRowPressed]}
                    >
                      <Ionicons name="chatbubbles" size={20} color={colors.primaryText} />
                      <View style={styles.flex1}>
                        <Text style={styles.feedBtnTitle}>Petek akışı</Text>
                        <Text style={styles.feedBtnSub}>
                          {nearCell(myCell, selected)
                            ? 'Yakınındasın: rumuzunla yazabilir, eski gönderileri görebilirsin.'
                            : 'Peteğe en çok 1 petek yakınsan rumuzunla yazabilir ve okuyabilirsin.'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.primaryText} />
                    </Pressable>
                  ) : null}
                  <TreasureCellSection
                    key={`tr-${selected.q},${selected.r}`}
                    cell={selected}
                    treasure={treasures.find((t) => t.cell_q === selected.q && t.cell_r === selected.r) ?? null}
                    isModerator={isModerator}
                    onChanged={() => void load()}
                  />
                  <GamesHere rooms={hereRooms} />
                  <EventsHere events={hereEvents} compact={hereRooms.length > 0} />
                  <VenuesHere
                    venues={hereVenues}
                    onOpen={sponsorMenu.openVenue}
                    isModerator={isModerator}
                    onRemove={(v) => void removeVenue(v)}
                  />
                  {isModerator ? (
                    <PrimaryButton label="Bu peteğe mekân ekle" variant="ghost" onPress={() => void openVenueForm()} />
                  ) : null}
                  <CellLeaders key={`cl-${selected.q},${selected.r}`} cell={selected} />
                  <View style={styles.cellActions}>
                    <Pressable
                      onPress={() => setSheet('presence')}
                      accessibilityRole="button"
                      accessibilityLabel="Bu petekte şu an kaç kişi var?"
                      testID="map-presence"
                      style={({ pressed }) => [styles.cellAction, pressed && styles.eventRowPressed]}
                    >
                      <Ionicons name="search" size={16} color={colors.primary} />
                      <Text style={styles.cellActionText}>Burada kim var?</Text>
                    </Pressable>
                    {!isSponsor ? (
                      <Pressable
                        onPress={() => setSheet('checkin')}
                        accessibilityRole="button"
                        accessibilityLabel="Buradayım, konumumu bildir"
                        testID="map-checkin"
                        style={({ pressed }) => [styles.cellAction, pressed && styles.eventRowPressed]}
                      >
                        <Ionicons name="location" size={16} color={colors.primary} />
                        <Text style={styles.cellActionText}>Buradayım</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() =>
                      void notify(
                        'Bu peteği adlandır',
                        'Bir peteğe isim verebilmek için o petekte 2 ay arka arkaya en çok oyun oynayan ya da en çok etkinlik düzenleyen kişi olman gerekir. Bu şartı sağlayan kişiler moderatöre bildirilir; moderatör seninle iletişime geçer.',
                        { icon: 'create' },
                      )
                    }
                    accessibilityRole="button"
                    testID="map-cell-name-info"
                    style={({ pressed }) => [styles.nameLink, pressed && styles.eventRowPressed]}
                  >
                    <Ionicons name="create-outline" size={15} color={colors.textMuted} />
                    <Text style={styles.nameLinkText}>Bu peteği adlandır</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>

      {eventPopup ? (
        <MapEventPopup
          events={eventPopup
            .map((id) => events.find((e) => e.id === id))
            .filter((e): e is EventItem => e !== undefined)}
          onClose={() => setEventPopup(null)}
          onChanged={() => void load()}
        />
      ) : null}
      {finderOpen ? (
        <FinderMenu
          games={finder.games}
          categories={finder.categories}
          onPick={onFinderPick}
          onClose={() => setFinderOpen(false)}
        />
      ) : null}
      <InfoModal visible={infoOpen} onClose={() => setInfoOpen(false)} status={status} />
      {isModerator ? (
        <VenueAdminModal
          visible={venueForm}
          onClose={() => setVenueForm(false)}
          sponsors={sponsors}
          cell={selected}
          onSaved={() => {
            setVenueForm(false);
            void load();
          }}
        />
      ) : null}
      {sponsorMenu.nodes}
      {(sheet === 'presence' || sheet === 'checkin') && selected ? (
        <PresenceSheet
          key={`${selected.q},${selected.r}`}
          cell={selected}
          canCheckIn={!isSponsor}
          autoCheckIn={sheet === 'checkin'}
          presenceOpen={status.presence_open ?? false}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'rename' && selected && isModerator ? (
        <RenameCellSheet cell={selected} onClose={() => setSheet(null)} />
      ) : null}
      {notifOpen ? <NotificationPanel onClose={() => setNotifOpen(false)} /> : null}
    </View>
  );
}

/**
 * Harita ekranının büyük bildirim zili. Bildirim yokken içi şeffaftır. Yeni bildirim varken düğme büyüyüp küçülür
 * ve yalnızca içindeki zil simgesi sallanır (halka sallanmaz).
 */
function BigBell({ onPress }: { onPress: () => void }) {
  const { notifications } = useNotices();
  const unread = notifications > 0;
  const [scale] = useState(() => new Animated.Value(1));
  const [swing] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!unread) {
      swing.setValue(0);
      return;
    }
    const step = (to: number, duration: number) =>
      Animated.timing(swing, { toValue: to, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const loop = Animated.loop(
      Animated.sequence([
        step(1, 90),
        step(-1, 160),
        step(0.7, 140),
        step(-0.7, 140),
        step(0.35, 110),
        step(0, 90),
        Animated.delay(650),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [unread, swing]);
  const rotate = swing.interpolate({ inputRange: [-1, 1], outputRange: ['-22deg', '22deg'] });
  useEffect(() => {
    if (!unread) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.18,
          duration: 520,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, { toValue: 1, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [unread, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={unread ? `Bildirimler, ${notifications} yeni` : 'Bildirimler'}
        testID="notification-bar"
        style={({ pressed }) => [styles.bigBell, unread && styles.bigBellUnread, pressed && styles.eventRowPressed]}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={28} color="#FFFFFF" />
        </Animated.View>
        {unread ? (
          <View style={styles.bigBellBadge}>
            <Text style={styles.bigBellBadgeText}>{notifications > 99 ? '99+' : notifications}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** Küçük bilgi düğmesi: çok hafif nefes alma animasyonu (dikkat çeker ama rahatsız etmez) */
function BreathingInfo({ onPress }: { onPress: () => void }) {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Harita nasıl çalışır?"
        testID="map-info"
        hitSlop={8}
        style={({ pressed }) => [styles.infoBtn, pressed && styles.eventRowPressed]}
      >
        <Ionicons name="help" size={17} color="#1A1200" />
      </Pressable>
    </Animated.View>
  );
}

/** Dikey renk açıklaması: kapalıyken yalnızca renkler, dokununca sağa açılıp yazılar görünür. */
function Legend({ densityOpen, open, onToggle }: { densityOpen: boolean; open: boolean; onToggle: () => void }) {
  const items: { key: string; swatch: React.ReactNode; label: string }[] = [
    ...(densityOpen
      ? [
          {
            key: 'l0',
            swatch: <View style={[styles.swatch, { backgroundColor: '#1B2440' }]} />,
            label: 'Veri yok / az',
          },
          {
            key: 'l1',
            swatch: <View style={[styles.swatch, { backgroundColor: LEVEL_COLORS[1] }]} />,
            label: 'Hareketli',
          },
          {
            key: 'l2',
            swatch: <View style={[styles.swatch, { backgroundColor: LEVEL_COLORS[2] }]} />,
            label: 'Çok hareketli',
          },
          {
            key: 'l3',
            swatch: <View style={[styles.swatch, { backgroundColor: LEVEL_COLORS[3] }]} />,
            label: 'En hareketli',
          },
        ]
      : []),
    { key: 'game', swatch: <View style={styles.gameSwatch} />, label: 'Oyun' },
    { key: 'event', swatch: <View style={styles.eventDot} />, label: 'Etkinlik' },
    { key: 'venue', swatch: <View style={styles.venueSwatch} />, label: 'Mekân' },
    { key: 'treasure', swatch: <Ionicons name="search" size={11} color={TREASURE_COLORS.kolay} />, label: 'Hazine' },
    { key: 'official', swatch: <Text style={styles.officialStar}>★</Text>, label: '41. Kat Özel' },
  ];
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Renk açıklamasını kapat' : 'Renk açıklamasını aç'}
      accessibilityState={{ expanded: open }}
      style={styles.legendCol}
      testID="map-legend"
    >
      {items.map((i) => (
        <View key={i.key} style={styles.legendRowV}>
          {i.swatch}
          {open ? <Text style={styles.legendText}>{i.label}</Text> : null}
        </View>
      ))}
      <View style={styles.legendToggle}>
        <Ionicons name={open ? 'chevron-back' : 'chevron-forward'} size={12} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function SelectedInfo({ level, densityOpen }: { cell: Cell; level: 0 | 1 | 2 | 3; densityOpen: boolean }) {
  if (!densityOpen) return null;
  return (
    <View style={styles.selected} testID="map-selected">
      <Ionicons
        name={level === 0 ? 'ellipse-outline' : 'flame-outline'}
        size={18}
        color={level === 0 ? colors.textMuted : colors.danger}
      />
      <View style={styles.selectedText}>
        <Text style={[styles.selectedTitle, level > 0 && { color: colors.danger }]}>
          {level === 0 ? 'Gri bölge' : LEVEL_NAME[level]}
        </Text>
        <Text style={styles.selectedSub}>
          {level === 0
            ? 'Bu bölge için gösterilecek kadar veri yok. Gri, “kimse yok” demek değildir.'
            : 'Bu bölgede bu hafta birçok üye hareket etti. Kimin olduğu gösterilmez.'}
        </Text>
      </View>
    </View>
  );
}

const SHOWN_EVENTS = 3;
const SHOWN_GAMES = 3;

/** Seçilen petekteki açık oyun odaları (listenin en üstünde). Bir odaya dokununca o oyunun “Açık odalar” ekranı açılır. */
function GamesHere({ rooms }: { rooms: OpenRoom[] }) {
  if (rooms.length === 0) return null;
  const shown = rooms.slice(0, SHOWN_GAMES);
  return (
    <View style={styles.eventsBox} testID="map-games-here">
      <View style={styles.eventsHead}>
        <Ionicons name="game-controller" size={18} color={GAME_COLOR} />
        <Text style={styles.gamesTitle}>{`Bu petekte ${rooms.length} açık oyun odası var`}</Text>
      </View>
      {shown.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => router.push({ pathname: '/acik-odalar', params: { game: r.game_type } })}
          accessibilityRole="button"
          accessibilityLabel={`${r.game_title} odalarını gör`}
          testID="map-game-row"
          style={({ pressed }) => [styles.eventRow, pressed && styles.eventRowPressed]}
        >
          <View style={styles.eventRowText}>
            <Text style={styles.eventRowTitle} numberOfLines={1}>
              {r.game_title}
            </Text>
            <Text style={styles.eventRowMeta} numberOfLines={2}>
              {[r.is_official ? '41. Kat Özel' : r.host_name, `${r.player_count} oyuncu`, r.place_note]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
      {rooms.length > shown.length ? (
        <Text style={styles.eventsMore}>{`ve ${rooms.length - shown.length} oda daha (Oyunlar sekmesinde)`}</Text>
      ) : null}
    </View>
  );
}

/** Seçilen petekteki yaklaşan etkinlikler. Etkinlik yoksa bunu açıkça söyler. */
function EventsHere({ events, compact = false }: { events: EventItem[]; compact?: boolean }) {
  if (events.length === 0) {
    // Oyun odası varsa "etkinlik yok" satırı gereksiz yer kaplar
    if (compact) return null;
    return (
      <View style={styles.eventsBox} testID="map-events-none">
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <Text style={styles.eventsNone}>Bu petekte yaklaşan etkinlik yok.</Text>
      </View>
    );
  }
  const shown = events.slice(0, compact ? 2 : SHOWN_EVENTS);
  return (
    <View style={styles.eventsBox} testID="map-events-here">
      <View style={styles.eventsHead}>
        <Ionicons name="calendar" size={18} color={EVENT_COLOR} />
        <Text style={styles.eventsTitle}>{`Bu petekte ${events.length} etkinlik var`}</Text>
      </View>
      {shown.map((e) => (
        <Pressable
          key={e.id}
          onPress={() => router.push('/events')}
          accessibilityRole="button"
          accessibilityLabel={`${e.title} etkinliğini etkinlikler sekmesinde gör`}
          testID="map-event-row"
          style={({ pressed }) => [styles.eventRow, pressed && styles.eventRowPressed]}
        >
          {showsImageOnMap(e) ? (
            <Image
              source={{ uri: eventImageUrl(e.image_path) ?? undefined }}
              contentFit="cover"
              style={styles.eventThumb}
            />
          ) : null}
          <View style={styles.eventRowText}>
            <Text style={styles.eventRowTitle} numberOfLines={1}>
              {e.title}
            </Text>
            <Text style={styles.eventRowMeta} numberOfLines={1}>
              {`${formatWhen(new Date(e.starts_at))} · ${e.host_name}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
      {events.length > shown.length ? (
        <Text
          style={styles.eventsMore}
        >{`ve ${events.length - shown.length} etkinlik daha (Etkinlikler sekmesinde)`}</Text>
      ) : null}
    </View>
  );
}

/** Seçilen petekteki sponsorlu mekânlar (etkinliklerin altında). Satıra dokununca mekân profili açılır. */
function VenuesHere({
  venues,
  onOpen,
  isModerator,
  onRemove,
}: {
  venues: MapVenue[];
  onOpen: (id: string) => void;
  isModerator: boolean;
  onRemove: (v: MapVenue) => void;
}) {
  if (venues.length === 0) return null;
  return (
    <View style={styles.eventsBox} testID="map-venues-here">
      <View style={styles.eventsHead}>
        <Ionicons name="storefront" size={18} color={colors.venue} />
        <Text style={styles.venuesTitle}>{`Bu petekte ${venues.length} mekân var`}</Text>
      </View>
      {venues.map((v) => (
        <View key={v.user_id} style={styles.venueLine}>
          <Pressable
            onPress={() => onOpen(v.user_id)}
            accessibilityRole="button"
            accessibilityLabel={`${v.name} mekânını görüntüle`}
            testID="map-venue-row"
            style={({ pressed }) => [styles.eventRow, styles.venueMain, pressed && styles.eventRowPressed]}
          >
            {v.image_path ? <Avatar index={1} size={30} uri={venueImageUrl(v.image_path)} /> : null}
            <View style={styles.eventRowText}>
              <Text style={styles.eventRowTitle} numberOfLines={1}>
                {v.name}
              </Text>
              <Text style={styles.eventRowMeta} numberOfLines={1}>
                {[
                  v.avg_stars === null ? 'Yeni mekân' : `★ ${starsText(v.avg_stars)}`,
                  v.closing_hours ? `Kapanış ${v.closing_hours}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
          {isModerator ? (
            <Pressable
              onPress={() => onRemove(v)}
              accessibilityRole="button"
              accessibilityLabel={`${v.name} mekânını haritadan kaldır`}
              hitSlop={8}
              style={styles.venueRemove}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** “Harita nasıl çalışır?” açılır penceresi */
function InfoModal({ visible, onClose, status }: { visible: boolean; onClose: () => void; status: MapStatus }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={styles.modalCard} testID="map-info-modal">
          <Text style={styles.modalTitle} accessibilityRole="header">
            Harita nasıl çalışır?
          </Text>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <Panel>
              <ListRow
                icon="grid-outline"
                title="Petekler"
                subtitle="Kocaeli peteklere bölünür; her peteğin bir adı vardır. Renk, o bölgede bu hafta ne kadar hareket olduğunu gösterir. En yoğun peteğin çevresindeki petekler de bir ton koyulaşır."
              />
              <ListRow
                icon="add-circle-outline"
                title="Haritaya nasıl katkı verilir?"
                subtitle="Gönderine bir yer eklersen, bir oyuna girersen, bir etkinlikte kodunu doğrularsan ya da peteğe dokunup “Buradayım” dersen bulunduğun bölge haritadaki yoğunluğa sayılır. Kimin olduğu hiçbir zaman görünmez."
              />
              <ListRow
                icon="eye-off-outline"
                title="Kimse görünmez"
                subtitle={`Bir petek en az ${status.min_people} farklı üye olmadan renklenmez. Gri, “kimse yok” demek değil, “göstermek için yeterli veri yok” demektir. Kişi ya da sayı hiçbir zaman gösterilmez.`}
              />
              <ListRow
                icon="refresh-outline"
                title="Güncelleme"
                subtitle="Harita açıkken 20 dakikada bir kendiliğinden yenilenir. Kimsenin şu an nerede olduğu anlaşılmaz."
              />
              <ListRow
                icon="search-outline"
                title="Hazineler"
                subtitle="Büyüteçli petekler Hazine Avı hazineleridir. Renk zorluğu gösterir: yeşil kolay, mavi orta, pembe-mor zor, beyaz imkânsız (imkânsız hazinenin çevresi de açık renkle boyanır). Peteğe dokunup ipucunu oku; kodu Oyunlar > Hazine Avı’na gir."
              />
              <ListRow
                icon="funnel-outline"
                title="Filtre ve konumum"
                subtitle="Alttaki iki şeritten yalnızca Konser & Festival etkinliklerini, oyunları, etkinlikleri ya da mekânları; bugünü, bu haftayı ya da yakınını seçebilirsin. Bir peteğe dokununca büyük petek menüsü açılır; oradan petek akışına gidebilirsin. 41. Kat Özel etkinlikler ve yoğunluk her zaman görünür. Başka ekrana geçince filtre sıfırlanır. “Konumum” düğmesi konumuna bir kez bakıp seni peteğine götürür; konumun sunucuya gönderilmez."
              />
              <ListRow
                icon="location-outline"
                title="Konum sürekli izlenmez"
                subtitle="Konumuna yalnızca gönderiye yer eklerken ve bir oyuna girerken, her seferinde bir kez bakılır; öncesinde sana haber verilir. Tam konumun sunucuya gitmez ve kaydedilmez, yalnızca bölge numarası tutulur."
              />
              <ListRow
                icon="calendar-outline"
                title="Etkinlikler"
                subtitle="Turkuaz işaretli petekler, yaklaşan etkinliklerin yapılacağı bölgelerdir; işaretteki sayı o petekteki etkinlik adedidir. Etkinlikler yoğunluk renklerini etkilemez. Yalnızca etkinliği açan kişinin seçtiği bölge görünür."
              />
              <ListRow
                icon="game-controller-outline"
                title="Oyunlar"
                subtitle="Mor işaretli petekler, katılıma açık oyun odalarının kurulduğu bölgelerdir; işaretteki sayı o petekteki oda adedidir. Peteğe dokununca odalar en üstte listelenir. Hem oyun hem etkinlik olan peteğin çerçevesi iki renkli görünür: sol yarısı mor (oyun), sağ yarısı turkuaz (etkinlik). Oda kodu haritada görünmez."
              />
              {!status.open ? (
                <ListRow
                  icon="time-outline"
                  tone="accent"
                  title="Yoğunluk katmanı yakında"
                  subtitle="Üye sayısı yeterli olunca ve gizlilik metinleri hazır olunca renkli yoğunluk petekleri de açılacak. O zamana kadar haritada yalnızca etkinlikler görünür."
                />
              ) : !status.is_public ? (
                <ListRow
                  icon="shield-checkmark-outline"
                  tone="accent"
                  title="Harita henüz üyelere kapalı"
                  subtitle="Sen moderatör olduğun için görüyorsun. Üyelere açmak için KURULUM_REHBERI.md’deki harita bölümüne bak."
                />
              ) : null}
            </Panel>
            <Text style={styles.credit}>
              Harita 41. Kat Sosyal tarafından çizilmiştir. Yer verisi: Overture Maps Foundation (CDLA-Permissive-2.0).
            </Text>
          </ScrollView>
          <PrimaryButton label="Tamam" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SEA },
  safe: { flex: 1 },
  mapArea: { flex: 1 },
  gap: { gap: spacing.md },
  muted: { color: colors.textMuted, fontSize: fontSizes.sm },
  error: { color: colors.danger, fontSize: fontSizes.sm, lineHeight: 20 },
  filterRow: { gap: 6, alignItems: 'center', paddingHorizontal: 10 },
  // Bugün · Bu hafta · Yakınımda satırı ekranda ortalanır (sığmazsa yine kaydırılır)
  filterRowCenter: { flexGrow: 1, justifyContent: 'center' },
  bellWrap: { position: 'absolute', top: 18, right: 20 },
  legendWrap: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center', paddingLeft: 6 },
  legendCol: {
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderRadius: radii.md,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 7,
  },
  legendRowV: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 13 },
  legendToggle: { alignItems: 'center', marginTop: 2 },
  activityWrap: { alignItems: 'center' },
  activityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    backgroundColor: colors.overlay,
  },
  activityDot: { width: 7, height: 7, borderRadius: 4 },
  activityLabel: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: 10 },
  activityValue: { fontFamily: fonts.black, fontSize: 12 },
  bigBell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigBellUnread: { backgroundColor: colors.danger },
  bigBellBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigBellBadgeText: { color: colors.danger, fontFamily: fonts.black, fontSize: 12 },
  cellMenuWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  cellMenu: {
    borderRadius: 22,
    backgroundColor: colors.overlay,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 200, 61, 0.5)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  bottomStack: { position: 'absolute', left: 0, right: 0, bottom: 6, gap: 5 },
  legendCard: {
    marginHorizontal: 10,
    alignSelf: 'flex-start',
    maxWidth: '95%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  filterCard: {
    gap: 6,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cellMenuHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  cellMenuName: { color: OFFICIAL_COLOR, fontFamily: fonts.black, fontSize: fontSizes.xl, flexShrink: 1 },
  cellMenuDistrict: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.sm, marginTop: 2 },
  cellClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellMenuBody: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  flex1: { flex: 1 },
  nameLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  nameLinkText: { color: colors.textMuted, fontFamily: fonts.semi, fontSize: fontSizes.xs },
  feedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
  },
  feedBtnTitle: { color: colors.primaryText, fontFamily: fonts.extra, fontSize: fontSizes.md },
  feedBtnSub: { color: colors.primaryText, fontSize: fontSizes.xs, lineHeight: 16, opacity: 0.85 },
  eventThumb: { width: 56, height: 36, borderRadius: 6 },
  fChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  fChipWhenOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  fChipText: { color: colors.text, fontFamily: fonts.semi, fontSize: 12 },
  fChipTextOn: { color: colors.primaryText },
  fChipTextWhenOn: { color: '#FFFFFF' },
  fSep: { width: 1, height: 22, backgroundColor: colors.border, marginHorizontal: 2 },
  topBar: {
    position: 'absolute',
    top: 78,
    left: 10,
    right: 80,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  legendStack: { gap: 6, alignItems: 'flex-start' },
  infoBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: OFFICIAL_COLOR,
    borderWidth: 1.5,
    borderColor: '#FFE7A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hereBanner: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '64%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(11, 15, 26, 0.88)',
  },
  hereText: { color: OFFICIAL_COLOR, fontFamily: fonts.black, fontSize: fontSizes.lg, flexShrink: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipWarn: { borderColor: 'rgba(124, 140, 255, 0.6)' },
  chipText: { color: colors.text, fontFamily: fonts.semi, fontSize: 13 },
  bottomCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 11, height: 11, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  legendText: { color: colors.textMuted, fontSize: 10.5, fontFamily: fonts.semi },
  eventDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: EVENT_COLOR },
  gameSwatch: { width: 11, height: 11, borderRadius: 4, backgroundColor: GAME_COLOR },
  venueSwatch: { width: 11, height: 11, borderRadius: 3, borderWidth: 2.5, borderColor: VENUE_COLOR },
  officialStar: { color: OFFICIAL_COLOR, fontSize: 15, lineHeight: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellNameText: { color: colors.primary, fontFamily: fonts.black, fontSize: fontSizes.sm, flexShrink: 1 },
  cellActions: { flexDirection: 'row', gap: spacing.sm },
  cellAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  cellActionText: { color: colors.text, fontFamily: fonts.semi, fontSize: 13 },
  hereList: { gap: spacing.sm },
  gamesTitle: { color: GAME_COLOR, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  venuesTitle: { color: colors.venue, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  venueLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  venueMain: { flex: 1 },
  venueRemove: { padding: 6 },
  eventsBox: {
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  eventsHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventsTitle: { color: EVENT_COLOR, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  eventsNone: { color: colors.textMuted, fontSize: 12 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  eventRowPressed: { opacity: 0.75 },
  eventRowText: { flex: 1, gap: 1 },
  eventRowTitle: { color: colors.text, fontFamily: fonts.semi, fontSize: 13 },
  eventRowMeta: { color: colors.textMuted, fontSize: 11 },
  eventsMore: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  selected: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  selectedText: { flex: 1, gap: 2 },
  selectedTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.sm },
  selectedSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  modalRoot: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 14, 0.78)',
  },
  modalCard: {
    maxHeight: '88%',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontFamily: fonts.extra, fontSize: fontSizes.lg },
  modalScroll: { flexGrow: 0 },
  modalContent: { gap: spacing.md },
  credit: { color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
