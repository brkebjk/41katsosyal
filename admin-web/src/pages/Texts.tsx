import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, errText, type Notice } from '../ui';

const TEXTS: { key: string; label: string }[] = [
  { key: 'legal_kvkk', label: 'KVKK aydınlatma metni' },
  { key: 'legal_privacy', label: 'Gizlilik politikası' },
  { key: 'legal_consent', label: 'Açık rıza metni' },
  { key: 'legal_terms', label: 'Kullanıcı sözleşmesi' },
  { key: 'faq', label: 'Sıkça sorulan sorular' },
  { key: 'support_contact', label: 'Bize ulaşın' },
];

/** Uygulama metinleri: yasal metinler ve yardım. "## " başlık, "• " madde olarak görünür. */
export function TextsPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [key, setKey] = useState(TEXTS[0].key);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('app_settings').select('key, value').in('key', TEXTS.map((t) => t.key));
    if (error) onNotice({ text: errText(error, 'Metinler okunamadı.'), error: true });
    const map: Record<string, string> = {};
    for (const r of (data ?? []) as { key: string; value: unknown }[]) map[r.key] = typeof r.value === 'string' ? r.value : '';
    setValues(map);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (values) setDraft(values[key] ?? '');
  }, [key, values]);

  async function save() {
    if (!supabase || busy) return;
    setBusy(true);
    const { error } = await supabase.from('app_settings').upsert({ key, value: draft });
    setBusy(false);
    if (error) return onNotice({ text: errText(error, 'Kaydedilemedi.'), error: true });
    onNotice({ text: 'Metin kaydedildi; uygulamada hemen görünür.', error: false });
    void load();
  }

  return (
    <section>
      <h2>Uygulama metinleri</h2>
      <div className="tabs">
        {TEXTS.map((t) => (
          <button key={t.key} className={`tab ${key === t.key ? 'tab-on' : ''}`} onClick={() => setKey(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {values === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : (
        <Card>
          <p className="muted small">“## ” ile başlayan satır başlık, “• ” ile başlayan satır madde olarak görünür.</p>
          <textarea className="big" rows={22} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="actions">
            <Button disabled={busy || draft === (values[key] ?? '')} onClick={() => void save()}>
              Kaydet
            </Button>
            <Button kind="ghost" onClick={() => setDraft(values[key] ?? '')}>
              Değişiklikleri geri al
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}
