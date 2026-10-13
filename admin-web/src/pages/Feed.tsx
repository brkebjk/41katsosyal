import { useCallback, useEffect, useState } from 'react';

import { revealCommentAuthor, revealPostAuthor, setHidden } from '@/lib/moderation';

import { supabase } from '../supabase';
import { Button, Card, Empty, errText, when, type Notice } from '../ui';

type Post = {
  id: string;
  alias: string;
  body: string;
  created_at: string;
  is_hidden: boolean;
  like_count: number;
  comment_count: number;
  cell_q: number | null;
  cell_r: number | null;
  place_name: string | null;
  event_title: string | null;
  thread: { id: string; body: string; hidden: boolean }[] | null;
};
type Comment = { id: string; alias: string; body: string; created_at: string; is_hidden: boolean };

/** Akış: son gönderiler (petek akışları dahil), gizle / göster, yazarı göster, yorumlar, Moderatör olarak yaz */
export function FeedPage({ onNotice, onMember }: { onNotice: (n: Notice) => void; onMember: (id: string) => void }) {
  const [rows, setRows] = useState<Post[] | null>(null);
  const [more, setMore] = useState(true);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});

  const load = useCallback(
    async (before: string | null) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc('list_feed', { p_before: before, p_limit: 40 });
      if (error) onNotice({ text: errText(error, 'Akış okunamadı.'), error: true });
      const list = (data as Post[]) ?? [];
      setMore(list.length === 40);
      setRows((old) => (before && old ? [...old, ...list] : list));
    },
    [onNotice],
  );
  useEffect(() => {
    void load(null);
  }, [load]);

  async function post() {
    if (!supabase || !body.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('create_post', { p_body: body.trim() });
    setBusy(false);
    if (error) return onNotice({ text: errText(error, 'Gönderilemedi.'), error: true });
    setBody('');
    onNotice({ text: 'Gönderin akışta “Moderatör” adıyla yayınlandı.', error: false });
    void load(null);
  }

  async function toggle(type: 'post' | 'comment', id: string, hidden: boolean, postId?: string) {
    const res = await setHidden(type, id, hidden);
    onNotice(res.error ? { text: res.error, error: true } : { text: hidden ? 'Gizlendi.' : 'Yeniden gösterildi.', error: false });
    if (type === 'post') void load(null);
    else if (postId) void loadComments(postId);
  }

  async function reveal(type: 'post' | 'comment', id: string) {
    if (!window.confirm('Yazarın kim olduğu gösterilecek ve bu görüntüleme işlem günlüğüne yazılacak. Devam?')) return;
    const res = type === 'post' ? await revealPostAuthor(id) : await revealCommentAuthor(id);
    if (res.error || !res.data) return onNotice({ text: res.error ?? 'Yazar bulunamadı.', error: true });
    onMember(res.data.id);
  }

  async function loadComments(postId: string) {
    if (!supabase) return;
    const { data } = await supabase.rpc('list_comments', { p_post_id: postId });
    setComments((c) => ({ ...c, [postId]: (data as Comment[]) ?? [] }));
  }

  return (
    <section>
      <h2>Akış</h2>
      <Card>
        <h3>Moderatör olarak yaz</h3>
        <p className="muted small">Gönderi herkese “Moderatör” adıyla ve kırmızı simgeyle görünür.</p>
        <div className="stack">
          <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder="Gönderi metni" />
          <Button disabled={busy || !body.trim()} onClick={() => void post()}>
            Yayınla
          </Button>
        </div>
      </Card>
      {rows === null ? (
        <Empty>Yükleniyor…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Gönderi yok.</Empty>
      ) : (
        rows.map((p) => (
          <Card key={p.id} className={p.is_hidden ? 'quote-hidden' : ''}>
            <div className="row-head">
              <strong>{p.alias}</strong>
              <span className="muted small">{when(p.created_at)}</span>
            </div>
            <p className="muted small">
              {[
                p.cell_q !== null ? `Petek akışı (${p.cell_q}, ${p.cell_r})` : 'Genel akış',
                p.place_name ? `Yer: ${p.place_name}` : null,
                p.event_title ? `Etkinlik: ${p.event_title}` : null,
                `${p.like_count} beğeni`,
                `${p.comment_count} yorum`,
                p.is_hidden ? 'GİZLİ' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="pre">{p.body}</p>
            {(p.thread ?? []).map((t) => (
              <p key={t.id} className={`pre small quote ${t.hidden ? 'quote-hidden' : ''}`}>
                {t.body}
              </p>
            ))}
            <div className="actions">
              <Button kind="ghost" onClick={() => void toggle('post', p.id, !p.is_hidden)}>
                {p.is_hidden ? 'Yeniden göster' : 'Gizle'}
              </Button>
              <Button kind="ghost" onClick={() => void reveal('post', p.id)}>
                Yazarı göster
              </Button>
              {p.comment_count > 0 ? (
                <Button kind="ghost" onClick={() => void loadComments(p.id)}>
                  Yorumlar ({p.comment_count})
                </Button>
              ) : null}
            </div>
            {comments[p.id]?.map((c) => (
              <div key={c.id} className={`quote ${c.is_hidden ? 'quote-hidden' : ''}`}>
                <div className="muted small">
                  {c.alias} · {when(c.created_at)}
                  {c.is_hidden ? ' · GİZLİ' : ''}
                </div>
                <p className="pre">{c.body}</p>
                <div className="actions">
                  <Button kind="ghost" onClick={() => void toggle('comment', c.id, !c.is_hidden, p.id)}>
                    {c.is_hidden ? 'Yeniden göster' : 'Gizle'}
                  </Button>
                  <Button kind="ghost" onClick={() => void reveal('comment', c.id)}>
                    Yazarı göster
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        ))
      )}
      {rows && more ? (
        <Button kind="ghost" onClick={() => void load(rows[rows.length - 1]?.created_at ?? null)}>
          Daha eski gönderiler
        </Button>
      ) : null}
    </section>
  );
}
