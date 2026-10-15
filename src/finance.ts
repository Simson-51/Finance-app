import type { Account, AccountType, Collection, Data, Kind, Planned, Recurring, Transaction } from './types';

export const CATEGORIES: Record<Kind, string[]> = {
  entrata: ['Stipendio', 'Freelance', 'Rimborsi', 'Regali', 'Investimenti', 'Altro'],
  uscita: [
    'Casa',
    'Bollette',
    'Spesa',
    'Trasporti',
    'Salute',
    'Ristoranti',
    'Svago',
    'Abbigliamento',
    'Abbonamenti',
    'Tecnologia',
    'Viaggi',
    'Istruzione',
    'Altro',
  ],
};

export const ACCOUNT_TYPES: Record<AccountType, { label: string; icon: string }> = {
  conto: { label: 'Conto corrente', icon: '🏦' },
  carta: { label: 'Carta', icon: '💳' },
  contanti: { label: 'Contanti', icon: '💶' },
  risparmio: { label: 'Risparmi', icon: '🐷' },
};

/**
 * Conto creato automaticamente quando non ce n'è nessuno. L'id fisso evita che due
 * dispositivi appena configurati creino due conti "principali" diversi.
 */
export const DEFAULT_ACCOUNT_ID = 'default';

const defaultAccount = (updatedAt = 0): Account => ({
  id: DEFAULT_ACCOUNT_ID,
  name: 'Conto principale',
  type: 'conto',
  initialBalance: 0,
  archived: false,
  updatedAt,
});

export const emptyData = (): Data => ({
  version: 2,
  accounts: [defaultAccount()],
  transactions: [],
  recurring: [],
  planned: [],
  deleted: {},
});

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

const pad = (n: number) => String(n).padStart(2, '0');

/** Data odierna in formato YYYY-MM-DD (fuso orario locale). */
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Mese in formato YYYY-MM. */
export const monthOf = (date: string) => date.slice(0, 7);

export const addMonths = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** Data effettiva di una voce mensile nel mese indicato (il 31 diventa l'ultimo giorno del mese). */
export const recurringDate = (r: Recurring, month: string) =>
  `${month}-${pad(Math.min(r.day, daysInMonth(month)))}`;

/** Numero di mesi interi (arrotondati per eccesso, minimo 1) da oggi alla data obiettivo. */
export const monthsUntil = (target: string, from = today()) => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm, td] = target.split('-').map(Number);
  const [, , fd] = from.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td > fd) months += 1;
  return Math.max(1, months);
};

const fmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
export const euro = (n: number) => fmt.format(n);

