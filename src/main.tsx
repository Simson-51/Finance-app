import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { download } from './backup';
import { today } from './finance';

/**
 * Se l'app va in errore, invece della pagina bianca mostra un messaggio da cui si può
 * ricaricare o scaricare una copia dei dati (letti così come sono salvati, senza toccarli).
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem('finanze:data');
    } catch {
      // storage non disponibile
    }
    return (
      <div className="crash">
        <h1>Qualcosa è andato storto</h1>
        <p>L'app ha incontrato un errore. I tuoi dati non sono stati toccati: sono ancora salvati su questo dispositivo.</p>
        <div className="button-row">
          <button className="btn primary" onClick={() => location.reload()}>
            Ricarica l'app
          </button>
          {raw && (
            <button className="btn ghost" onClick={() => download(`finanze-backup-${today()}.json`, raw, 'application/json')}>
              Esporta backup
            </button>
          )}
        </div>
        <p className="small muted">Dettaglio dell'errore: {error.message}</p>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Quando viene pubblicata una nuova versione, il nuovo service worker prende il controllo
  // e la pagina si ricarica da sola (aspettando che non ci sia un modulo aperto).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    if (document.querySelector('dialog[open]')) {
      document.addEventListener('visibilitychange', reload, { once: true });
      return;
    }
    reloading = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => hadController && reload());

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // cerca aggiornamenti ogni volta che l'app torna in primo piano
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
      })
      .catch(() => {
        // offline non disponibile: l'app funziona comunque
      });
  });
}
