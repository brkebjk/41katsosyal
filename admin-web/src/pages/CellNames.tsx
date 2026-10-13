import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, errText, when, type Notice } from '../ui';

type Candidate = {
  id: string;
  cell_q: number;
  cell_r: number;
  user_id: string;
  full_name: string;
  kind: 'host' | 'player';
  month_start: string;
  count_last: number;
  count_prev: number;
  admin_seen: boolean;
  created_at: string;
};

const NAME_RE = /^[a-zçğıöşüâîû0-9]+(-[a-zçğıöşüâîû0-9]+)*$/;

/** Petek adları: adlandırma hakkı kazananlar (2 ay üst üste en çok oyun / etkinlik) ve elle ad verme */
export function CellNamesPage({ onNotice, onMember }: { onNotice: (n: Notice) => void; onMember: (id: string) => void }) {
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [q, setQ] = useState('');
  const [r, setR] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    await supabase.rpc('admin_refresh_cell_candidates');
    const { data, error } = await supabase.rpc('admin_list_cell_candidates');
    if (error) onNotice({ text: errText(error, 'Adaylar okunamadı.'), error: true });
    setRows((data as Candidate[]) ?? []);
    await supabase.rpc('admin_mark_cell_candidates_seen');
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function rename() {
    if (!supabase) return;
    const v = name.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, '-');
    if (v && (v.length < 3 || v.length > 40 || !NAME_RE.test(v))) {
      return onNotice({ text: 'Ad 3–40 karakter: küçük harf ve rakam, kelimeler arasında tire (ör. adalar-sahili).', error: true });
    }
    const { error } = await supabase.rpc('admin_set_cell_name', { p_q: Number(q), p_r: Number(r), p_name: v });
    onNotice(error ? { text: errText(error, 'Ad verilemedi.'), error: true } : { text: v ? 'Petek adı değişti.' : 'Petek varsayılan adına döndü.', error: false });
  }

  return (
    <section>
      <h2>Petek adları</h2>
      <Card>
        <h3>Peteğe ad ver</h3>
        <p className="muted small">
          Peteğin numarasını (q, r) uygulamadaki petek menüsünde ya da aşağıdaki adaylarda görebilirsin. Adı boş bırakırsan
          petek varsayılan adına döner.
        </p>
        <div className="inline-form inline-3">
          <input placeholder="q" value={q} onChange={(e) => setQ(e.target.value.replace(/[^\d-]/g, ''))} />
          <input placeholder="r" value={r} onChange={(e) => setR(e.target.value.replace(/[^\d-]/g, ''))} />
          <input placeholder="ör. adalar-sahili" value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={!q || !r} onClick={() => void rename()}>
            Kaydet
          </Button>
        </div>
      </Card>
      <h3>Adlandırma hakkı kazananlar</h3>
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Aday yok.</Empty>
      ) : (
        rows.map((c) => (
          <Card key={c.id} className={c.admin_seen ? '' : 'stat-on'}>
            <div className="row-head">
              <strong>
                {c.full_name} · petek ({c.cell_q}, {c.cell_r})
              </strong>
              <span className="muted small">{when(c.created_at)}</span>
            </div>
            <p className="muted small">
              {c.kind === 'host' ? 'En çok etkinlik düzenleyen' : 'En çok oyun oynayan'} · son ay {c.count_last}, önceki ay{' '}
              {c.count_prev}
            </p>
            <div className="actions">
              <Button kind="ghost" onClick={() => onMember(c.user_id)}>
                Üyeyi aç (mesaj gönder)
              </Button>
              <Button
                kind="ghost"
                onClick={() => {
                  setQ(String(c.cell_q));
                  setR(String(c.cell_r));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Bu peteğe ad ver
              </Button>
            </div>
          </Card>
        ))
      )}
    </section>
  );
}
