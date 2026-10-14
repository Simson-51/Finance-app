import { useMemo, useState, type FormEvent } from 'react';
import { accountName, CATEGORIES, euro, formatDate, isFuture, isVisible, monthOf, parseAmount, sum, today, transactionsIn, uid, usableAccounts } from '../finance';
import type { Store } from '../store';
import type { Account, Kind, Transaction, TxKind } from '../types';
import { AccountSelect } from './Accounts';
import { Empty, Field, Modal } from './ui';

const KIND_LABEL: Record<TxKind, string> = { uscita: 'Uscita', entrata: 'Entrata', trasferimento: 'Trasferimento' };
const TRANSFER_CATEGORY = 'Trasferimento';

export function TransactionForm({
  accounts,
  initial,
  defaultKind = 'uscita',
  defaultDate = today(),
  defaultAccount,
  onSave,
  onDelete,
  onClose,
}: {
  accounts: Account[];
  initial?: Transaction;
  defaultKind?: Kind;
  defaultDate?: string;
  defaultAccount?: string;
  onSave: (t: Omit<Transaction, 'updatedAt'>) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const usable = usableAccounts(accounts, initial?.accountId);
  const firstAccount = (usable.find((a) => a.id === defaultAccount) ?? usable[0]).id;
  const [kind, setKind] = useState<TxKind>(initial?.kind ?? defaultKind);
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', ',') : '');
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [accountId, setAccountId] = useState(initial?.accountId ?? firstAccount);
  const [toAccountId, setToAccountId] = useState(
    initial?.toAccountId ?? usableAccounts(accounts).find((a) => a.id !== (initial?.accountId ?? firstAccount))?.id ?? '',
  );
  const [category, setCategory] = useState(initial?.kind === 'trasferimento' ? CATEGORIES.uscita[0] : (initial?.category ?? CATEGORIES.uscita[0]));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');

  const canTransfer = usableAccounts(accounts, initial?.toAccountId).length > 1;

  const switchKind = (k: TxKind) => {
    setKind(k);
    if (k !== 'trasferimento' && !CATEGORIES[k].includes(category)) setCategory(CATEGORIES[k][0]);
  };

  const changeFrom = (id: string) => {
    setAccountId(id);
    if (id === toAccountId) setToAccountId(usableAccounts(accounts).find((a) => a.id !== id)?.id ?? '');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!(value > 0)) return setError('Inserisci un importo maggiore di zero');
    if (!date) return setError('Inserisci una data');
    const transfer = kind === 'trasferimento';
    if (transfer && (!toAccountId || toAccountId === accountId)) return setError('Scegli due conti diversi');
    onSave({
      ...initial,
      id: initial?.id ?? uid(),
      kind,
      amount: value,
      date,
      accountId,
      toAccountId: transfer ? toAccountId : undefined,
      category: transfer ? TRANSFER_CATEGORY : category,
      description: description.trim(),
    });
    onClose();
  };

  const catKind: Kind = kind === 'entrata' ? 'entrata' : 'uscita';
  const categories = CATEGORIES[catKind].includes(category) ? CATEGORIES[catKind] : [category, ...CATEGORIES[catKind]];
  const kinds: TxKind[] = canTransfer || kind === 'trasferimento' ? ['uscita', 'entrata', 'trasferimento'] : ['uscita', 'entrata'];

  return (
    <Modal title={initial ? 'Modifica movimento' : 'Nuovo movimento'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="segmented" role="radiogroup" aria-label="Tipo">
          {kinds.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? `active ${k}` : ''} onClick={() => switchKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <Field label="Importo (€)">
          {(id) => <input id={id} inputMode="decimal" autoFocus placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        {kind === 'trasferimento' ? (
          <div className="row-2">
            <AccountSelect accounts={accounts} value={accountId} onChange={changeFrom} label="Dal conto" />
            <AccountSelect accounts={accounts} value={toAccountId} onChange={setToAccountId} label="Al conto" exclude={accountId} />
          </div>
        ) : (
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
        )}
        <div className="row-2">
          <Field label="Data">{(id) => <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          {kind !== 'trasferimento' && (
            <Field label="Categoria">
              {(id) => (
                <select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </div>
        {date > today() && (
          <p className="note">
            📅 <strong>Movimento previsto</strong>: non cambia il saldo di oggi ma conta nelle previsioni e negli avvisi. Dal{' '}
            {formatDate(date)} diventerà effettivo da solo.
          </p>
        )}
        {initial?.autoTopUp && (
          <p className="note">⇄ Ricarica automatica: l'importo viene ricalcolato dall'app per mantenere il budget minimo del conto.</p>
        )}
        <Field label="Descrizione">
          {(id) => (
            <input
              id={id}
              placeholder={kind === 'trasferimento' ? 'Es. Ricarica Satispay' : kind === 'entrata' ? 'Es. Welfare aziendale' : 'Es. Spesa al supermercato'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {initial && onDelete && (
            <button
              type="button"
              className="btn danger-ghost"
              onClick={() => {
                if (confirm('Eliminare questo movimento?')) {
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
      </form>
    </Modal>
  );
}

const BADGE: Record<TxKind, string> = { entrata: '↓', uscita: '↑', trasferimento: '⇄' };
const SIGN: Record<TxKind, string> = { entrata: '+', uscita: '−', trasferimento: '' };

export function TransactionList({
  txs,
  accounts,
  onEdit,
  ascending = false,
}: {
  txs: Transaction[];
  accounts: Account[];
  onEdit: (t: Transaction) => void;
  /** true per mostrare prima i più vicini (movimenti previsti). */
  ascending?: boolean;
}) {
  const now = today();
  const groups = useMemo(() => {
    const dir = ascending ? -1 : 1;
    const sorted = txs.filter(isVisible).sort((a, b) => dir * (b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt));
    const map = new Map<string, Transaction[]>();
    for (const t of sorted) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map];
  }, [txs, ascending]);
  const multi = accounts.length > 1;

  return (
    <div className="tx-groups">
      {groups.map(([date, list]) => (
        <section key={date}>
          <h3 className="group-title">{formatDate(date)}</h3>
          <ul className="list card">
            {list.map((t) => (
              <li key={t.id}>
                <button className={`list-item ${isFuture(t, now) ? 'future' : ''}`} onClick={() => onEdit(t)}>
                  <span className={`badge ${t.kind}`} aria-hidden>
                    {BADGE[t.kind]}
                  </span>
                  <span className="list-main">
                    <span className="list-title with-icon">
                      <span className="truncate">{t.description || t.category}</span>
                      {isFuture(t, now) && <span className="tag">Previsto</span>}
                    </span>
                    <span className="list-sub">
                      {t.kind === 'trasferimento'
                        ? `${accountName(accounts, t.accountId)} → ${accountName(accounts, t.toAccountId)}${t.autoTopUp ? ' · automatica' : ''}`
                        : [t.category, multi && accountName(accounts, t.accountId), t.recurringId && 'mensile', t.plannedId && 'acquisto programmato']
                            .filter(Boolean)
                            .join(' · ')}
                    </span>
                  </span>
                  <span className={`amount ${t.kind}`}>
                    {SIGN[t.kind]}
                    {euro(t.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Filter = 'tutti' | TxKind;

export function TransactionsView({ store, month }: { store: Store; month: string }) {
  const [filter, setFilter] = useState<Filter>('tutti');
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const { accounts } = store.data;

  const monthTxs = transactionsIn(store.data.transactions, month).filter(isVisible);
  const categories = [...new Set(monthTxs.filter((t) => t.kind !== 'trasferimento').map((t) => t.category))].sort();
  const q = query.trim().toLowerCase();
  const visible = monthTxs.filter(
    (t) =>
      (filter === 'tutti' || t.kind === filter) &&
      (!category || t.category === category) &&
      (!account || t.accountId === account || t.toAccountId === account) &&
      (!q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)),
  );
  const now = today();
  const done = visible.filter((t) => !isFuture(t, now));
  const planned = visible.filter((t) => isFuture(t, now));
  const income = sum(done.filter((t) => t.kind === 'entrata'));
  const expenses = sum(done.filter((t) => t.kind === 'uscita'));
  const plannedIn = sum(planned.filter((t) => t.kind === 'entrata'));
  const plannedOut = sum(planned.filter((t) => t.kind === 'uscita'));
  const hasTransfers = accounts.length > 1 || monthTxs.some((t) => t.kind === 'trasferimento');
  const filters: Filter[] = hasTransfers ? ['tutti', 'entrata', 'uscita', 'trasferimento'] : ['tutti', 'entrata', 'uscita'];

  // Nuovi movimenti: data di oggi se si sta guardando il mese corrente, altrimenti il primo del mese.
  const defaultDate = monthOf(today()) === month ? today() : `${month}-01`;

  return (
    <div className="view">
      <div className="view-head">
        <h2>Movimenti</h2>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + Aggiungi
        </button>
      </div>

      <div className="filters">
        <div className="segmented small" role="radiogroup" aria-label="Filtro tipo">
          {filters.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'tutti' ? 'Tutti' : f === 'entrata' ? 'Entrate' : f === 'uscita' ? 'Uscite' : 'Trasf.'}
            </button>
          ))}
        </div>
        {accounts.length > 1 && (
          <select aria-label="Conto" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Tutti i conti</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input type="search" placeholder="Cerca…" aria-label="Cerca" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {visible.length > 0 && (
        <div className="totals-strip">
          <span>
            Entrate <strong className="amount entrata">{euro(income)}</strong>
          </span>
          <span>
            Uscite <strong className="amount uscita">{euro(expenses)}</strong>
          </span>
          <span>
            Saldo <strong>{euro(income - expenses)}</strong>
          </span>
          {(plannedIn > 0 || plannedOut > 0) && (
            <span className="planned-strip">
              Previsti: {plannedIn > 0 && <strong className="amount entrata">+{euro(plannedIn)}</strong>}{' '}
              {plannedOut > 0 && <strong className="amount uscita">−{euro(plannedOut)}</strong>}
            </span>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <Empty icon="🧾" title={monthTxs.length ? 'Nessun movimento corrisponde ai filtri' : 'Nessun movimento in questo mese'}>
          {!monthTxs.length && 'Aggiungi la tua prima entrata o uscita con il pulsante “Aggiungi”.'}
        </Empty>
      ) : (
        <>
          {planned.length > 0 && (
            <section>
              <h3 className="group-title">Previsti</h3>
              <TransactionList txs={planned} accounts={accounts} onEdit={setEditing} ascending />
            </section>
          )}
          {done.length > 0 && <TransactionList txs={done} accounts={accounts} onEdit={setEditing} />}
        </>
      )}

      {editing && (
        <TransactionForm
          accounts={accounts}
          initial={editing === 'new' ? undefined : editing}
          defaultKind={filter === 'entrata' ? 'entrata' : 'uscita'}
          defaultDate={defaultDate}
          defaultAccount={account || undefined}
          onSave={store.saveTransaction}
          onDelete={store.deleteTransaction}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
