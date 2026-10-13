import { useEffect, useState } from 'react';

import { AUDIT_TEXT } from '@/lib/moderation';

import { supabase } from '../supabase';
import { Card, Empty, when } from '../ui';

type Raw = {
  id: number;
  admin_id: string | null;
  action: string;
  target_user: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};
type Person = { id: string; full_name: string; admin_real_name: string | null; alias: string };

/** İşlem günlüğü: hangi moderatör (gerçek adıyla) ne yaptı */
export function LogPage() {
  const [rows, setRows] = useState<Raw[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    void (async () => {
      const { data } = await sb
        .from('admin_audit_log')
        .select('id, admin_id, action, target_user, detail, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      const list = (data ?? []) as Raw[];
      const ids = [...new Set(list.flatMap((r) => [r.admin_id, r.target_user]).filter((x): x is string => !!x))];
      const map = new Map<string, string>();
      if (ids.length) {
        const { data: people } = await sb.from('profiles').select('id, full_name, admin_real_name, alias').in('id', ids);
        for (const p of (people ?? []) as Person[]) {
          map.set(p.id, p.admin_real_name ? `${p.admin_real_name} (moderatör)` : p.full_name);
        }
      }
      setNames(map);
      setRows(list);
    })();
  }, []);

  return (
    <section>
      <h2>İşlem günlüğü</h2>
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Kayıt yok.</Empty>
      ) : (
        <Card>
          <table className="table">
            <thead>
              <tr>
                <th>Zaman</th>
                <th>Moderatör</th>
                <th>İşlem</th>
                <th>Üye</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{when(r.created_at)}</td>
                  <td>{r.admin_id ? (names.get(r.admin_id) ?? 'Silinmiş hesap') : '—'}</td>
                  <td>{AUDIT_TEXT[r.action] ?? r.action}</td>
                  <td>{r.target_user ? (names.get(r.target_user) ?? 'Silinmiş hesap') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
