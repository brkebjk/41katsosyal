import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, Tabs, when, type Notice } from '../ui';

type Row = {
  id: string;
  category: string;
  message: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  app_version: string | null;
  platform: string | null;
  status: string;
  created_at: string;
  user_id: string | null;
  user_full_name: string | null;
  user_alias: string | null;
};

const CATEGORY: Record<string, string> = {
  bug: 'Uygulama hatası',
  account: 'Hesap ve giriş',
  points: 'Puan ve seviye',
  event: 'Etkinlik',
  game: 'Oyun',
  map: 'Harita ve konum',
  subscription: 'Abonelik',
  abuse: 'Kötüye kullanım',
  suggestion: 'Öneri',
  other: 'Diğer',
};

export function ProblemsPage({ onNotice, onMember }: { onNotice: (n: Notice) => void; onMember: (id: string) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async (s: 'open' | 'closed') => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_list_problem_reports', { p_status: s });
    if (error) onNotice({ text: 'Sorun bildirimleri okunamadı.', error: true });
    setRows((data as Row[]) ?? []);
  }, [onNotice]);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function close(r: Row) {
    if (!supabase || !window.confirm('Bu bildirim kapatılsın mı?')) return;
    const { error } = await supabase.rpc('admin_close_problem_report', { p_id: r.id });
    onNotice(error ? { text: 'Kapatılamadı.', error: true } : { text: 'Bildirim kapatıldı.', error: false });
    void load(status);
  }

  return (
    <section>
      <h2>Sorun bildirimleri</h2>
      <Tabs
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: 'Açık' },
          { value: 'closed', label: 'Kapatılan' },
        ]}
      />
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Bildirim yok.</Empty>
      ) : (
        rows.map((r) => (
          <Card key={r.id}>
            <div className="row-head">
              <strong>{CATEGORY[r.category] ?? r.category}</strong>
              <span className="muted">{when(r.created_at)}</span>
            </div>
            <p className="pre">{r.message}</p>
            <p className="muted small">
              {[
                r.user_full_name ? `Üye: ${r.user_full_name}${r.user_alias ? ` (${r.user_alias})` : ''}` : 'Üye: silinmiş',
                r.contact_name ? `İletişim adı: ${r.contact_name}` : null,
                r.contact_email ? `E-posta: ${r.contact_email}` : null,
                r.contact_phone ? `Telefon: ${r.contact_phone}` : null,
                r.platform ? `${r.platform} · sürüm ${r.app_version ?? '?'}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="actions">
              {r.user_id ? (
                <Button kind="ghost" onClick={() => onMember(r.user_id as string)}>
                  Üyeyi aç
                </Button>
              ) : null}
              {r.status === 'open' ? <Button onClick={() => void close(r)}>Kapat</Button> : null}
            </div>
          </Card>
        ))
      )}
    </section>
  );
}
