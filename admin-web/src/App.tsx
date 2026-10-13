import { useCallback, useEffect, useState } from 'react';

import { isBackendReady, loginEmail, supabase } from './supabase';
import { Button, NoticeBar, type Notice } from './ui';
import { ApprovalsPage } from './pages/Approvals';
import { LogPage } from './pages/Log';
import { MembersPage } from './pages/Members';
import { OverviewPage } from './pages/Overview';
import { ProblemsPage } from './pages/Problems';
import { ReportsPage } from './pages/Reports';

type Page = 'overview' | 'reports' | 'members' | 'approvals' | 'problems' | 'log';

const NAV: { value: Page; label: string }[] = [
  { value: 'overview', label: 'Özet' },
  { value: 'reports', label: 'Şikayetler' },
  { value: 'members', label: 'Üyeler' },
  { value: 'approvals', label: 'Onaylar' },
  { value: 'problems', label: 'Sorun bildirimleri' },
  { value: 'log', label: 'İşlem günlüğü' },
];

/** Sonraki aşamalarda eklenecek bölümler (şimdilik mobil uygulamadaki moderatör ekranından yapılır) */
const SOON = ['Akış ve mesajlar', 'Duyurular', 'Etkinlikler ve çekilişler', 'Yarışma soruları', 'Harita araçları', 'Ayarlar'];

type Gate = 'loading' | 'out' | 'in';

export function App() {
  const [gate, setGate] = useState<Gate>('loading');
  const [page, setPage] = useState<Page>(() => {
    const h = window.location.hash.replace('#', '') as Page;
    return NAV.some((n) => n.value === h) ? h : 'overview';
  });
  const [notice, setNotice] = useState<Notice>(null);
  const [focusMember, setFocusMember] = useState<string | null>(null);

  /** Oturum varsa web panel oturumunu sunucuya kaydeder (yalnızca moderatör hesabı geçer) */
  const claim = useCallback(async (): Promise<string | null> => {
    if (!supabase) return 'Sunucu bağlantısı kurulmadı.';
    const { error } = await supabase.rpc('admin_web_claim');
    if (!error) return null;
    // Moderatör olmayan hesabın oturumu bu tarayıcıda kapatılır (telefondaki oturuma dokunulmaz)
    await supabase.auth.signOut({ scope: 'local' });
    return error.message.includes('forbidden')
      ? 'Bu hesap moderatör değil. Panele yalnızca moderatör hesapları girebilir.'
      : 'Giriş tamamlanamadı. Veritabanı güncel olmayabilir (schema.sql çalıştırılmalı).';
  }, []);

  useEffect(() => {
    if (!supabase) {
      setGate('out');
      return;
    }
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return setGate('out');
      const err = await claim();
      if (err) {
        setNotice({ text: err, error: true });
        setGate('out');
      } else setGate('in');
    });
  }, [claim]);

  useEffect(() => {
    window.location.hash = page;
  }, [page]);

  async function logout() {
    if (!supabase) return;
    await supabase.rpc('admin_web_release');
    // Yalnızca bu tarayıcıdaki oturum kapanır; telefondaki oturum açık kalır
    await supabase.auth.signOut({ scope: 'local' });
    setGate('out');
  }

  if (!isBackendReady) {
    return (
      <div className="center">
        <div className="login card">
          <h1>41. Kat Yönetim</h1>
          <p className="error">
            Sunucu adresi girilmemiş. Cloudflare Pages ayarlarında VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY
            tanımlanmalı.
          </p>
        </div>
      </div>
    );
  }
  if (gate === 'loading') return <div className="center muted">Yükleniyor…</div>;
  if (gate === 'out') {
    return (
      <Login
        notice={notice}
        onNotice={setNotice}
        onDone={async () => {
          const err = await claim();
          if (err) setNotice({ text: err, error: true });
          else {
            setNotice(null);
            setGate('in');
          }
        }}
      />
    );
  }

  const openMember = (id: string) => {
    setFocusMember(id);
    setPage('members');
  };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">41. Kat Yönetim</div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.value}
              className={`nav ${page === n.value ? 'nav-on' : ''}`}
              onClick={() => setPage(n.value)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="soon">
          <div className="soon-title">Yakında</div>
          {SOON.map((s) => (
            <div key={s} className="soon-item">
              {s}
            </div>
          ))}
        </div>
        <Button kind="ghost" onClick={() => void logout()}>
          Çıkış yap
        </Button>
      </aside>
      <main className="main">
        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
        {page === 'overview' ? (
          <OverviewPage onGo={(p) => setPage(p as Page)} />
        ) : page === 'reports' ? (
          <ReportsPage onNotice={setNotice} onMember={openMember} />
        ) : page === 'members' ? (
          <MembersPage onNotice={setNotice} focusId={focusMember} onFocusDone={() => setFocusMember(null)} />
        ) : page === 'approvals' ? (
          <ApprovalsPage onNotice={setNotice} />
        ) : page === 'problems' ? (
          <ProblemsPage onNotice={setNotice} onMember={openMember} />
        ) : (
          <LogPage />
        )}
      </main>
    </div>
  );
}

function Login({
  notice,
  onNotice,
  onDone,
}: {
  notice: Notice;
  onNotice: (n: Notice) => void;
  onDone: () => Promise<void>;
}) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    onNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(user), password: pass });
    if (error) {
      setBusy(false);
      onNotice({ text: 'Kullanıcı adı ya da şifre hatalı.', error: true });
      return;
    }
    await onDone();
    setBusy(false);
  }

  return (
    <div className="center">
      <form className="login card" onSubmit={(e) => void submit(e)}>
        <h1>41. Kat Yönetim</h1>
        <p className="muted">Moderatör hesabının uygulamadaki kullanıcı adı ve şifresiyle gir.</p>
        <NoticeBar notice={notice} onClose={() => onNotice(null)} />
        <label>
          Kullanıcı adı
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Şifre
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </Button>
        <p className="small muted">Buradan giriş yapmak telefondaki oturumunu kapatmaz.</p>
      </form>
    </div>
  );
}
