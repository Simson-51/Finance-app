import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  addMonths,
  DEFAULT_ACCOUNT_ID,
  emptyData,
  merge,
  normalize,
  sameData,
  monthSummary,
  monthsUntil,
  parseAmount,
  parseBackup,
  plannedProgress,
  recurringDate,
  sortPlanned,
  toCsv,
  totalBalance,
} from './finance';
import type { Account, Data, Planned, Recurring, Transaction } from './types';

const rent: Recurring = { id: 'r1', kind: 'uscita', name: 'Affitto', amount: 700, category: 'Casa', day: 5, active: true, updatedAt: 0 };
const salary: Recurring = { id: 'r2', kind: 'entrata', name: 'Stipendio', amount: 1800, category: 'Stipendio', day: 27, active: true, updatedAt: 0 };
const netflix: Recurring = { id: 'r3', kind: 'uscita', name: 'Netflix', amount: 13.99, category: 'Abbonamenti', day: 31, active: false, updatedAt: 0 };

const plan = (p: Partial<Planned>): Planned => ({ id: 'p', name: 'x', cost: 100, saved: 0, priority: 'media', category: 'Altro', notes: '', updatedAt: 0, ...p });

const tx = (t: Partial<Transaction> & Pick<Transaction, 'id' | 'kind' | 'amount' | 'date'>): Transaction => ({
  category: 'Altro',
  description: '',
  accountId: 'bank',
  updatedAt: 0,
  ...t,
});

const account = (a: Partial<Account> & Pick<Account, 'id'>): Account => ({
  name: a.id,
  type: 'conto',
  initialBalance: 0,
  archived: false,
  updatedAt: 0,
  ...a,
});

describe('date', () => {
  it('somma mesi attraversando gli anni', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', 3)).toBe('2027-02');
  });

  it('adatta il giorno della voce mensile ai mesi più corti', () => {
    expect(recurringDate(netflix, '2026-02')).toBe('2026-02-28');
    expect(recurringDate(netflix, '2028-02')).toBe('2028-02-29');
    expect(recurringDate(rent, '2026-04')).toBe('2026-04-05');
  });

  it('conta i mesi che mancano a una scadenza', () => {
    expect(monthsUntil('2026-12-14', '2026-10-14')).toBe(2);
    expect(monthsUntil('2026-12-20', '2026-10-14')).toBe(3);
    expect(monthsUntil('2026-10-20', '2026-10-14')).toBe(1);
    expect(monthsUntil('2026-01-01', '2026-10-14')).toBe(1);
  });
});

describe('parseAmount', () => {
  it('accetta formati italiani e internazionali', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('€ 99.9')).toBe(99.9);
    expect(parseAmount('-20')).toBe(-20);
  });

  it('rifiuta testo non numerico', () => {
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
    expect(parseAmount('1,2,3')).toBeNaN();
  });
});

describe('monthSummary', () => {
  const data: Data = {
    ...emptyData(),
    recurring: [rent, salary, netflix],
    accounts: [account({ id: 'bank', initialBalance: 1000 }), account({ id: 'card', type: 'carta', initialBalance: 50 })],
    transactions: [
      tx({ id: 't1', kind: 'entrata', amount: 1800, date: '2026-10-01', category: 'Stipendio', recurringId: 'r2' }),
      tx({ id: 't2', kind: 'uscita', amount: 80.4, date: '2026-10-03', category: 'Spesa' }),
      tx({ id: 't3', kind: 'uscita', amount: 19.6, date: '2026-10-09', category: 'Spesa', accountId: 'card' }),
      tx({ id: 't4', kind: 'uscita', amount: 50, date: '2026-10-10', category: 'Svago' }),
      tx({ id: 't5', kind: 'uscita', amount: 999, date: '2026-09-30', category: 'Svago' }),
      tx({ id: 't6', kind: 'trasferimento', amount: 200, date: '2026-10-05', category: 'Trasferimento', accountId: 'bank', toAccountId: 'card' }),
    ],
  };

  it('calcola totali, previsione e categorie del mese', () => {
    const s = monthSummary(data, '2026-10');
    expect(s.income).toBe(1800);
    expect(s.expenses).toBe(150);
    expect(s.balance).toBe(1650);
    // stipendio già registrato, affitto ancora da pagare, Netflix disattivato
    expect(s.pendingIncome).toBe(0);
    expect(s.pendingExpenses).toBe(700);
    expect(s.forecast).toBe(950);
    expect(s.fixedExpenses).toBe(700);
    expect(s.byCategory).toEqual([
      { category: 'Spesa', amount: 100 },
      { category: 'Svago', amount: 50 },
    ]);
  });

  it('esclude i trasferimenti da entrate, uscite e categorie', () => {
    const s = monthSummary(data, '2026-10');
    expect(s.byCategory.some((c) => c.category === 'Trasferimento')).toBe(false);
  });

  it('calcola i saldi dei conti partendo dal saldo iniziale', () => {
    const [bank, card] = data.accounts;
    // 1000 - 999 + 1800 - 80,40 - 50 - 200
    expect(accountBalance(data, bank)).toBe(1470.6);
    // 50 + 200 - 19,60
    expect(accountBalance(data, card)).toBe(230.4);
    expect(accountBalance(data, card, '2026-10-04')).toBe(50);
  });

  it('calcola il saldo complessivo fino a una data (i trasferimenti si compensano)', () => {
    expect(totalBalance(data, '2026-09-30')).toBe(51);
    expect(totalBalance(data)).toBe(1701);
  });
});

