// Akış: gönderiler, yorumlar, beğeniler, şikayet ve engelleme.
// Hepsi sunucudaki fonksiyonları (RPC) çağırır; yazarın gerçek kimliği istemciye hiç gelmez.

import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

/** Zincir gönderinin bir devam parçası */
export type ThreadPart = { id: string; body: string; at: string; hidden?: boolean };

/** Zincirde en çok kaç parça olabilir (ilk gönderi dahil; sunucu da uygular) */
export const THREAD_MAX = 5;

export type Post = {
  id: string;
  alias: string;
  avatar_index: number;
  body: string;
  like_count: number;
  comment_count: number;
  /** Moderatör gizlemişse true (yalnızca moderatör görür) */
  is_hidden: boolean;
  created_at: string;
  /** Ben beğendim mi? */
  liked: boolean;
  /** Benim gönderim mi? (yazar kimliği yerine sadece bu bilgi gelir) */
  is_mine: boolean;
  /** Yazar benim arkadaşımsa gerçek adı; değilse null (o zaman rumuz gösterilir) */
  author_name: string | null;
  /** Gönderiye eklenen yer (isteğe bağlı): adı, türü (“Kafe”) ve ilçesi */
  place_id: string | null;
  place_name: string | null;
  place_label: string | null;
  place_district: string | null;
  /** Yazarın seçtiği balon rengi (anahtar); sunucu henüz güncellenmediyse gelmeyebilir */
  author_skin?: string | null;
  /** Yazar şu an abone mi (saatin yanında küçük abone rozeti); sunucu güncellenmediyse gelmeyebilir */
  author_premium?: boolean;
  /** Yazarın hesabı NVİ ile doğrulanmış mı (sarı tik) */
  author_verified?: boolean;
  /** Gönderiyi bir sponsor (mekân) hesabı yazdıysa kimliği; adı gerçek addır ve dokununca mekân profili açılır */
  sponsor_id?: string | null;
  /** Mekân hesabının profil resmi (Storage yolu); varsa avatarın yerine görünür */
  author_image?: string | null;
  /** Profil resmi: yalnızca gerçek adı görünen (arkadaş) yazarda gelir */
  author_photo?: string | null;
  /** Bu gönderide benden bahsedildi mi (beni etiketlediler mi)? */
  mentions_me?: boolean;
  /** Başka bir gönderiye cevap mı? */
  is_reply?: boolean;
  laugh_count?: number;
  plus_count?: number;
  minus_count?: number;
  /** Benim tepkim: 'laugh' | 'plus' | 'minus' ya da boş */
  my_reaction?: Reaction | null;
  /** Etkinlik paylaşımıysa etkinliğin bilgileri (düzenleyen gerçek adıyla paylaşır) */
  event_id?: string | null;
  event_title?: string | null;
  event_starts_at?: string | null;
  event_location?: string | null;
  event_category?: string | null;
  event_official?: boolean | null;
  /** Etkinlik paylaşımında etkinliğin (onaylı) görseli */
  event_image?: string | null;
  /** Petek akışına yazılmış gönderinin peteği */
  cell_q?: number | null;
  cell_r?: number | null;
  /** Gönderiye eklenen yerin peteği (dokununca haritada gösterilir) */
  place_q?: number | null;
  place_r?: number | null;
  /** Zincir gönderi: yazarın eklediği devam parçaları (sırayla) */
  thread?: ThreadPart[] | null;
};

export type Reaction = 'laugh' | 'plus' | 'minus';

export type Comment = {
  id: string;
  post_id: string;
  alias: string;
  avatar_index: number;
  body: string;
  is_hidden: boolean;
  created_at: string;
  is_mine: boolean;
  author_name: string | null;
  author_skin?: string | null;
  sponsor_id?: string | null;
  author_image?: string | null;
  /** Profil resmi: yalnızca gerçek adı görünen (arkadaş) yazarda gelir */
  author_photo?: string | null;
};

/** Ekranda yazının üstünde görünecek ad: arkadaşsa gerçek ad, değilse rumuz. */
export function displayName(item: { alias: string; author_name: string | null }): string {
  return item.author_name ?? item.alias;
}

