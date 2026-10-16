import { useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, downloadFile, errText, stamp, toCsv, when, type Notice } from '../ui';

type Row = {
  id: number;
  created_at: string;
  user_id: string | null;
  username: string | null;
  full_name: string | null;
  action: string;
  object_id: string | null;
  ip: string | null;
  user_agent: string | null;
};

const ACTION: Record<string, string> = {
  login: 'Giriş',
  post: 'Akış gönderisi',
  comment: 'Yorum',
  dm: 'Özel mesaj',
  event_comment: 'Etkinlik yorumu',
  venue_review: 'Mekân değerlendirmesi',
  game_room: 'Oyun odası açtı',
  quiz_chat: 'Yarışma sohbeti',
  vv_whisper: 'Vampir fısıltısı',
  event: 'Etkinlik oluşturdu',
  problem_report: 'Sorun bildirdi',
};

/**
 * Trafik kayıtları (5651): kim, ne zaman, hangi IP adresinden giriş yaptı / içerik ekledi. Mahkeme ya da savcılık
 * talebinde kullanılır. Her arama işlem günlüğüne yazılır; kayıtların kendisi değiştirilemez.
 */
export function TrafficPage({ onNotice, onMember }: { onNotice: (n: Notice) => void; onMember: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    if (!supabase || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_traffic_search', {
      p_query: query.trim() || null,
      p_from: from ? new Date(from).toISOString() : null,
      p_to: to ? new Date(new Date(to).getTime() + 86400000).toISOString() : null,
      p_limit: 5000,
    });
    setBusy(false);
    if (error) return onNotice({ text: errText(error, 'Arama yapılamadı.'), error: true });
    setRows((data as Row[]) ?? []);
  }

  function exportCsv() {
    if (!rows) return;
    downloadFile(
      `peoplehere-trafik-kayitlari-${stamp()}.csv`,
      toCsv(
        rows.map((r) => ({ ...r, time: when(r.created_at), utc: r.created_at, act: ACTION[r.action] ?? r.action })),
        [
          { key: 'time', label: 'Zaman (yerel)' },
          { key: 'utc', label: 'Zaman (UTC)' },
          { key: 'full_name', label: 'Ad soyad' },
          { key: 'username', label: 'Kullanıcı adı' },
          { key: 'user_id', label: 'Üye kimliği' },
          { key: 'act', label: 'İşlem' },
          { key: 'object_id', label: 'İçerik kimliği' },
          { key: 'ip', label: 'IP adresi' },
          { key: 'user_agent', label: 'Uygulama / cihaz' },
        ],
      ),
      'text/csv',
    );
  }

  return (
    <section>
      <h2>Trafik kayıtları (5651)</h2>
      <p className="muted small">
        Ad, kullanıcı adı, rumuz, üye kimliği ya da IP adresiyle ara. Bu kayıtlar yalnızca yasal bir talep olduğunda
        kullanılmalı; her arama işlem günlüğüne yazılır. İçeriğin kendisi burada yoktur, yalnızca kim / ne zaman / hangi IP.
      </p>
      <div className="filters">
        <label>
          Aranan
          <input placeholder="ör. 88.230.1.2 ya da kullanıcı adı" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          Başlangıç
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Bitiş
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button disabled={busy} onClick={() => void search()}>
          {busy ? 'Aranıyor…' : 'Ara'}
        </Button>
        <Button kind="ghost" disabled={!rows?.length} onClick={exportCsv}>
          Excel (CSV) indir
        </Button>
      </div>
      {rows === null ? (
        <Empty>Aramak için yukarıdaki alanları doldur.</Empty>
      ) : rows.length === 0 ? (
        <Empty>Kayıt bulunamadı.</Empty>
      ) : (
        <Card>
          <p className="muted small">{rows.length} kayıt</p>
          <table className="table">
            <thead>
              <tr>
                <th>Zaman</th>
                <th>Üye</th>
                <th>İşlem</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{when(r.created_at)}</td>
                  <td>
                    {r.user_id && r.full_name ? (
                      <button className="link" onClick={() => onMember(r.user_id as string)}>
                        {r.full_name}
                      </button>
                    ) : (
                      <span>{r.username ?? 'silinmiş hesap'}</span>
                    )}
                    <div className="muted small">{r.username}</div>
                  </td>
                  <td>{ACTION[r.action] ?? r.action}</td>
                  <td className="nowrap">{r.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
