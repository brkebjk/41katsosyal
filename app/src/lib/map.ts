// Harita: yoğunluk verisi, yer arama ve TEK SEFERLİK konum alma.
//
// İlkeler (kullanıcıya da böyle anlatılır):
//  - Uygulama konumu hiçbir zaman sürekli izlemez. Konum yalnızca (1) gönderiye yer eklerken yakındaki
//    mekânları listelemek için ve (2) yan yana oynanan bir oyunu açarken / oyuna girerken, her seferinde BİR KEZ alınır.
//    Arka plan konumu yoktur. (3) Etkinlikte katılım kodunu yazarken de, her seferinde BİR KEZ alınır.
//  - Yan yana oynanan oyunlarda konum izni ZORUNLUDUR: izin verilmezse oda açılmaz, odaya girilmez (sunucu da reddeder).
//    Bilgi Yarışması uzaktan oynandığı için ve çekiliş için konum istenmez.
//  - Akışta yalnızca bulunduğun yerin 500 metre çevresindeki (kuş uçuşu) mekânlar paylaşılabilir.
//  - Konum izni verilmemişse, konum alınmadan hemen önce “Konumunu 1 kez isteyeceğim” uyarısı gösterilir.
//    İzin (“uygulamayı kullanırken”) verildiyse uyarı atlanır; ilkeler izin ekranında anlatılır.
//  - Ham konum (enlem/boylam) sunucuya gönderilmez ve hiçbir yerde saklanmaz; telefon yalnızca bulunduğu
//    peteğin numarasını (q, r) çıkarır.
//  - Ayrı bir “haritaya katkı izni” yoktur: gönderiye yer eklemek ve oyuna girmek zaten üyenin bilerek yaptığı işlemlerdir
//    ve her konum isteğinden önce harita için de sayılacağı yazılı olarak bildirilir. Yer eklemeyen / “Şimdi değil” diyen
//    üyenin hiçbir verisi haritaya işlenmez.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { showDialog } from '@/lib/dialog';
import { cellOf, isLand, type Cell } from '@/lib/hex';
import { callRpc } from '@/lib/rpc';

export type MapStatus = {
  /** Bu kullanıcı haritayı görebilir mi? (herkese açıksa ya da kullanıcı moderatörse) */
  open: boolean;
  /** Harita herkese açık mı? */
  is_public: boolean;
  is_moderator: boolean;
  min_people: number;
  delay_minutes: number;
  window_days: number;
  /** Petekteki “son dakikalarda bildirim yapan kişi sayısı” bu kullanıcıya açık mı? */
  presence_open?: boolean;
  presence_minutes?: number;
  /** Her ilçenin haftalık sıfırlanma günü (1 = Pazartesi … 7 = Pazar) */
  district_resets?: { name: string; dow: number }[];
};

export type DensityCell = { cell_q: number; cell_r: number; level: 1 | 2 | 3 };

export type Place = {
  id: string;
  name: string;
  cat_label: string | null;
  district: string | null;
  address: string | null;
  lat: number;
  lon: number;
};

const MAP_TEXT: Record<string, string> = {
  map_closed: 'Harita şu an herkese açık değil.',
  presence_closed: 'Petekteki kişi sayısı şu an üyelere açık değil.',
  invalid_cell: 'Bu petek Kocaeli haritasında değil.',
  place_not_found: 'Bu yer artık listede yok. Başka bir yer seç.',
};

export async function getMapStatus(): Promise<{ data: MapStatus | null; error: string | null }> {
  return callRpc<MapStatus>('map_status', {}, MAP_TEXT);
}

export async function getDensity(): Promise<{ data: DensityCell[]; error: string | null }> {
  const { data, error } = await callRpc<DensityCell[]>('map_density', {}, MAP_TEXT);
  return { data: data ?? [], error };
}

export async function searchPlaces(query: string): Promise<{ data: Place[]; error: string | null }> {
  const { data, error } = await callRpc<Place[]>('search_places', { p_query: query, p_limit: 20 }, MAP_TEXT);
  return { data: data ?? [], error };
}

export async function placesNearCell(cell: Cell): Promise<{ data: Place[]; error: string | null }> {
  const { data, error } = await callRpc<Place[]>(
    'places_near_cell',
    { p_q: cell.q, p_r: cell.r, p_limit: 150 },
    MAP_TEXT,
  );
  return { data: data ?? [], error };
}

// ---------------------------------------------------------------------------------------------
// Tek seferlik konum
// ---------------------------------------------------------------------------------------------