export const PAGE_SIZE = 20;
export const POST_MAX = 500;
export const COMMENT_MAX = 300;

/** Akışa özel hata metinleri */
const FEED_TEXT: Record<string, string> = {
  premium_required: 'Yeni gönderi paylaşmak abonelere özel. Yorum yazabilir ve beğenebilirsin.',
  muted: 'Hesabın geçici olarak susturuldu, şu an yazamazsın.',
  invalid_body: 'Metin boş olamaz (gönderi en fazla 500, yorum en fazla 300 karakter).',
  rate_limited: 'Çok hızlı yazıyorsun. Bir dakika bekleyip tekrar dene.',
  place_not_found: 'Seçtiğin yer artık listede yok. Başka bir yer seç ya da yersiz paylaş.',
  post_not_found: 'Cevapladığın gönderi artık yok.',
  share_too_early: 'Etkinliği akışta, başlamasına 1 saat kala paylaşabilirsin.',
  event_started: 'Etkinlik başladı; artık akışta paylaşılamaz.',
  already_shared: 'Bu etkinliği akışta zaten paylaştın.',
  event_not_found: 'Bu etkinlik artık yok.',
  invalid_kind: 'Bu tepki geçersiz.',
  share_cooldown: 'Etkinliği 5 dakikada bir paylaşabilirsin.',
  event_pending: 'Bu etkinlik moderatör onayı bekliyor; onaylanınca paylaşabilirsin.',
  cell_too_far: 'Bu peteğe yazmak için peteğin içinde ya da hemen yanında olmalısın.',
  invalid_cell: 'Bu petek geçersiz.',
  thread_full: 'Bu zincir dolu (en çok 5 parça).',
  links_not_allowed: 'Bağlantı (link), web adresi ve e-posta paylaşılamaz. Lütfen yalnızca yazı yaz.',
  contact_not_allowed:
    'Akışta bağlantı (link), e-posta, telefon numarası, sosyal medya hesabı ya da kod (oda, arkadaş, etkinlik, mekân, hazine kodu) paylaşılamaz. Lütfen bunları çıkarıp tekrar dene.',
  invalid_thread: 'Zincire eklenen parçaya yer ya da cevap eklenemez.',
  profile_not_found: 'Bu rumuzun profili açılamıyor (hafta bitmiş ya da gönderi kaldırılmış olabilir).',
};

/** Akış süzgeci: yalnızca benim gönderilerim ve/veya yalnızca bir ilçenin (konumlu) gönderileri. */
export type FeedFilter = {
  mine?: boolean;
  district?: string | null;
  mentions?: boolean;
  /** Petek akışı: belirli bir petek (my zorunlu) */
  cell?: { q: number; r: number } | null;
  /** Yakınımdaki petekler: bulunduğum peteğe en çok 1 petek uzaklıktakilerin hepsi (my zorunlu) */
  near?: boolean;
  /** Telefonun bir kez aldığı konumun peteği (yalnızca petek numarası gider) */
  my?: { q: number; r: number } | null;
  /** Bakılan şehrin akışı (ziyaret); boşsa kendi şehrim */
  city?: string | null;
};

/** Akış listesi (en yeni önce). `before` verilirse o tarihten eski gönderiler gelir. */
export async function listFeed(before?: string, filter?: FeedFilter): Promise<{ data: Post[]; error: string | null }> {
  const { data, error } = await callRpc<Post[]>(
    'list_feed',
    {
      p_before: before ?? null,
      p_limit: PAGE_SIZE,
      p_mine: filter?.mine === true,
      p_district: filter?.district ?? null,
      p_mentions: filter?.mentions === true,
      p_cell_q: filter?.cell?.q ?? null,
      p_cell_r: filter?.cell?.r ?? null,
      p_my_q: filter?.my?.q ?? null,
      p_my_r: filter?.my?.r ?? null,
      p_near: filter?.near === true,
      p_city: filter?.city ?? null,
    },
    FEED_TEXT,
  );
  return { data: data ?? [], error };
}

