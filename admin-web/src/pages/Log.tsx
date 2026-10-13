import { useCallback, useEffect, useState } from 'react';

import { AUDIT_TEXT } from '@/lib/moderation';

import { supabase } from '../supabase';
import { Button, Card, Empty, downloadFile, stamp, toCsv, when } from '../ui';

type Raw = {
  id: number;
  admin_id: string | null;
  action: string;
  target_user: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};
type Person = { id: string; full_name: string; admin_real_name: string | null };

const EXTRA: Record<string, string> = {
  table_insert: 'Ayar ekledi',
  table_update: 'Ayar değiştirdi',
  table_delete: 'Ayar sildi',
  backup_export: 'Yedek aldı',
  backup_restore: 'Yedeği geri yükledi',
  retention_purge: 'Süresi dolan kayıtları temizledi',
  traffic_search: 'Trafik kayıtlarında arama yaptı',
};
const label = (a: string) => AUDIT_TEXT[a] ?? EXTRA[a] ?? a;

/** İşlem günlüğü: hangi moderatör (gerçek adıyla) ne zaman ne yaptı. Silinemez ve değiştirilemez. */
export function LogPage() {
  const [rows, setRows] = useState<Raw[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const sb = supabase;
    let q = sb.from('admin_audit_log').select('id, admin_id, action, target_user, detail, created_at');
    if (from) q = q.gte('created_at', new Date(from).toISOString());
    if (to) q = q.lt('created_at', new Date(new Date(to).getTime() + 86400000).toISOString());
    if (action) q = q.eq('action', action);
    const { data } = await q.order('created_at', { ascending: false }).limit(1000);
    const list = (data ?? []) as Raw[];
    const ids = [...new Set(list.flatMap((r) => [r.admin_id, r.target_user]).filter((x): x is string => !!x))];
    const map = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: people } = await sb.from('profiles').select('id, full_name, admin_real_name').in('id', ids.slice(i, i + 200));
      for (const p of (people ?? []) as Person[]) map.set(p.id, p.admin_real_name ? `${p.admin_real_name} (moderatör)` : p.full_name);
    }
    setNames(map);
    setRows(list);
  }, [from, to, action]);
  useEffect(() => {
    void load();
  }, [load]);

  const who = (id: string | null) => (id ? (names.get(id) ?? 'Silinmiş hesap') : '—');

  function exportCsv() {
    if (!rows) return;
    downloadFile(
      `41kat-islem-gunlugu-${stamp()}.csv`,
      toCsv(
        rows.map((r) => ({ ...r, time: when(r.created_at), admin: who(r.admin_id), target: who(r.target_user), act: label(r.action) })),
        [
          { key: 'time', label: 'Zaman' },
          { key: 'admin', label: 'Moderatör' },
          { key: 'act', label: 'İşlem' },
          { key: 'target', label: 'Üye' },
          { key: 'detail', label: 'Ayrıntı' },
        ],
      ),
      'text/csv',
    );
  }

  const actions = [...new Set([...Object.keys(AUDIT_TEXT), ...Object.keys(EXTRA)])].sort((a, b) => label(a).localeCompare(label(b), 'tr'));

  return (
    <section>
      <h2>İşlem günlüğü</h2>
      <p className="muted small">
        Moderatörlerin yaptığı her işlem (kimlik görüntüleme, susturma, ayar değişikliği, yedek…) burada tutulur. Kayıtlar
        kimse tarafından silinemez ya da değiştirilemez; saklama süresi dolunca kendiliğinden imha edilir.
      </p>
      <div className="filters">
        <label>
          Başlangıç
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Bitiş
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          İşlem
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Hepsi</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {label(a)}
              </option>
            ))}
          </select>
        </label>
        <Button kind="ghost" disabled={!rows?.length} onClick={exportCsv}>
          Excel (CSV) indir
        </Button>
      </div>
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
                <tr key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} className="clickable">
                  <td className="nowrap">{when(r.created_at)}</td>
                  <td>{who(r.admin_id)}</td>
                  <td>
                    {label(r.action)}
                    {open === r.id && r.detail && Object.keys(r.detail).length ? (
                      <pre className="detail-json">{JSON.stringify(r.detail, null, 2)}</pre>
                    ) : null}
                  </td>
                  <td>{who(r.target_user)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Ayrıntıyı görmek için satıra dokun. En çok 1000 kayıt gösterilir; tarih süzgeciyle daralt.</p>
        </Card>
      )}
    </section>
  );
}
