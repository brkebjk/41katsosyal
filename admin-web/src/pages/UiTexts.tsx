import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, downloadFile, errText, stamp, type Notice } from '../ui';

type Row = { source: string; text: string; updated_at: string };

/**
 * GEÇİCİ: Yazı düzeltmeleri. Moderatör uygulamada "Yazı düzenleme modu"yla yazıları düzeltir; burada hepsi listelenir.
 * "Düzeltmeleri indir" dosyası GitHub'a yüklenir, düzeltmeler koda işlenir ve bu özellik kaldırılır.
 */
export function UiTextsPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('ui_text_overrides')
      .select('source, text, updated_at')
      .order('updated_at', { ascending: false });
    if (error) onNotice({ text: errText(error, 'Düzeltmeler okunamadı. schema.sql çalıştırıldı mı?'), error: true });
    setRows((data as Row[]) ?? []);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function revert(r: Row) {
    if (!supabase || !window.confirm('Bu düzeltme silinsin ve yazı orijinaline dönsün mü?')) return;
    const { error } = await supabase.rpc('admin_set_ui_text', { p_source: r.source, p_text: null });
    if (error) return onNotice({ text: errText(error), error: true });
    onNotice({ text: 'Yazı orijinaline döndü.', error: false });
    void load();
  }

  function download() {
    if (!rows?.length) return;
    const data = Object.fromEntries([...rows].sort((a, b) => a.source.localeCompare(b.source)).map((r) => [r.source, r.text]));
    downloadFile(`yazi-duzeltmeleri-${stamp()}.json`, JSON.stringify(data, null, 2));
  }

  const term = q.trim().toLocaleLowerCase('tr-TR');
  const shown = (rows ?? []).filter(
    (r) => !term || r.source.toLocaleLowerCase('tr-TR').includes(term) || r.text.toLocaleLowerCase('tr-TR').includes(term),
  );

  return (
    <section>
      <h2>Yazı düzeltmeleri</h2>
      <p className="muted small">
        Uygulamada Moderatör paneli &gt; “Yazı düzenleme modu”nu açıp yazılara uzun basarak düzeltme yaparsın. Düzeltmeler
        herkeste hemen görünür. İşin bitince “Düzeltmeleri indir” dosyasını GitHub'a yükle; düzeltmeler koda işlenir.
      </p>
      <div className="searchbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Yazılarda ara" />
        <Button onClick={download} disabled={!rows?.length}>
          Düzeltmeleri indir ({rows?.length ?? 0})
        </Button>
      </div>
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : shown.length === 0 ? (
        <Empty>Henüz düzeltme yok.</Empty>
      ) : (
        shown.map((r) => (
          <Card key={r.source}>
            <div className="muted small">Orijinal</div>
            <div className="pre">{r.source}</div>
            <div className="muted small">Yeni hali · {new Date(r.updated_at).toLocaleString('tr-TR')}</div>
            <div className="pre">
              <strong>{r.text}</strong>
            </div>
            <div className="actions">
              <Button kind="danger" onClick={() => void revert(r)}>
                Orijinale döndür
              </Button>
            </div>
          </Card>
        ))
      )}
    </section>
  );
}
