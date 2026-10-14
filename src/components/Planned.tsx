import { useState, type FormEvent } from 'react';
import { CATEGORIES, euro, formatDate, parseAmount, plannedProgress, sortPlanned, sum, today, uid } from '../finance';
import type { Store } from '../store';
import type { Planned, Priority } from '../types';
import { Empty, Field, Modal, Progress } from './ui';

const PRIORITIES: Priority[] = ['alta', 'media', 'bassa'];
const toInput = (n: number) => (n ? String(n).replace('.', ',') : '');

function PlannedForm({
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  initial?: Planned;
  onSave: (p: Planned) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [cost, setCost] = useState(toInput(initial?.cost ?? 0));
  const [saved, setSaved] = useState(toInput(initial?.saved ?? 0));
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'media');
  const [category, setCategory] = useState(initial?.category ?? 'Altro');
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = parseAmount(cost);
    const s = saved.trim() ? parseAmount(saved) : 0;
    if (!name.trim()) return setError('Inserisci un nome');
    if (!(c > 0)) return setError('Inserisci un costo maggiore di zero');
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
    });
    onClose();
  };

  return (
    <Modal title={initial ? 'Modifica acquisto' : 'Nuovo acquisto in programma'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Cosa vuoi comprare">
          {(id) => <input id={id} autoFocus placeholder="Es. Nuovo portatile" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
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
        <Field label="Note">
          {(id) => <textarea id={id} rows={2} placeholder="Link, modello, negozio…" value={notes} onChange={(e) => setNotes(e.target.value)} />}
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

function SaveMoneyForm({ item, onSave, onClose }: { item: Planned; onSave: (p: Planned) => void; onClose: () => void }) {
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

function BuyForm({ item, onBuy, onClose }: { item: Planned; onBuy: (amount: number, date: string) => void; onClose: () => void }) {
  const [amount, setAmount] = useState(toInput(item.cost));
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = parseAmount(amount);
    if (!(v > 0)) return setError('Inserisci il prezzo pagato');
    if (!date) return setError('Inserisci la data');
    onBuy(v, date);
    onClose();
  };
  return (
    <Modal title={`Hai comprato “${item.name}”?`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <p className="muted">Verrà registrata un'uscita nella categoria {item.category}.</p>
        <div className="row-2">
          <Field label="Prezzo pagato (€)">
            {(id) => <input id={id} inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
          <Field label="Data">{(id) => <input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="btn primary">
            Conferma acquisto
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PlannedView({ store }: { store: Store }) {
  const [editing, setEditing] = useState<Planned | 'new' | null>(null);
  const [saving, setSaving] = useState<Planned | null>(null);
  const [buying, setBuying] = useState<Planned | null>(null);
  const [showDone, setShowDone] = useState(false);

  const todo = sortPlanned(store.data.planned.filter((p) => !p.boughtDate));
  const done = [...store.data.planned.filter((p) => p.boughtDate)].sort((a, b) => b.boughtDate!.localeCompare(a.boughtDate!));
  const totalCost = sum(todo.map((p) => ({ amount: p.cost })));
  const totalSaved = sum(todo.map((p) => ({ amount: Math.min(p.saved, p.cost) })));
  const perMonth = sum(todo.map((p) => ({ amount: plannedProgress(p).perMonth ?? 0 })));

  return (
    <div className="view">
      <div className="view-head">
        <h2>Acquisti in programma</h2>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + Aggiungi
        </button>
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

      {todo.length === 0 && done.length === 0 && (
        <Empty icon="🛍️" title="Nessun acquisto in programma">
          Annota le cose che vuoi comprare, quanto costano ed entro quando: l'app ti dice quanto mettere da parte ogni mese.
        </Empty>
      )}
      {todo.length === 0 && done.length > 0 && <Empty icon="🎉" title="Hai completato tutti gli acquisti in programma" />}

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
            {showDone ? '▾' : '▸'} Acquisti completati ({done.length})
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
                      <span className="list-sub">Acquistato il {formatDate(p.boughtDate!)}</span>
                    </span>
                    <button
                      className="btn ghost small"
                      onClick={() => {
                        if (confirm(`Riportare “${p.name}” tra gli acquisti da fare? L'uscita registrata verrà eliminata.`)) store.undoBought(p);
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
        <PlannedForm initial={editing === 'new' ? undefined : editing} onSave={store.savePlanned} onDelete={store.deletePlanned} onClose={() => setEditing(null)} />
      )}
      {saving && <SaveMoneyForm item={saving} onSave={store.savePlanned} onClose={() => setSaving(null)} />}
      {buying && <BuyForm item={buying} onBuy={(amount, date) => store.markBought(buying, amount, date)} onClose={() => setBuying(null)} />}
    </div>
  );
}
