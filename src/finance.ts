import type { Data, Kind, Planned, Recurring, Transaction } from './types';

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

export const emptyData = (): Data => ({ version: 1, transactions: [], recurring: [], planned: [] });

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

/** Il movimento che registra la voce mensile in quel mese, se esiste. */
export const recurringPayment = (txs: Transaction[], r: Recurring, month: string) =>
  txs.find((t) => t.recurringId === r.id && monthOf(t.date) === month);

export interface MonthSummary {
  income: number;
  expenses: number;
  balance: number;
  /** Voci mensili attive non ancora registrate in questo mese. */
  pendingIncome: number;
  pendingExpenses: number;
  /** Saldo del mese una volta registrate tutte le voci mensili rimaste. */
  forecast: number;
  fixedExpenses: number;
  fixedIncome: number;
  byCategory: { category: string; amount: number }[];
}

export function monthSummary(data: Data, month: string): MonthSummary {
  const txs = transactionsIn(data.transactions, month);
  const income = sum(txs.filter((t) => t.kind === 'entrata'));
  const expenses = sum(txs.filter((t) => t.kind === 'uscita'));
  const active = data.recurring.filter((r) => r.active);
  const pending = active.filter((r) => !recurringPayment(data.transactions, r, month));
  const pendingIncome = sum(pending.filter((r) => r.kind === 'entrata'));
  const pendingExpenses = sum(pending.filter((r) => r.kind === 'uscita'));

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

/** Saldo complessivo di tutti i movimenti fino alla data indicata compresa. */
export const totalBalance = (txs: Transaction[], upTo = '9999-12-31') =>
  round(txs.filter((t) => t.date <= upTo).reduce((s, t) => s + (t.kind === 'entrata' ? t.amount : -t.amount), 0));

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

/** Valida e normalizza un backup importato. Lancia un errore se il file non è valido. */
export function parseBackup(json: string): Data {
  const raw = JSON.parse(json);
  if (!raw || typeof raw !== 'object') throw new Error('File non valido');
  const { transactions, recurring, planned } = raw as Partial<Data>;
  if (!Array.isArray(transactions) || !Array.isArray(recurring) || !Array.isArray(planned)) {
    throw new Error('Il file non contiene un backup di questa app');
  }
  return { version: 1, transactions, recurring, planned };
}

export function toCsv(txs: Transaction[]): string {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) =>
      [t.date, t.kind, t.category, esc(t.description), (t.kind === 'uscita' ? -t.amount : t.amount).toFixed(2).replace('.', ',')].join(';'),
    );
  return ['Data;Tipo;Categoria;Descrizione;Importo', ...rows].join('\n');
}
