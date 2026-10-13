// Profil > Kişisel Verilerim & Rapor: kimlik bilgisi, açık rızalar ve resmi veri dosyası (.json).

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { gameTitle } from '@/lib/gameCatalog';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';

export type ConsentKey = 'marketing' | 'map_density';

export type MyPrivacy = {
  user_id: string;
  created_at: string;
  consents: Record<ConsentKey, boolean>;
};

/** Açık rızalar: her biri açılıp kapanabilir; sunucu kapalı rızaya göre davranır. */
export const CONSENTS: { key: ConsentKey; title: string; text: string }[] = [
  {
    key: 'marketing',
    title: 'Kampanya ve özel etkinlik bildirimleri',
    text: '41. Kat Özel etkinlikleri, kampanyalar ve duyurular hakkında bana bildirim gönderilmesine izin veriyorum. Kapalıyken bu bildirimler gönderilmez.',
  },
  {
    key: 'map_density',
    title: 'Haritadaki anonim yoğunluğa sayılmak',
    text: 'Oyun, etkinlik, gönderi ve petek bildirimlerinde bulunduğum peteğin, adım görünmeden haritadaki kişi yoğunluğuna sayılmasına izin veriyorum. Kapalıyken hiçbir yoğunluk kaydım tutulmaz (petek bildirimlerim de sayılmaz).',
  },
];

export async function getMyPrivacy(): Promise<{ data: MyPrivacy | null; error: string | null }> {
  return callRpc<MyPrivacy>('my_privacy');
}

export async function setConsent(key: ConsentKey, granted: boolean): Promise<Result> {
  return callRpcVoid('set_consent', { p_key: key, p_granted: granted });
}

