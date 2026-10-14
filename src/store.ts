import { useCallback, useEffect, useState } from 'react';
import { emptyData, parseBackup, recurringDate, recurringPayment, today, uid } from './finance';
import type { Data, Planned, Recurring, Transaction } from './types';

const KEY = 'finanze:data';

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseBackup(raw) : emptyData();
  } catch {
    return emptyData();
  }
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

  // Mantiene sincronizzate più schede aperte contemporaneamente.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setData(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const upsert = <K extends 'transactions' | 'recurring' | 'planned'>(key: K, item: Data[K][number]) =>
    setData((d) => {
      const list = d[key] as Data[K][number][];
      const exists = list.some((x) => x.id === item.id);
      return { ...d, [key]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] };
    });

  const remove = (key: 'transactions' | 'recurring' | 'planned', id: string) =>
    setData((d) => ({ ...d, [key]: (d[key] as { id: string }[]).filter((x) => x.id !== id) }));

  return {
    data,
    saveTransaction: useCallback((t: Transaction) => upsert('transactions', t), []),
    deleteTransaction: useCallback((id: string) => remove('transactions', id), []),

    saveRecurring: useCallback((r: Recurring) => upsert('recurring', r), []),
    deleteRecurring: useCallback(
      // I movimenti già registrati restano, ma non sono più collegati alla voce eliminata.
      (id: string) =>
        setData((d) => ({
          ...d,
          recurring: d.recurring.filter((r) => r.id !== id),
          transactions: d.transactions.map((t) => (t.recurringId === id ? { ...t, recurringId: undefined } : t)),
        })),
      [],
    ),
    /** Segna la voce mensile come pagata/incassata nel mese, creando il movimento; se già presente lo annulla. */
    toggleRecurringPaid: useCallback(
      (r: Recurring, month: string) =>
        setData((d) => {
          const existing = recurringPayment(d.transactions, r, month);
          if (existing) return { ...d, transactions: d.transactions.filter((t) => t.id !== existing.id) };
          const tx: Transaction = {
            id: uid(),
            kind: r.kind,
            amount: r.amount,
            date: recurringDate(r, month),
            category: r.category,
            description: r.name,
            recurringId: r.id,
          };
          return { ...d, transactions: [...d.transactions, tx] };
        }),
      [],
    ),

    savePlanned: useCallback((p: Planned) => upsert('planned', p), []),
    deletePlanned: useCallback(
      (id: string) =>
        setData((d) => ({
          ...d,
          planned: d.planned.filter((p) => p.id !== id),
          transactions: d.transactions.map((t) => (t.plannedId === id ? { ...t, plannedId: undefined } : t)),
        })),
      [],
    ),
    /** Segna l'acquisto come fatto e registra la relativa uscita. */
    markBought: useCallback(
      (p: Planned, amount: number, date = today()) =>
        setData((d) => ({
          ...d,
          planned: d.planned.map((x) => (x.id === p.id ? { ...x, boughtDate: date, saved: amount } : x)),
          transactions: [
            ...d.transactions,
            {
              id: uid(),
              kind: 'uscita',
              amount,
              date,
              category: p.category,
              description: p.name,
              plannedId: p.id,
            },
          ],
        })),
      [],
    ),
    /** Riporta l'acquisto tra quelli da fare ed elimina l'uscita collegata. */
    undoBought: useCallback(
      (p: Planned) =>
        setData((d) => ({
          ...d,
          planned: d.planned.map((x) => (x.id === p.id ? { ...x, boughtDate: undefined } : x)),
          transactions: d.transactions.filter((t) => t.plannedId !== p.id),
        })),
      [],
    ),

    replaceAll: useCallback((next: Data) => setData(next), []),
  };
}

export type Store = ReturnType<typeof useStore>;
