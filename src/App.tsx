import { useEffect, useState } from 'react';
import { addMonths, formatMonth, monthOf, today } from './finance';
import { useStore } from './store';
import { Dashboard } from './components/Dashboard';
import { TransactionsView } from './components/Transactions';
import { RecurringView } from './components/Recurring';
import { PlannedView } from './components/Planned';
import { SettingsView, type Theme } from './components/Settings';

export type Tab = 'home' | 'movimenti' | 'mensili' | 'acquisti' | 'impostazioni';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Riepilogo', icon: '◎' },
  { id: 'movimenti', label: 'Movimenti', icon: '⇅' },
  { id: 'mensili', label: 'Mensili', icon: '📅' },
  { id: 'acquisti', label: 'Acquisti', icon: '🛍️' },
  { id: 'impostazioni', label: 'Impostazioni', icon: '⚙' },
];

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
  const [tab, setTab] = useState<Tab>(() => readPref('finanze:tab', 'home', TABS.map((t) => t.id)));
  const [month, setMonth] = useState(monthOf(today()));
  const [theme, setTheme] = useState<Theme>(() => readPref('finanze:theme', 'auto', ['auto', 'light', 'dark'] as const));

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
        <nav className="tabs desktop-only" aria-label="Sezioni">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
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
        {tab === 'home' && <Dashboard store={store} month={month} goTo={setTab} />}
        {tab === 'movimenti' && <TransactionsView store={store} month={month} />}
        {tab === 'mensili' && <RecurringView store={store} month={month} />}
        {tab === 'acquisti' && <PlannedView store={store} />}
        {tab === 'impostazioni' && <SettingsView store={store} theme={theme} setTheme={setTheme} />}
      </main>

      <nav className="bottom-nav mobile-only" aria-label="Sezioni">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
