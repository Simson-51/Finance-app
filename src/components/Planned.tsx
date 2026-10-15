import { useState, type FormEvent } from 'react';
import { ACCOUNT_TYPES, accountName, CATEGORIES, commitments, euro, formatDate, parseAmount, plannedProgress, sortPlanned, sum, today, uid, usableAccounts } from '../finance';
import type { Store } from '../store';
import type { Account, Planned, Priority } from '../types';
import { AccountSelect } from './Accounts';
import { Empty, Field, Modal, Progress } from './ui';

const PRIORITIES: Priority[] = ['alta', 'media', 'bassa'];
const toInput = (n: number) => (n ? String(n).replace('.', ',') : '');

function PlannedForm({
  accounts,
  initial,
  defaultCommitted = false,
  onSave,
  onDelete,
  onClose,
}: {
  accounts: Account[];
  initial?: Planned;
  defaultCommitted?: boolean;
  onSave: (p: Omit<Planned, 'updatedAt'>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [committed, setCommitted] = useState(initial?.committed ?? defaultCommitted);
  const [name, setName] = useState(initial?.name ?? '');
  const [cost, setCost] = useState(toInput(initial?.cost ?? 0));
  const [saved, setSaved] = useState(toInput(initial?.saved ?? 0));
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'media');
  const [category, setCategory] = useState(initial?.category ?? 'Altro');
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '');
  const [accountId, setAccountId] = useState(initial?.accountId ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState('');
  const usable = usableAccounts(accounts, initial?.accountId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = parseAmount(cost);
    const s = !committed && saved.trim() ? parseAmount(saved) : 0;
    if (!name.trim()) return setError('Inserisci un nome');
    if (!(c > 0)) return setError(committed ? "Inserisci l'importo" : 'Inserisci un costo maggiore di zero');
    if (!(s >= 0)) return setError('La cifra messa da parte non è valida');
    onSave({
      ...initial,
      id: initial?.id ?? uid(),
      name: name.trim(),
      cost: c,
      saved: s,
      priority,
      category,
      targetDate: targetDate || undefined,
      notes: notes.trim(),
      committed: committed || undefined,
      accountId: committed && accountId ? accountId : undefined,
    });
    onClose();
  };

  return (
    <Modal title={initial ? (committed ? 'Modifica spesa sicura' : 'Modifica acquisto') : committed ? 'Nuova spesa sicura' : 'Nuovo acquisto in programma'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="segmented" role="radiogroup" aria-label="Tipo">
          <button type="button" role="radio" aria-checked={!committed} className={!committed ? 'active' : ''} onClick={() => setCommitted(false)}>
            Da comprare
          </button>
          <button type="button" role="radio" aria-checked={committed} className={committed ? 'active' : ''} onClick={() => setCommitted(true)}>
            Spesa sicura
          </button>
        </div>
        <p className="small muted form-help">
          {committed
            ? "Un debito o un acquisto già fatto ma non ancora addebitato: conta negli impegni, nel disponibile libero e negli avvisi."
            : 'Qualcosa che vorresti comprare: puoi mettere da parte i soldi un po’ alla volta.'}
        </p>
        <Field label={committed ? 'Descrizione' : 'Cosa vuoi comprare'}>
          {(id) => (
            <input
              id={id}
              autoFocus
              placeholder={committed ? 'Es. Debito con i miei, Switch 2 (Amazon)' : 'Es. Nuovo portatile'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        {committed ? (
          <>
            <div className="row-2">
              <Field label="Importo (€)">
                {(id) => <input id={id} inputMode="decimal" placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)} />}
              </Field>
              <Field label="Pagherò con">
                {(id) => (
                  <select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">Non ancora deciso</option>
                    {usable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {ACCOUNT_TYPES[a.type].icon} {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <div className="row-2">
              <Field label="Data prevista" hint="Lasciala vuota se non la sai: conterà come da pagare da subito.">
                {(id) => <input id={id} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />}
              </Field>
              <Field label="Categoria">
                {(id) => (
                  <select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.uscita.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="row-2">
              <Field label="Costo previsto (€)">
                {(id) => <input id={id} inputMode="decimal" placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)} />}
              </Field>
              <Field label="Già messo da parte (€)">
                {(id) => <input id={id} inputMode="decimal" placeholder="0,00" value={saved} onChange={(e) => setSaved(e.target.value)} />}
              </Field>
            </div>
            <div className="row-2">
              <Field label="Entro il" hint="Facoltativa: calcola quanto risparmiare al mese">
                {(id) => <input id={id} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />}
              </Field>
              <Field label="Categoria">
                {(id) => (
                  <select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.uscita.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <div className="field">
              <span className="label">Priorità</span>
              <div className="segmented" role="radiogroup" aria-label="Priorità">
                {PRIORITIES.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={priority === p} className={priority === p ? `active prio-${p}` : ''} onClick={() => setPriority(p)}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <Field label="Note">
          {(id) => (
            <textarea
              id={id}
              rows={2}
              placeholder={committed ? 'Es. da restituire entro Natale' : 'Link, modello, negozio…'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {initial && (
            <button
              type="button"
              className="btn danger-ghost"
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
      </form>
    </Modal>
  );
}

function SaveMoneyForm({ item, onSave, onClose }: { item: Planned; onSave: (p: Omit<Planned, 'updatedAt'>) => void; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = parseAmount(amount);
    if (!v || Number.isNaN(v)) return setError('Inserisci un importo');
    const next = Math.max(0, Math.round((item.saved + v) * 100) / 100);
    onSave({ ...item, saved: next });
    onClose();
  };
  return (
    <Modal title={`Metti da parte per “${item.name}”`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Importo (€)" hint={`Ora: ${euro(item.saved)} su ${euro(item.cost)}. Usa un numero negativo per togliere.`}>
          {(id) => <input id={id} inputMode="decimal" autoFocus placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="btn primary">
            Aggiungi
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BuyForm({
  item,
  accounts,
  onBuy,
  onClose,
}: {
  item: Planned;
  accounts: Account[];
  onBuy: (amount: number, accountId: string, date: string) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(toInput(item.cost));
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.id === item.accountId && !a.archived)?.id ?? (accounts.find((a) => !a.archived) ?? accounts[0]).id,
  );
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = parseAmount(amount);
    if (!(v > 0)) return setError('Inserisci il prezzo pagato');
    if (!date) return setError('Inserisci la data');
    onBuy(v, accountId, date);
    onClose();
  };
  return (
    <Modal title={item.committed ? `Hai pagato “${item.name}”?` : `Hai comprato “${item.name}”?`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <p className="muted">Verrà registrata un'uscita nella categoria {item.category}.</p>
        <div className="row-2">
          <Field label={item.committed ? 'Importo pagato (€)' : 'Prezzo pagato (€)'}>
            {(id) => <input id={id} inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
          <Field label="Data">{(id) => <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} label="Pagato con" />
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="btn primary">
            {item.committed ? 'Conferma pagamento' : 'Conferma acquisto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PlannedView({ store }: { store: Store }) {
  const [editing, setEditing] = useState<Planned | 'new' | 'new-committed' | null>(null);
  const [saving, setSaving] = useState<Planned | null>(null);
  const [buying, setBuying] = useState<Planned | null>(null);
  const [showDone, setShowDone] = useState(false);

  const open = store.data.planned.filter((p) => !p.boughtDate);
  const todo = sortPlanned(open.filter((p) => !p.committed));
  const sure = [...open.filter((p) => p.committed)].sort((a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? '') || a.name.localeCompare(b.name));
  const c = commitments(store.data);
  const done = [...store.data.planned.filter((p) => p.boughtDate)].sort((a, b) => b.boughtDate!.localeCompare(a.boughtDate!));
  const totalCost = sum(todo.map((p) => ({ amount: p.cost })));
  const totalSaved = sum(todo.map((p) => ({ amount: Math.min(p.saved, p.cost) })));
  const perMonth = sum(todo.map((p) => ({ amount: plannedProgress(p).perMonth ?? 0 })));

  return (
    <div className="view">
      <div className="view-head">
        <h2>Acquisti e spese sicure</h2>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + Aggiungi
        </button>
      </div>

      <section className="sure-section">
        <div className="card-head">
          <h3>Spese sicure</h3>
          <button className="link" onClick={() => setEditing('new-committed')}>
            + Spesa sicura
          </button>
        </div>
        {sure.length === 0 ? (
          <p className="muted small">
            Debiti o acquisti già fatti ma non ancora addebitati (es. un prestito da restituire, un ordine Amazon). Contano nel disponibile
            libero e negli avvisi.
          </p>
        ) : (
          <>
            <div className="card stat-card">
              <div className="stat-row">
                <div>
                  <span className="muted">Impegnati</span>
                  <strong className="big amount uscita">{euro(c.total)}</strong>
                </div>
                {c.unassignedTotal > 0 && (
                  <div className="right">
                    <span className="muted">Senza conto deciso</span>
                    <strong className="big">{euro(c.unassignedTotal)}</strong>
                  </div>
                )}
              </div>
            </div>
            <ul className="list card">
              {sure.map((p) => (
                <li key={p.id}>
                  <div className="list-item">
                    <span className="badge uscita" aria-hidden>
                      ⏳
                    </span>
                    <button className="list-main as-button" onClick={() => setEditing(p)}>
                      <span className="list-title">{p.name}</span>
                      <span className="list-sub">
                        {p.accountId ? accountName(store.data.accounts, p.accountId) : 'Conto da decidere'} ·{' '}
                        {p.targetDate ? (p.targetDate < today() ? `previsto il ${formatDate(p.targetDate)} (passato)` : `il ${formatDate(p.targetDate)}`) : 'data non nota'}
                      </span>
                    </button>
                    <span className="amount-col">
                      <span className="amount uscita">{euro(p.cost)}</span>
                      <button className="btn ghost small" onClick={() => setBuying(p)}>
                        ✓ Pagato
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="card-head wishes-head">
        <h3>Da comprare</h3>
      </div>

      {todo.length > 0 && (
        <div className="card stat-card">
          <div className="stat-row">
            <div>
              <span className="muted">Totale da spendere</span>
              <strong className="big">{euro(totalCost)}</strong>
            </div>
            <div className="right">
              <span className="muted">Già da parte</span>
              <strong className="big amount entrata">{euro(totalSaved)}</strong>
            </div>
          </div>
          <Progress value={totalCost ? (totalSaved / totalCost) * 100 : 0} tone="income" />
          {perMonth > 0 && (
            <span className="muted small">
              Per rispettare le scadenze metti da parte circa <strong>{euro(perMonth)}</strong> al mese
            </span>
          )}
        </div>
      )}

      {todo.length === 0 && (
        <Empty icon="🛍️" title="Nessun acquisto in programma">
          Annota le cose che vuoi comprare, quanto costano ed entro quando: l'app ti dice quanto mettere da parte ogni mese.
        </Empty>
      )}

      <div className="cards">
        {todo.map((p) => {
          const pr = plannedProgress(p);
          const overdue = p.targetDate && p.targetDate < today();
          return (
            <article key={p.id} className="card planned">
              <button className="planned-head as-button" onClick={() => setEditing(p)}>
                <span className={`prio prio-${p.priority}`}>{p.priority}</span>
                <span className="list-title">{p.name}</span>
                <span className="amount">{euro(p.cost)}</span>
              </button>
              <Progress value={pr.percent} tone="income" />
              <div className="planned-meta">
                <span>
                  {euro(p.saved)} da parte · {pr.percent}%
                </span>
                {p.targetDate && (
                  <span className={overdue ? 'error' : ''}>
                    {overdue ? 'Scaduto il ' : 'Entro il '}
                    {formatDate(p.targetDate)}
                  </span>
                )}
              </div>
              {pr.remaining > 0 && pr.perMonth !== null && (
                <p className="small muted">
                  Mancano {euro(pr.remaining)} → circa <strong>{euro(pr.perMonth)}</strong> al mese
                </p>
              )}
              {p.notes && <p className="small notes">{p.notes}</p>}
              <div className="planned-actions">
                <button className="btn ghost small" onClick={() => setSaving(p)}>
                  + Metti da parte
                </button>
                <button className="btn primary small" onClick={() => setBuying(p)}>
                  ✓ Acquistato
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {done.length > 0 && (
        <section>
          <button className="link" onClick={() => setShowDone((v) => !v)}>
            {showDone ? '▾' : '▸'} Completati ({done.length})
          </button>
          {showDone && (
            <ul className="list card">
              {done.map((p) => (
                <li key={p.id}>
                  <div className="list-item">
                    <span className="badge done" aria-hidden>
                      ✓
                    </span>
                    <span className="list-main">
                      <span className="list-title">{p.name}</span>
                      <span className="list-sub">
                        {p.committed ? 'Pagato' : 'Acquistato'} il {formatDate(p.boughtDate!)}
                      </span>
                    </span>
                    <button
                      className="btn ghost small"
                      onClick={() => {
                        if (confirm(`Riportare “${p.name}” tra le spese da fare? L'uscita registrata verrà eliminata.`)) store.undoBought(p);
                      }}
                    >
                      Annulla
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && (
        <PlannedForm
          accounts={store.data.accounts}
          initial={typeof editing === 'string' ? undefined : editing}
          defaultCommitted={editing === 'new-committed'}
          onSave={store.savePlanned}
          onDelete={store.deletePlanned}
          onClose={() => setEditing(null)}
        />
      )}
      {saving && <SaveMoneyForm item={saving} onSave={store.savePlanned} onClose={() => setSaving(null)} />}
      {buying && (
        <BuyForm
          item={buying}
          accounts={store.data.accounts}
          onBuy={(amount, accountId, date) => store.markBought(buying, amount, accountId, date)}
          onClose={() => setBuying(null)}
        />
      )}
    </div>
  );
}
