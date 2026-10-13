import { useCallback, useEffect, useState } from 'react';

import {
  awardPoints,
  banMember,
  cleanSearch,
  grantSubscription,
  muteMember,
  revokeSubscription,
  sendMemberMessage,
  unbanMember,
  unmuteMember,
} from '@/lib/moderation';
import type { PackageType } from '@/lib/labels';

import { publicUrl, supabase } from '../supabase';
import { Button, Card, Empty, Tabs, isActive, when, type Notice } from '../ui';

type Row = {
  id: string;
  full_name: string;
  admin_real_name: string | null;
  alias: string;
  role: 'user' | 'admin' | 'sponsor';
  points: number;
  premium_until: string | null;
  muted_until: string | null;
  banned_at: string | null;
  ban_reason: string | null;
  created_at: string;
  identity_verified_at: string | null;
  photo_path: string | null;
  photo_status: string | null;
  last_seen_at: string | null;
};

const COLUMNS =
  'id, full_name, admin_real_name, alias, role, points, premium_until, muted_until, banned_at, ban_reason, created_at, identity_verified_at, photo_path, photo_status, last_seen_at';

type Filter = 'all' | 'online' | 'verified' | 'subscribed' | 'muted' | 'banned' | 'staff';

/** Son 10 dakikada uygulamadan sinyal gelen üye çevrimiçi sayılır */
const ONLINE_MS = 10 * 60_000;
const REFRESH_MS = 10 * 60_000;
const isOnline = (r: Row) => Boolean(r.last_seen_at && Date.now() - Date.parse(r.last_seen_at) < ONLINE_MS);

const ROLE: Record<Row['role'], string> = { user: 'Üye', admin: 'Moderatör', sponsor: 'Mekân hesabı' };
const PACKAGES: { value: PackageType; label: string }[] = [
  { value: 'daily', label: '1 gün' },
  { value: 'monthly', label: '1 ay' },
  { value: 'quarterly', label: '3 ay' },
  { value: 'yearly', label: '1 yıl' },
];

function nameOf(r: Row): string {
  return r.admin_real_name ? `${r.admin_real_name} (Moderatör)` : r.full_name;
}

