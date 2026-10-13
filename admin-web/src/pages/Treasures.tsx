import { useCallback, useEffect, useState } from 'react';

import { publicUrl, supabase } from '../supabase';
import { Button, Card, Empty, Tabs, errText, when, type Notice } from '../ui';

type T = {
  id: string;
  cell_q: number;
  cell_r: number;
  code: string;
  hint: string;
  difficulty: string;
  expires_at: string;
  created_at: string;
  found_at: string | null;
  finder_name: string | null;
  removed_at: string | null;
  admin_seen: boolean;
  image_paths: string[] | null;
};

const DIFF: Record<string, string> = { kolay: 'Kolay', orta: 'Orta', zor: 'Zor', imkansiz: 'İmkânsız' };

/** Hazineler: aktif, bulunan, hepsi; kaldırma. Yeni hazine haritada yerinde (uygulamadan) gizlenir. */
export function TreasuresPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [status, setStatus] = useState<'active' | 'found' | 'all'>('active');
  const [rows, setRows] = useState<T[] | null>(null);

  const load = useCallback(
    async (s: string) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc('admin_list_treasures', { p_status: s });
      if (error) onNotice({ text: errText(error, 'Hazineler okunamadı.'), error: true });
      setRows((data as T[]) ?? []);
      if (s === 'found') await supabase.rpc('admin_mark_treasures_seen');
    },
    [onNotice],
  );
  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function remove(t: T) {
    if (!supabase || !window.confirm('Hazine haritadan kaldırılsın mı?')) return;
    const { error } = await supabase.rpc('admin_remove_treasure', { p_id: t.id });
    onNotice(error ? { text: errText(error), error: true } : { text: 'Hazine kaldırıldı.', error: false });
    void load(status);
  }

  return (
    <section>
      <h2>Hazineler</h2>
      <p className="muted small">Yeni hazine, uygulamada haritadan peteğe dokunularak gizlenir (fotoğraflı ipucuyla).</p>
      <Tabs
        value={status}
        onChange={setStatus}
        options={[
          { value: 'active', label: 'Aktif' },
          { value: 'found', label: 'Bulunan' },
          { value: 'all', label: 'Hepsi' },
        ]}
      />
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Hazine yok.</Empty>
      ) : (
        rows.map((t) => (
          <Card key={t.id} className={t.found_at && !t.admin_seen ? 'stat-on' : ''}>
            <div className="row-head">
              <strong>
                {DIFF[t.difficulty] ?? t.difficulty} · petek ({t.cell_q}, {t.cell_r}) · kod {t.code}
              </strong>
              <span className="muted small">{when(t.created_at)}</span>
            </div>
            <p className="pre small">İpucu: {t.hint}</p>
            {t.image_paths?.length ? (
              <div className="thumbs">
                {t.image_paths.map((p) => (
                  <img key={p} src={publicUrl('treasure-images', p) ?? ''} alt="" />
                ))}
              </div>
            ) : null}
            <p className="muted small">
              {t.found_at
                ? `Bulan: ${t.finder_name ?? '—'} · ${when(t.found_at)}`
                : t.removed_at
                  ? `Kaldırıldı · ${when(t.removed_at)}`
                  : `Son gün: ${when(t.expires_at)}`}
            </p>
            {!t.found_at && !t.removed_at ? (
              <div className="actions">
                <Button kind="danger" onClick={() => void remove(t)}>
                  Kaldır
                </Button>
              </div>
            ) : null}
          </Card>
        ))
      )}
    </section>
  );
}