export const formatDate = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatMonth = (month: string) => {
  const s = new Date(month + '-01T00:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const round = (n: number) => Math.round(n * 100) / 100;

export const sum = (list: { amount: number }[]) => round(list.reduce((s, x) => s + x.amount, 0));

export const transactionsIn = (txs: Transaction[], month: string) => txs.filter((t) => monthOf(t.date) === month);

/**
 * Primo mese in cui una voce mensile è dovuta: quello del primo addebito che cade dopo la
 * creazione. Una spesa del giorno 1 creata il 15 ottobre parte da novembre.
 */
export function defaultStartMonth(day: number, created = today()): string {
  const month = monthOf(created);
  return Number(created.slice(8, 10)) > Math.min(day, daysInMonth(month)) ? addMonths(month, 1) : month;
}

/** Primo mese della voce; per le voci create prima di questa opzione si deduce dall'ultima modifica. */
export const recurringStart = (r: Recurring) =>
  r.startMonth ?? (r.updatedAt > 0 ? defaultStartMonth(r.day, today(new Date(r.updatedAt))) : '0000-01');

/** Mesi tra due mesi YYYY-MM (b − a). */
export const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

export const FREQUENCIES = [
  { months: 1, label: 'Ogni mese' },
  { months: 2, label: 'Ogni 2 mesi' },
  { months: 3, label: 'Ogni 3 mesi' },
  { months: 6, label: 'Ogni 6 mesi' },
  { months: 12, label: 'Ogni anno' },
];

export const recurringEvery = (r: Pick<Recurring, 'everyMonths'>) => Math.max(1, r.everyMonths ?? 1);

/** La voce conta nel mese indicato: attiva, già iniziata, non finita e nel mese giusto della sua cadenza. */
export function recurringDue(r: Recurring, month: string): boolean {
  if (!r.active) return false;
  const start = recurringStart(r);
  if (month < start || (r.endMonth && month > r.endMonth)) return false;
  return monthsBetween(start, month) % recurringEvery(r) === 0;
}

/** Ultimo mese di una voce che termina dopo `count` addebiti. */
export const endMonthFor = (start: string, every: number, count: number) => addMonths(start, (count - 1) * every);

/** Numero di addebiti totali di una voce con fine (rate), altrimenti null. */
export const installmentsTotal = (r: Recurring) =>
  r.endMonth ? Math.floor(monthsBetween(recurringStart(r), r.endMonth) / recurringEvery(r)) + 1 : null;

/** Quale rata cade nel mese (1 = la prima), per le voci con fine. */
export const installmentNumber = (r: Recurring, month: string) =>
  r.endMonth ? Math.floor(monthsBetween(recurringStart(r), month) / recurringEvery(r)) + 1 : null;

/** Prossimo mese, da `month` compreso, in cui la voce è dovuta (entro due anni). */
export function nextDueMonth(r: Recurring, month: string): string | undefined {
  for (let m = month, i = 0; i < 25; i++, m = addMonths(m, 1)) if (recurringDue(r, m)) return m;
  return undefined;
}

/** Id fisso del pagamento registrato in automatico: due dispositivi producono lo stesso record. */
export const autoPayId = (recurringId: string, month: string) => `autopay-${recurringId}-${month}`;

/**
 * Registra da solo, alla scadenza, il pagamento/incasso delle voci con registrazione automatica
 * (al massimo per gli ultimi 3 mesi). Se l'utente ha tolto la spunta, il pagamento non viene
 * ricreato. Restituisce lo stesso oggetto se non c'è nulla da cambiare.
 */
export function reconcileAutoPay(data: Data, day = today(), now = Date.now()): Data {
  const added: Transaction[] = [];
  const current = monthOf(day);
  const fallback = data.accounts.find((a) => !a.archived) ?? data.accounts[0];
  for (const r of data.recurring) {
    if (!r.autoPay || !r.active) continue;
    const start = recurringStart(r);
    const from = start > addMonths(current, -3) ? start : addMonths(current, -3);
    for (let month = from; month <= current; month = addMonths(month, 1)) {
      const date = recurringDate(r, month);
      if (!recurringDue(r, month) || date > day || recurringPayment(data.transactions, r, month)) continue;
      const id = autoPayId(r.id, month);
      if (data.deleted[id]) continue;
      const account = data.accounts.find((a) => a.id === r.accountId && !a.archived) ?? fallback;
      added.push({ id, kind: r.kind, amount: r.amount, date, category: r.category, description: r.name, accountId: account.id, recurringId: r.id, updatedAt: now });
    }
  }
  return added.length ? { ...data, transactions: [...data.transactions, ...added] } : data;
}

/** Il movimento che registra la voce mensile in quel mese, se esiste. */
export const recurringPayment = (txs: Transaction[], r: Recurring, month: string) =>
  txs.find((t) => t.recurringId === r.id && monthOf(t.date) === month);

export interface MonthSummary {
  /** Entrate e uscite già avvenute (data fino a oggi). */
  income: number;
  expenses: number;
  balance: number;
  /** Movimenti con data futura e voci mensili attive non ancora registrate in questo mese. */
  pendingIncome: number;
  pendingExpenses: number;
  /** Saldo del mese una volta avvenuti tutti i movimenti previsti. */
  forecast: number;
  fixedExpenses: number;
  fixedIncome: number;
  byCategory: { category: string; amount: number }[];
}

export function monthSummary(data: Data, month: string, asOf = today()): MonthSummary {
  const all = transactionsIn(data.transactions, month);
  const txs = all.filter((t) => t.date <= asOf);
  const future = all.filter((t) => t.date > asOf);
  const income = sum(txs.filter((t) => t.kind === 'entrata'));
  const expenses = sum(txs.filter((t) => t.kind === 'uscita'));
  const active = data.recurring.filter((r) => recurringDue(r, month));
  const pending = active.filter((r) => !recurringPayment(data.transactions, r, month));
  const pendingIncome = round(sum(pending.filter((r) => r.kind === 'entrata')) + sum(future.filter((t) => t.kind === 'entrata')));
  const pendingExpenses = round(sum(pending.filter((r) => r.kind === 'uscita')) + sum(future.filter((t) => t.kind === 'uscita')));

  const cats = new Map<string, number>();
  for (const t of txs) if (t.kind === 'uscita') cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
  const byCategory = [...cats]
    .map(([category, amount]) => ({ category, amount: round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    income,
    expenses,
    balance: round(income - expenses),
    pendingIncome,
    pendingExpenses,
    forecast: round(income + pendingIncome - expenses - pendingExpenses),
    fixedExpenses: sum(active.filter((r) => r.kind === 'uscita')),
    fixedIncome: sum(active.filter((r) => r.kind === 'entrata')),
    byCategory,
  };
}

/** Effetto di un movimento sul saldo di un conto. */
export function effectOn(t: Transaction, accountId: string): number {
  if (t.kind === 'trasferimento') {
    return (t.toAccountId === accountId ? t.amount : 0) - (t.accountId === accountId ? t.amount : 0);
  }
  if (t.accountId !== accountId) return 0;
  return t.kind === 'entrata' ? t.amount : -t.amount;
}

/** Saldo di un conto: saldo iniziale più i movimenti fino alla data indicata compresa. */
export const accountBalance = (data: Pick<Data, 'transactions'>, account: Account, upTo = '9999-12-31') =>
  round(data.transactions.filter((t) => t.date <= upTo).reduce((s, t) => s + effectOn(t, account.id), account.initialBalance));

/** Saldo complessivo di tutti i conti fino alla data indicata compresa (i trasferimenti si compensano). */
export const totalBalance = (data: Pick<Data, 'transactions' | 'accounts'>, upTo = '9999-12-31') =>
  round(data.accounts.reduce((s, a) => s + accountBalance(data, a, upTo), 0));

/** Conti utilizzabili nei moduli; include comunque `keep` se archiviato (per modificare vecchi movimenti). */
export const usableAccounts = (accounts: Account[], keep?: string) =>
  accounts.filter((a) => !a.archived || a.id === keep);

export const accountName = (accounts: Account[], id?: string) => accounts.find((a) => a.id === id)?.name ?? 'Conto eliminato';

/** Un movimento è "previsto" finché la sua data non è arrivata. */
export const isFuture = (t: Transaction, day = today()) => t.date > day;

/** Le ricariche automatiche azzerate (il saldo era già sufficiente) non vanno mostrate. */
export const isVisible = (t: Transaction) => !(t.autoTopUp && t.amount === 0);

/** Conto da cui ricaricare un conto con budget minimo, se la configurazione è valida. */
export function topUpSource(accounts: Account[], a: Account): Account | undefined {
  if (!a.minBalance || a.minBalance <= 0 || !a.topUpFrom || a.topUpFrom === a.id || a.archived) return undefined;
  return accounts.find((x) => x.id === a.topUpFrom && !x.archived);
}

/** Id fisso della ricarica automatica di un giorno: due dispositivi producono lo stesso record. */
export const topUpId = (accountId: string, date: string) => `topup-${accountId}-${date}`;

/**
 * Registra (o aggiorna) la ricarica automatica di oggi per ogni conto con budget minimo,
 * così che il saldo torni esattamente al budget. Se la ricarica non serve più viene
 * azzerata; se l'utente l'ha eliminata a mano non viene ricreata. Restituisce lo stesso
 * oggetto se non c'è nulla da cambiare.
 */
export function reconcileTopUps(data: Data, day = today(), now = Date.now()): Data {
  let transactions = data.transactions;
  for (const a of data.accounts) {
    const src = topUpSource(data.accounts, a);
    if (!src || !a.autoTopUp) continue;
    const id = topUpId(a.id, day);
    if (data.deleted[id]) continue;
    const existing = transactions.find((t) => t.id === id);
    const balance = accountBalance({ transactions }, a, day) - (existing ? effectOn(existing, a.id) : 0);
    const amount = Math.max(0, round(a.minBalance! - balance));
    if (!existing && amount === 0) continue;
    if (existing && existing.amount === amount && existing.accountId === src.id) continue;
    const tx: Transaction = {
      id,
      kind: 'trasferimento',
      amount,
      date: day,
      category: 'Trasferimento',
      description: `Ricarica automatica ${a.name}`,
      accountId: src.id,
      toAccountId: a.id,
      autoTopUp: true,
      updatedAt: now,
    };
    transactions = existing ? transactions.map((t) => (t.id === id ? tx : t)) : [...transactions, tx];
  }
  return transactions === data.transactions ? data : { ...data, transactions };
}

/** Pagamento o incasso atteso nel futuro (movimento con data futura o voce mensile da registrare). */
export interface ScheduledEvent {
  date: string;
  kind: Transaction['kind'];
  amount: number;
  accountId: string;
  toAccountId?: string;
  label: string;
  /** Voce mensile non ancora segnata come pagata/incassata. */
  recurring?: boolean;
  /** Data originale di una voce mensile scaduta e non registrata (contata come dovuta oggi). */
  overdue?: string;
}

const endOfMonth = (month: string) => `${month}-${pad(daysInMonth(month))}`;

/** Fine del mese successivo: orizzonte delle previsioni. */
export const forecastHorizon = (day = today()) => endOfMonth(addMonths(monthOf(day), 1));

export const DEFAULT_PAYDAY = 15;

/** Prossimo giorno di stipendio dopo `day` (il giorno viene adattato ai mesi più corti). */
export function nextPayday(payday: number, day = today()): string {
  const at = (month: string) => `${month}-${pad(Math.min(payday, daysInMonth(month)))}`;
  const thisMonth = at(monthOf(day));
  return thisMonth > day ? thisMonth : at(addMonths(monthOf(day), 1));
}

/** Giorno prima di una data YYYY-MM-DD. */
export const dayBefore = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return today(new Date(y, m - 1, d - 1));
};

/**
 * Elenca i movimenti attesi tra oggi (escluso) e `to` (incluso). Le voci mensili attive non
 * ancora registrate sono considerate dovute alla loro data, oppure oggi se già scadute.
 */
export function scheduledEvents(data: Data, from = today(), to = forecastHorizon(from)): ScheduledEvent[] {
  const events: ScheduledEvent[] = data.transactions
    .filter((t) => t.date > from && t.date <= to && t.amount > 0)
    .map((t) => ({ date: t.date, kind: t.kind, amount: t.amount, accountId: t.accountId, toAccountId: t.toAccountId, label: t.description || t.category }));

  const fallback = data.accounts.find((a) => !a.archived) ?? data.accounts[0];
  for (let month = monthOf(from); month <= monthOf(to); month = addMonths(month, 1)) {
    for (const r of data.recurring) {
      if (!recurringDue(r, month) || recurringPayment(data.transactions, r, month)) continue;
      const due = recurringDate(r, month);
      if (due > to) continue;
      const account = data.accounts.find((a) => a.id === r.accountId && !a.archived) ?? fallback;
      events.push({
        date: due < from ? from : due,
        kind: r.kind,
        amount: r.amount,
        accountId: account.id,
        label: r.name,
        recurring: true,
        overdue: due < from ? due : undefined,
      });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export interface AccountForecast {
  /** Saldo oggi. */
  current: number;
  /** Saldo a fine orizzonte. */
  end: number;
  /** Saldo più basso raggiunto nel periodo. */
  min: number;
  /** Quanto manca per coprire i pagamenti previsti (0 se tutto è coperto). */
  shortfall: number;
  /** Primo giorno in cui i soldi non bastano. */
  shortDate?: string;
  /** Movimenti previsti che toccano il conto, con il saldo dopo ciascuno. */
  steps: ForecastStep[];
}

export interface ForecastStep {
  date: string;
  label: string;
  /** Effetto sul saldo del conto (+ entra, − esce). */
  amount: number;
  balance: number;
  kind: 'entrata' | 'uscita' | 'trasferimento' | 'ricarica';
  recurring?: boolean;
  overdue?: string;
}

export interface Forecast {
  accounts: Record<string, AccountForecast>;
  /** Ricariche da fare oggi per i conti con budget minimo in modalità manuale. */
  topUps: { accountId: string; fromId: string; amount: number }[];
}

/**
 * Simula giorno per giorno i saldi dei conti da oggi a `to`, applicando i movimenti previsti,
 * le voci mensili da pagare e le ricariche dei conti con budget minimo.
 */
export function forecast(data: Data, from = today(), to = forecastHorizon(from)): Forecast {
  const bal: Record<string, number> = {};
  const result: Record<string, AccountForecast> = {};
  for (const a of data.accounts) {
    bal[a.id] = accountBalance(data, a, from);
    result[a.id] = { current: bal[a.id], end: bal[a.id], min: bal[a.id], shortfall: 0, steps: [] };
  }
  const topUps: Forecast['topUps'] = [];
  const events = scheduledEvents(data, from, to);
  const days = [...new Set([from, ...events.map((e) => e.date)])].sort();

  const name = (id?: string) => accountName(data.accounts, id);
  const move = (id: string | undefined, amount: number, step: Omit<ForecastStep, 'amount' | 'balance'>) => {
    if (!id || !(id in bal)) return;
    bal[id] = round(bal[id] + amount);
    result[id].steps.push({ ...step, amount, balance: bal[id] });
  };

  for (const day of days) {
    for (const e of events) {
      if (e.date !== day) continue;
      const base = { date: day, kind: e.kind, recurring: e.recurring, overdue: e.overdue };
      if (e.kind === 'trasferimento') {
        move(e.accountId, -e.amount, { ...base, label: `${e.label} → ${name(e.toAccountId)}` });
        move(e.toAccountId, e.amount, { ...base, label: `${e.label} ← ${name(e.accountId)}` });
      } else {
        move(e.accountId, e.kind === 'entrata' ? e.amount : -e.amount, { ...base, label: e.label });
      }
    }
    for (const a of data.accounts) {
      const src = topUpSource(data.accounts, a);
      const deficit = src ? round(a.minBalance! - bal[a.id]) : 0;
      if (!src || deficit <= 0) continue;
      move(a.id, deficit, { date: day, kind: 'ricarica', label: `Ricarica da ${src.name} (budget ${euro(a.minBalance!)})` });
      move(src.id, -deficit, { date: day, kind: 'ricarica', label: `Ricarica ${a.name} (budget ${euro(a.minBalance!)})` });
      if (day === from && !a.autoTopUp) topUps.push({ accountId: a.id, fromId: src.id, amount: deficit });
    }
    for (const a of data.accounts) {
      const f = result[a.id];
      const b = round(bal[a.id]);
      if (b < f.min) f.min = b;
      // un conto nato in negativo (es. carta di credito) segnala solo il peggioramento rispetto a oggi
      const floor = a.initialBalance < 0 ? Math.min(0, f.current) : 0;
      const missing = round(floor - b);
      if (missing > f.shortfall) {
        if (!f.shortDate) f.shortDate = day;
        f.shortfall = missing;
      }
    }
  }
  for (const a of data.accounts) result[a.id].end = round(bal[a.id]);
  return { accounts: result, topUps };
}

export interface PlannedProgress {
  remaining: number;
  percent: number;
  /** Quanto mettere da parte al mese per arrivare in tempo; null se senza data obiettivo. */
  perMonth: number | null;
}

export function plannedProgress(p: Planned, from = today()): PlannedProgress {
  const remaining = round(Math.max(0, p.cost - p.saved));
  const percent = p.cost > 0 ? Math.min(100, Math.round((p.saved / p.cost) * 100)) : 100;
  const perMonth = p.targetDate ? round(remaining / monthsUntil(p.targetDate, from)) : null;
  return { remaining, percent, perMonth };
}

const PRIORITY_ORDER = { alta: 0, media: 1, bassa: 2 } as const;

/** Ordina gli acquisti: prima i più urgenti per priorità, poi per data obiettivo. */
export const sortPlanned = (list: Planned[]) =>
  [...list].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') ||
      a.name.localeCompare(b.name),
  );

/** Converte il testo inserito dall'utente (accetta "12,50" e "1.234,50") in numero. */
export function parseAmount(input: string): number {
  const s = input.trim().replace(/\s|€/g, '');
  if (!s) return NaN;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return /^-?\d*\.?\d+$/.test(normalized) ? round(Number(normalized)) : NaN;
}

/**
 * Porta dati di qualsiasi versione al formato attuale: aggiunge i campi mancanti e,
 * se non esiste alcun conto, crea il conto principale e vi assegna i movimenti senza conto.
 */
export function normalize(raw: Partial<Data> & { version?: number }): Data {
  const stamp = <T extends object>(x: T) => ({ updatedAt: 0, ...x });
  const data: Data = {
    version: 2,
    accounts: (raw.accounts ?? []).map(stamp),
    transactions: (raw.transactions ?? []).map(stamp),
    recurring: (raw.recurring ?? []).map(stamp),
    planned: (raw.planned ?? []).map(stamp),
    deleted: raw.deleted ?? {},
  };
  return ensureAccount(data);
}

/** Garantisce che esista almeno un conto e che ogni movimento ne abbia uno. */
export function ensureAccount(data: Data): Data {
  let { accounts } = data;
  if (!accounts.length) {
    // dopo un'eliminazione sincronizzata il conto predefinito va ricreato con data più recente
    accounts = [defaultAccount(data.deleted[DEFAULT_ACCOUNT_ID] ? Date.now() : 0)];
  }
  const fallback = accounts.find((a) => !a.archived)?.id ?? accounts[0].id;
  const needsFix = data.transactions.some((t) => !t.accountId);
  if (accounts === data.accounts && !needsFix) return data;
  return {
    ...data,
    accounts,
    transactions: needsFix ? data.transactions.map((t) => (t.accountId ? t : { ...t, accountId: fallback })) : data.transactions,
  };
}

/** Valida e normalizza un backup importato. Lancia un errore se il file non è valido. */
export function parseBackup(json: string): Data {
  const raw = JSON.parse(json);
  if (!raw || typeof raw !== 'object') throw new Error('File non valido');
  const { transactions, recurring, planned } = raw as Partial<Data>;
  if (!Array.isArray(transactions) || !Array.isArray(recurring) || !Array.isArray(planned)) {
    throw new Error('Il file non contiene un backup di questa app');
  }
  return normalize(raw);
}

const COLLECTIONS: Collection[] = ['accounts', 'transactions', 'recurring', 'planned'];

/**
 * Unisce i dati di due dispositivi: per ogni record vince la versione con `updatedAt` più
 * recente; un record eliminato resta eliminato a meno che non sia stato modificato dopo.
 * L'operazione è commutativa e idempotente, quindi si può ripetere senza effetti collaterali.
 */
export function merge(a: Data, b: Data): Data {
  const deleted: Record<string, number> = { ...a.deleted };
  for (const [id, at] of Object.entries(b.deleted)) deleted[id] = Math.max(deleted[id] ?? 0, at);

  const pick = <T extends { id: string; updatedAt: number }>(x: T[], y: T[]): T[] => {
    const map = new Map<string, T>();
    for (const item of [...x, ...y]) {
      const cur = map.get(item.id);
      // a parità di data si sceglie in modo deterministico, così entrambi i dispositivi ottengono lo stesso risultato
      if (!cur || item.updatedAt > cur.updatedAt || (item.updatedAt === cur.updatedAt && JSON.stringify(item) > JSON.stringify(cur))) {
        map.set(item.id, item);
      }
    }
    return [...map.values()].filter((item) => !(deleted[item.id] >= item.updatedAt));
  };

  return ensureAccount({
    version: 2,
    accounts: pick(a.accounts, b.accounts),
    transactions: pick(a.transactions, b.transactions),
    recurring: pick(a.recurring, b.recurring),
    planned: pick(a.planned, b.planned),
    deleted,
  });
}

/** Confronta due insiemi di dati ignorando l'ordine dei record. */
export function sameData(a: Data, b: Data): boolean {
  const canon = (d: Data) =>
    JSON.stringify([
      ...COLLECTIONS.map((c) => [...(d[c] as { id: string }[])].sort((x, y) => x.id.localeCompare(y.id))),
      Object.entries(d.deleted).sort(([x], [y]) => x.localeCompare(y)),
    ]);
  return canon(a) === canon(b);
}

export function toCsv(data: Pick<Data, 'transactions' | 'accounts'>): string {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = data.transactions
    .filter(isVisible)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) =>
      [
        t.date,
        t.kind,
        esc(accountName(data.accounts, t.accountId)),
        esc(t.kind === 'trasferimento' ? accountName(data.accounts, t.toAccountId) : ''),
        esc(t.category),
        esc(t.description),
        (t.kind === 'uscita' ? -t.amount : t.amount).toFixed(2).replace('.', ','),
      ].join(';'),
    );
  return ['Data;Tipo;Conto;Conto di arrivo;Categoria;Descrizione;Importo', ...rows].join('\n');
}

export interface Flow {
  label: string;
  amount: number;
}

/** Flussi di un mese per il diagramma di Sankey: entrate per categoria → spese per categoria + risparmio. */
export interface MonthFlows {
  incomes: Flow[];
  expenses: Flow[];
  /** Entrate non spese. */
  saved: number;
  /** Spese oltre le entrate, coperte con i soldi già presenti sui conti. */
  fromSavings: number;
  /** Totale che attraversa il diagramma (uguale a sinistra e a destra). */
  total: number;
}

/** Raggruppa per categoria e unisce le più piccole in "altro" oltre `max` voci. */
function groupFlows(txs: Transaction[], max: number, otherLabel: string): Flow[] {
  const map = new Map<string, number>();
  for (const t of txs) map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  const sorted = [...map].map(([label, amount]) => ({ label, amount: round(amount) })).sort((a, b) => b.amount - a.amount);
  if (sorted.length <= max) return sorted;
  const rest = sorted.slice(max - 1);
  return [...sorted.slice(0, max - 1), { label: otherLabel, amount: sum(rest) }];
}

export function monthFlows(data: Data, month: string, includeFuture = false, asOf = today()): MonthFlows {
  const txs = transactionsIn(data.transactions, month).filter((t) => includeFuture || t.date <= asOf);
  const incomes = groupFlows(txs.filter((t) => t.kind === 'entrata'), 6, 'Altre entrate');
  const expenses = groupFlows(txs.filter((t) => t.kind === 'uscita'), 7, 'Altre spese');
  const totalIn = sum(incomes);
  const totalOut = sum(expenses);
  return {
    incomes,
    expenses,
    saved: round(Math.max(0, totalIn - totalOut)),
    fromSavings: round(Math.max(0, totalOut - totalIn)),
    total: round(Math.max(totalIn, totalOut)),
  };
}

export interface BalancePoint {
  date: string;
  balance: number;
  /** true per i giorni futuri (saldo previsto). */
  projected?: boolean;
}

/** Giorno successivo a una data YYYY-MM-DD. */
export const dayAfter = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return today(new Date(y, m - 1, d + 1));
};

/**
 * Saldo totale di tutti i conti giorno per giorno da `from` a oggi, seguito dal saldo previsto
 * fino a `until` (movimenti previsti e voci mensili da registrare). I trasferimenti tra conti
 * non cambiano il totale. La storia parte al più presto dal giorno prima del primo movimento.
 */
export function balanceSeries(data: Data, from: string, day = today(), until = day): BalancePoint[] {
  const delta = new Map<string, number>();
  const add = (date: string, v: number) => delta.set(date, (delta.get(date) ?? 0) + v);
  let start = data.accounts.reduce((s, a) => s + a.initialBalance, 0);
  for (const t of data.transactions) {
    if (t.kind === 'trasferimento' || t.date > day) continue;
    const v = t.kind === 'entrata' ? t.amount : -t.amount;
    if (t.date < from) start += v;
    else add(t.date, v);
  }
  const first = data.transactions.filter((t) => t.kind !== 'trasferimento').reduce((m, t) => (t.date < m ? t.date : m), day);
  const begin = from > dayBefore(first) ? from : dayBefore(first);

  const points: BalancePoint[] = [];
  let bal = start;
  for (let d = begin; d <= day; d = dayAfter(d)) {
    bal += delta.get(d) ?? 0;
    points.push({ date: d, balance: round(bal) });
  }

  const future = new Map<string, number>();
  for (const e of scheduledEvents(data, day, until)) {
    if (e.kind !== 'trasferimento') future.set(e.date, (future.get(e.date) ?? 0) + (e.kind === 'entrata' ? e.amount : -e.amount));
  }
  // le voci scadute contano come dovute oggi: il punto di oggi le include nella parte prevista
  const dueToday = future.get(day) ?? 0;
  if (dueToday) points.push({ date: day, balance: round(bal + dueToday), projected: true });
  bal += dueToday;
  for (let d = dayAfter(day); d <= until; d = dayAfter(d)) {
    bal += future.get(d) ?? 0;
    points.push({ date: d, balance: round(bal), projected: true });
  }
  return points;
}
