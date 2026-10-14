import { useMemo, useState, type FormEvent } from 'react';
import { CATEGORIES, euro, formatDate, monthOf, parseAmount, sum, today, transactionsIn, uid } from '../finance';
import type { Store } from '../store';
import type { Kind, Transaction } from '../types';
import { Empty, Field, Modal } from './ui';

export function TransactionForm({
  initial,
  defaultKind = 'uscita',
  defaultDate = today(),
  onSave,
  onDelete,
  onClose,
}: {
  initial?: Transaction;
  defaultKind?: Kind;
  defaultDate?: string;
  onSave: (t: Transaction) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>(initial?.kind ?? defaultKind);
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', ',') : '');
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[kind][0]);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');

  const switchKind = (k: Kind) => {
    setKind(k);
    if (!CATEGORIES[k].includes(category)) setCategory(CATEGORIES[k][0]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!(value > 0)) return setError("Inserisci un importo maggiore di zero");
    if (!date) return setError('Inserisci una data');
    onSave({ ...initial, id: initial?.id ?? uid(), kind, amount: value, date, category, description: description.trim() });
    onClose();
  };

  const categories = CATEGORIES[kind].includes(category) ? CATEGORIES[kind] : [category, ...CATEGORIES[kind]];

  return (
    <Modal title={initial ? 'Modifica movimento' : 'Nuovo movimento'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="segmented" role="radiogroup" aria-label="Tipo">
          {(['uscita', 'entrata'] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? `active ${k}` : ''}
              onClick={() => switchKind(k)}
            >
              {k === 'uscita' ? 'Uscita' : 'Entrata'}
            </button>
          ))}
        </div>
        <Field label="Importo (€)">
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              autoFocus
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </Field>
        <div className="row-2">
          <Field label="Data">{(id) => <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Categoria">
            {(id) => (
              <select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Descrizione">
          {(id) => (
            <input id={id} placeholder="Es. Spesa al supermercato" value={description} onChange={(e) => setDescription(e.target.value)} />
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

export function TransactionList({ txs, onEdit }: { txs: Transaction[]; onEdit: (t: Transaction) => void }) {
  const groups = useMemo(() => {
    const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<string, Transaction[]>();
    for (const t of sorted) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map];
  }, [txs]);

  return (
    <div className="tx-groups">
      {groups.map(([date, list]) => (
        <section key={date}>
          <h3 className="group-title">{formatDate(date)}</h3>
          <ul className="list card">
            {list.map((t) => (
              <li key={t.id}>
                <button className="list-item" onClick={() => onEdit(t)}>
                  <span className={`badge ${t.kind}`} aria-hidden>
                    {t.kind === 'entrata' ? '↓' : '↑'}
                  </span>
                  <span className="list-main">
                    <span className="list-title">{t.description || t.category}</span>
                    <span className="list-sub">
                      {t.category}
                      {t.recurringId && ' · mensile'}
                      {t.plannedId && ' · acquisto programmato'}
                    </span>
                  </span>
                  <span className={`amount ${t.kind}`}>
                    {t.kind === 'entrata' ? '+' : '−'}
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

type Filter = 'tutti' | Kind;

export function TransactionsView({ store, month }: { store: Store; month: string }) {
  const [filter, setFilter] = useState<Filter>('tutti');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);

  const monthTxs = transactionsIn(store.data.transactions, month);
  const categories = [...new Set(monthTxs.map((t) => t.category))].sort();
  const q = query.trim().toLowerCase();
  const visible = monthTxs.filter(
    (t) =>
      (filter === 'tutti' || t.kind === filter) &&
      (!category || t.category === category) &&
      (!q || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)),
  );
  const income = sum(visible.filter((t) => t.kind === 'entrata'));
  const expenses = sum(visible.filter((t) => t.kind === 'uscita'));

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
          {(['tutti', 'entrata', 'uscita'] as Filter[]).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'tutti' ? 'Tutti' : f === 'entrata' ? 'Entrate' : 'Uscite'}
            </button>
          ))}
        </div>
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
        </div>
      )}

      {visible.length === 0 ? (
        <Empty icon="🧾" title={monthTxs.length ? 'Nessun movimento corrisponde ai filtri' : 'Nessun movimento in questo mese'}>
          {!monthTxs.length && 'Aggiungi la tua prima entrata o uscita con il pulsante “Aggiungi”.'}
        </Empty>
      ) : (
        <TransactionList txs={visible} onEdit={setEditing} />
      )}

      {editing && (
        <TransactionForm
          initial={editing === 'new' ? undefined : editing}
          defaultKind={filter === 'entrata' ? 'entrata' : 'uscita'}
          defaultDate={defaultDate}
          onSave={store.saveTransaction}
          onDelete={store.deleteTransaction}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
