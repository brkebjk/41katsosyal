import { useCallback, useEffect, useState } from 'react';

import { adminEndThread, adminListThreads, getThread, replyThread, type ModThread, type ThreadSummary } from '@/lib/modThreads';

import { Button, Card, Empty, when, type Notice } from '../ui';

/** Üye mesajları: moderatörün üyelerle yazışmaları (üye moderatörü yalnızca "Moderatör" olarak görür) */
export function ModMessagesPage({ onNotice, onMember }: { onNotice: (n: Notice) => void; onMember: (id: string) => void }) {
  const [rows, setRows] = useState<ThreadSummary[] | null>(null);
  const [open, setOpen] = useState<ModThread | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await adminListThreads();
    if (res.error) onNotice({ text: res.error, error: true });
    setRows(res.data);
  }, [onNotice]);
  useEffect(() => {
    void load();
  }, [load]);

  async function openThread(id: string) {
    const res = await getThread(id);
    if (res.error) return onNotice({ text: res.error, error: true });
    setOpen(res.data);
    void load();
  }

  async function send() {
    if (!open || !reply.trim() || busy) return;
    setBusy(true);
    const res = await replyThread(open.id, reply.trim());
    setBusy(false);
    if (res.error) return onNotice({ text: res.error, error: true });
    setReply('');
    void openThread(open.id);
  }

  async function end() {
    if (!open || !window.confirm('Görüşme sonlandırılacak ve yazışma silinecek. Emin misin?')) return;
    const res = await adminEndThread(open.id);
    onNotice(res.error ? { text: res.error, error: true } : { text: 'Görüşme sonlandırıldı.', error: false });
    setOpen(null);
    void load();
  }

  return (
    <section>
      <h2>Üye mesajları</h2>
      <p className="muted small">Yeni yazışma başlatmak için: Üyeler → üyeyi seç → Mesaj gönder.</p>
      <div className="split">
        <div className="list">
          {rows === null ? (
            <Empty>Yükleniyor…</Empty>
          ) : rows.length === 0 ? (
            <Empty>Yazışma yok.</Empty>
          ) : (
            rows.map((t) => (
              <button key={t.id} className={`member ${open?.id === t.id ? 'member-on' : ''}`} onClick={() => void openThread(t.id)}>
                <span className="member-name">
                  {t.unread ? <span className="dot" /> : null}
                  {t.member_name} · {t.title}
                </span>
                <span className="muted small">
                  {t.last_from_admin ? 'Moderatör: ' : 'Üye: '}
                  {(t.last_body ?? '').slice(0, 60)} · {when(t.last_at)}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="detail">
          {open ? (
            <Card>
              <div className="row-head">
                <h3>{open.title}</h3>
                <span className="muted small">{when(open.created_at)}</span>
              </div>
              <p className="muted small">
                {open.member_name} {open.member_alias ? `(${open.member_alias})` : ''}
              </p>
              <div className="chat">
                {open.messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.from_admin ? 'bubble-me' : ''}`}>
                    <div className="pre">{m.body}</div>
                    <div className="muted small">{when(m.created_at)}</div>
                  </div>
                ))}
              </div>
              <div className="stack">
                <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} placeholder="Cevap yaz" />
                <div className="actions">
                  <Button disabled={busy || !reply.trim()} onClick={() => void send()}>
                    Gönder
                  </Button>
                  {rows?.find((r) => r.id === open.id)?.user_id ? (
                    <Button kind="ghost" onClick={() => onMember(rows.find((r) => r.id === open.id)?.user_id as string)}>
                      Üyeyi aç
                    </Button>
                  ) : null}
                  <Button kind="danger" onClick={() => void end()}>
                    Görüşmeyi sonlandır
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Empty>Soldan bir yazışma seç.</Empty>
          )}
        </div>
      </div>
    </section>
  );
}
