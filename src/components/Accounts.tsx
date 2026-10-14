import { useState, type FormEvent } from 'react';
import { ACCOUNT_TYPES, accountBalance, euro, parseAmount, today, totalBalance, uid, usableAccounts } from '../finance';
import type { Store } from '../store';
import type { Account, AccountType } from '../types';
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
  initial,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
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
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const balance = initialBalance.trim() ? parseAmount(initialBalance) : 0;
    if (!name.trim()) return setError('Inserisci un nome');
    if (Number.isNaN(balance)) return setError('Il saldo iniziale non è valido');
    onSave({ id: initial?.id ?? uid(), name: name.trim(), type, initialBalance: balance, archived });
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

export function AccountsView({ store }: { store: Store }) {
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const { accounts, transactions } = store.data;
  const now = today();
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const total = totalBalance(store.data, now);
  const canDelete = (a: Account) => accounts.length > 1 && !transactions.some((t) => t.accountId === a.id || t.toAccountId === a.id);

  const row = (a: Account) => {
    const balance = accountBalance(store.data, a, now);
    const count = transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length;
    return (
      <li key={a.id} className={a.archived ? 'inactive' : ''}>
        <button className="list-item" onClick={() => setEditing(a)}>
          <span className="badge account" aria-hidden>
            {ACCOUNT_TYPES[a.type].icon}
          </span>
          <span className="list-main">
            <span className="list-title">{a.name}</span>
            <span className="list-sub">
              {ACCOUNT_TYPES[a.type].label} · iniziale {euro(a.initialBalance)} · {count} {count === 1 ? 'movimento' : 'movimenti'}
            </span>
          </span>
          <span className={`amount ${balance < 0 ? 'uscita' : ''}`}>{euro(balance)}</span>
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

      <ul className="list card">{active.map(row)}</ul>

      {archived.length > 0 && (
        <section>
          <h3 className="group-title">Archiviati</h3>
          <ul className="list card">{archived.map(row)}</ul>
        </section>
      )}

      {editing && (
        <AccountForm
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
