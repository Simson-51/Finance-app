import { useState, type FormEvent } from 'react';
import { addMonths, CATEGORIES, defaultStartMonth, endMonthFor, FREQUENCIES, installmentNumber, installmentsTotal, nextDueMonth, recurringEvery, euro, formatMonth, monthOf, parseAmount, recurringDate, recurringDue, recurringPayment, recurringStart, sum, formatDate, today, uid } from '../finance';
import type { Store } from '../store';
import type { Account, Kind, Recurring } from '../types';
import { AccountSelect } from './Accounts';
import { Empty, Field, Modal, Progress } from './ui';

function RecurringForm({
  accounts,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  accounts: Account[];
  initial?: Recurring;
  onSave: (r: Omit<Recurring, 'updatedAt'>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'uscita');
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', ',') : '');
  const [category, setCategory] = useState(initial?.category ?? 'Bollette');
  const [day, setDay] = useState(String(initial?.day ?? 1));
  const [active, setActive] = useState(initial?.active ?? true);
  // per una voce nuova il primo mese segue il giorno scelto, finché non lo si cambia a mano
  const [startMonth, setStartMonth] = useState(initial ? recurringStart(initial) : defaultStartMonth(1));
  const [startTouched, setStartTouched] = useState(!!initial);
  const [every, setEvery] = useState(initial ? recurringEvery(initial) : 1);
  const [limited, setLimited] = useState(!!initial?.endMonth);
  const [count, setCount] = useState(String((initial && installmentsTotal(initial)) ?? 12));
  const [autoPay, setAutoPay] = useState(initial?.autoPay ?? !initial);
  const current = monthOf(today());
  const months = Array.from({ length: 15 }, (_, i) => addMonths(current, i - 2));
  if (!months.includes(startMonth)) months.unshift(startMonth);
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.id === initial?.accountId)?.id ?? accounts.find((a) => !a.archived)?.id ?? accounts[0].id,
  );
  const [error, setError] = useState('');

  const switchKind = (k: Kind) => {
    setKind(k);
    if (!CATEGORIES[k].includes(category)) setCategory(CATEGORIES[k][0]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = parseAmount(amount);
    const d = Number(day);
    if (!name.trim()) return setError('Inserisci un nome');
    if (!(value > 0)) return setError('Inserisci un importo maggiore di zero');
    if (!Number.isInteger(d) || d < 1 || d > 31) return setError('Il giorno deve essere tra 1 e 31');
    const n = Number(count);
    if (limited && (!Number.isInteger(n) || n < 1 || n > 360)) return setError('Il numero di rate deve essere tra 1 e 360');
    onSave({
      id: initial?.id ?? uid(),
      kind,
      name: name.trim(),
      amount: value,
      category,
      day: d,
      active,
      accountId,
      startMonth,
      everyMonths: every,
      endMonth: limited ? endMonthFor(startMonth, every, n) : undefined,
      autoPay,
    });
    onClose();
  };

  return (
    <Modal title={initial ? 'Modifica voce mensile' : 'Nuova voce mensile'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="segmented" role="radiogroup" aria-label="Tipo">
          {(['uscita', 'entrata'] as Kind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? `active ${k}` : ''} onClick={() => switchKind(k)}>
              {k === 'uscita' ? 'Spesa' : 'Entrata'}
            </button>
          ))}
        </div>
        <Field label="Nome">
          {(id) => <input id={id} autoFocus placeholder={kind === 'uscita' ? 'Es. Affitto, Netflix, Luce' : 'Es. Stipendio'} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="row-2">
          <Field label="Importo mensile (€)">
            {(id) => <input id={id} inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
          <Field label="Giorno del mese">
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                max={31}
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  const d = Number(e.target.value);
                  if (!startTouched && d >= 1 && d <= 31) setStartMonth(defaultStartMonth(d));
                }}
              />
            )}
          </Field>
        </div>
        <Field
          label="Primo addebito"
          hint={`I mesi precedenti non vengono contati. Primo ${kind === 'uscita' ? 'pagamento' : 'incasso'}: ${
            Number(day) >= 1 && Number(day) <= 31 ? formatDate(recurringDate({ day: Number(day) } as Recurring, startMonth)) : '—'
          }.`}
        >
          {(id) => (
            <select
              id={id}
              value={startMonth}
              onChange={(e) => {
                setStartMonth(e.target.value);
                setStartTouched(true);
              }}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="row-2">
          <Field label="Frequenza">
            {(id) => (
              <select id={id} value={every} onChange={(e) => setEvery(Number(e.target.value))}>
                {FREQUENCIES.map((f) => (
                  <option key={f.months} value={f.months}>
                    {f.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Termina">
            {(id) => (
              <select id={id} value={limited ? 'rate' : 'mai'} onChange={(e) => setLimited(e.target.value === 'rate')}>
                <option value="mai">Mai</option>
                <option value="rate">Dopo un numero di rate</option>
              </select>
            )}
          </Field>
        </div>
        {limited && (
          <Field
            label="Numero di rate"
            hint={
              Number(count) >= 1
                ? `Ultima rata: ${formatDate(recurringDate({ day: Number(day) || 1 } as Recurring, endMonthFor(startMonth, every, Number(count))))}.`
                : undefined
            }
          >
            {(id) => <input id={id} type="number" min={1} max={360} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />}
          </Field>
        )}
        <Field label="Categoria">
          {(id) => (
            <select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES[kind].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
        </Field>
        <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} label={kind === 'uscita' ? 'Pagata con' : 'Accreditata su'} />
        <label className="check">
          <input type="checkbox" checked={autoPay} onChange={(e) => setAutoPay(e.target.checked)} />
          Registra in automatico alla scadenza
        </label>
        <small className="muted check-hint">
          {autoPay
            ? `Il giorno dell'addebito l'app la segna da sola come ${kind === 'uscita' ? 'pagata' : 'incassata'}. Se non è avvenuto, togli la spunta in Mensili.`
            : `Ogni mese la segni tu come ${kind === 'uscita' ? 'pagata' : 'incassata'} con un tocco.`}
        </small>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Attiva
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {initial && (
            <button
              type="button"
              className="btn danger-ghost"
              onClick={() => {
                if (confirm(`Eliminare “${initial.name}”? I movimenti già registrati resteranno.`)) {
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

export function RecurringView({ store, month }: { store: Store; month: string }) {
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const { recurring, transactions } = store.data;
  const sorted = [...recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.day - b.day || a.name.localeCompare(b.name));
  const activeExpenses = recurring.filter((r) => recurringDue(r, month) && r.kind === 'uscita');
  const activeIncome = recurring.filter((r) => recurringDue(r, month) && r.kind === 'entrata');
  const paid = activeExpenses.filter((r) => recurringPayment(transactions, r, month));
  const totalExpenses = sum(activeExpenses);
  const paidAmount = sum(paid);

  const section = (kind: Kind) => {
    const list = sorted.filter((r) => r.kind === kind);
    if (!list.length) return null;
    return (
      <section>
        <h3 className="group-title">{kind === 'uscita' ? 'Spese fisse' : 'Entrate fisse'}</h3>
        <ul className="list card">
          {list.map((r) => {
            const payment = recurringPayment(transactions, r, month);
            const due = recurringDue(r, month);
            const total = installmentsTotal(r);
            const every = recurringEvery(r);
            /** Quando non è dovuta in questo mese: da quando, la prossima volta o se è finita. */
            const whenNext = () => {
              const next = nextDueMonth(r, month);
              if (!next) return r.endMonth && month > r.endMonth ? 'rate terminate' : 'nessun addebito in programma';
              const label = formatMonth(next).toLowerCase();
              return month < recurringStart(r) ? `inizia a ${label}` : `prossima a ${label}`;
            };
            const details = [
              every > 1 && FREQUENCIES.find((f) => f.months === every)?.label.toLowerCase(),
              due && total && `rata ${installmentNumber(r, month)} di ${total}`,
              r.autoPay && r.active && 'automatica',
            ].filter(Boolean);
            return (
              <li key={r.id} className={due ? '' : 'inactive'}>
                <div className="list-item">
                  <button
                    className={`tick ${payment ? 'done' : ''}`}
                    disabled={!due && !payment}
                    aria-label={payment ? `Annulla registrazione di ${r.name}` : `Segna ${r.name} come ${kind === 'uscita' ? 'pagata' : 'incassata'}`}
                    title={payment ? 'Registrata questo mese (clicca per annullare)' : kind === 'uscita' ? 'Segna come pagata' : 'Segna come incassata'}
                    onClick={() => store.toggleRecurringPaid(r, month)}
                  >
                    {payment ? '✓' : ''}
                  </button>
                  <button className="list-main as-button" onClick={() => setEditing(r)}>
                    <span className="list-title">{r.name}</span>
                    <span className="list-sub">
                      {r.category} ·{' '}
                      {!r.active ? 'disattivata' : due ? `il ${formatDate(recurringDate(r, month)).replace(/ \d{4}$/, '')}` : whenNext()}
                      {payment && (kind === 'uscita' ? ' · pagata' : ' · incassata')}
                      {details.length > 0 && ` · ${details.join(' · ')}`}
                    </span>
                  </button>
                  <span className={`amount ${r.kind}`}>{euro(r.amount)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <div className="view">
      <div className="view-head">
        <h2>Spese mensili</h2>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + Aggiungi
        </button>
      </div>

      {recurring.length === 0 ? (
        <Empty icon="📅" title="Nessuna voce mensile">
          Aggiungi affitto, bollette, abbonamenti o lo stipendio: ogni mese potrai segnarli come pagati con un tocco e verranno registrati tra i movimenti.
        </Empty>
      ) : (
        <>
          <div className="card stat-card">
            <div className="stat-row">
              <div>
                <span className="muted">Spese fisse al mese</span>
                <strong className="big">{euro(totalExpenses)}</strong>
              </div>
              {activeIncome.length > 0 && (
                <div className="right">
                  <span className="muted">Entrate fisse</span>
                  <strong className="big amount entrata">{euro(sum(activeIncome))}</strong>
                </div>
              )}
            </div>
            {activeExpenses.length > 0 && (
              <>
                <Progress value={totalExpenses ? (paidAmount / totalExpenses) * 100 : 0} />
                <span className="muted small">
                  Pagate {paid.length} su {activeExpenses.length} · restano {euro(totalExpenses - paidAmount)} da pagare questo mese
                </span>
              </>
            )}
          </div>
          {recurring.some((r) => r.active && !r.autoPay) && (
            <div className="note autopay-note">
              <span>
                ⚡ Vuoi che le voci vengano segnate come pagate/incassate da sole il giorno dell'addebito?
              </span>
              <button
                className="btn primary small"
                onClick={() => recurring.filter((r) => r.active && !r.autoPay).forEach((r) => store.saveRecurring({ ...r, autoPay: true }))}
              >
                Attiva per tutte
              </button>
            </div>
          )}
          {section('uscita')}
          {section('entrata')}
        </>
      )}

      {editing && (
        <RecurringForm
          accounts={store.data.accounts}
          initial={editing === 'new' ? undefined : editing}
          onSave={store.saveRecurring}
          onDelete={store.deleteRecurring}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