/** Tek gönderi (rumuz profilinden gönderiye gitmek için) */
export async function getPost(id: string): Promise<{ data: Post | null; error: string | null }> {
  const { data, error } = await callRpc<Post[]>('list_feed', { p_limit: 1, p_post: id }, FEED_TEXT);
  return { data: data && data.length > 0 ? data[0] : null, error };
}

/** Süzgeçte seçilebilecek ilçeler (konumlu gönderisi olanlar) ve gönderi sayıları. */
export type FeedDistrict = { district: string; post_count: number };

export async function listFeedDistricts(city?: string | null): Promise<{ data: FeedDistrict[]; error: string | null }> {
  const { data, error } = await callRpc<FeedDistrict[]>('feed_districts', { p_city: city ?? null }, FEED_TEXT);
  return {
    data: (data ?? []).map((d) => ({ district: d.district, post_count: Number(d.post_count) })),
    error,
  };
}

export async function listComments(postId: string): Promise<{ data: Comment[]; error: string | null }> {
  const { data, error } = await callRpc<Comment[]>('list_comments', { p_post_id: postId }, FEED_TEXT);
  return { data: data ?? [], error };
}

/** Gönderi paylaşır. `placeId` verilirse gönderide yer etiketi görünür (haritaya katkı onayı varsa petek sayılır). */
export async function createPost(
  body: string,
  placeId?: string | null,
  replyTo?: string | null,
  cell?: { cell: { q: number; r: number }; my: { q: number; r: number } } | null,
  /** Zincir: kendi gönderimin devamı (verilirse yer ve cevap eklenemez; petek ilk gönderiden alınır) */
  threadOf?: string | null,
): Promise<{ error: string | null; id: string | null }> {
  const { data, error } = await callRpc<string>(
    'create_post',
    {
      p_body: body,
      p_place_id: placeId ?? null,
      p_reply_to: replyTo ?? null,
      p_cell_q: threadOf ? null : (cell?.cell.q ?? null),
      p_cell_r: threadOf ? null : (cell?.cell.r ?? null),
      p_my_q: cell?.my.q ?? null,
      p_my_r: cell?.my.r ?? null,
      p_thread_of: threadOf ?? null,
    },
    FEED_TEXT,
  );
  return { error, id: error ? null : (data ?? null) };
}

// ---------------------------------------------------------------------------
// Rumuz profili (haftalık; her Pazartesi sıfırlanır)
// ---------------------------------------------------------------------------

export type AliasProfilePost = {
  id: string;
  body: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  laugh_count: number;
  plus_count: number;
  minus_count: number;
  /** Petek akışına yazıldı (hangi petek olduğu gösterilmez) */
  in_cell: boolean;
  place_name: string | null;
  is_reply: boolean;
  thread: ThreadPart[];
};

export type AliasProfile = {
  alias: string;
  avatar_index: number;
  is_me: boolean;
  week_start: string;
  posts: AliasProfilePost[];
  post_count: number;
  /** Bu hafta akışta kendisinden kaç kez bahsedildi */
  mentions: number;
  events: number;
  games: number;
};

/** Bir gönderi ya da yorumun yazarının bu haftaki rumuz profili (gerçek ad hiç gelmez) */
export async function getAliasProfile(ref: {
  post?: string | null;
  comment?: string | null;
  /** @rumuz etiketinden: bu haftaki rumuz */
  alias?: string | null;
}): Promise<{ data: AliasProfile | null; error: string | null }> {
  return callRpc<AliasProfile>(
    'alias_profile',
    { p_post: ref.post ?? null, p_comment: ref.comment ?? null, p_alias: ref.alias ?? null },
    FEED_TEXT,
  );
}

/** Tepki ver / geri al. Döner: yeni tepkim (geri aldıysam boş). */
export async function reactToPost(
  postId: string,
  kind: Reaction,
): Promise<{ reaction: Reaction | null; error: string | null }> {
  const { data, error } = await callRpc<Reaction | null>(
    'react_to_post',
    { p_post_id: postId, p_kind: kind },
    FEED_TEXT,
  );
  return { reaction: error ? null : (data ?? null), error };
}

