import { useCallback, useEffect, useState } from 'react';

import { configProblem, isBackendReady, loginEmail, supabase } from './supabase';
import { Button, NoticeBar, type Notice } from './ui';
import { ALL_PAGES, NAV_GROUPS, pageLabel, renderPage, type Page } from './pages';

type Gate = 'loading' | 'out' | 'in';

export function App() {
  const [gate, setGate] = useState<Gate>('loading');
  const [page, setPage] = useState<Page>(() => {
    const h = window.location.hash.replace('#', '') as Page;
    return ALL_PAGES.includes(h) ? h : 'overview';
  });
  const [notice, setNotice] = useState<Notice>(null);
  const [focusMember, setFocusMember] = useState<string | null>(null);
  // Telefonda menü kapalı başlar (üstteki ☰ ile açılır)
  const [menuOpen, setMenuOpen] = useState(false);

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
    if (window.location.hash !== `#${page}`) window.location.hash = page;
  }, [page]);
  // Tarayıcının geri / ileri düğmesi
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace('#', '') as Page;
      if (ALL_PAGES.includes(h)) setPage(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
          <p className="error">{configProblem ?? 'Sunucu bağlantısı kurulamadı.'}</p>
          <p className="muted small">
            Değeri düzelttikten sonra Cloudflare'de Deployments sekmesinde en üstteki yayının yanındaki ⋯ menüsünden
            “Retry deployment” seç.
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
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="shell">
      <header className="topbar">
        <button className="menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menü">
          {menuOpen ? '✕' : '☰'}
        </button>
        <span className="topbar-title">{pageLabel(page)}</span>
      </header>
      <aside className={`side ${menuOpen ? 'side-open' : ''}`}>
        <div className="brand">41. Kat Yönetim</div>
        <nav>
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="nav-group">
              <div className="nav-title">{g.title}</div>
              {g.items.map((n) => (
                <button
                  key={n.value}
                  className={`nav ${page === n.value ? 'nav-on' : ''}`}
                  onClick={() => {
                    setPage(n.value);
                    setMenuOpen(false);
                    window.scrollTo({ top: 0 });
                  }}
                >
                  {n.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <Button kind="ghost" onClick={() => void logout()}>
          Çıkış yap
        </Button>
      </aside>
      <main className="main">
        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
        {renderPage(page, { onNotice: setNotice, onMember: openMember, onGo: setPage, focusMember, clearFocus: () => setFocusMember(null) })}
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
