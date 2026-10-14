import { describe, expect, it } from 'vitest';
import {
  addMonths,
  emptyData,
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
import type { Data, Planned, Recurring } from './types';

const rent: Recurring = { id: 'r1', kind: 'uscita', name: 'Affitto', amount: 700, category: 'Casa', day: 5, active: true };
const salary: Recurring = { id: 'r2', kind: 'entrata', name: 'Stipendio', amount: 1800, category: 'Stipendio', day: 27, active: true };
const netflix: Recurring = { id: 'r3', kind: 'uscita', name: 'Netflix', amount: 13.99, category: 'Abbonamenti', day: 31, active: false };

const plan = (p: Partial<Planned>): Planned => ({ id: 'p', name: 'x', cost: 100, saved: 0, priority: 'media', category: 'Altro', notes: '', ...p });

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
    transactions: [
      { id: 't1', kind: 'entrata', amount: 1800, date: '2026-10-01', category: 'Stipendio', description: '', recurringId: 'r2' },
      { id: 't2', kind: 'uscita', amount: 80.4, date: '2026-10-03', category: 'Spesa', description: '' },
      { id: 't3', kind: 'uscita', amount: 19.6, date: '2026-10-09', category: 'Spesa', description: '' },
      { id: 't4', kind: 'uscita', amount: 50, date: '2026-10-10', category: 'Svago', description: '' },
      { id: 't5', kind: 'uscita', amount: 999, date: '2026-09-30', category: 'Svago', description: '' },
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

  it('calcola il saldo complessivo fino a una data', () => {
    expect(totalBalance(data.transactions, '2026-09-30')).toBe(-999);
    expect(totalBalance(data.transactions)).toBe(651);
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

  it('esporta CSV con importi con segno e campi protetti', () => {
    const csv = toCsv([
      { id: '1', kind: 'uscita', amount: 10.5, date: '2026-10-02', category: 'Spesa', description: 'pane; latte' },
      { id: '2', kind: 'entrata', amount: 100, date: '2026-10-01', category: 'Altro', description: '' },
    ]);
    expect(csv.split('\n')).toEqual([
      'Data;Tipo;Categoria;Descrizione;Importo',
      '2026-10-01;entrata;Altro;;100,00',
      '2026-10-02;uscita;Spesa;"pane; latte";-10,50',
    ]);
  });
});
