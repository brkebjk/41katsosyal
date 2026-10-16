import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, errText, when, type Notice } from '../ui';

type Row = {
  fingerprint: string;
  message: string;
  stack: string;
  screen: string;
  platform: string;
  app_version: string;
  fatal: boolean;
  count: number;
  first_at: string;
  last_at: string;
};

/**
 * Hatalar: uygulamada yakalanmamış hatalar (çökme takibi). Kişisel veri tutulmaz: üye kimliği, konum ve cihaz kimliği
 * yoktur; e-posta ve uzun sayılar sunucuda silinir. Aynı hata tek satırda sayılır, 30 günden eski kayıtlar silinir.
 * Düzeltilen hatayı “Çözüldü” ile silebilirsin; yeniden olursa yeniden görünür.
 */
export function ErrorsPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('client_errors')
      .select('fingerprint, message, stack, screen, platform, app_version, fatal, count, first_at, last_at')
      .order('last_at', { ascending: false })
      .limit(200);
    if (error) onNotice({ text: errText(error, 'Hatalar okunamadı.'), error: true });
    setRows((data as Row[]) ?? []);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(r: Row) {
    if (!supabase) return;
    const { error } = await supabase.from('client_errors').delete().eq('fingerprint', r.fingerprint);
    if (error) return onNotice({ text: errText(error, 'Silinemedi.'), error: true });
    onNotice({ text: 'Hata çözüldü olarak kaldırıldı.', error: false });
    void load();
  }

  return (
    <section>
      <h2>Hatalar</h2>
      <p className="muted small">
        Uygulamada bir hata olunca yalnızca hatanın yeri buraya yazılır (mesaj, kod satırları, ekran, sürüm, telefon
        türü). Kimin telefonunda olduğu bilinmez. En çok tekrar eden ve son görülen hatalar önce düzeltilmeli.
      </p>
      <div className="online-bar">
        <span className="muted small">{rows ? `${rows.length} farklı hata` : ''}</span>
        <button className="link" onClick={() => void load()}>
          Yenile
        </button>
      </div>
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Kayıtlı hata yok.</Empty>
      ) : (
        rows.map((r) => (
          <Card key={r.fingerprint}>
            <div className="row-head">
              <strong>{r.message}</strong>
              <span className="muted small">{`${r.count} kez · son ${when(r.last_at)}`}</span>
            </div>
            <p className="muted small">
              {[
                r.fatal ? 'uygulamayı kapattı' : 'uygulama açık kaldı',
                r.screen ? `ekran: ${r.screen}` : null,
                r.platform || null,
                r.app_version ? `sürüm ${r.app_version}` : null,
                `ilk ${when(r.first_at)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {open === r.fingerprint ? <pre className="small">{r.stack || '(kod satırı yok)'}</pre> : null}
            <div className="actions">
              <Button kind="ghost" onClick={() => setOpen(open === r.fingerprint ? null : r.fingerprint)}>
                {open === r.fingerprint ? 'Ayrıntıyı gizle' : 'Ayrıntı'}
              </Button>
              <Button kind="ghost" onClick={() => void resolve(r)}>
                Çözüldü
              </Button>
            </div>
          </Card>
        ))
      )}
    </section>
  );
}
