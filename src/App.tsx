import { useEffect, useRef, useState } from 'react';
import { addMonths, DEFAULT_PAYDAY, formatMonth, monthOf, today } from './finance';
import { useStore } from './store';
import { useSync } from './useSync';
import { notifyIfNeeded } from './notify';
import { Dashboard } from './components/Dashboard';
import { TransactionsView } from './components/Transactions';
import { RecurringView } from './components/Recurring';
import { PlannedView } from './components/Planned';
import { SettingsView, timeAgo, type Theme } from './components/Settings';
import { AccountsView } from './components/Accounts';

export type Tab = 'home' | 'movimenti' | 'conti' | 'mensili' | 'acquisti' | 'impostazioni';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Riepilogo', icon: '◎' },
  { id: 'movimenti', label: 'Movimenti', icon: '⇅' },
  { id: 'conti', label: 'Conti', icon: '💳' },
  { id: 'mensili', label: 'Mensili', icon: '📅' },
  { id: 'acquisti', label: 'Acquisti', icon: '🛍️' },
  { id: 'impostazioni', label: 'Impostazioni', icon: '⚙' },
];

/** Sul telefono le impostazioni si aprono dall'icona in alto, per lasciare spazio alle altre sezioni. */
const MOBILE_TABS = TABS.filter((t) => t.id !== 'impostazioni');

const readPref = <T extends string>(key: string, fallback: T, allowed: readonly T[]): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // preferenza non salvata: nessun problema
  }
};

export default function App() {
  const store = useStore();
  const sync = useSync(store);
  const [tab, setTab] = useState<Tab>(() => readPref('finanze:tab', 'home', TABS.map((t) => t.id)));
  const [month, setMonth] = useState(monthOf(today()));
  const [theme, setTheme] = useState<Theme>(() => readPref('finanze:theme', 'auto', ['auto', 'light', 'dark'] as const));
  const [payday, setPayday] = useState(() => {
    const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
    return Number(readPref('finanze:payday', String(DEFAULT_PAYDAY), days));
  });
  useEffect(() => writePref('finanze:payday', String(payday)), [payday]);

  // Promemoria: all'apertura e quando l'app torna in primo piano, dopo qualche secondo per
  // lasciare il tempo alla sincronizzazione di portare i dati degli altri dispositivi.
  const latest = useRef({ data: store.data, payday });
  latest.current = { data: store.data, payday };
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => notifyIfNeeded(latest.current.data, latest.current.payday).catch(() => {}), 4000);
    };
    const onVisible = () => document.visibilityState === 'visible' && check();
    check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => writePref('finanze:tab', tab), [tab]);
  useEffect(() => {
    writePref('finanze:theme', theme);
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const showMonth = tab === 'home' || tab === 'movimenti' || tab === 'mensili';
  const current = monthOf(today());

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="./icon.svg" alt="" width={28} height={28} />
          <span>Le mie finanze</span>
        </div>
        <div className="topbar-right">
          {sync.enabled && (
            <button
              className={`sync-chip ${sync.status.state}`}
              onClick={() => (sync.status.state === 'error' ? setTab('impostazioni') : sync.syncNow())}
              title={
                sync.status.state === 'error'
                  ? `Errore di sincronizzazione: ${sync.status.message}`
                  : sync.status.lastSync
                    ? `Sincronizzato ${timeAgo(sync.status.lastSync)}`
                    : 'Sincronizzazione'
              }
              aria-label="Stato sincronizzazione"
            >
              <span className="sync-dot" aria-hidden />
              <span className="sync-label">{sync.status.state === 'syncing' ? 'Sincronizzo…' : sync.status.state === 'error' ? 'Errore sync' : 'Sincronizzato'}</span>
            </button>
          )}
          <nav className="tabs desktop-only" aria-label="Sezioni">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <button
            className={`icon-btn mobile-only ${tab === 'impostazioni' ? 'active' : ''}`}
            aria-label="Impostazioni"
            aria-current={tab === 'impostazioni' ? 'page' : undefined}
            onClick={() => setTab('impostazioni')}
          >
            ⚙
          </button>
        </div>
      </header>

      {showMonth && (
        <div className="month-nav">
          <button className="icon-btn" aria-label="Mese precedente" onClick={() => setMonth((m) => addMonths(m, -1))}>
            ‹
          </button>
          <div className="month-label">
            <strong>{formatMonth(month)}</strong>
            {month !== current && (
              <button className="link small" onClick={() => setMonth(current)}>
                Torna a oggi
              </button>
            )}
          </div>
          <button className="icon-btn" aria-label="Mese successivo" onClick={() => setMonth((m) => addMonths(m, 1))}>
            ›
          </button>
        </div>
      )}

      <main>
        {tab === 'home' && <Dashboard store={store} month={month} payday={payday} goTo={setTab} />}
        {tab === 'movimenti' && <TransactionsView store={store} month={month} />}
        {tab === 'conti' && <AccountsView store={store} payday={payday} />}
        {tab === 'mensili' && <RecurringView store={store} month={month} />}
        {tab === 'acquisti' && <PlannedView store={store} />}
        {tab === 'impostazioni' && <SettingsView store={store} sync={sync} theme={theme} setTheme={setTheme} payday={payday} setPayday={setPayday} />}
      </main>

      <nav className="bottom-nav mobile-only" aria-label="Sezioni">
        {MOBILE_TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
