import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles.css';

/** Beklenmeyen bir hata olursa boş beyaz sayfa yerine hatanın kendisi gösterilir (bana fotoğrafı gönderilebilsin) */
class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center">
        <div className="login card">
          <h1>PeopleHere Yönetim</h1>
          <p className="error">Panel açılırken hata oluştu:</p>
          <p className="pre small">{this.state.error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Sayfayı yenile
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </StrictMode>,
);
