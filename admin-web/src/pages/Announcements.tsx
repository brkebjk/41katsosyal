import { useCallback, useEffect, useState } from 'react';

import { createAnnouncement, listAnnouncements, setAnnouncementActive, type Announcement } from '@/lib/moderation';

import { Button, Card, Empty, when, type Notice } from '../ui';

/** Duyurular: bütün üyelerin bildirim kutusuna düşer */
export function AnnouncementsPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listAnnouncements();
    if (res.error) onNotice({ text: res.error, error: true });
    setRows(res.data);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!title.trim() || !body.trim() || busy) return;
    if (!window.confirm('Duyuru bütün üyelere gönderilecek. Emin misin?')) return;
    setBusy(true);
    const res = await createAnnouncement(title.trim(), body.trim());
    setBusy(false);
    if (res.error) return onNotice({ text: res.error, error: true });
    setTitle('');
    setBody('');
    onNotice({ text: 'Duyuru yayınlandı.', error: false });
    void load();
  }

  async function toggle(a: Announcement) {
    const res = await setAnnouncementActive(a.id, !a.is_active);
    onNotice(res.error ? { text: res.error, error: true } : { text: a.is_active ? 'Duyuru kaldırıldı.' : 'Duyuru yeniden yayında.', error: false });
    void load();
  }

  return (
    <section>
      <h2>Duyurular</h2>
      <Card>
        <h3>Yeni duyuru</h3>
        <div className="stack">
          <input placeholder="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          <textarea placeholder="Metin" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
          <Button disabled={busy || !title.trim() || !body.trim()} onClick={() => void create()}>
            Herkese gönder
          </Button>
        </div>
      </Card>
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Duyuru yok.</Empty>
      ) : (
        rows.map((a) => (
          <Card key={a.id} className={a.is_active ? '' : 'quote-hidden'}>
            <div className="row-head">
              <strong>{a.title}</strong>
              <span className="muted small">{when(a.created_at)}</span>
            </div>
            <p className="pre">{a.body}</p>
            <div className="actions">
              <span className="muted small">{a.is_active ? 'Yayında' : 'Kaldırıldı'}</span>
              <Button kind="ghost" onClick={() => void toggle(a)}>
                {a.is_active ? 'Kaldır' : 'Yeniden yayınla'}
              </Button>
            </div>
          </Card>
        ))
      )}
    </section>
  );
}
