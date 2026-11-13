import { useState } from 'react';
import {
  ACCOUNT_TYPES,
  commitments,
  recurringDue,
  isFuture,
  isVisible,
  MACROS,
  macroSummary,
  accountBalance,
  addMonths,
  euro,
  formatDate,
  formatMonth,
  monthOf,
  monthSummary,
  overdueRecurring,
  plannedProgress,
  recurringDate,
  recurringPayment,
  sortPlanned,
  today,
  totalBalance,
  transactionsIn,
} from '../finance';
import type { Store } from '../store';
import type { Kind, Transaction } from '../types';
import type { Tab } from '../App';
import { TransactionForm, TransactionList } from './Transactions';
import { Alerts, shortfallText, useForecast, WarnIcon } from './Alerts';
import { SankeyCard } from './Sankey';
import { BalanceChart } from './BalanceChart';
import { Empty, Progress } from './ui';
import { backupDue, exportBackup, snoozeBackup } from '../backup';

export function Dashboard({
  store,
  month,
  payday,
  goTo,
  syncEnabled,
}: {
  store: Store;
  month: string;
  payday: number;
  goTo: (t: Tab) => void;
  syncEnabled: boolean;
}) {
  const { data } = store;
  const [adding, setAdding] = useState<Kind | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  // promemoria del backup: solo senza sincronizzazione, che è già una copia online
  const [backupAsked, setBackupAsked] = useState(false);
  const askBackup = !syncEnabled && !backupAsked && backupDue(data);
  const s = monthSummary(data, month);
  const fc = useForecast(data, payday);
  const macro = macroSummary(data, month);
  const macroBase = macro.spent.bisogni + macro.spent.desideri + Math.max(0, macro.spent.risparmio);
  // differenze di saldo ancora da dividere, di qualsiasi mese
  const adjustments = data.transactions.filter((t) => t.adjustment && t.date <= today());
  const toSplit = adjustments.reduce((s, t) => s + (t.kind === 'uscita' ? t.amount : -t.amount), 0);
  const committed = commitments(data);
  const balanceToday = totalBalance(data, today());
  const freeToday = Math.round((balanceToday - committed.total) * 100) / 100;
  const isCurrent = month === monthOf(today());
  const lastDay = `${month}-31`;
  const balanceDate = isCurrent ? today() : lastDay;
  const balanceAtEnd = totalBalance(data, balanceDate);
  const visibleAccounts = data.accounts.filter((a) => !a.archived || accountBalance(data, a, balanceDate) !== 0);

  const trend = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5)).map((m) => ({ month: m, ...monthSummary(data, m) }));
  const trendMax = Math.max(1, ...trend.flatMap((t) => [t.income, t.expenses]));

  const due = data.recurring
    .filter((r) => recurringDue(r, month) && !recurringPayment(data.transactions, r, month))
    .sort((a, b) => a.day - b.day);
  // nel mese in corso si vedono anche le voci dei mesi passati mai registrate
  const overdue = isCurrent ? overdueRecurring(data) : [];
  const planned = sortPlanned(data.planned.filter((p) => !p.boughtDate && !p.committed)).slice(0, 3);
  const recent = transactionsIn(data.transactions, month)
    .filter((t) => isVisible(t) && !isFuture(t))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const upcoming = data.transactions
    .filter((t) => isVisible(t) && isFuture(t))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const catMax = s.byCategory[0]?.amount ?? 1;
  const defaultDate = isCurrent ? today() : `${month}-01`;

  const isEmpty = !data.transactions.length && !data.recurring.length && !data.planned.length && data.accounts.every((a) => !a.initialBalance);

  return (
    <div className="view">
      <Alerts store={store} fc={fc} />

      {(adjustments.length > 0 || (isCurrent && macro.wants && macro.wants.state !== 'ok')) && (
        <div className="alerts">
          {isCurrent && macro.wants && macro.wants.state !== 'ok' && (
            <div className="alert warn">
              <WarnIcon />
              <div>
                <strong>{macro.wants.state === 'over' ? 'Budget dei desideri superato' : 'Stai per raggiungere il budget dei desideri'}</strong>
                <p>
                  {euro(macro.wants.total)} su {euro(macro.wants.budget)} questo mese
                  {macro.pending.desideri > 0 && ` (compresi ${euro(macro.pending.desideri)} ancora previsti)`}:{' '}
                  {macro.wants.left >= 0 ? `restano ${euro(macro.wants.left)}` : `sei oltre di ${euro(-macro.wants.left)}`}.
                </p>
              </div>
            </div>
          )}
          {adjustments.length > 0 && (
            <div className="alert info">
              <span className="alert-icon" aria-hidden>
                ?
              </span>
              <div>
                <strong>{euro(Math.abs(toSplit))} da classificare</strong>
                <p>
                  {toSplit >= 0 ? 'Spese non segnate' : 'Entrate non segnate'} trovate allineando il saldo: dividile nelle categorie giuste quando
                  vuoi.
                </p>
              </div>
              <button className="btn primary small" onClick={() => setEditing(adjustments[0])}>
                Dividi
              </button>
            </div>
          )}
        </div>
      )}

      {askBackup && (
        <div className="alerts">
          <div className="alert info backup-alert">
            <span className="alert-icon" aria-hidden>
              💾
            </span>
            <div>
              <strong>È ora di fare un backup</strong>
              <p>I dati sono salvati solo su questo dispositivo: scarica una copia per non perderli.</p>
              <div className="button-row">
                <button
                  className="btn primary small"
                  onClick={() => {
                    exportBackup(JSON.stringify(data, null, 2));
                    setBackupAsked(true);
                  }}
                >
                  Esporta backup
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => {
                    snoozeBackup();
                    setBackupAsked(true);
                  }}
                >
                  Più tardi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="quick-add">
        <button className="btn income" onClick={() => setAdding('entrata')}>
          + Entrata
        </button>
        <button className="btn expense" onClick={() => setAdding('uscita')}>
          − Uscita
        </button>
      </div>

      {isEmpty && (
        <div className="card welcome">
          <h2>Benvenuto! 👋</h2>
          <p>Per iniziare:</p>
          <ol>
            <li>
              Inserisci i tuoi <button className="link" onClick={() => goTo('conti')}>conti e carte</button> con il saldo che hanno oggi.
            </li>
            <li>Registra entrate e uscite con i pulsanti qui sopra.</li>
            <li>
              Aggiungi le <button className="link" onClick={() => goTo('mensili')}>spese mensili</button> fisse (affitto, bollette, abbonamenti…).
            </li>
            <li>
              Annota gli <button className="link" onClick={() => goTo('acquisti')}>acquisti in programma</button> per sapere quanto risparmiare.
            </li>
          </ol>
          <p className="muted small">
            I dati restano su questo dispositivo. Dalle <button className="link" onClick={() => goTo('impostazioni')}>Impostazioni</button> puoi
            attivare la sincronizzazione cifrata tra telefono e computer.
          </p>
        </div>
      )}

      <div className="summary">
        <div className="card kpi">
          <span className="muted">Entrate</span>
          <strong className="amount entrata">{euro(s.income)}</strong>
        </div>
        <div className="card kpi">
          <span className="muted">Uscite</span>
          <strong className="amount uscita">{euro(s.expenses)}</strong>
        </div>
        <div className="card kpi">
          <span className="muted">Saldo del mese</span>
          <strong className={s.balance >= 0 ? 'amount entrata' : 'amount uscita'}>{euro(s.balance)}</strong>
        </div>
        <div className="card kpi">
          <span className="muted">{isCurrent ? 'Saldo totale oggi' : `Saldo totale a fine mese`}</span>
          <strong>{euro(balanceAtEnd)}</strong>
        </div>
      </div>

      {committed.total > 0 && (
        <button className="card free-card" onClick={() => goTo('acquisti')}>
          <span className="free-main">
            <span className="muted">Disponibile libero oggi</span>
            <strong className={`big ${freeToday < 0 ? 'amount uscita' : 'amount entrata'}`}>{euro(freeToday)}</strong>
          </span>
          <span className="free-calc small muted">
            Saldo {euro(balanceToday)} − spese sicure {euro(committed.total)}
          </span>
          <span className="chevron" aria-hidden>
            ›
          </span>
        </button>
      )}

      {(s.pendingExpenses > 0 || s.pendingIncome > 0) && (
        <div className="card forecast">
          <div>
            <span className="muted">Previsione di fine mese</span>
            <strong className={s.forecast >= 0 ? 'big amount entrata' : 'big amount uscita'}>{euro(s.forecast)}</strong>
          </div>
          <p className="small muted">
            Considerando i movimenti previsti, le voci mensili non ancora registrate e le spese sicure
            {s.pendingExpenses > 0 && <> (−{euro(s.pendingExpenses)} di spese</>}
            {s.pendingIncome > 0 && <>{s.pendingExpenses > 0 ? ', ' : ' ('}+{euro(s.pendingIncome)} di entrate</>})
          </p>
        </div>
      )}

      <section className="card macro-card">
        <div className="card-head">
          <h3>Bisogni, desideri, risparmio</h3>
          <button className="link" onClick={() => goTo('impostazioni')}>
            {macro.wants ? 'Budget' : 'Imposta un budget'}
          </button>
        </div>
        <ul className="bars">
          {MACROS.map((m) => {
            const spent = macro.spent[m.id];
            const w = m.id === 'desideri' ? macro.wants : null;
            return (
              <li key={m.id}>
                <div className="bar-label">
                  <span>
                    {m.label} <span className="muted small">· {m.hint}</span>
                  </span>
                  <span>
                    {euro(spent)}
                    {macroBase > 0 && spent > 0 && <span className="muted"> · {Math.round((spent / macroBase) * 100)}%</span>}
                  </span>
                </div>
                <Progress
                  value={w ? (w.total / w.budget) * 100 : macroBase > 0 ? (Math.max(0, spent) / macroBase) * 100 : 0}
                  tone={m.id === 'risparmio' ? 'income' : w && w.state !== 'ok' ? 'expense' : 'accent'}
                />
                {w && (
                  <span className={`small ${w.state === 'ok' ? 'muted' : 'error'}`}>
                    Budget {euro(w.budget)}
                    {macro.pending.desideri > 0 && ` · ancora previsti ${euro(macro.pending.desideri)}`} ·{' '}
                    {w.left >= 0 ? `restano ${euro(w.left)}` : `superato di ${euro(-w.left)}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {macro.unclassified > 0 && <p className="small muted">Più {euro(macro.unclassified)} ancora da classificare.</p>}
      </section>

      <SankeyCard data={data} month={month} />

      <div className="grid-2">
        <BalanceChart data={data} payday={payday} />

        <section className="card span-2">
          <div className="card-head">
            <h3>{isCurrent ? 'Saldo dei conti' : 'Saldo dei conti a fine mese'}</h3>
            <button className="link" onClick={() => goTo('conti')}>
              Gestisci
            </button>
          </div>
          <ul className="mini-list account-grid">
            {visibleAccounts.map((a) => {
              const balance = accountBalance(data, a, balanceDate);
              return (
                <li key={a.id}>
                  <span className="badge account small" aria-hidden>
                    {ACCOUNT_TYPES[a.type].icon}
                  </span>
                  <span className="list-main">
                    <span className="list-title with-icon">
                      <span className="truncate">{a.name}</span>
                      {fc.accounts[a.id]?.shortfall > 0 && (
                        <WarnIcon title={shortfallText(fc.accounts[a.id].shortfall, fc.accounts[a.id].shortDate)} />
                      )}
                    </span>
                  </span>
                  <span className={`amount ${balance < 0 ? 'uscita' : ''}`}>{euro(balance)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Spese per categoria</h3>
          </div>
          {s.byCategory.length === 0 ? (
            <p className="muted small">Nessuna uscita in {formatMonth(month).toLowerCase()}.</p>
          ) : (
            <ul className="bars">
              {s.byCategory.map((c) => (
                <li key={c.category}>
                  <div className="bar-label">
                    <span>{c.category}</span>
                    <span>
                      {euro(c.amount)} <span className="muted">· {Math.round((c.amount / s.expenses) * 100)}%</span>
                    </span>
                  </div>
                  <Progress value={(c.amount / catMax) * 100} tone="expense" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Ultimi 6 mesi</h3>
            <span className="legend">
              <i className="dot entrata" /> Entrate <i className="dot uscita" /> Uscite
            </span>
          </div>
          <div className="trend" role="img" aria-label="Entrate e uscite degli ultimi 6 mesi">
            {trend.map((t) => (
              <div key={t.month} className={`trend-col ${t.month === month ? 'current' : ''}`} title={`${formatMonth(t.month)}: entrate ${euro(t.income)}, uscite ${euro(t.expenses)}`}>
                <div className="trend-bars">
                  <span className="trend-bar entrata" style={{ height: `${(t.income / trendMax) * 100}%` }} />
                  <span className="trend-bar uscita" style={{ height: `${(t.expenses / trendMax) * 100}%` }} />
                </div>
                <span className="trend-label">{new Date(t.month + '-01T00:00:00').toLocaleDateString('it-IT', { month: 'short' })}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Voci mensili da registrare</h3>
            <button className="link" onClick={() => goTo('mensili')}>
              Vedi tutte
            </button>
          </div>
          {data.recurring.length === 0 ? (
            <p className="muted small">Nessuna spesa mensile impostata.</p>
          ) : due.length === 0 && overdue.length === 0 ? (
            <p className="muted small">✓ Tutto registrato per questo mese.</p>
          ) : (
            <ul className="mini-list">
              {overdue.map(({ recurring: r, month: m, date }) => (
                <li key={`${r.id}-${m}`}>
                  <button className="tick" aria-label={`Segna ${r.name} di ${formatMonth(m).toLowerCase()} come registrata`} onClick={() => store.toggleRecurringPaid(r, m)} />
                  <span className="list-main">
                    <span className="list-title">{r.name}</span>
                    <span className="list-sub error">Non registrata · {formatDate(date)}</span>
                  </span>
                  <span className={`amount ${r.kind}`}>{euro(r.amount)}</span>
                </li>
              ))}
              {due.map((r) => {
                const date = recurringDate(r, month);
                const late = isCurrent && date < today() && r.kind === 'uscita';
                return (
                  <li key={r.id}>
                    <button className="tick" aria-label={`Segna ${r.name} come registrata`} onClick={() => store.toggleRecurringPaid(r, month)} />
                    <span className="list-main">
                      <span className="list-title">{r.name}</span>
                      <span className={`list-sub ${late ? 'error' : ''}`}>
                        {late ? 'In ritardo · ' : ''}
                        {formatDate(date)}
                      </span>
                    </span>
                    <span className={`amount ${r.kind}`}>{euro(r.amount)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Acquisti in programma</h3>
            <button className="link" onClick={() => goTo('acquisti')}>
              Vedi tutti
            </button>
          </div>
          {planned.length === 0 ? (
            <p className="muted small">Nessun acquisto in programma.</p>
          ) : (
            <ul className="mini-list planned-mini">
              {planned.map((p) => {
                const pr = plannedProgress(p);
                return (
                  <li key={p.id}>
                    <span className="list-main">
                      <span className="list-title">{p.name}</span>
                      <Progress value={pr.percent} tone="income" />
                      <span className="list-sub">
                        {euro(p.saved)} di {euro(p.cost)}
                        {pr.perMonth !== null && pr.remaining > 0 && ` · ${euro(pr.perMonth)}/mese`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {upcoming.length > 0 && (
        <section>
          <div className="card-head">
            <h3>Movimenti previsti</h3>
          </div>
          <TransactionList txs={upcoming} accounts={data.accounts} onEdit={setEditing} ascending />
        </section>
      )}

      <section>
        <div className="card-head">
          <h3>Ultimi movimenti</h3>
          <button className="link" onClick={() => goTo('movimenti')}>
            Vedi tutti
          </button>
        </div>
        {recent.length === 0 ? <Empty icon="🧾" title="Nessun movimento in questo mese" /> : <TransactionList txs={recent} accounts={data.accounts} onEdit={setEditing} />}
      </section>

      {(adding || editing) && (
        <TransactionForm
          accounts={data.accounts}
          initial={editing ?? undefined}
          defaultKind={adding ?? 'uscita'}
          defaultDate={defaultDate}
          onSave={store.saveTransaction}
          onDelete={store.deleteTransaction}
          onSplit={store.splitAdjustment}
          onClose={() => {
            setAdding(null);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
