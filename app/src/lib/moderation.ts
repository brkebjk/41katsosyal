// Moderatör işlemleri. Hepsi sunucuda moderatör kontrolünden geçer; moderatör olmayan biri
// bu fonksiyonları çağırsa bile "yetkin yok" cevabı alır. Kimlik görüntülemeleri kayda geçer.

import type { PackageType } from '@/lib/labels';
import { callRpc, callRpcVoid, type Result } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

export type Member = {
  id: string;
  full_name: string;
  alias: string;
  avatar_index: number;
  role: 'user' | 'admin' | 'sponsor';
  points: number;
  premium_until: string | null;
  muted_until: string | null;
  banned_at: string | null;
  ban_reason: string | null;
  created_at: string;
  /** Uygulamadan gelen son "buradayım" sinyali (yalnızca üye listesinde gelir) */
  last_seen_at?: string | null;
};

const MEMBER_COLUMNS =
  'id, full_name, alias, avatar_index, role, points, premium_until, muted_until, banned_at, ban_reason, created_at, last_seen_at';

/** Son 10 dakikada uygulamadan sinyal gelen üye çevrimiçi sayılır */
export const ONLINE_MS = 10 * 60_000;

export function isMemberOnline(m: Member): boolean {
  return Boolean(m.last_seen_at && Date.now() - Date.parse(m.last_seen_at) < ONLINE_MS);
}

/** Şu an çevrimiçi üye sayısı (yalnızca moderatör okuyabilir) */
export async function countOnlineMembers(): Promise<number | null> {
  if (!supabase) return null;
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gt('last_seen_at', new Date(Date.now() - ONLINE_MS).toISOString());
  return error ? null : (count ?? 0);
}

const MOD_TEXT: Record<string, string> = {
  premium_required: 'Bu işlem için abonelik gerekiyor.',
  forbidden: 'Bu işlem yalnızca moderatörler içindir.',
  request_not_found: 'Bu talep artık yok. Liste yenileniyor.',
  request_closed: 'Bu talep zaten sonuçlandırılmış. Liste yenileniyor.',
};

/** Gönderinin gerçek yazarını getirir. Bu görüntüleme moderatör kaydına yazılır. */
export async function revealPostAuthor(postId: string): Promise<{ data: Member | null; error: string | null }> {
  return callRpc<Member>('admin_get_post_author', { p_post_id: postId }, MOD_TEXT);
}

export async function revealCommentAuthor(commentId: string): Promise<{ data: Member | null; error: string | null }> {
  return callRpc<Member>('admin_get_comment_author', { p_comment_id: commentId }, MOD_TEXT);
}

export async function setHidden(
  type: 'post' | 'comment' | 'event_comment' | 'venue_review',
  id: string,
  hidden: boolean,
): Promise<Result> {
  return callRpcVoid('admin_set_hidden', { p_type: type, p_id: id, p_hidden: hidden }, MOD_TEXT);
}

export async function muteMember(userId: string, minutes: number, reason?: string): Promise<Result> {
  return callRpcVoid('admin_mute_user', { p_user_id: userId, p_minutes: minutes, p_reason: reason ?? null }, MOD_TEXT);
}

export async function unmuteMember(userId: string): Promise<Result> {
  return callRpcVoid('admin_unmute_user', { p_user_id: userId }, MOD_TEXT);
}

export async function banMember(userId: string, reason?: string): Promise<Result> {
  return callRpcVoid('admin_ban_user', { p_user_id: userId, p_reason: reason ?? null }, MOD_TEXT);
}

export async function unbanMember(userId: string): Promise<Result> {
  return callRpcVoid('admin_unban_user', { p_user_id: userId }, MOD_TEXT);
}

export async function grantSubscription(userId: string, pkg: PackageType): Promise<Result> {
  return callRpcVoid('admin_grant_premium', { p_user_id: userId, p_package: pkg }, MOD_TEXT);
}

export async function revokeSubscription(userId: string): Promise<Result> {
  return callRpcVoid('admin_revoke_premium', { p_user_id: userId }, MOD_TEXT);
}

export async function awardPoints(userId: string, amount: number, reason: string): Promise<Result> {
  return callRpcVoid('admin_award_points', { p_user_id: userId, p_amount: amount, p_reason: reason }, MOD_TEXT);
}