describe('acquisti in programma', () => {
  it('calcola avanzamento e risparmio mensile', () => {
    const p = plannedProgress(plan({ cost: 1200, saved: 300, targetDate: '2027-01-14' }), '2026-10-14');
    expect(p).toEqual({ remaining: 900, percent: 25, perMonth: 300 });
    expect(plannedProgress(plan({ cost: 100, saved: 150 })).percent).toBe(100);
    expect(plannedProgress(plan({})).perMonth).toBeNull();
  });

  it('ordina per priorità e poi per scadenza', () => {
    const sorted = sortPlanned([
      plan({ id: 'a', name: 'a', priority: 'bassa' }),
      plan({ id: 'b', name: 'b', priority: 'alta' }),
      plan({ id: 'c', name: 'c', priority: 'alta', targetDate: '2026-12-01' }),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('backup ed export', () => {
  it('rifiuta file che non sono backup', () => {
    expect(() => parseBackup('{"foo":1}')).toThrow();
    expect(() => parseBackup('non json')).toThrow();
    expect(parseBackup(JSON.stringify(emptyData()))).toEqual(emptyData());
  });

  it('migra i backup della prima versione creando il conto principale', () => {
    const v1 = {
      version: 1,
      transactions: [{ id: 't', kind: 'uscita', amount: 5, date: '2026-10-01', category: 'Spesa', description: '' }],
      recurring: [],
      planned: [],
    };
    const data = parseBackup(JSON.stringify(v1));
    expect(data.version).toBe(2);
    expect(data.accounts.map((a) => a.id)).toEqual([DEFAULT_ACCOUNT_ID]);
    expect(data.transactions[0]).toMatchObject({ accountId: DEFAULT_ACCOUNT_ID, updatedAt: 0 });
    expect(data.deleted).toEqual({});
  });

  it('esporta CSV con importi con segno, conti e campi protetti', () => {
    const csv = toCsv({
      accounts: [account({ id: 'bank', name: 'Banca' }), account({ id: 'card', name: 'Carta' })],
      transactions: [
        tx({ id: '1', kind: 'uscita', amount: 10.5, date: '2026-10-02', category: 'Spesa', description: 'pane; latte' }),
        tx({ id: '2', kind: 'entrata', amount: 100, date: '2026-10-01' }),
        tx({ id: '3', kind: 'trasferimento', amount: 20, date: '2026-10-03', category: 'Trasferimento', toAccountId: 'card' }),
      ],
    });
    expect(csv.split('\n')).toEqual([
      'Data;Tipo;Conto;Conto di arrivo;Categoria;Descrizione;Importo',
      '2026-10-01;entrata;Banca;;Altro;;100,00',
      '2026-10-02;uscita;Banca;;Spesa;"pane; latte";-10,50',
      '2026-10-03;trasferimento;Banca;Carta;Trasferimento;;20,00',
    ]);
  });
});

describe('unione dei dati tra dispositivi', () => {
  const base = (patch: Partial<Data>): Data => ({ ...normalize({}), ...patch });

  it('tiene i record di entrambi e la versione modificata più di recente', () => {
    const phone = base({
      accounts: [account({ id: DEFAULT_ACCOUNT_ID, initialBalance: 500, updatedAt: 10 })],
      transactions: [tx({ id: 'a', kind: 'uscita', amount: 5, date: '2026-10-01', updatedAt: 1 }), tx({ id: 'shared', kind: 'uscita', amount: 1, date: '2026-10-01', updatedAt: 5 })],
    });
    const pc = base({
      transactions: [tx({ id: 'b', kind: 'entrata', amount: 9, date: '2026-10-02', updatedAt: 2 }), tx({ id: 'shared', kind: 'uscita', amount: 2, date: '2026-10-01', updatedAt: 7 })],
    });
    const merged = merge(phone, pc);
    expect(merged.transactions.map((t) => t.id).sort()).toEqual(['a', 'b', 'shared']);
    expect(merged.transactions.find((t) => t.id === 'shared')!.amount).toBe(2);
    // il conto principale modificato sul telefono vince su quello mai toccato del computer
    expect(merged.accounts).toHaveLength(1);
    expect(merged.accounts[0].initialBalance).toBe(500);
  });

  it('propaga le eliminazioni, salvo modifiche successive', () => {
    const a = base({ transactions: [tx({ id: 'x', kind: 'uscita', amount: 1, date: '2026-10-01', updatedAt: 1 }), tx({ id: 'y', kind: 'uscita', amount: 1, date: '2026-10-01', updatedAt: 9 })] });
    const b = base({ transactions: [], deleted: { x: 5, y: 5 } });
    const merged = merge(a, b);
    expect(merged.transactions.map((t) => t.id)).toEqual(['y']);
    expect(merged.deleted).toEqual({ x: 5, y: 5 });
  });

  it('è commutativa e idempotente', () => {
    const a = base({ transactions: [tx({ id: 'x', kind: 'uscita', amount: 1, date: '2026-10-01', updatedAt: 3 })], deleted: { z: 4 } });
    const b = base({ transactions: [tx({ id: 'x', kind: 'uscita', amount: 2, date: '2026-10-01', updatedAt: 3 }), tx({ id: 'z', kind: 'uscita', amount: 1, date: '2026-10-01', updatedAt: 1 })] });
    const ab = merge(a, b);
    expect(sameData(ab, merge(b, a))).toBe(true);
    expect(sameData(merge(ab, b), ab)).toBe(true);
    expect(ab.transactions.map((t) => t.id)).toEqual(['x']);
  });
});