export type OneShot =
  | { ok: true; lat: number; lon: number }
  | { ok: false; reason: 'declined' | 'denied' | 'unavailable' | 'timeout' | 'mocked' };

export type LocationPurpose =
  | 'post'
  | 'game'
  | 'event'
  | 'checkin'
  | 'locate'
  | 'cellfeed'
  | 'treasure'
  | 'gameseek';

/** Akışta paylaşılabilecek en uzak mekânın, bulunduğun yere kuş uçuşu uzaklığı (metre). */
export const NEARBY_MAX_METERS = 500;

const NOTICE: Record<LocationPurpose, { message: string; cancel: string }> = {
  post: {
    message:
      'Paylaşacağın yerin sana yakın olduğunu görmek için konumuna şimdi yalnızca bir kez bakacağım.\n\n' +
      `Yalnızca bulunduğun yerin ${NEARBY_MAX_METERS} metre çevresindeki mekânlar paylaşılabilir.\n\n` +
      'Uygulama konumunu sürekli takip etmez, arka planda hiçbir şey izlenmez. Tam konumun sunucuya gönderilmez ve ' +
      'kaydedilmez. Seçeceğin yer, kimse görünmeden haritadaki yoğunluğa da sayılır.',
    cancel: 'Yer adını yazarım',
  },
  game: {
    message:
      'Bu oyun yan yana oturularak oynanır. Oyunu açmadan / oyuna girmeden önce bulunduğun bölgeyi bir kez alacağım. ' +
      'Konum izni vermezsen bu oyuna girilemez.\n\n' +
      'Uygulama konumunu sürekli takip etmez, arka planda hiçbir şey izlenmez. Sunucuya yalnızca bölge numarası ' +
      'gider, tam konumun kaydedilmez. Bu bölge, kimse görünmeden haritadaki yoğunluğa sayılır.',
    cancel: 'Vazgeç',
  },
  event: {
    message:
      'Etkinlikte olduğunu doğrulamak için bulunduğun bölgeyi şimdi bir kez alacağım. Etkinliğin bölgesinden uzaksan ' +
      'katılımın sayılmaz.\n\n' +
      'Uygulama konumunu sürekli takip etmez, arka planda hiçbir şey izlenmez. Sunucuya yalnızca bölge numarası ' +
      'gider, tam konumun kaydedilmez. Bu bölge, kimse görünmeden haritadaki yoğunluğa ve peteğin kişi sayısına sayılır.',
    cancel: 'Vazgeç',
  },
  treasure: {
    message:
      'Hazinenin yanında olduğunu doğrulamak için konumuna şimdi bir kez bakacağım. Hazinenin peteğine en çok 1 ' +
      'petek uzaklıkta olmalısın.\n\n' +
      'Uygulama konumunu sürekli takip etmez. Sunucuya yalnızca bulunduğun peteğin numarası gider, tam konumun kaydedilmez.',
    cancel: 'Vazgeç',
  },
  gameseek: {
    message:
      'Oyun arayanlar listesine yalnızca o peteğin içinde ya da hemen yanında olanlar adını yazdırabilir. Bunun için ' +
      'konumuna şimdi bir kez bakacağım.\n\n' +
      'Uygulama konumunu sürekli takip etmez. Sunucuya yalnızca bulunduğun peteğin numarası gider, tam konumun ' +
      'kaydedilmez. Listede bu haftaki rumuzun gece yarısına kadar görünür.',
    cancel: 'Vazgeç',
  },
  cellfeed: {
    message:
      'Petek akışını yalnızca o peteğin içinde ya da hemen yanında olanlar okuyup yazabilir. Bunun için konumuna şimdi ' +
      'bir kez bakacağım.\n\n' +
      'Uygulama konumunu sürekli takip etmez. Sunucuya yalnızca bulunduğun peteğin numarası gider, tam konumun ' +
      'kaydedilmez. Gönderilerin rumuzunla görünür.',
    cancel: 'Vazgeç',
  },
  locate: {
    message:
      'Haritada bulunduğun peteği göstermek için konumuna şimdi bir kez bakacağım.\n\n' +
      'Konumun sunucuya hiç gönderilmez ve kaydedilmez; yalnızca telefonunda haritayı peteğine götürmek için kullanılır. ' +
      'Haritadaki yoğunluğa da sayılmaz.',
    cancel: 'Vazgeç',
  },
  checkin: {
    message:
      'Seçtiğin petekte olduğunu doğrulamak için konumuna şimdi bir kez bakacağım. Yalnızca gerçekten bulunduğun ' +
      'peteğe bildirim yapabilirsin.\n\n' +
      'Uygulama konumunu sürekli takip etmez. Sunucuya yalnızca petek numarası gider, tam konumun kaydedilmez. ' +
      'Bildirimin, kimse görünmeden haritadaki yoğunluğa ve peteğin kişi sayısına sayılır; adın ve rumuzun görünmez.',
    cancel: 'Vazgeç',
  },
};