/** Tek bir üyenin güncel bilgisi (işlemden sonra kartı tazelemek için). */
export async function getMember(userId: string): Promise<Member | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select(MEMBER_COLUMNS).eq('id', userId).maybeSingle();
  return (data as Member | null) ?? null;
}

/** Arama kutusuna yazılan metinden filtreyi bozabilecek karakterleri temizler. */
export function cleanSearch(text: string): string {
  return text
    .replace(/[,()%*\\_"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

export type MemberFilter = 'all' | 'online' | 'subscribed' | 'muted' | 'banned';

/**
 * Üye ara (ad ya da rumuz). Boş arama son kayıt olanları getirir.
 * `filter` ile yalnızca aboneler, susturulmuş ya da yasaklı üyeler listelenir.
 */
export async function searchMembers(
  query: string,
  filter: MemberFilter = 'all',
): Promise<{ data: Member[]; error: string | null }> {
  if (!supabase) return { data: [], error: 'Sunucu bağlantısı kurulmadı.' };
  const q = cleanSearch(query);
  let req = supabase.from('profiles').select(MEMBER_COLUMNS);
  if (q) req = req.or(`full_name.ilike.%${q}%,alias.ilike.%${q}%`);
  const nowIso = new Date().toISOString();
  if (filter === 'online') req = req.gt('last_seen_at', new Date(Date.now() - ONLINE_MS).toISOString());
  if (filter === 'subscribed') req = req.gt('premium_until', nowIso);
  if (filter === 'muted') req = req.gt('muted_until', nowIso);
  if (filter === 'banned') req = req.not('banned_at', 'is', null);
  const { data, error } = await req
    .order(filter === 'online' ? 'last_seen_at' : 'created_at', { ascending: false })
    .limit(filter === 'online' ? 200 : 40);
  if (error) return { data: [], error: 'Üyeler okunamadı. Biraz sonra tekrar dene.' };
  return { data: (data ?? []) as Member[], error: null };
}

// ---------------------------------------------------------------------------
// Şikayetler
// ---------------------------------------------------------------------------

export type ReportGroup = {
  /** "post:uuid", "comment:uuid", "event_comment:uuid" ya da "venue_review:uuid" */
  key: string;
  type:
    | 'post'
    | 'comment'
    | 'event_comment'
    | 'venue_review'
    | 'room'
    | 'event'
    | 'quiz_chat'
    | 'vv_whisper'
    | 'vv_dead'
    | 'dm'
    | 'sk_voice';
  targetId: string;
  /** Bu içerik için açık şikayet kimlikleri (hepsi birlikte kapatılır) */
  reportIds: string[];
  reasons: string[];
  count: number;
  latest: string;
  /** İçerik silinmişse null */
  content: { alias: string; body: string; is_hidden: boolean; created_at: string; cancelled?: boolean } | null;
};

type ReportRow = {
  id: string;
  target_type:
    | 'post'
    | 'comment'
    | 'event_comment'
    | 'venue_review'
    | 'room'
    | 'event'
    | 'quiz_chat'
    | 'vv_whisper'
    | 'vv_dead'
    | 'dm';
  target_id: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
};

/** Şikayetleri içerik başına gruplayıp içeriğin metniyle birlikte getirir. */
/** Moderatör: şikâyet edilen Köpekbalığı Kafesi ses mesajı (base64 m4a); silinmişse boş */
export async function adminVoiceClip(id: string): Promise<{ data: string | null; error: string | null }> {
  if (!supabase) return { data: null, error: 'Sunucu bağlantısı kurulmadı.' };
  const { data, error } = await supabase.rpc('admin_get_voice_clip', { p_id: id });
  if (error) return { data: null, error: 'Ses mesajı okunamadı.' };
  return { data: typeof data === 'string' && data.length > 0 ? data : null, error: null };
}

export async function listReports(status: 'open' | 'closed'): Promise<{ data: ReportGroup[]; error: string | null }> {
  if (!supabase) return { data: [], error: 'Sunucu bağlantısı kurulmadı.' };
  const base = supabase.from('reports').select('id, target_type, target_id, reason, status, created_at');
  const { data: rows, error } = await (status === 'open' ? base.eq('status', 'open') : base.neq('status', 'open'))
    .order('created_at', { ascending: false })
    .limit(150);
  if (error) return { data: [], error: 'Şikayetler okunamadı. Biraz sonra tekrar dene.' };

  const reports = (rows ?? []) as ReportRow[];
  const groups = new Map<string, ReportGroup>();
  for (const r of reports) {
    const key = `${r.target_type}:${r.target_id}`;
    const g = groups.get(key);
    if (g) {
      g.reportIds.push(r.id);
      g.reasons.push(r.reason);
      g.count += 1;
    } else {
      groups.set(key, {
        key,
        type: r.target_type,
        targetId: r.target_id,
        reportIds: [r.id],
        reasons: [r.reason],
        count: 1,
        latest: r.created_at,
        content: null,
      });
    }
  }

  const postIds = [...groups.values()].filter((g) => g.type === 'post').map((g) => g.targetId);
  const commentIds = [...groups.values()].filter((g) => g.type === 'comment').map((g) => g.targetId);
  const eventCommentIds = [...groups.values()].filter((g) => g.type === 'event_comment').map((g) => g.targetId);
  const reviewIds = [...groups.values()].filter((g) => g.type === 'venue_review').map((g) => g.targetId);
  const roomIds = [...groups.values()].filter((g) => g.type === 'room').map((g) => g.targetId);
  const eventIds = [...groups.values()].filter((g) => g.type === 'event').map((g) => g.targetId);
  const quizChatIds = [...groups.values()].filter((g) => g.type === 'quiz_chat').map((g) => g.targetId);
  const whisperIds = [...groups.values()].filter((g) => g.type === 'vv_whisper').map((g) => g.targetId);
  const deadIds = [...groups.values()].filter((g) => g.type === 'vv_dead').map((g) => g.targetId);
  const dmIds = [...groups.values()].filter((g) => g.type === 'dm').map((g) => g.targetId);
  const [posts, comments, eventComments, reviews, rooms, events, quizChats, whispers, deads, dms] = await Promise.all([
    postIds.length
      ? supabase.from('posts').select('id, alias, body, is_hidden, created_at').in('id', postIds)
      : Promise.resolve({ data: [] as never[] }),
    commentIds.length
      ? supabase.from('comments').select('id, alias, body, is_hidden, created_at').in('id', commentIds)
      : Promise.resolve({ data: [] as never[] }),
    // Etkinlik yorumları gerçek adla yazıldığı için yazarın adı doğrudan gelir
    eventCommentIds.length
      ? supabase
          .from('event_comments')
          .select('id, body, is_hidden, created_at, profiles(full_name)')
          .in('id', eventCommentIds)
      : Promise.resolve({ data: [] as never[] }),
    // Mekân yorumları da gerçek adla yazılır (puan + isteğe bağlı yorum)
    reviewIds.length
      ? supabase
          .from('venue_reviews')
          .select('id, stars, body, is_hidden, created_at, profiles(full_name)')
          .in('id', reviewIds)
      : Promise.resolve({ data: [] as never[] }),
    // Oyun odası: oyun, oda sahibi (gerçek ad), adres tarifi
    roomIds.length
      ? supabase
          .from('game_rooms')
          .select('id, game_type, status, place_note, created_at, profiles(full_name)')
          .in('id', roomIds)
      : Promise.resolve({ data: [] as never[] }),
    eventIds.length
      ? supabase
          .from('events')
          .select('id, title, location, description, starts_at, is_cancelled, created_at, profiles(full_name)')
          .in('id', eventIds)
      : Promise.resolve({ data: [] as never[] }),
    // Bilgi Yarışması sohbet mesajı: rumuz + gerçek ad (yalnızca moderatör okuyabilir)
    quizChatIds.length
      ? supabase.from('quiz_chat').select('id, alias, body, created_at, profiles(full_name)').in('id', quizChatIds)
      : Promise.resolve({ data: [] as never[] }),
    // Vampir–Köylü fısıltısı: gönderen ve alan (gerçek ad; yalnızca moderatör okuyabilir)
    whisperIds.length
      ? supabase
          .from('vv_whispers')
          .select(
            'id, body, created_at, sender:profiles!vv_whispers_from_user_fkey(full_name), receiver:profiles!vv_whispers_to_user_fkey(full_name)',
          )
          .in('id', whisperIds)
      : Promise.resolve({ data: [] as never[] }),
    // Vampir–Köylü elenenlerin sohbeti (gerçek adla yazılır)
    deadIds.length
      ? supabase.from('vv_dead_chat').select('id, name, body, created_at').in('id', deadIds)
      : Promise.resolve({ data: [] as never[] }),
    // Özel mesaj: yalnızca şikayet edilen mesaj okunabilir (gönderenin gerçek adıyla)
    dmIds.length
      ? supabase
          .from('dm_messages')
          .select('id, body, created_at, sender:profiles!dm_messages_sender_id_fkey(full_name)')
          .in('id', dmIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  type Content = { id: string; alias: string; body: string; is_hidden: boolean; created_at: string };
  // Zincir gönderi: devam parçaları da şikayet edilen gönderinin metnine eklenir (moderatör hepsini görsün)
  const partsByRoot = new Map<string, string[]>();
  if (postIds.length) {
    const { data: parts } = await supabase
      .from('posts')
      .select('thread_root, thread_no, body')
      .in('thread_root', postIds)
      .order('thread_no', { ascending: true });
    for (const t of (parts ?? []) as { thread_root: string; thread_no: number; body: string }[]) {
      const list = partsByRoot.get(t.thread_root) ?? [];
      list.push(`(${t.thread_no + 1}) ${t.body}`);
      partsByRoot.set(t.thread_root, list);
    }
  }
  for (const p of (posts.data ?? []) as Content[]) {
    const g = groups.get(`post:${p.id}`);
    const extra = partsByRoot.get(p.id);
    if (g) {
      g.content = {
        alias: p.alias,
        body: extra ? `${p.body}\n${extra.join('\n')}` : p.body,
        is_hidden: p.is_hidden,
        created_at: p.created_at,
      };
    }
  }
  for (const c of (comments.data ?? []) as Content[]) {
    const g = groups.get(`comment:${c.id}`);
    if (g) g.content = { alias: c.alias, body: c.body, is_hidden: c.is_hidden, created_at: c.created_at };
  }
  type EventContent = {
    id: string;
    body: string;
    is_hidden: boolean;
    created_at: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  };
  for (const c of (eventComments.data ?? []) as EventContent[]) {
    const g = groups.get(`event_comment:${c.id}`);
    const prof = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
    if (g) {
      g.content = {
        alias: prof?.full_name ?? 'Silinmiş hesap',
        body: c.body,
        is_hidden: c.is_hidden,
        created_at: c.created_at,
      };
    }
  }
  type ReviewContent = {
    id: string;
    stars: number;
    body: string | null;
    is_hidden: boolean;
    created_at: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  };
  for (const c of (reviews.data ?? []) as ReviewContent[]) {
    const g = groups.get(`venue_review:${c.id}`);
    const prof = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
    if (g) {
      g.content = {
        alias: prof?.full_name ?? 'Silinmiş hesap',
        body: `${'★'.repeat(c.stars)}${'☆'.repeat(5 - c.stars)}${c.body ? ` ${c.body}` : ' (yorumsuz puan)'}`,
        is_hidden: c.is_hidden,
        created_at: c.created_at,
      };
    }
  }
  type Person = { full_name: string } | { full_name: string }[] | null;
  const nameOf = (p: Person) => (Array.isArray(p) ? p[0]?.full_name : p?.full_name) ?? 'Silinmiş hesap';
  type RoomContent = {
    id: string;
    game_type: string;
    status: string;
    place_note: string | null;
    created_at: string;
    profiles: Person;
  };
  for (const r of (rooms.data ?? []) as RoomContent[]) {
    const g = groups.get(`room:${r.id}`);
    if (g) {
      g.content = {
        alias: `Oda sahibi: ${nameOf(r.profiles)}`,
        body: `${r.game_type} · durum: ${r.status}${r.place_note ? ` · ${r.place_note}` : ''}`,
        is_hidden: false,
        created_at: r.created_at,
      };
    }
  }
  type EventRow = {
    id: string;
    title: string;
    location: string;
    description: string;
    starts_at: string;
    is_cancelled: boolean;
    created_at: string;
    profiles: Person;
  };
  for (const e of (events.data ?? []) as EventRow[]) {
    const g = groups.get(`event:${e.id}`);
    if (g) {
      g.content = {
        alias: `Düzenleyen: ${nameOf(e.profiles)}`,
        body: `${e.title}${e.is_cancelled ? ' · iptal edildi' : ''}\n${new Date(e.starts_at).toLocaleString('tr-TR', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })} · ${e.location}\n${e.description}`,
        is_hidden: false,
        created_at: e.created_at,
        cancelled: e.is_cancelled,
      };
    }
  }
  type QuizChatRow = { id: string; alias: string; body: string; created_at: string; profiles: Person };
  for (const m of (quizChats.data ?? []) as QuizChatRow[]) {
    const g = groups.get(`quiz_chat:${m.id}`);
    if (g) {
      g.content = {
        alias: `${m.alias} (${nameOf(m.profiles)}) · Bilgi Yarışması sohbeti`,
        body: m.body,
        is_hidden: false,
        created_at: m.created_at,
      };
    }
  }
  type WhisperRow = { id: string; body: string; created_at: string; sender: Person; receiver: Person };
  for (const w of (whispers.data ?? []) as WhisperRow[]) {
    const g = groups.get(`vv_whisper:${w.id}`);
    if (g) {
      g.content = {
        alias: `${nameOf(w.sender)} → ${nameOf(w.receiver)} · Vampir–Köylü fısıltısı`,
        body: w.body,
        is_hidden: false,
        created_at: w.created_at,
      };
    }
  }
  for (const d of (deads.data ?? []) as { id: string; name: string; body: string; created_at: string }[]) {
    const g = groups.get(`vv_dead:${d.id}`);
    if (g)
      g.content = {
        alias: `${d.name} · Vampir–Köylü elenenler sohbeti`,
        body: d.body,
        is_hidden: false,
        created_at: d.created_at,
      };
  }
  for (const d of (dms.data ?? []) as unknown as {
    id: string;
    body: string;
    created_at: string;
    sender: { full_name: string } | { full_name: string }[] | null;
  }[]) {
    const g = groups.get(`dm:${d.id}`);
    const sender = Array.isArray(d.sender) ? d.sender[0] : d.sender;
    if (g)
      g.content = {
        alias: `${sender?.full_name ?? 'Bilinmeyen'} · Özel mesaj`,
        body: d.body,
        is_hidden: false,
        created_at: d.created_at,
      };
  }
  return { data: [...groups.values()], error: null };
}

/** Bir içeriğe ait bütün açık şikayetleri kapatır. */
export async function closeReports(reportIds: string[], status: 'resolved' | 'dismissed'): Promise<Result> {
  for (const id of reportIds) {
    const res = await callRpcVoid('admin_resolve_report', { p_report_id: id, p_status: status }, MOD_TEXT);
    if (res.error) return res;
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Etkinlik kapatma talepleri
//   Kodla katılanı olan etkinliği düzenleyen kendisi kapatamaz; nedenini yazıp talep gönderir, moderatör karar verir.
//   Onaylanırsa etkinlik kapanır ve etkinlikten verilmiş bütün puanlar (katılımcılar + düzenleyen) geri alınır.
// ---------------------------------------------------------------------------

export type CloseRequest = {
  id: string;
  event_id: string;
  event_title: string;
  starts_at: string;
  host_name: string | null;
  reason: string;
  /** Etkinlikte kodla doğrulanan kişi sayısı */
  verified_count: number;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
};

/** `open`: bekleyenler, `closed`: sonuçlananlar (onaylanan + reddedilen). */
export async function listCloseRequests(
  status: 'open' | 'closed',
): Promise<{ data: CloseRequest[]; error: string | null }> {
  const { data, error } = await callRpc<CloseRequest[]>(
    'admin_list_close_requests',
    { p_status: status === 'open' ? 'pending' : 'closed' },
    MOD_TEXT,
  );
  const rows = (data ?? []).map((r) => ({ ...r, verified_count: Number(r.verified_count) }));
  return { data: error ? [] : rows, error };
}

export async function resolveCloseRequest(id: string, approve: boolean, note?: string): Promise<Result> {
  return callRpcVoid(
    'admin_resolve_close_request',
    { p_id: id, p_approve: approve, p_note: note?.trim() ? note.trim() : null },
    MOD_TEXT,
  );
}

// ---------------------------------------------------------------------------
// Etkinlik lideri başvuruları (telefon yalnızca moderatöre görünür)
// ---------------------------------------------------------------------------

export type LeaderApplication = {
  id: string;
  user_id: string;
  /** Başvuruda yazılan ad soyad */
  full_name: string;
  /** Hesaptaki ad */
  profile_name: string;
  phone: string;
  categories: string[];
  audience: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  is_leader: boolean;
  is_premium: boolean;
};

export async function listLeaderApplications(
  status: 'open' | 'closed',
): Promise<{ data: LeaderApplication[]; error: string | null }> {
  const { data, error } = await callRpc<LeaderApplication[]>(
    'admin_list_leader_applications',
    { p_status: status === 'open' ? 'pending' : 'closed' },
    MOD_TEXT,
  );
  return { data: error ? [] : (data ?? []).map((r) => ({ ...r, categories: r.categories ?? [] })), error };
}

export async function resolveLeaderApplication(id: string, approve: boolean, note?: string): Promise<Result> {
  return callRpcVoid(
    'admin_resolve_leader_application',
    { p_id: id, p_approve: approve, p_note: note?.trim() ? note.trim() : null },
    MOD_TEXT,
  );
}

export async function setEventLeader(userId: string, on: boolean): Promise<Result> {
  return callRpcVoid(
    'admin_set_event_leader',
    { p_user_id: userId, p_on: on },
    {
      ...MOD_TEXT,
      user_not_found: 'Üye bulunamadı.',
    },
  );
}

// ---------------------------------------------------------------------------
// Onaylar: Konser & Festival etkinlikleri ve etkinlik görselleri
// ---------------------------------------------------------------------------

export type EventApproval = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  category: string;
  host_name: string;
  approval: 'pending' | 'approved' | 'rejected';
  image_path: string | null;
  image_status: 'pending' | 'approved' | 'rejected' | null;
  created_at: string;
};

export async function listEventApprovals(): Promise<{ data: EventApproval[]; error: string | null }> {
  const { data, error } = await callRpc<EventApproval[]>('admin_list_event_approvals', {}, MOD_TEXT);
  return { data: error ? [] : (data ?? []), error };
}

export async function reviewEvent(
  eventId: string,
  target: 'event' | 'image',
  approve: boolean,
  note?: string,
): Promise<Result> {
  return callRpcVoid(
    'admin_review_event',
    { p_event_id: eventId, p_target: target, p_approve: approve, p_note: note?.trim() ? note.trim() : null },
    MOD_TEXT,
  );
}

// ---------------------------------------------------------------------------
// İşlem günlüğü
// ---------------------------------------------------------------------------

export type AuditRow = {
  id: number;
  action: string;
  created_at: string;
  admin_name: string;
  target_name: string | null;
  detail: Record<string, unknown>;
};

export const AUDIT_TEXT: Record<string, string> = {
  reveal_post_author: 'Gönderi yazarını görüntüledi',
  ui_text: 'Yazı düzenledi',
  test_bots: 'Deneme oyuncusu ekledi',
  reveal_comment_author: 'Yorum yazarını görüntüledi',
  mute: 'Susturdu',
  unmute: 'Susturmayı kaldırdı',
  ban: 'Hesabı askıya aldı',
  unban: 'Askıyı kaldırdı',
  hide_content: 'İçeriği gizledi',
  unhide_content: 'İçeriği yeniden gösterdi',
  grant_premium: 'Abonelik verdi',
  revoke_premium: 'Aboneliği kaldırdı',
  draw_raffle: 'Çekiliş yaptı',
  award_points: 'Puan verdi',
  resolve_report: 'Şikayeti sonuçlandırdı',
  cancel_event: 'Etkinliği kaldırdı',
  close_event_request_approved: 'Etkinlik kapatma talebini onayladı',
  close_event_request_rejected: 'Etkinlik kapatma talebini reddetti',
  save_venue: 'Mekân bilgisini kaydetti',
  remove_venue_from_map: 'Mekânı haritadan kaldırdı',
  send_message: 'Özel mesaj gönderdi',
  announce: 'Duyuru yayınladı',
  announce_show: 'Duyuruyu yeniden yayına aldı',
  announce_hide: 'Duyuruyu kaldırdı',
  rename_cell: 'Petek adını değiştirdi',
  venue_image: 'Mekân resmini değiştirdi',
  leader_approved: 'Etkinlik lideri başvurusunu onayladı',
  leader_rejected: 'Etkinlik lideri başvurusunu reddetti',
  leader_set: 'Etkinlik lideri yaptı',
  leader_removed: 'Etkinlik liderliğini kaldırdı',
  event_approved: 'Etkinliği onayladı',
  event_rejected: 'Etkinliği reddetti',
  event_image_approved: 'Etkinlik görselini onayladı',
  event_image_rejected: 'Etkinlik görselini reddetti',
  treasure_create: 'Hazine gizledi',
  treasure_remove: 'Hazineyi kaldırdı',
  web_login: 'Web panele giriş yaptı',
  identity_revoke: 'Hesap doğrulamasını kaldırdı',
  photo_approve: 'Profil resmini onayladı',
  photo_reject: 'Profil resmini reddetti',
  alias_code: 'Rumuz kodunu değiştirdi',
};

// ---------------------------------------------------------------------------
// Bildirim kutusu: özel mesaj ve genel duyuru
// ---------------------------------------------------------------------------

const MESSAGE_TEXT: Record<string, string> = {
  ...MOD_TEXT,
  invalid_title: 'Başlık 3 ile 120 karakter arasında olmalı.',
  invalid_body: 'Mesaj boş olamaz ve 1000 karakteri geçemez.',
  announcement_not_found: 'Bu duyuru artık yok.',
};

/** Üyenin bildirim kutusuna moderatörden özel mesaj */
export async function sendMemberMessage(userId: string, title: string, body: string): Promise<Result> {
  return callRpcVoid('admin_send_message', { p_user_id: userId, p_title: title, p_body: body }, MESSAGE_TEXT);
}

export type Announcement = {
  id: string;
  title: string;
  body: string;
  is_active: boolean;
  created_at: string;
  read_count: number;
};

export async function listAnnouncements(): Promise<{ data: Announcement[]; error: string | null }> {
  const { data, error } = await callRpc<Announcement[]>('admin_list_announcements', {}, MESSAGE_TEXT);
  return { data: error ? [] : (data ?? []), error };
}

/** Herkesin bildirim kutusuna düşen genel duyuru (30 gün görünür) */
export async function createAnnouncement(title: string, body: string): Promise<Result> {
  return callRpcVoid('admin_create_announcement', { p_title: title, p_body: body }, MESSAGE_TEXT);
}

export async function setAnnouncementActive(id: string, active: boolean): Promise<Result> {
  return callRpcVoid('admin_set_announcement_active', { p_id: id, p_active: active }, MESSAGE_TEXT);
}

export async function listAuditLog(): Promise<{ data: AuditRow[]; error: string | null }> {
  if (!supabase) return { data: [], error: 'Sunucu bağlantısı kurulmadı.' };
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('id, admin_id, action, target_user, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) return { data: [], error: 'Günlük okunamadı. Biraz sonra tekrar dene.' };
  type Raw = {
    id: number;
    admin_id: string | null;
    action: string;
    target_user: string | null;
    detail: Record<string, unknown>;
    created_at: string;
  };
  const rows = (data ?? []) as Raw[];
  const ids = [...new Set(rows.flatMap((r) => [r.admin_id, r.target_user]).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    for (const p of (people ?? []) as { id: string; full_name: string }[]) names.set(p.id, p.full_name);
  }
  return {
    data: rows.map((r) => ({
      id: r.id,
      action: r.action,
      created_at: r.created_at,
      admin_name: r.admin_id ? (names.get(r.admin_id) ?? 'Silinmiş hesap') : 'Silinmiş hesap',
      target_name: r.target_user ? (names.get(r.target_user) ?? 'Silinmiş hesap') : null,
      detail: r.detail ?? {},
    })),
    error: null,
  };
}