/** Üyeler: arama, durum ve bütün üye işlemleri (susturma, askı, abonelik, puan, mesaj, doğrulamayı kaldırma) */
export function MembersPage({
  onNotice,
  focusId,
  onFocusDone,
}: {
  onNotice: (n: Notice) => void;
  focusId: string | null;
  onFocusDone: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!supabase) return;
    const q = cleanSearch(query);
    let req = supabase.from('profiles').select(COLUMNS);
    if (q) req = req.or(`full_name.ilike.%${q}%,alias.ilike.%${q}%,admin_real_name.ilike.%${q}%`);
    const now = new Date().toISOString();
    if (filter === 'online') req = req.gt('last_seen_at', new Date(Date.now() - ONLINE_MS).toISOString());
    if (filter === 'verified') req = req.not('identity_verified_at', 'is', null);
    if (filter === 'subscribed') req = req.gt('premium_until', now);
    if (filter === 'muted') req = req.gt('muted_until', now);
    if (filter === 'banned') req = req.not('banned_at', 'is', null);
    if (filter === 'staff') req = req.in('role', ['admin', 'sponsor']);
    const { data, error } = await req
      .order(filter === 'online' ? 'last_seen_at' : 'created_at', { ascending: false })
      .limit(filter === 'online' ? 500 : 100);
    if (error) onNotice({ text: 'Üyeler okunamadı.', error: true });
    setRows((data as Row[]) ?? []);
    // Toplam çevrimiçi (yalnızca sayı)
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('last_seen_at', new Date(Date.now() - ONLINE_MS).toISOString());
    setOnline(count ?? 0);
    setCheckedAt(new Date().toISOString());
  }, [query, filter, onNotice]);

  useEffect(() => {
    void search();
    // yalnızca filtre değişince; arama kutusu "Ara" ile çalışır
  }, [filter]);
  // 10 dakikada bir kendiliğinden yenilenir (çevrimiçi / çevrimdışı noktaları güncellensin)
  useEffect(() => {
    const t = setInterval(() => void search(), REFRESH_MS);
    return () => clearInterval(t);
  }, [search]);

  const refresh = useCallback(async (id: string) => {
    if (!supabase) return;
    const { data } = await supabase.from('profiles').select(COLUMNS).eq('id', id).maybeSingle();
    if (data) {
      setSelected(data as Row);
      setRows((list) => (list ? list.map((r) => (r.id === id ? (data as Row) : r)) : list));
    }
  }, []);

  useEffect(() => {
    if (!focusId) return;
    void refresh(focusId).then(onFocusDone);
  }, [focusId, refresh, onFocusDone]);

  return (
    <section>
      <h2>Üyeler</h2>
      <div className="online-bar">
        <span className="dot-on" /> Şu an çevrimiçi: <strong>{online ?? '…'}</strong>
        <span className="muted small">
          {checkedAt ? ` · son kontrol ${when(checkedAt)} · 10 dakikada bir yenilenir` : ''}
        </span>
        <button className="link" onClick={() => void search()}>
          Şimdi yenile
        </button>
      </div>
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input placeholder="Ad, rumuz ya da moderatör adı" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn-primary" type="submit">
          Ara
        </button>
      </form>
      <Tabs
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Hepsi' },
          { value: 'online', label: 'Çevrimiçi' },
          { value: 'verified', label: 'Doğrulanmış' },
          { value: 'subscribed', label: 'Abone' },
          { value: 'muted', label: 'Susturulmuş' },
          { value: 'banned', label: 'Askıda' },
          { value: 'staff', label: 'Moderatör / Mekân' },
        ]}
      />
      <div className="split">
        <div className="list">
          {rows === null ? (
            <Empty>Yükleniyor…</Empty>
          ) : rows.length === 0 ? (
            <Empty>Üye bulunamadı.</Empty>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                className={`member ${selected?.id === r.id ? 'member-on' : ''}`}
                onClick={() => setSelected(r)}
              >
                <span className="member-name">
                  <span className={isOnline(r) ? 'dot-on' : 'dot-off'} title={isOnline(r) ? 'Çevrimiçi' : 'Çevrimdışı'} />
                  {nameOf(r)}
                  {r.identity_verified_at ? <span className="tick" title="Doğrulanmış hesap">✔</span> : null}
                  {r.role === 'admin' ? <span className="shield" title="Moderatör">⛨</span> : null}
                </span>
                <span className="muted small">
                  {[
                    r.alias,
                    ROLE[r.role],
                    isActive(r.premium_until) ? 'abone' : null,
                    isActive(r.muted_until) ? 'susturulmuş' : null,
                    r.banned_at ? 'askıda' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="detail">
          {selected ? (
            <MemberDetail key={selected.id} m={selected} onNotice={onNotice} onChanged={() => void refresh(selected.id)} />
          ) : (
            <Empty>Soldan bir üye seç.</Empty>
          )}
        </div>
      </div>
    </section>
  );
}

function MemberDetail({ m, onNotice, onChanged }: { m: Row; onNotice: (n: Notice) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msgTitle, setMsgTitle] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [points, setPoints] = useState('');
  const [pointsReason, setPointsReason] = useState('');
  const photo = publicUrl('profile-photos', m.photo_path);

  async function run(task: () => Promise<{ error: string | null }>, ok: string) {
    if (busy) return;
    setBusy(true);
    const res = await task();
    setBusy(false);
    onNotice(res.error ? { text: res.error, error: true } : { text: ok, error: false });
    onChanged();
  }

  async function revokeIdentity() {
    const note = window.prompt(
      'Hesap doğrulaması kaldırılacak: sarı tik ve profil resmi kalkar, gerçek ad doğrulamadan önceki ada döner, üye yeniden doğrulama yapabilir.\n\nÜyeye gidecek not (isteğe bağlı):',
      '',
    );
    if (note === null || !supabase) return;
    const sb = supabase;
    await run(async () => {
      const { error } = await sb.rpc('admin_revoke_identity', { p_user: m.id, p_note: note || null });
      // Profil resmi kalktı: üyenin resim dosyaları da sunucudan silinir
      if (!error) {
        const { data: files } = await sb.storage.from('profile-photos').list(m.id, { limit: 100 });
        const paths = (files ?? []).map((f) => `${m.id}/${f.name}`);
        if (paths.length) await sb.storage.from('profile-photos').remove(paths);
      }
      return { error: error ? 'Doğrulama kaldırılamadı.' : null };
    }, 'Hesap doğrulaması kaldırıldı.');
  }

  return (
    <Card>
      <div className="detail-head">
        {photo ? <img className="photo" src={photo} alt="" /> : null}
        <div>
          <h3>
            {nameOf(m)}
            {m.identity_verified_at ? <span className="tick">✔</span> : null}
          </h3>
          <div className="muted small">
            {m.alias} · {ROLE[m.role]} · {m.points} puan · kayıt {when(m.created_at)}
          </div>
        </div>
      </div>

      <dl className="facts">
        <dt>Son görülme</dt>
        <dd>
          {isOnline(m) ? 'Şu an çevrimiçi' : m.last_seen_at ? when(m.last_seen_at) : 'Henüz sinyal yok'}
        </dd>
        <dt>Hesap doğrulama</dt>
        <dd>{m.identity_verified_at ? `Doğrulandı (${when(m.identity_verified_at)})` : 'Doğrulanmadı'}</dd>
        <dt>Profil resmi</dt>
        <dd>
          {m.photo_path
            ? m.photo_status === 'approved'
              ? 'Onaylı'
              : m.photo_status === 'rejected'
                ? 'Reddedildi'
                : 'Kontrolde'
            : 'Yok'}
        </dd>
        <dt>Abonelik</dt>
        <dd>{isActive(m.premium_until) ? `${when(m.premium_until)} tarihine kadar` : 'Yok'}</dd>
        <dt>Susturma</dt>
        <dd>{isActive(m.muted_until) ? `${when(m.muted_until)} tarihine kadar` : 'Yok'}</dd>
        <dt>Askı</dt>
        <dd>{m.banned_at ? `${when(m.banned_at)}${m.ban_reason ? ` · ${m.ban_reason}` : ''}` : 'Yok'}</dd>
      </dl>

      {m.role === 'admin' ? (
        <p className="muted small">Moderatör hesapları burada değiştirilemez.</p>
      ) : (
        <>
          <h4>Hesap</h4>
          <div className="actions">
            {m.identity_verified_at ? (
              <Button kind="danger" disabled={busy} onClick={() => void revokeIdentity()}>
                Doğrulamayı kaldır
              </Button>
            ) : null}
            {isActive(m.muted_until) ? (
              <Button kind="ghost" disabled={busy} onClick={() => void run(() => unmuteMember(m.id), 'Susturma kaldırıldı.')}>
                Susturmayı kaldır
              </Button>
            ) : (
              [60, 1440, 10080].map((min) => (
                <Button
                  key={min}
                  kind="ghost"
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt('Susturma nedeni (üyeye gider, isteğe bağlı):', '');
                    if (reason === null) return;
                    void run(() => muteMember(m.id, min, reason || undefined), 'Üye susturuldu.');
                  }}
                >
                  Sustur {min === 60 ? '1 saat' : min === 1440 ? '1 gün' : '1 hafta'}
                </Button>
              ))
            )}
            {m.banned_at ? (
              <Button kind="ghost" disabled={busy} onClick={() => void run(() => unbanMember(m.id), 'Askı kaldırıldı.')}>
                Askıyı kaldır
              </Button>
            ) : (
              <Button
                kind="danger"
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt('Hesap askıya alınacak. Neden:', '');
                  if (reason === null) return;
                  void run(() => banMember(m.id, reason || undefined), 'Hesap askıya alındı.');
                }}
              >
                Askıya al
              </Button>
            )}
          </div>

          <h4>Abonelik</h4>
          <div className="actions">
            {PACKAGES.map((p) => (
              <Button
                key={p.value}
                kind="ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`${p.label} abonelik verilsin mi?`)) {
                    void run(() => grantSubscription(m.id, p.value), 'Abonelik verildi.');
                  }
                }}
              >
                {p.label} ver
              </Button>
            ))}
            {isActive(m.premium_until) ? (
              <Button
                kind="danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Abonelik kaldırılsın mı?')) {
                    void run(() => revokeSubscription(m.id), 'Abonelik kaldırıldı.');
                  }
                }}
              >
                Aboneliği kaldır
              </Button>
            ) : null}
          </div>

          <h4>Puan ver / düş</h4>
          <div className="inline-form">
            <input
              placeholder="Puan (ör. 20 ya da -20)"
              value={points}
              onChange={(e) => setPoints(e.target.value.replace(/[^\d-]/g, ''))}
            />
            <input placeholder="Neden (üye görür)" value={pointsReason} onChange={(e) => setPointsReason(e.target.value)} />
            <Button
              disabled={busy || !points || !pointsReason.trim()}
              onClick={() =>
                void run(() => awardPoints(m.id, Number(points), pointsReason.trim()), 'Puan işlendi.').then(() => {
                  setPoints('');
                  setPointsReason('');
                })
              }
            >
              Uygula
            </Button>
          </div>

          <h4>Mesaj gönder</h4>
          <p className="muted small">Üye seni “Moderatör” olarak görür ve uygulamada cevap yazabilir.</p>
          <div className="stack">
            <input placeholder="Konu" value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} maxLength={80} />
            <textarea placeholder="Mesaj" value={msgBody} onChange={(e) => setMsgBody(e.target.value)} rows={4} maxLength={1000} />
            <Button
              disabled={busy || !msgTitle.trim() || !msgBody.trim()}
              onClick={() =>
                void run(() => sendMemberMessage(m.id, msgTitle.trim(), msgBody.trim()), 'Mesaj gönderildi.').then(() => {
                  setMsgTitle('');
                  setMsgBody('');
                })
              }
            >
              Gönder
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
