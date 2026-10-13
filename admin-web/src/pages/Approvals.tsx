import { useCallback, useEffect, useState } from 'react';

import { listEventApprovals, reviewEvent, type EventApproval } from '@/lib/moderation';

import { publicUrl, supabase } from '../supabase';
import { Button, Card, Empty, when, type Notice } from '../ui';

type Photo = { user_id: string; full_name: string; photo_path: string; updated_at: string };

/** Onaylar: Konser & Festival etkinlikleri, etkinlik görselleri ve profil resimleri */
export function ApprovalsPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [events, setEvents] = useState<EventApproval[] | null>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listEventApprovals();
    if (res.error) onNotice({ text: res.error, error: true });
    setEvents(res.data);
    if (supabase) {
      const { data } = await supabase.rpc('admin_list_photo_approvals');
      setPhotos((data as Photo[]) ?? []);
    }
  }, [onNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(task: () => Promise<{ error: string | null }>, ok: string) {
    if (busy) return;
    setBusy(true);
    const res = await task();
    setBusy(false);
    onNotice(res.error ? { text: res.error, error: true } : { text: ok, error: false });
    void load();
  }

  function review(e: EventApproval, target: 'event' | 'image', approve: boolean) {
    let note: string | undefined;
    if (!approve) {
      const n = window.prompt('Reddetme nedeni (düzenleyene gider, isteğe bağlı):', '');
      if (n === null) return;
      note = n || undefined;
    }
    void run(
      () => reviewEvent(e.id, target, approve, note),
      approve ? 'Onaylandı.' : 'Reddedildi.',
    );
  }

  function reviewPhoto(p: Photo, approve: boolean) {
    if (!supabase) return;
    const sb = supabase;
    void run(async () => {
      const { error } = await sb.rpc('admin_review_photo', { p_user: p.user_id, p_path: p.photo_path, p_approve: approve });
      // Reddedilen resim sunucuda saklanmaz
      if (!error && !approve) await sb.storage.from('profile-photos').remove([p.photo_path]);
      return { error: error ? 'İşlem yapılamadı; resim değişmiş ya da kendiliğinden onaylanmış olabilir.' : null };
    }, approve ? 'Profil resmi onaylandı.' : 'Profil resmi reddedildi.');
  }

  return (
    <section>
      <h2>Onaylar</h2>

      <h3>Profil resimleri</h3>
      <p className="muted small">
        Üye resmi “moderatörler kontrol ediyor” olarak görür. Burada bir şey yapmazsan resim 10–30 dakika içinde
        kendiliğinden onaylanır; bu sürede reddedebilirsin.
      </p>
      {photos === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : photos.length === 0 ? (
        <Empty>Kontrolde profil resmi yok.</Empty>
      ) : (
        <div className="grid">
          {photos.map((p) => (
            <Card key={`${p.user_id}:${p.photo_path}`}>
              <img className="photo-lg" src={publicUrl('profile-photos', p.photo_path) ?? ''} alt="" />
              <strong>{p.full_name}</strong>
              <div className="muted small">{when(p.updated_at)}</div>
              <div className="actions">
                <Button disabled={busy} onClick={() => reviewPhoto(p, true)}>
                  Onayla
                </Button>
                <Button kind="danger" disabled={busy} onClick={() => reviewPhoto(p, false)}>
                  Reddet
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <h3>Etkinlikler ve etkinlik görselleri</h3>
      {events === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : events.length === 0 ? (
        <Empty>Onay bekleyen etkinlik yok.</Empty>
      ) : (
        events.map((e) => (
          <Card key={e.id}>
            <div className="row-head">
              <strong>{e.title}</strong>
              <span className="muted">{when(e.created_at)}</span>
            </div>
            <p className="muted small">
              {e.host_name} · {when(e.starts_at)} · {e.location}
            </p>
            <p className="pre">{e.description}</p>
            {e.approval === 'pending' ? (
              <div className="actions">
                <Button disabled={busy} onClick={() => review(e, 'event', true)}>
                  Etkinliği onayla
                </Button>
                <Button kind="danger" disabled={busy} onClick={() => review(e, 'event', false)}>
                  Etkinliği reddet
                </Button>
              </div>
            ) : null}
            {e.image_status === 'pending' && e.image_path ? (
              <>
                <img className="event-img" src={publicUrl('event-images', e.image_path) ?? ''} alt="" />
                <div className="actions">
                  <Button disabled={busy} onClick={() => review(e, 'image', true)}>
                    Görseli onayla
                  </Button>
                  <Button kind="danger" disabled={busy} onClick={() => review(e, 'image', false)}>
                    Görseli reddet
                  </Button>
                </div>
              </>
            ) : null}
          </Card>
        ))
      )}
    </section>
  );
}