/**
 * “Gerektiğinde konum iznini otomatik ver” seçeneği (bu telefonda saklanır). Açıksa “1 kez isteyeceğim” uyarısı bir
 * daha gösterilmez; konum gerektiğinde izin yoksa telefonun izin penceresi doğrudan açılır.
 */
const AUTO_KEY = 'kat41_auto_location';

async function autoLocationOn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(AUTO_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Uyarıdaki anahtar açılınca: telefonun izin penceresi açılır; izin verilirse seçenek kaydedilir ve devam edilir. */
async function enableAutoLocation(): Promise<true | undefined> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return undefined;
    await AsyncStorage.setItem(AUTO_KEY, '1').catch(() => {});
    return true;
  } catch {
    return undefined;
  }
}

/** “Konumunu 1 kez isteyeceğim” uyarısı. Konum izni yokken, konum isteğinden hemen önce gösterilir. */
export async function showOneTimeNotice(purpose: LocationPurpose): Promise<boolean> {
  const n = NOTICE[purpose];
  // Otomatik izin seçildiyse uyarı gösterilmez
  if (await autoLocationOn()) return true;
  return showDialog<boolean>({
    title: 'Konumunu 1 kez isteyeceğim',
    message: n.message,
    icon: 'location',
    toggle: {
      label: 'Gerektiğinde konum iznini otomatik ver',
      onEnable: enableAutoLocation,
      failText: 'İzin verilmedi. Telefonunun Ayarlar > Uygulamalar bölümünden konum iznini açabilirsin.',
    },
    buttons: [
      { label: 'Devam', value: true, style: 'primary' },
      { label: n.cancel, value: false, style: 'ghost' },
    ],
    cancelValue: false,
  });
}

const FIX_TIMEOUT_MS = 15_000;

/**
 * Konumu TEK SEFER alır (sürekli izleme yok). Önce kullanıcıya “1 kez isteyeceğim” uyarısı gösterilir,
 * sonra gerekirse telefonun izin penceresi açılır. Enlem/boylam yalnızca çağıranın elinde kalır; saklanmaz.
 */
export async function requestOneTimeLocation(purpose: LocationPurpose): Promise<OneShot> {
  // İzin (“uygulamayı kullanırken”) zaten verildiyse uyarı tekrar gösterilmez; izin ekranında anlatıldı
  let granted = false;
  try {
    granted = (await Location.getForegroundPermissionsAsync()).granted;
  } catch {
    granted = false;
  }
  if (!granted && !(await showOneTimeNotice(purpose))) return { ok: false, reason: 'declined' };
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'denied' };
    if (!(await Location.hasServicesEnabledAsync())) return { ok: false, reason: 'unavailable' };
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);
    if (!fix) return { ok: false, reason: 'timeout' };
    // Android, “sahte konum” uygulamalarının verdiği konumları işaretler; bunlar kabul edilmez
    if (fix.mocked === true) return { ok: false, reason: 'mocked' };
    return { ok: true, lat: fix.coords.latitude, lon: fix.coords.longitude };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/** İki nokta arası kuş uçuşu uzaklık (metre). Yalnızca telefonda, yakın yerleri sıralamak için. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function distanceText(m: number): string {
  if (m < 95) return '100 m’den yakın';
  if (m < 1000) return `${Math.round(m / 100) * 100} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

const MOCKED_TEXT =
  'Telefonunda “sahte konum” (konum taklit) uygulaması açık görünüyor. Onu kapatıp tekrar dene; gerçek konumun gerekiyor.';

/** Konum alma başarısızken (gönderiye yer eklerken) kullanıcıya gösterilecek kısa açıklama. */
export function locationFailText(reason: Exclude<OneShot, { ok: true }>['reason']): string {
  if (reason === 'mocked') return MOCKED_TEXT;
  if (reason === 'denied') return 'Konum izni verilmedi. İstersen yer paylaşmadan devam edebilirsin.';
  if (reason === 'timeout')
    return 'Konum şu an alınamadı. Biraz sonra tekrar dene ya da yer paylaşmadan devam et.';
  if (reason === 'unavailable')
    return 'Telefonunun konum özelliği kapalı görünüyor. İstersen yer paylaşmadan devam edebilirsin.';
  return '';
}

