import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, errText, type Notice } from '../ui';

type Code = { code: number; taken: boolean; mine: boolean; holder: string | null };

/** Rumuz kodum: moderatörlere ayrılmış #41 ve #1000 (akışta @41 ile etiketlenir) */
export function AliasCodePage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<Code[] | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_alias_codes');
    if (error) onNotice({ text: errText(error), error: true });
    setRows((data as Code[]) ?? []);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function choose(code: number | null) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_set_alias_code', { p_code: code });
    if (error) {
      return onNotice({
        text: error.message.includes('alias_code_taken') ? 'Bu kodu başka bir moderatör kullanıyor.' : errText(error),
        error: true,
      });
    }
    onNotice({ text: `Rumuzun artık: ${String(data ?? '')}`, error: false });
    void load();
  }

  return (
    <section>
      <h2>Rumuz kodum</h2>
      <p className="muted small">Seçtiğin kodla rumuzun “Moderatör#41” olur; üyeler seni akışta @41 yazarak etiketleyebilir.</p>
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : (
        <div className="grid">
          {rows.map((r) => (
            <Card key={r.code} className={r.mine ? 'stat stat-on' : 'stat'}>
              <div className="stat-n">#{r.code}</div>
              <div className="stat-l">{r.mine ? 'Senin kodun' : r.taken ? `Kullanımda: ${r.holder ?? ''}` : 'Boşta'}</div>
              <div className="actions">
                {r.mine ? (
                  <Button kind="danger" onClick={() => void choose(null)}>
                    Bırak
                  </Button>
                ) : (
                  <Button disabled={r.taken} onClick={() => void choose(r.code)}>
                    Seç
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
