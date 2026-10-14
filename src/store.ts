import { useCallback, useEffect, useState } from 'react';
import { emptyData, ensureAccount, merge, normalize, reconcileTopUps, recurringDate, recurringPayment, sameData, today, uid } from './finance';
import type { Account, Collection, Data, Planned, Recurring, Transaction } from './types';

const KEY = 'finanze:data';

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyData();
  } catch {
    return emptyData();
  }
}

type Item<C extends Collection> = Data[C][number];
/** Un record senza `updatedAt`: viene impostato dallo store al salvataggio. */
type Draft<T> = Omit<T, 'updatedAt'>;

const now = () => Date.now();

function upsertIn<C extends Collection>(d: Data, key: C, item: Draft<Item<C>>): Data {
  const stamped = { ...item, updatedAt: now() } as Item<C>;
  const list = d[key] as Item<C>[];
  const exists = list.some((x) => x.id === item.id);
  return { ...d, [key]: exists ? list.map((x) => (x.id === item.id ? stamped : x)) : [...list, stamped] };
}

function removeFrom(d: Data, key: Collection, ids: string[]): Data {
  if (!ids.length) return d;
  const at = now();
  const deleted = { ...d.deleted };
  for (const id of ids) deleted[id] = at;
  return { ...d, [key]: (d[key] as { id: string }[]).filter((x) => !ids.includes(x.id)), deleted };
}

/** Modifica i movimenti che soddisfano `match`, aggiornandone la data di modifica. */
function patchTransactions(d: Data, match: (t: Transaction) => boolean, patch: (t: Transaction) => Transaction): Data {
  const at = now();
  return { ...d, transactions: d.transactions.map((t) => (match(t) ? { ...patch(t), updatedAt: at } : t)) };
}

/** Stato dell'app, salvato automaticamente nel browser (localStorage). */
export function useStore() {
  const [data, setData] = useState<Data>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // spazio esaurito o storage bloccato: i dati restano in memoria finché la pagina è aperta
    }
  }, [data]);

  // Registra le ricariche automatiche dei conti con budget minimo: dopo ogni modifica e
  // quando l'app torna in primo piano (potrebbe essere cambiato il giorno).
  const [day, setDay] = useState(today);
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setDay(today());
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  useEffect(() => {
    setData((cur) => reconcileTopUps(cur, day));
  }, [data, day]);

  // Mantiene sincronizzate più schede aperte contemporaneamente.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setData((cur) => merge(cur, load()));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((fn: (d: Data) => Data) => setData((d) => ensureAccount(fn(d))), []);

  return {
    data,

    saveAccount: useCallback((a: Draft<Account>) => update((d) => upsertIn(d, 'accounts', a)), [update]),
    /** Elimina un conto senza movimenti (quelli con movimenti si archiviano). */
    deleteAccount: useCallback(
      (id: string) =>
        update((d) => {
          if (d.accounts.length <= 1 || d.transactions.some((t) => t.accountId === id || t.toAccountId === id)) return d;
          const next = removeFrom(d, 'accounts', [id]);
          const at = now();
          return { ...next, recurring: next.recurring.map((r) => (r.accountId === id ? { ...r, accountId: undefined, updatedAt: at } : r)) };
        }),
      [update],
    ),

    saveTransaction: useCallback((t: Draft<Transaction>) => update((d) => upsertIn(d, 'transactions', t)), [update]),
    deleteTransaction: useCallback((id: string) => update((d) => removeFrom(d, 'transactions', [id])), [update]),

    saveRecurring: useCallback((r: Draft<Recurring>) => update((d) => upsertIn(d, 'recurring', r)), [update]),
    deleteRecurring: useCallback(
      // I movimenti già registrati restano, ma non sono più collegati alla voce eliminata.
      (id: string) =>
        update((d) =>
          patchTransactions(removeFrom(d, 'recurring', [id]), (t) => t.recurringId === id, (t) => ({ ...t, recurringId: undefined })),
        ),
      [update],
    ),
    /** Segna la voce mensile come pagata/incassata nel mese, creando il movimento; se già presente lo annulla. */
    toggleRecurringPaid: useCallback(
      (r: Recurring, month: string) =>
        update((d) => {
          const existing = recurringPayment(d.transactions, r, month);
          if (existing) return removeFrom(d, 'transactions', [existing.id]);
          const account = d.accounts.find((a) => a.id === r.accountId && !a.archived) ?? d.accounts.find((a) => !a.archived) ?? d.accounts[0];
          return upsertIn(d, 'transactions', {
            id: uid(),
            kind: r.kind,
            amount: r.amount,
            date: recurringDate(r, month),
            category: r.category,
            description: r.name,
            accountId: account.id,
            recurringId: r.id,
          });
        }),
      [update],
    ),

    savePlanned: useCallback((p: Draft<Planned>) => update((d) => upsertIn(d, 'planned', p)), [update]),
    deletePlanned: useCallback(
      (id: string) =>
        update((d) =>
          patchTransactions(removeFrom(d, 'planned', [id]), (t) => t.plannedId === id, (t) => ({ ...t, plannedId: undefined })),
        ),
      [update],
    ),
    /** Segna l'acquisto come fatto e registra la relativa uscita. */
    markBought: useCallback(
      (p: Planned, amount: number, accountId: string, date = today()) =>
        update((d) => {
          const next = upsertIn(d, 'planned', { ...p, boughtDate: date, saved: amount });
          return upsertIn(next, 'transactions', {
            id: uid(),
            kind: 'uscita',
            amount,
            date,
            category: p.category,
            description: p.name,
            accountId,
            plannedId: p.id,
          });
        }),
      [update],
    ),
    /** Riporta l'acquisto tra quelli da fare ed elimina l'uscita collegata. */
    undoBought: useCallback(
      (p: Planned) =>
        update((d) => {
          const next = upsertIn(d, 'planned', { ...p, boughtDate: undefined });
          return removeFrom(next, 'transactions', next.transactions.filter((t) => t.plannedId === p.id).map((t) => t.id));
        }),
      [update],
    ),

    /**
     * Sostituisce tutti i dati (import di un backup o azzeramento). Tutto ciò che non è nei
     * nuovi dati viene segnato come eliminato e i nuovi record diventano i più recenti,
     * così la sostituzione si propaga anche agli altri dispositivi sincronizzati.
     */
    replaceAll: useCallback(
      (next: Data) =>
        update((d) => {
          const at = now();
          const keep = new Set<string>();
          const fresh = { ...next, deleted: { ...d.deleted, ...next.deleted } };
          for (const key of ['accounts', 'transactions', 'recurring', 'planned'] as const) {
            (fresh[key] as { id: string; updatedAt: number }[]) = next[key].map((x) => {
              keep.add(x.id);
              return { ...x, updatedAt: at };
            });
            for (const x of d[key]) if (!keep.has(x.id)) fresh.deleted[x.id] = at;
          }
          for (const id of keep) delete fresh.deleted[id];
          return fresh;
        }),
      [update],
    ),

    /** Unisce dati arrivati da un altro dispositivo; non cambia nulla se sono già allineati. */
    mergeRemote: useCallback((remote: Data) => setData((cur) => {
      const merged = merge(cur, remote);
      return sameData(merged, cur) ? cur : merged;
    }), []),
  };
}

export type Store = ReturnType<typeof useStore>;