/** Akışta bir yer seçilirken tek seferlik konum: null = “Yer adını yazarım” dedi (konuma bakılmadı). */
export type PostFix = { ok: true; fix: { lat: number; lon: number } } | { ok: false; message: string };

export async function requestPostFix(): Promise<PostFix | null> {
  const fix = await requestOneTimeLocation('post');
  if (!fix.ok) return fix.reason === 'declined' ? null : { ok: false, message: locationFailText(fix.reason) };
  return { ok: true, fix: { lat: fix.lat, lon: fix.lon } };
}

/** Seçilen yer, bulunduğun yerin 500 metre çevresinin dışındaysa kullanıcıya gösterilecek açıklama. */
export function tooFarText(name: string, meters: number): string {
  return `“${name}” sana yaklaşık ${distanceText(meters)} uzakta. Yalnızca bulunduğun yerin ${NEARBY_MAX_METERS} metre çevresindeki yerler paylaşılabilir.`;
}

export type NearbyResult =
  | { ok: true; places: (Place & { meters: number })[]; fix: { lat: number; lon: number } }
  | { ok: false; message: string };

/** Telefondaki konuma göre 500 m içinde kalan yerleri uzaklığa göre sıralar (çok uzak olanlar atılır). */
export function withinReach(
  places: Place[],
  fix: { lat: number; lon: number },
  max = NEARBY_MAX_METERS,
): (Place & { meters: number })[] {
  return places
    .map((p) => ({ ...p, meters: distanceMeters(fix.lat, fix.lon, p.lat, p.lon) }))
    .filter((p) => p.meters <= max)
    .sort((a, b) => a.meters - b.meters);
}

/**
 * Gönderiye yer eklerken: konumu 1 kez al, bulunduğun peteğin çevresindeki yerlerden yalnızca 500 m içindekileri
 * uzaklığa göre sırala. Ham konum (`fix`) yalnızca çağıranın belleğinde kalır; sunucuya gitmez.
 */
export async function findNearbyPlaces(): Promise<NearbyResult | null> {
  const fix = await requestOneTimeLocation('post');
  if (!fix.ok) return fix.reason === 'declined' ? null : { ok: false, message: locationFailText(fix.reason) };
  const cell = cellOf(fix.lon, fix.lat);
  if (!isLand(cell.q, cell.r)) {
    return {
      ok: false,
      message: 'Kocaeli sınırları içinde görünmüyorsun, bu yüzden yer paylaşılamıyor.',
    };
  }
  const { data, error } = await placesNearCell(cell);
  if (error) return { ok: false, message: error };
  return { ok: true, places: withinReach(data, fix).slice(0, 40), fix: { lat: fix.lat, lon: fix.lon } };
}

// ---------------------------------------------------------------------------------------------
// Oyunu açarken / oyuna girerken (yan yana oynanan oyunlar)
// ---------------------------------------------------------------------------------------------

export type GameLocation = { ok: true; cell: Cell } | { ok: false; message: string };

/**
 * Yan yana oynanan bir oyunu açmadan / oyuna girmeden önce çağrılır: “1 kez isteyeceğim” uyarısı, izin, tek seferlik
 * konum. Yalnızca bölge numarası (petek) döner ve sunucuya gider; ham konum saklanmaz. İzin verilmezse
 * oyuna girilemez; `message` kullanıcıya gösterilecek açıklamadır.
 */
export async function requireGameLocation(): Promise<GameLocation> {
  const fix = await requestOneTimeLocation('game');
  if (!fix.ok) {
    const message =
      fix.reason === 'declined'
        ? 'Konum izni olmadan bu oyuna girilemez. Oyun yan yana oynandığı için bulunduğun bölgeyi her girişte bir kez alıyoruz.'
        : fix.reason === 'mocked'
          ? MOCKED_TEXT
          : fix.reason === 'denied'
            ? 'Konum izni verilmedi, bu yüzden oyuna girilemedi. İzin vermek için telefonunun ayarlarından 41. Kat Sosyal’e konum izni ver, sonra tekrar dene.'
            : fix.reason === 'timeout'
              ? 'Konumun şu an alınamadı. Birkaç saniye sonra tekrar dene.'
              : 'Telefonunun konum özelliği kapalı görünüyor. Konumu açıp tekrar dene.';
    return { ok: false, message };
  }
  return { ok: true, cell: cellOf(fix.lon, fix.lat) };
}

