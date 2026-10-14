import { useState } from 'react';
import {
  addMonths,
  euro,
  formatDate,
  formatMonth,
  monthOf,
  monthSummary,
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
import { Empty, Progress } from './ui';

export function Dashboard({ store, month, goTo }: { store: Store; month: string; goTo: (t: Tab) => void }) {
  const { data } = store;
  const [adding, setAdding] = useState<Kind | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const s = monthSummary(data, month);
  const isCurrent = month === monthOf(today());
  const lastDay = `${month}-31`;
  const balanceAtEnd = totalBalance(data.transactions, isCurrent ? today() : lastDay);

  const trend = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5)).map((m) => ({ month: m, ...monthSummary(data, m) }));
  const trendMax = Math.max(1, ...trend.flatMap((t) => [t.income, t.expenses]));

  const due = data.recurring
    .filter((r) => r.active && !recurringPayment(data.transactions, r, month))
    .sort((a, b) => a.day - b.day);
  const planned = sortPlanned(data.planned.filter((p) => !p.boughtDate)).slice(0, 3);
  const recent = [...transactionsIn(data.transactions, month)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const catMax = s.byCategory[0]?.amount ?? 1;
  const defaultDate = isCurrent ? today() : `${month}-01`;

  const isEmpty = !data.transactions.length && !data.recurring.length && !data.planned.length;

  return (
    <div className="view">
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
            <li>Registra entrate e uscite con i pulsanti qui sopra.</li>
            <li>
              Aggiungi le <button className="link" onClick={() => goTo('mensili')}>spese mensili</button> fisse (affitto, bollette, abbonamenti…).
            </li>
            <li>
              Annota gli <button className="link" onClick={() => goTo('acquisti')}>acquisti in programma</button> per sapere quanto risparmiare.
            </li>
          </ol>
          <p className="muted small">I dati restano salvati solo su questo dispositivo. Dalle Impostazioni puoi esportare un backup.</p>
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

      {(s.pendingExpenses > 0 || s.pendingIncome > 0) && (
        <div className="card forecast">
          <div>
            <span className="muted">Previsione di fine mese</span>
            <strong className={s.forecast >= 0 ? 'big amount entrata' : 'big amount uscita'}>{euro(s.forecast)}</strong>
          </div>
          <p className="small muted">
            Considerando le voci mensili non ancora registrate
            {s.pendingExpenses > 0 && <> (−{euro(s.pendingExpenses)} di spese</>}
            {s.pendingIncome > 0 && <>{s.pendingExpenses > 0 ? ', ' : ' ('}+{euro(s.pendingIncome)} di entrate</>})
          </p>
        </div>
      )}

      <div className="grid-2">
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
          ) : due.length === 0 ? (
            <p className="muted small">✓ Tutto registrato per questo mese.</p>
          ) : (
            <ul className="mini-list">
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

      <section>
        <div className="card-head">
          <h3>Ultimi movimenti</h3>
          <button className="link" onClick={() => goTo('movimenti')}>
            Vedi tutti
          </button>
        </div>
        {recent.length === 0 ? <Empty icon="🧾" title="Nessun movimento in questo mese" /> : <TransactionList txs={recent} onEdit={setEditing} />}
      </section>

      {(adding || editing) && (
        <TransactionForm
          initial={editing ?? undefined}
          defaultKind={adding ?? 'uscita'}
          defaultDate={defaultDate}
          onSave={store.saveTransaction}
          onDelete={store.deleteTransaction}
          onClose={() => {
            setAdding(null);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
