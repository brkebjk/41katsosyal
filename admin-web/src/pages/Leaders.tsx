import { useCallback, useEffect, useState } from 'react';

import { listLeaderApplications, resolveLeaderApplication, type LeaderApplication } from '@/lib/moderation';

import { Button, Card, Empty, Tabs, when, type Notice } from '../ui';

/** Etkinlik lideri başvuruları */
export function LeadersPage({ onNotice, onMember }: { onNotice: (n: Notice) => void; onMember: (id: string) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [rows, setRows] = useState<LeaderApplication[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (s: 'open' | 'closed') => {
      const res = await listLeaderApplications(s);
      if (res.error) onNotice({ text: res.error, error: true });
      setRows(res.data);
    },
    [onNotice],
  );
  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function decide(r: LeaderApplication, approve: boolean) {
    const note = window.prompt(approve ? 'Başvuru onaylanacak. Üyeye not (isteğe bağlı):' : 'Başvuru reddedilecek. Neden (üyeye gider):', '');
    if (note === null || busy) return;
    setBusy(true);
    const res = await resolveLeaderApplication(r.id, approve, note);
    setBusy(false);
    onNotice(res.error ? { text: res.error, error: true } : { text: approve ? 'Üye etkinlik lideri oldu.' : 'Başvuru reddedildi.', error: false });
    void load(status);
  }

  return (
    <section>
      <h2>Etkinlik lideri başvuruları</h2>
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
        <Empty>Başvuru yok.</Empty>
      ) : (
        rows.map((r) => (
          <Card key={r.id}>
            <div className="row-head">
              <strong>{r.full_name}</strong>
              <span className="muted">{when(r.created_at)}</span>
            </div>
            <p className="muted small">
              Profil adı: {r.profile_name} · Telefon: {r.phone} · {r.is_premium ? 'abone' : 'abone değil'}
              {r.is_leader ? ' · zaten lider' : ''}
            </p>
            <p className="small">Kategoriler: {r.categories.join(', ') || '—'}</p>
            <p className="pre">Kitle: {r.audience}</p>
            <div className="actions">
              <Button kind="ghost" onClick={() => onMember(r.user_id)}>
                Üyeyi aç
              </Button>
              {r.status === 'pending' ? (
                <>
                  <Button disabled={busy} onClick={() => void decide(r, true)}>
                    Onayla
                  </Button>
                  <Button kind="danger" disabled={busy} onClick={() => void decide(r, false)}>
                    Reddet
                  </Button>
                </>
              ) : (
                <span className="muted small">
                  {r.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                  {r.admin_note ? ` · Not: ${r.admin_note}` : ''}
                </span>
              )}
            </div>
          </Card>
        ))
      )}
    </section>
  );
}
