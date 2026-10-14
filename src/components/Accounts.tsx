import { useState, type FormEvent } from 'react';
import { ACCOUNT_TYPES, accountBalance, accountName, euro, forecast, isVisible, monthOf, daysInMonth, parseAmount, today, totalBalance, uid, usableAccounts } from '../finance';
import type { Store } from '../store';
import type { Account, AccountType } from '../types';
import { Alerts, shortfallText, useForecast, WarnIcon } from './Alerts';
import { Field, Modal } from './ui';

/** Selettore del conto, nascosto quando esiste un solo conto utilizzabile. */
export function AccountSelect({
  accounts,
  value,
  onChange,
  label = 'Conto',
  exclude,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  exclude?: string;
}) {
  const options = usableAccounts(accounts, value).filter((a) => a.id !== exclude);
  if (options.length <= 1 && !exclude) return null;
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {ACCOUNT_TYPES[a.type].icon} {a.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function AccountForm({
  accounts,
  initial,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
  accounts: Account[];
  initial?: Account;
  canDelete: boolean;
  onSave: (a: Omit<Account, 'updatedAt'>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<AccountType>(initial?.type ?? 'conto');
  const [initialBalance, setInitialBalance] = useState(initial ? String(initial.initialBalance).replace('.', ',') : '');
  const [archived, setArchived] = useState(initial?.archived ?? false);
  const sources = accounts.filter((a) => a.id !== initial?.id && (!a.archived || a.id === initial?.topUpFrom));
  const [budgetOn, setBudgetOn] = useState(!!initial?.minBalance);
  const [minBalance, setMinBalance] = useState(initial?.minBalance ? String(initial.minBalance).replace('.', ',') : '');
  const [topUpFrom, setTopUpFrom] = useState(initial?.topUpFrom ?? sources.find((a) => !a.archived)?.id ?? '');
  const [autoTopUp, setAutoTopUp] = useState(initial?.autoTopUp ?? true);
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const balance = initialBalance.trim() ? parseAmount(initialBalance) : 0;
    if (!name.trim()) return setError('Inserisci un nome');
    if (Number.isNaN(balance)) return setError('Il saldo iniziale non è valido');
    const budget = budgetOn ? parseAmount(minBalance) : 0;
    if (budgetOn && !(budget > 0)) return setError('Inserisci il budget minimo da mantenere');
    if (budgetOn && !topUpFrom) return setError('Scegli il conto da cui ricaricare');
    onSave({
      id: initial?.id ?? uid(),
      name: name.trim(),
      type,
      initialBalance: balance,
      archived,
      minBalance: budgetOn ? budget : undefined,
      topUpFrom: budgetOn ? topUpFrom : undefined,
      autoTopUp: budgetOn ? autoTopUp : undefined,
    });
    onClose();
  };

  return (
    <Modal title={initial ? 'Modifica conto' : 'Nuovo conto o carta'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Nome">
          {(id) => <input id={id} autoFocus placeholder="Es. Conto Intesa, Carta prepagata, Portafoglio" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="field">
          <span className="label">Tipo</span>
          <div className="type-grid" role="radiogroup" aria-label="Tipo">
            {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>
                <span aria-hidden>{ACCOUNT_TYPES[t].icon}</span>
                {ACCOUNT_TYPES[t].label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Saldo iniziale (€)" hint="Quanto c'è su questo conto prima dei movimenti che registrerai nell'app. Può essere negativo (es. carta di credito).">
          {(id) => <input id={id} inputMode="decimal" placeholder="0,00" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />}
        </Field>
        {sources.length > 0 && (
          <fieldset className="budget">
            <label className="check">
              <input type="checkbox" checked={budgetOn} onChange={(e) => setBudgetOn(e.target.checked)} />
              Mantieni un budget minimo (es. Satispay)
            </label>
            {budgetOn && (
              <>
                <div className="row-2">
                  <Field label="Budget minimo (€)">
                    {(id) => <input id={id} inputMode="decimal" placeholder="75,00" value={minBalance} onChange={(e) => setMinBalance(e.target.value)} />}
                  </Field>
                  <Field label="Ricarica da">
                    {(id) => (
                      <select id={id} value={topUpFrom} onChange={(e) => setTopUpFrom(e.target.value)}>
                        {sources.map((a) => (
                          <option key={a.id} value={a.id}>
                            {ACCOUNT_TYPES[a.type].icon} {a.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>
                <div className="segmented" role="radiogroup" aria-label="Modalità di ricarica">
                  <button type="button" role="radio" aria-checked={autoTopUp} className={autoTopUp ? 'active' : ''} onClick={() => setAutoTopUp(true)}>
                    Automatica
                  </button>
                  <button type="button" role="radio" aria-checked={!autoTopUp} className={!autoTopUp ? 'active' : ''} onClick={() => setAutoTopUp(false)}>
                    Te la propongo io
                  </button>
                </div>
                <small className="muted">
                  {autoTopUp
                    ? "Quando il saldo scende sotto il budget, l'app registra da sola un trasferimento che lo riporta al budget (una ricarica al giorno, aggiornata a ogni spesa)."
                    : 'Quando il saldo scende sotto il budget, nel riepilogo compare la ricarica da fare con un tasto per registrarla.'}{' '}
                  Le ricariche future vengono considerate anche nelle previsioni del conto da cui ricarichi.
                </small>
              </>
            )}
          </fieldset>
        )}
        {initial && (
          <label className="check">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            Archiviato (non più in uso, resta nello storico)
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {initial && (
            <button
              type="button"
              className="btn danger-ghost"
              disabled={!canDelete}
              title={canDelete ? undefined : 'Un conto con movimenti, o l\'unico conto, non si può eliminare: puoi archiviarlo'}
              onClick={() => {
                if (confirm(`Eliminare “${initial.name}”?`)) {
                  onDelete(initial.id);
                  onClose();
                }
              }}
            >
              Elimina
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="btn primary">
            Salva
          </button>
        </div>
        {initial && !canDelete && <p className="small muted">Questo conto ha dei movimenti o è l'unico: puoi archiviarlo ma non eliminarlo.</p>}
      </form>
    </Modal>
  );
}

export function AccountsView({ store, payday }: { store: Store; payday: number }) {
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const { accounts, transactions } = store.data;
  const now = today();
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const total = totalBalance(store.data, now);
  const canDelete = (a: Account) => accounts.length > 1 && !transactions.some((t) => t.accountId === a.id || t.toAccountId === a.id);
  const fc = useForecast(store.data, payday);
  const month = monthOf(now);
  const monthEnd = forecast(store.data, now, `${month}-${String(daysInMonth(month)).padStart(2, '0')}`);

  const row = (a: Account) => {
    const balance = accountBalance(store.data, a, now);
    const count = transactions.filter((t) => isVisible(t) && (t.accountId === a.id || t.toAccountId === a.id)).length;
    const f = fc.accounts[a.id];
    const end = monthEnd.accounts[a.id]?.end ?? balance;
    return (
      <li key={a.id} className={a.archived ? 'inactive' : ''}>
        <button className="list-item" onClick={() => setEditing(a)}>
          <span className="badge account" aria-hidden>
            {ACCOUNT_TYPES[a.type].icon}
          </span>
          <span className="list-main">
            <span className="list-title with-icon">
              <span className="truncate">{a.name}</span>
              {f?.shortfall > 0 && <WarnIcon title={shortfallText(f.shortfall, f.shortDate)} />}
            </span>
            <span className="list-sub">
              {ACCOUNT_TYPES[a.type].label} · iniziale {euro(a.initialBalance)} · {count} {count === 1 ? 'movimento' : 'movimenti'}
            </span>
            {a.minBalance ? (
              <span className="list-sub">
                Budget {euro(a.minBalance)} · ricarica {a.autoTopUp ? 'automatica' : 'manuale'} da {accountName(accounts, a.topUpFrom)}
              </span>
            ) : null}
          </span>
          <span className="amount-col">
            <span className={`amount ${balance < 0 ? 'uscita' : ''}`}>{euro(balance)}</span>
            {Math.abs(end - balance) > 0.005 && <span className="list-sub">fine mese {euro(end)}</span>}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="view">
      <div className="view-head">
        <h2>Conti e carte</h2>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + Aggiungi
        </button>
      </div>

      <div className="card stat-card">
        <span className="muted small">Disponibilità totale oggi</span>
        <strong className={`big ${total < 0 ? 'amount uscita' : ''}`}>{euro(total)}</strong>
        <span className="muted small">
          Somma dei saldi di tutti i conti: saldo iniziale più i movimenti registrati. Tocca un conto per modificarne il saldo iniziale.
        </span>
      </div>

      <Alerts store={store} fc={fc} />

      <ul className="list card">{active.map(row)}</ul>

      {archived.length > 0 && (
        <section>
          <h3 className="group-title">Archiviati</h3>
          <ul className="list card">{archived.map(row)}</ul>
        </section>
      )}

      {editing && (
        <AccountForm
          accounts={accounts}
          initial={editing === 'new' ? undefined : editing}
          canDelete={editing !== 'new' && canDelete(editing)}
          onSave={store.saveAccount}
          onDelete={store.deleteAccount}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