type Row = Record<string, unknown>;

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "13 Ekim 2026, 14:05" (İstanbul saati). Boşsa "—". */
function when(v: unknown): string {
  if (typeof v !== 'string' || !v) return '—';
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return v;
  // İstanbul UTC+3 (yaz saati uygulanmıyor)
  const d = new Date(t.getTime() + 3 * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

const yesNo = (v: unknown) => (v === true ? 'Evet' : v === false ? 'Hayır' : '—');
const text = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const pick = (map: Record<string, string>, v: unknown) => (typeof v === 'string' ? (map[v] ?? v) : text(v));
const list = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

const ROLE: Record<string, string> = { user: 'Üye', admin: 'Moderatör', sponsor: 'Mekân hesabı' };
const PREMIUM_SOURCE: Record<string, string> = {
  store: 'Mağazadan satın alma',
  moderator: 'Moderatör tanımladı',
  achievement: 'Başarı ödülü',
};
const FRIEND_STATUS: Record<string, string> = { pending: 'Bekliyor', accepted: 'Arkadaş', declined: 'Reddedildi' };
const NOTIF_KIND: Record<string, string> = {
  admin_message: 'Moderatör mesajı',
  friend_request: 'Arkadaşlık isteği',
  system: 'Sistem',
  game_invite: 'Oyun daveti',
  team_invite: 'Takım daveti',
  mention: 'Bahsedilme',
  dm: 'Özel mesaj',
  room_msg: 'Oyun odası mesajı',
};
const PROBLEM: Record<string, string> = {
  bug: 'Uygulama hatası',
  account: 'Hesap ve giriş',
  points: 'Puan ve seviye',
  event: 'Etkinlik',
  game: 'Oyun',
  map: 'Harita ve konum',
  subscription: 'Abonelik',
  abuse: 'Kötüye kullanım',
  suggestion: 'Öneri',
  other: 'Diğer',
};
const INVITE_ITEM: Record<string, string> = {
  cell_name: 'Petek adı hakkı',
  premium_month: '1 ay abonelik',
  title: 'Profil unvanı',
};
const POINT_SOURCE: Record<string, string> = {
  admin: 'Moderatör',
  post: 'Gönderi',
  game: 'Oyun',
  event: 'Etkinlik',
  checkin: 'Konum bildirimi',
  quiz: 'Bilgi Yarışması',
  quiz_play: 'Bilgi Yarışması',
};
const NOTIFY_PREF: Record<string, string> = {
  game_invite: 'Oyun davetleri',
  special_events: 'Özel etkinlikler',
  friend_request: 'Arkadaşlık istekleri',
  mention: 'Bahsedilmeler',
  event_reminder: 'Etkinlik hatırlatmaları',
};

/**
 * Sunucudan gelen veri dosyasını okunur hâle getirir: Türkçe başlıklar, açıklamalar, okunur tarihler (İstanbul saati),
 * kodların karşılıkları (Evet/Hayır, “Bekliyor”…). Teknik kayıt numaraları dosyaya yazılmaz; kullanıcı kimliği kalır.
 */
export function readableExport(raw: Row): Row {
  const h = (raw.hesap ?? {}) as Row;
  const consents = (raw.acik_rizalar ?? {}) as Row;
  const prefs = (raw.bildirim_tercihleri ?? null) as Row | null;
  const invites = (raw.davetler ?? {}) as Row;
  return {
    'Bu dosya nedir?':
      '41. Kat Sosyal uygulamasında sana ait tutulan kişisel verilerin dökümüdür (KVKK madde 11 kapsamındaki bilgi ' +
      'edinme hakkın). Her bölümde en yeni 1000 kayıt yer alır. Tarih ve saatler İstanbul saatidir. Başka üyelerin ' +
      'gerçek adı ya da kullanıcı adı bu dosyaya yazılmaz; yalnızca o anki rumuzları yazılır.',
    'Dosyanın oluşturulduğu an': when(raw.olusturulma),
    'Hesap bilgilerim': {
      'Kullanıcı kimliği': text(h.kullanici_kimligi),
      'Gerçek ad': text(h.gercek_ad),
      'Kullanıcı adı': text(h.kullanici_adi),
      'Bu haftaki rumuz': text(h.rumuz),
      'Avatar numarası': text(h.avatar),
      'Hesap türü': pick(ROLE, h.rol),
      'Kayıt tarihi': when(h.kayit_tarihi),
      'Toplam puan': text(h.toplam_puan),
      Seviye: text(h.seviye),
      'Abonelik bitişi': h.abonelik_bitis ? when(h.abonelik_bitis) : 'Abonelik yok',
      'Aboneliğin kaynağı': h.abonelik_kaynagi ? pick(PREMIUM_SOURCE, h.abonelik_kaynagi) : '—',
      'Arkadaş kodu': text(h.arkadas_kodu),
      'Davet kodu': text(h.davet_kodu),
      'Susturma bitişi': h.susturma_bitis ? when(h.susturma_bitis) : 'Susturulmadım',
      'Hesap doğrulaması (NVİ)': h.kimlik_dogrulama
        ? `${when(h.kimlik_dogrulama)} tarihinde doğrulandı (TC kimlik numarası saklanmaz)`
        : 'Doğrulanmadı',
      'Profil resmi': pick(
        { pending: 'Onay bekliyor', approved: 'Onaylı (yalnızca arkadaşlara görünür)', rejected: 'Onaylanmadı' },
        h.profil_resmi ?? 'Yok',
      ),
    },
    'Açık rızalarım': {
      'Kampanya ve özel etkinlik bildirimleri': consents.marketing === false ? 'Kapalı' : 'Açık',
      'Haritadaki anonim yoğunluğa sayılmak': consents.map_density === false ? 'Kapalı' : 'Açık',
    },
    'Kabul ettiğim sözleşmeler': list(raw.kabul_edilen_sozlesmeler).map((r) => ({
      Metin: text(r.metin),
      'Kabul tarihi': when(r.kabul),
    })),
    'Bildirim tercihlerim': prefs
      ? Object.fromEntries(
          Object.entries(NOTIFY_PREF).map(([k, label]) => [label, prefs[k] === false ? 'Kapalı' : 'Açık']),
        )
      : 'Hepsi açık (hiç değiştirilmedi)',
    'Gönderilerim': list(raw.gonderiler).map((r) => ({
      Tarih: when(r.created_at),
      Metin: text(r.body),
      Beğeni: text(r.like_count),
      Yorum: text(r.comment_count),
      'Moderatör gizledi mi?': yesNo(r.is_hidden),
    })),
    'Yorumlarım': list(raw.yorumlar).map((r) => ({
      Tarih: when(r.created_at),
      Metin: text(r.body),
      'Moderatör gizledi mi?': yesNo(r.is_hidden),
    })),
    'Gönderdiğim özel mesajlar': list(raw.gonderdigim_ozel_mesajlar).map((r) => ({
      Tarih: when(r.created_at),
      Metin: text(r.body),
    })),
    'Açtığım etkinlikler': list(raw.actigim_etkinlikler).map((r) => ({
      Başlık: text(r.title),
      Açıklama: text(r.description),
      Yer: text(r.location),
      Başlangıç: when(r.starts_at),
      Kontenjan: text(r.capacity),
      'İptal edildi mi?': yesNo(r.is_cancelled),
      'Oluşturma tarihi': when(r.created_at),
    })),
    'Etkinlik kayıtlarım': list(raw.etkinlik_kayitlarim).map((r) => ({
      Etkinlik: text(r.title),
      Başlangıç: when(r.starts_at),
      'Kayıt tarihi': when(r.created_at),
      'Katılımım doğrulandı': r.checked_in_at ? when(r.checked_in_at) : 'Hayır',
    })),
    'Puan geçmişim': list(raw.puan_gecmisi).map((r) => ({
      Tarih: when(r.created_at),
      Puan: text(r.amount),
      Neden: text(r.reason),
      Kaynak: pick(POINT_SOURCE, r.source),
    })),
    'Oynadığım oyunlar': list(raw.oyunlar).map((r) => ({
      Tarih: when(r.created_at),
      Oyun: typeof r.game_type === 'string' ? gameTitle(r.game_type) : '—',
      Puan: text(r.points),
      'Kazandım mı?': yesNo(r.won),
    })),
    'Arkadaşlıklarım': list(raw.arkadasliklar).map((r) => ({
      'Karşı tarafın o anki rumuzu': text(r.karsi_taraf_rumuz),
      İstek: r.yon === 'gonderdim' ? 'Ben gönderdim' : 'Bana geldi',
      Durum: pick(FRIEND_STATUS, r.status),
      'İstek tarihi': when(r.created_at),
      'Cevap tarihi': when(r.responded_at),
    })),
    'Davetlerim': {
      'Davet ettiğim kişi sayısı': text(invites.davet_ettiklerim),
      'Ödül kazandıran davet sayısı': text(invites.odullenen),
      'Davet puanıyla aldıklarım': list(invites.satin_alinan_ogeler).map((r) => ({
        Öğe: pick(INVITE_ITEM, r.oge),
        Bedel: `${text(r.bedel)} davet puanı`,
        'Alınma tarihi': when(r.alinma),
        'Kullanılma tarihi': r.kullanilma ? when(r.kullanilma) : 'Henüz kullanılmadı',
      })),
    },
    'Sorun bildirimlerim': list(raw.sorun_bildirimlerim).map((r) => ({
      Tarih: when(r.created_at),
      Tür: pick(PROBLEM, r.category),
      Mesaj: text(r.message),
      'İletişim adı': text(r.contact_name),
      'İletişim e-postası': text(r.contact_email),
      'İletişim telefonu': text(r.contact_phone),
      Durum: r.status === 'closed' ? 'Kapatıldı' : 'Açık',
    })),
    'Bildirimlerim': list(raw.bildirimler).map((r) => ({
      Tarih: when(r.created_at),
      Tür: pick(NOTIF_KIND, r.kind),
      Başlık: text(r.title),
      Metin: text(r.body),
      Okundu: r.read_at ? when(r.read_at) : 'Okunmadı',
    })),
  };
}

/**
 * Resmi veri dosyasını sunucudan alır, telefonda .json dosyası olarak oluşturur ve paylaşma / kaydetme penceresini
 * açar (Dosyalar'a kaydet, e-posta ile gönder vb.).
 */
export async function exportMyData(): Promise<Result> {
  const { data, error } = await callRpc<Record<string, unknown>>('my_data_export');
  if (error || !data) return { error: error ?? 'Veri dosyası hazırlanamadı.' };
  try {
    const day = new Date().toISOString().slice(0, 10);
    const file = new File(Paths.cache, `41kat-veri-dosyasi-${day}.json`);
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(readableExport(data), null, 2));
    if (!(await Sharing.isAvailableAsync())) {
      return { error: 'Bu telefonda dosya paylaşma açılamadı.' };
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Resmi veri dosyan',
      UTI: 'public.json',
    });
    return { error: null };
  } catch {
    return { error: 'Dosya oluşturulamadı. Telefonunda yer olduğundan emin olup tekrar dene.' };
  }
}
