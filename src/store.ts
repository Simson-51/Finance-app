import { useCallback, useEffect, useState } from 'react';
import { accountBalance, autoPayId, categoryId, COLLECTIONS, defaultStartMonth, UNCLASSIFIED, emptyData, ensureAccount, merge, normalize, paymentMonth, reconcileAutoPay, reconcileTopUps, recurringDate, recurringPayment, recurringStart, sameData, today, uid } from './finance';
import type { Account, Collection, Data, Kind, Macro, Planned, Recurring, Transaction } from './types';

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

/**
 * Elimina dei movimenti. Se uno registrava una voce mensile, segna come eliminato anche il
 * pagamento automatico di quel mese: altrimenti l'app lo registrerebbe di nuovo subito.
 */
function removeTransactions(d: Data, ids: string[]): Data {
  const next = removeFrom(d, 'transactions', ids);
  for (const t of d.transactions) {
    if (t.recurringId && ids.includes(t.id)) next.deleted[autoPayId(t.recurringId, paymentMonth(t))] = next.deleted[t.id];
  }
  return next;
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

  // Registra i pagamenti automatici delle voci mensili e le ricariche dei conti con budget
  // minimo: dopo ogni modifica e
  // quando l'app torna in primo piano (potrebbe essere cambiato il giorno).
  const [day, setDay] = useState(today);
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setDay(today());
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  useEffect(() => {
    setData((cur) => reconcileTopUps(reconcileAutoPay(cur, day), day));
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
    deleteTransaction: useCallback((id: string) => update((d) => removeTransactions(d, [id])), [update]),

    saveRecurring: useCallback(
      (r: Draft<Recurring>) =>
        update((d) => {
          // una voce senza primo addebito lo dedurrebbe dall'ultima modifica: lo si fissa prima di cambiarla
          const old = d.recurring.find((x) => x.id === r.id);
          return upsertIn(d, 'recurring', { ...r, startMonth: r.startMonth ?? (old ? recurringStart(old) : defaultStartMonth(r.day)) });
        }),
      [update],
    ),
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
          if (existing) return removeTransactions(d, [existing.id]);
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
          const next = upsertIn(d, 'planned', { ...p, boughtDate: date });
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

    /** Aggiunge una categoria personalizzata (lo stesso nome non crea doppioni). */
    addCategory: useCallback(
      (kind: Kind, name: string, macro?: Macro) => update((d) => upsertIn(d, 'categories', { id: categoryId(kind, name), kind, name: name.trim(), macro })),
      [update],
    ),
    /** Sposta una categoria di spesa (anche predefinita) in un'altra macro-categoria. */
    setCategoryMacro: useCallback(
      (name: string, macro: Macro) => update((d) => upsertIn(d, 'categories', { id: categoryId('uscita', name), kind: 'uscita', name, macro })),
      [update],
    ),
    /** Budget mensile dei desideri; undefined lo toglie. */
    setWantsBudget: useCallback((amount: number | undefined) => update((d) => ({ ...d, settings: { ...d.settings, wantsBudget: amount, updatedAt: now() } })), [update]),

    /**
     * Allinea il saldo di un conto a quello reale: la differenza diventa un movimento "da
     * classificare" (uscita se mancano soldi, entrata se ce ne sono di più), da dividere poi
     * nelle categorie giuste. Una differenza di segno opposto ancora aperta viene prima ridotta.
     */
    alignBalance: useCallback(
      (accountId: string, real: number) =>
        update((d) => {
          const account = d.accounts.find((a) => a.id === accountId);
          if (!account) return d;
          let diff = Math.round((real - accountBalance(d, account, today())) * 100) / 100;
          if (!diff) return d;
          const kind: Kind = diff < 0 ? 'uscita' : 'entrata';
          let left = Math.abs(diff);
          let next = d;
          for (const t of d.transactions.filter((x) => x.adjustment && x.accountId === accountId && x.kind !== kind && x.date <= today())) {
            if (left <= 0) break;
            const cut = Math.min(left, t.amount);
            left = Math.round((left - cut) * 100) / 100;
            const rest = Math.round((t.amount - cut) * 100) / 100;
            next = rest > 0 ? patchTransactions(next, (x) => x.id === t.id, (x) => ({ ...x, amount: rest })) : removeFrom(next, 'transactions', [t.id]);
          }
          if (left <= 0) return next;
          return upsertIn(next, 'transactions', {
            id: uid(),
            kind,
            amount: left,
            date: today(),
            category: UNCLASSIFIED,
            description: 'Differenza da allineare',
            accountId,
            adjustment: true,
          });
        }),
      [update],
    ),
    /** Divide una differenza in movimenti veri; quello che avanza resta da classificare. */
    splitAdjustment: useCallback(
      (id: string, parts: { amount: number; category: string; description: string }[]) =>
        update((d) => {
          const adj = d.transactions.find((t) => t.id === id);
          const total = Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100) / 100;
          if (!adj || !parts.length || total > adj.amount) return d;
          let next = d;
          for (const p of parts) {
            next = upsertIn(next, 'transactions', { id: uid(), kind: adj.kind, amount: p.amount, date: adj.date, category: p.category, description: p.description, accountId: adj.accountId });
          }
          const rest = Math.round((adj.amount - total) * 100) / 100;
          return rest > 0 ? patchTransactions(next, (t) => t.id === id, (t) => ({ ...t, amount: rest })) : removeFrom(next, 'transactions', [id]);
        }),
      [update],
    ),
    /** Toglie la categoria dagli elenchi; i movimenti che la usano la conservano. */
    deleteCategory: useCallback((id: string) => update((d) => removeFrom(d, 'categories', [id])), [update]),

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
          const settings = next.settings ? { ...next.settings, updatedAt: at } : d.settings ? { updatedAt: at } : undefined;
          const fresh = { ...next, settings, deleted: { ...d.deleted, ...next.deleted } };
          for (const key of COLLECTIONS) {
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
