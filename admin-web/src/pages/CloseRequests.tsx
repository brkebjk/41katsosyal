import { useCallback, useEffect, useState } from 'react';

import { listCloseRequests, resolveCloseRequest, type CloseRequest } from '@/lib/moderation';

import { Button, Card, Empty, Tabs, when, type Notice } from '../ui';

/** Etkinlik kapatma istekleri: kodla katılanı olan etkinliği düzenleyen kendisi kapatamaz, buradan karar verilir */
export function CloseRequestsPage({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [rows, setRows] = useState<CloseRequest[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (s: 'open' | 'closed') => {
      const res = await listCloseRequests(s);
      if (res.error) onNotice({ text: res.error, error: true });
      setRows(res.data);
    },
    [onNotice],
  );
  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function decide(r: CloseRequest, approve: boolean) {
    const note = window.prompt(
      approve
        ? 'Etkinlik kapanacak ve etkinlikten verilen bütün puanlar geri alınacak. Düzenleyene not (isteğe bağlı):'
        : 'İstek reddedilecek. Düzenleyene not (isteğe bağlı):',
      '',
    );
    if (note === null || busy) return;
    setBusy(true);
    const res = await resolveCloseRequest(r.id, approve, note);
    setBusy(false);
    onNotice(res.error ? { text: res.error, error: true } : { text: approve ? 'Etkinlik kapatıldı.' : 'İstek reddedildi.', error: false });
    void load(status);
  }

  return (
    <section>
      <h2>Etkinlik kapatma istekleri</h2>
      <Tabs
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: 'Bekleyen' },
          { value: 'closed', label: 'Sonuçlanan' },
        ]}
      />
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>İstek yok.</Empty>
      ) : (
        rows.map((r) => (
          <Card key={r.id}>
            <div className="row-head">
              <strong>{r.event_title}</strong>
              <span className="muted">{when(r.created_at)}</span>
            </div>
            <p className="muted small">
              Düzenleyen: {r.host_name ?? '—'} · Başlangıç: {when(r.starts_at)} · Kodla doğrulanan: {r.verified_count} kişi
            </p>
            <p className="pre">Neden: {r.reason}</p>
            {r.status === 'pending' ? (
              <div className="actions">
                <Button kind="danger" disabled={busy} onClick={() => void decide(r, true)}>
                  Onayla (etkinliği kapat)
                </Button>
                <Button kind="ghost" disabled={busy} onClick={() => void decide(r, false)}>
                  Reddet
                </Button>
              </div>
            ) : (
              <p className="muted small">
                {r.status === 'approved' ? 'Onaylandı' : 'Reddedildi'} · {when(r.resolved_at)}
                {r.admin_note ? ` · Not: ${r.admin_note}` : ''}
              </p>
            )}
          </Card>
        ))
      )}
    </section>
  );
}
