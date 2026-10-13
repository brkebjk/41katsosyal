import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../supabase';
import { Button, Card, Empty, errText, type Notice } from '../ui';

type Row = { key: string; value: unknown; description: string | null };

/** Uzun metinler "Uygulama metinleri" sayfasında düzenlenir */
export const TEXT_KEYS = ['legal_terms', 'legal_consent', 'legal_kvkk', 'support_contact', 'legal_privacy', 'faq'];

function show(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/** Bir değeri yazılan metinden çözer: sayı / true / false / JSON ya da düz metin */
function parse(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

/** Ayarlar: bütün sunucu ayarları (kotalar, puanlar, kurallar, saklama süreleri…). Her değişiklik işlem günlüğüne yazılır. */
export function SettingsPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('app_settings').select('key, value, description').order('key');
    if (error) onNotice({ text: errText(error, 'Ayarlar okunamadı.'), error: true });
    setRows(((data as Row[]) ?? []).filter((r) => !TEXT_KEYS.includes(r.key)));
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(r: Row) {
    if (!supabase) return;
    const value = parse(edit[r.key] ?? show(r.value));
    if (!window.confirm(`“${r.key}” ayarı ${show(r.value)} → ${show(value)} olarak değişecek. Emin misin?`)) return;
    const { error } = await supabase.from('app_settings').update({ value }).eq('key', r.key);
    if (error) return onNotice({ text: errText(error, 'Kaydedilemedi.'), error: true });
    onNotice({ text: 'Ayar kaydedildi.', error: false });
    setEdit((e) => {
      const n = { ...e };
      delete n[r.key];
      return n;
    });
    void load();
  }

  const f = filter.trim().toLowerCase();
  const list = (rows ?? []).filter((r) => !f || r.key.includes(f) || (r.description ?? '').toLowerCase().includes(f));

  return (
    <section>
      <h2>Ayarlar</h2>
      <p className="muted small">
        Bir değeri değiştirince uygulama hemen yeni değerle çalışır. Açık/kapalı ayarlarda <code>true</code> ya da{' '}
        <code>false</code> yaz. Her değişiklik eski ve yeni değeriyle işlem günlüğüne yazılır.
      </p>
      <input className="filter" placeholder="Ayar ara (ör. quota, points, retention)" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : (
        <Card>
          <table className="table">
            <thead>
              <tr>
                <th>Ayar</th>
                <th>Değer</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const changed = edit[r.key] !== undefined && edit[r.key] !== show(r.value);
                return (
                  <tr key={r.key}>
                    <td>
                      <code>{r.key}</code>
                      {r.description ? <div className="muted small">{r.description}</div> : null}
                    </td>
                    <td>
                      <input value={edit[r.key] ?? show(r.value)} onChange={(e) => setEdit({ ...edit, [r.key]: e.target.value })} />
                    </td>
                    <td>
                      <Button disabled={!changed} onClick={() => void save(r)}>
                        Kaydet
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
