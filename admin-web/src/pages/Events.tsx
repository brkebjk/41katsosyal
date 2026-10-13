import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, Tabs, errText, when, type Notice } from '../ui';

type Ev = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  category: string;
  capacity: number;
  is_cancelled: boolean;
  approval: string;
  as_official: boolean;
  created_at: string;
  created_by: string | null;
  host: { full_name: string; admin_real_name: string | null; role: string } | null;
};

/** Etkinlikler: yaklaşan ve geçmiş; iptal, resmî (41. Kat) işareti */
export function EventsPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [tab, setTab] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const [rows, setRows] = useState<Ev[] | null>(null);

  const load = useCallback(
    async (t: 'upcoming' | 'past' | 'cancelled') => {
      if (!supabase) return;
      const now = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
      let q = supabase
        .from('events')
        .select(
          'id, title, description, location, starts_at, category, capacity, is_cancelled, approval, as_official, created_at, created_by, host:profiles!events_created_by_fkey(full_name, admin_real_name, role)',
        );
      if (t === 'upcoming') q = q.eq('is_cancelled', false).gte('starts_at', now).order('starts_at', { ascending: true });
      else if (t === 'past') q = q.eq('is_cancelled', false).lt('starts_at', now).order('starts_at', { ascending: false });
      else q = q.eq('is_cancelled', true).order('starts_at', { ascending: false });
      const { data, error } = await q.limit(100);
      if (error) onNotice({ text: errText(error, 'Etkinlikler okunamadı.'), error: true });
      setRows(((data ?? []) as unknown as (Ev & { host: Ev['host'] | Ev['host'][] })[]).map((e) => ({
        ...e,
        host: Array.isArray(e.host) ? (e.host[0] ?? null) : e.host,
      })));
    },
    [onNotice],
  );
  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  async function cancel(e: Ev) {
    if (!supabase || !window.confirm(`“${e.title}” iptal edilecek. Katılımcılara bildirim gider. Emin misin?`)) return;
    const { error } = await supabase.rpc('cancel_event', { p_event_id: e.id });
    onNotice(error ? { text: errText(error, 'İptal edilemedi.'), error: true } : { text: 'Etkinlik iptal edildi.', error: false });
    void load(tab);
  }

  async function official(e: Ev) {
    if (!supabase) return;
    const { error } = await supabase.rpc('admin_set_event_official', { p_event_id: e.id, p_official: !e.as_official });
    onNotice(error ? { text: errText(error), error: true } : { text: 'Güncellendi.', error: false });
    void load(tab);
  }

  return (
    <section>
      <h2>Etkinlikler</h2>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: 'Yaklaşan' },
          { value: 'past', label: 'Geçmiş' },
          { value: 'cancelled', label: 'İptal edilen' },
        ]}
      />
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Etkinlik yok.</Empty>
      ) : (
        rows.map((e) => {
          const staff = e.host?.role === 'admin';
          return (
            <Card key={e.id}>
              <div className="row-head">
                <strong>{e.title}</strong>
                <span className="muted small">{when(e.starts_at)}</span>
              </div>
              <p className="muted small">
                {[
                  staff ? `Düzenleyen: ${e.host?.admin_real_name ?? 'Moderatör'} (moderatör)` : `Düzenleyen: ${e.host?.full_name ?? '—'}`,
                  e.location,
                  e.category,
                  `kontenjan ${e.capacity}`,
                  e.approval !== 'approved' ? `onay: ${e.approval}` : null,
                  staff && e.as_official ? '41. Kat resmî' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="pre small">{e.description}</p>
              {!e.is_cancelled ? (
                <div className="actions">
                  {staff ? (
                    <Button kind="ghost" onClick={() => void official(e)}>
                      {e.as_official ? 'Resmî işaretini kaldır' : 'Resmî yap (41. Kat)'}
                    </Button>
                  ) : null}
                  <Button kind="danger" onClick={() => void cancel(e)}>
                    İptal et
                  </Button>
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </section>
  );
}
