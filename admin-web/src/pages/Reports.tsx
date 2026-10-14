import { useCallback, useEffect, useState } from 'react';

import {
  adminVoiceClip,
  closeReports,
  listReports,
  revealCommentAuthor,
  revealPostAuthor,
  setHidden,
  type ReportGroup,
} from '@/lib/moderation';

import { Button, Card, Empty, Tabs, when, type Notice } from '../ui';

const TYPE: Record<ReportGroup['type'], string> = {
  post: 'Akış gönderisi',
  comment: 'Yorum',
  event_comment: 'Etkinlik yorumu',
  venue_review: 'Mekân değerlendirmesi',
  room: 'Oyun odası',
  event: 'Etkinlik',
  quiz_chat: 'Yarışma sohbeti',
  vv_whisper: 'Vampir fısıltısı',
  vv_dead: 'Vampir elenenler sohbeti',
  dm: 'Özel mesaj',
  crew_msg: 'Klan sohbeti',
  sk_voice: 'Köpekbalığı Kafesi ses mesajı',
};

const HIDEABLE = new Set(['post', 'comment', 'event_comment', 'venue_review']);

/** Şikayetler: içerik başına gruplanmış; gizle / göster, yazarı göster (kayda geçer), sonuçlandır */
export function ReportsPage({ onNotice, onMember }: { onNotice: (n: Notice) => void; onMember: (id: string) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [rows, setRows] = useState<ReportGroup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (s: 'open' | 'closed') => {
      const res = await listReports(s);
      if (res.error) onNotice({ text: res.error, error: true });
      setRows(res.data);
    },
    [onNotice],
  );

  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function act(g: ReportGroup, task: () => Promise<{ error: string | null }>, ok: string) {
    if (busy) return;
    setBusy(g.key);
    const res = await task();
    setBusy(null);
    onNotice(res.error ? { text: res.error, error: true } : { text: ok, error: false });
    void load(status);
  }

  async function reveal(g: ReportGroup) {
    if (!window.confirm('Yazarın kim olduğu gösterilecek. Bu görüntüleme işlem günlüğüne yazılır. Devam edilsin mi?')) return;
    const res = g.type === 'post' ? await revealPostAuthor(g.targetId) : await revealCommentAuthor(g.targetId);
    if (res.error || !res.data) return onNotice({ text: res.error ?? 'Yazar bulunamadı.', error: true });
    onMember(res.data.id);
  }

  return (
    <section>
      <h2>Şikayetler</h2>
      <Tabs
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: 'Açık' },
          { value: 'closed', label: 'Sonuçlanan' },
        ]}
      />
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>{status === 'open' ? 'Açık şikayet yok.' : 'Kayıt yok.'}</Empty>
      ) : (
        rows.map((g) => (
          <Card key={g.key}>
            <div className="row-head">
              <strong>
                {TYPE[g.type]} · {g.count} şikayet
              </strong>
              <span className="muted">{when(g.latest)}</span>
            </div>
            <p className="muted small">Nedenler: {[...new Set(g.reasons)].join(', ')}</p>
            {g.type === 'sk_voice' ? (
              <>
                <VoiceClip id={g.targetId} />
                <p className="muted small">
                  Haklı: konuşanın mikrofonu 7 gün (tekrarında 30 gün) kapanır. Haksız: şikâyet edenin haksız şikâyet
                  sayısı artar; her 3 haksız şikâyette 30 gün ses şikâyeti yapamaz ve 7 gün mikrofon kullanamaz.
                </p>
              </>
            ) : g.content ? (
              <div className={`quote ${g.content.is_hidden ? 'quote-hidden' : ''}`}>
                <div className="muted small">
                  {g.content.alias} · {when(g.content.created_at)}
                  {g.content.is_hidden ? ' · GİZLİ' : ''}
                  {g.content.cancelled ? ' · iptal edildi' : ''}
                </div>
                <p className="pre">{g.content.body}</p>
              </div>
            ) : (
              <p className="muted">İçerik silinmiş.</p>
            )}
            {status === 'open' ? (
              <div className="actions">
                {g.content && HIDEABLE.has(g.type) ? (
                  <Button
                    kind="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      void act(
                        g,
                        () =>
                          setHidden(
                            g.type as 'post' | 'comment' | 'event_comment' | 'venue_review',
                            g.targetId,
                            !g.content?.is_hidden,
                          ),
                        g.content?.is_hidden ? 'İçerik yeniden gösterildi.' : 'İçerik gizlendi.',
                      )
                    }
                  >
                    {g.content.is_hidden ? 'Yeniden göster' : 'Gizle'}
                  </Button>
                ) : null}
                {g.content && (g.type === 'post' || g.type === 'comment') ? (
                  <Button kind="ghost" disabled={busy !== null} onClick={() => void reveal(g)}>
                    Yazarı göster
                  </Button>
                ) : null}
                <Button
                  disabled={busy !== null}
                  onClick={() => void act(g, () => closeReports(g.reportIds, 'resolved'), 'Şikayet sonuçlandırıldı.')}
                >
                  Haklı (sonuçlandır)
                </Button>
                <Button
                  kind="ghost"
                  disabled={busy !== null}
                  onClick={() => void act(g, () => closeReports(g.reportIds, 'dismissed'), 'Şikayet reddedildi.')}
                >
                  Haksız (reddet)
                </Button>
              </div>
            ) : null}
          </Card>
        ))
      )}
    </section>
  );
}

/** Şikâyet edilen ses mesajı: düğmeye basınca sunucudan alınır ve çalınır (inceleme için en çok 14 gün saklanır) */
function VoiceClip({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'gone'>('idle');
  async function load() {
    setState('loading');
    const res = await adminVoiceClip(id);
    if (!res.data) {
      setState('gone');
      return;
    }
    setSrc(`data:audio/mp4;base64,${res.data}`);
    setState('idle');
  }
  if (src) return <audio controls autoPlay src={src} />;
  if (state === 'gone') return <p className="muted">Ses mesajı silinmiş (14 gün geçmiş olabilir).</p>;
  return (
    <Button kind="ghost" disabled={state === 'loading'} onClick={() => void load()}>
      {state === 'loading' ? 'Yükleniyor…' : 'Ses mesajını dinle'}
    </Button>
  );
}