// ---------------------------------------------------------------------------------------------
// Etkinlikte katılım kodunu yazarken
// ---------------------------------------------------------------------------------------------

/**
 * Etkinlikte kodu doğrularken çağrılır (sunucu “konum gerekli” dediğinde): “1 kez isteyeceğim” uyarısı, izin, tek
 * seferlik konum. Yalnızca bölge numarası (petek) sunucuya gider; ham konum saklanmaz ve haritaya sayılmaz.
 */
export async function requireEventLocation(): Promise<GameLocation> {
  const fix = await requestOneTimeLocation('event');
  if (!fix.ok) {
    const message =
      fix.reason === 'declined'
        ? 'Konum izni olmadan katılımın doğrulanamaz. Etkinlikte bulunduğunu bölge bilginle kontrol ediyoruz; kodu tekrar yazıp devam edebilirsin.'
        : fix.reason === 'mocked'
          ? MOCKED_TEXT
          : fix.reason === 'denied'
            ? 'Konum izni verilmedi, bu yüzden katılımın doğrulanamadı. İzin vermek için telefonunun ayarlarından 41. Kat Sosyal’e konum izni ver, sonra tekrar dene.'
            : fix.reason === 'timeout'
              ? 'Konumun şu an alınamadı. Birkaç saniye sonra tekrar dene.'
              : 'Telefonunun konum özelliği kapalı görünüyor. Konumu açıp tekrar dene.';
    return { ok: false, message };
  }
  return { ok: true, cell: cellOf(fix.lon, fix.lat) };
}

// ---------------------------------------------------------------------------------------------
// Haritada “Buradayım” (konum bildirimi) ve petekteki kişi sayısı
// ---------------------------------------------------------------------------------------------

export type CheckinResult = { ok: true } | { ok: false; message: string };

/**
 * Seçilen peteğe konum bildirimi: konum 1 kez alınır; telefon gerçekten o petekteyse sunucuya yalnızca petek numarası
 * gider. Başka bir petekteyse bildirim yapılmaz ve kullanıcıya bulunduğu petek söylenir.
 */
export async function checkInHere(selected: Cell, nameOf: (c: Cell) => string): Promise<CheckinResult | null> {
  const fix = await requestOneTimeLocation('checkin');
  if (!fix.ok) {
    if (fix.reason === 'declined') return null;
    return {
      ok: false,
      message:
        fix.reason === 'mocked'
          ? MOCKED_TEXT
          : fix.reason === 'denied'
            ? 'Konum izni verilmedi. Telefon ayarlarından 41. Kat Sosyal’e konum izni verip tekrar dene.'
            : fix.reason === 'timeout'
              ? 'Konumun şu an alınamadı. Birkaç saniye sonra tekrar dene.'
              : 'Telefonunun konum özelliği kapalı görünüyor. Konumu açıp tekrar dene.',
    };
  }
  const here = cellOf(fix.lon, fix.lat);
  if (here.q !== selected.q || here.r !== selected.r) {
    return {
      ok: false,
      message: isLand(here.q, here.r)
        ? `Şu an bu petekte değilsin. Yalnızca bulunduğun peteğe bildirim yapabilirsin; bulunduğun petek: ${nameOf(here)}.`
        : 'Kocaeli haritasının içinde görünmüyorsun, bu yüzden bildirim yapılamaz.',
    };
  }
  const { data, error } = await callRpc<{ ok: boolean; reason?: string; wait_minutes?: number }>(
    'map_checkin',
    { p_q: here.q, p_r: here.r },
    MAP_TEXT,
  );
  if (error) return { ok: false, message: error };
  if (!data?.ok) {
    return {
      ok: false,
      message: `Az önce bildirim yaptın. ${data?.wait_minutes ?? 10} dakika sonra tekrar bildirebilirsin.`,
    };
  }
  return { ok: true };
}

export type Presence = { count: number; minutes: number; me: boolean };

/** Petekte son dakikalarda (varsayılan 20) bildirim yapan üye sayısı. Kim olduğu gelmez. */
export async function getPresence(cell: Cell): Promise<{ data: Presence | null; error: string | null }> {
  return callRpc<Presence>('map_presence', { p_q: cell.q, p_r: cell.r }, MAP_TEXT);
}

export const DAY_OF_WEEK = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