/** Etkinliği akışta paylaş (yalnızca düzenleyen; başlamasına 1 saat kala). */
export async function shareEventToFeed(eventId: string, body?: string): Promise<Result> {
  return callRpcVoid('share_event_to_feed', { p_event_id: eventId, p_body: body ?? null }, FEED_TEXT);
}

/**
 * Etiketler (metinde renkli gösterilir): “@Kaptan#145”, “@#145” ya da eski gönderilerdeki “@Sıfat Hayvan 123”.
 * Büyük/küçük harf önemsizdir; sunucu yalnızca bu haftaki rumuz sahibine götürür.
 */
export const MENTION_RE =
  /@(?:[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]{0,30}#\d{1,5}|[A-Za-zÇĞİÖŞÜçğıöşü]+ [A-Za-zÇĞİÖŞÜçğıöşü]+ \d{3}(?:-[0-9a-f]{3})?)/g;

/** Cevapta yazarı etiketleme metni: boşluklu rumuz (ör. “Moderatör#41”) yalnızca numarasıyla etiketlenir. */
export function mentionTag(alias: string): string {
  const m = /\s.*#(\d{1,5})$/.exec(alias);
  return m ? `@#${m[1]}` : `@${alias}`;
}

export async function createComment(postId: string, body: string): Promise<Result> {
  return callRpcVoid('create_comment', { p_post_id: postId, p_body: body }, FEED_TEXT);
}

/** Beğeniyi aç/kapat. liked: yeni durum (true = beğenildi). */
export async function toggleLike(postId: string): Promise<{ liked: boolean | null; error: string | null }> {
  const { data, error } = await callRpc<boolean>('toggle_like', { p_post_id: postId }, FEED_TEXT);
  return { liked: error ? null : data === true, error };
}

export async function deletePost(postId: string): Promise<Result> {
  return callRpcVoid('delete_my_post', { p_post_id: postId }, FEED_TEXT);
}

export async function deleteComment(commentId: string): Promise<Result> {
  return callRpcVoid('delete_my_comment', { p_comment_id: commentId }, FEED_TEXT);
}

export async function reportContent(
  type: 'post' | 'comment' | 'venue_review',
  id: string,
  reason: string,
): Promise<Result> {
  return callRpcVoid('report_content', { p_type: type, p_id: id, p_reason: reason }, FEED_TEXT);
}

/** İçeriğin yazarını engeller. Engellenen kişinin içerikleri bir daha görünmez. */
export async function blockAuthor(type: 'post' | 'comment', id: string): Promise<Result> {
  return type === 'post'
    ? callRpcVoid('block_author_of_post', { p_post_id: id }, FEED_TEXT)
    : callRpcVoid('block_author_of_comment', { p_comment_id: id }, FEED_TEXT);
}

export type BlockedAuthor = { id: string; blocked_alias: string; created_at: string };

export async function listBlocks(): Promise<{ data: BlockedAuthor[]; error: string | null }> {
  const { data, error } = await callRpc<BlockedAuthor[]>('my_blocks');
  return { data: data ?? [], error };
}

export async function unblock(blockId: string): Promise<Result> {
  return callRpcVoid('unblock', { p_block_id: blockId });
}

/**
 * Yeni gönderi yazmak abonelik gerektiriyor mu? (moderatör ayarı). Paket 31'den beri herkes yazabilir; okunamazsa "hayır"
 * varsayılır. Asıl kural sunucudadır.
 */
export async function postsRequireSubscription(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'post_requires_premium')
    .maybeSingle();
  if (error || !data) return false;
  return data.value !== false && data.value !== 'false';
}

/** Şikayet nedenleri: kullanıcı listeden seçer, metin olarak sunucuya gider. */
export const REPORT_REASONS = [
  'Spam ya da reklam',
  'Hakaret, taciz ya da nefret söylemi',
  'Uygunsuz ya da rahatsız edici içerik',
  'Gerçek kişileri hedef alıyor',
  'Başka bir sorun',
] as const;
