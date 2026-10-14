import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
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
