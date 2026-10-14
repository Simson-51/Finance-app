import { describe, expect, it } from 'vitest';
import { accountBalance, emptyData, forecast, monthSummary, reconcileTopUps, scheduledEvents, topUpId } from './finance';
import type { Account, Data, Recurring, Transaction } from './types';

const TODAY = '2026-10-14';

const account = (a: Partial<Account> & Pick<Account, 'id'>): Account => ({
  name: a.id,
  type: 'conto',
  initialBalance: 0,
  archived: false,
  updatedAt: 0,
  ...a,
});

const tx = (t: Partial<Transaction> & Pick<Transaction, 'id' | 'kind' | 'amount' | 'date' | 'accountId'>): Transaction => ({
  category: 'Altro',
  description: '',
  updatedAt: 0,
  ...t,
});

const rec = (r: Partial<Recurring> & Pick<Recurring, 'id' | 'amount' | 'day'>): Recurring => ({
  kind: 'uscita',
  name: r.id,
  category: 'Bollette',
  active: true,
  updatedAt: 0,
  ...r,
});

const data = (patch: Partial<Data>): Data => ({ ...emptyData(), ...patch });

describe('movimenti previsti', () => {
  const d = data({
    accounts: [account({ id: 'hype', initialBalance: 100 }), account({ id: 'welfare' })],
    transactions: [
      tx({ id: 'w', kind: 'entrata', amount: 500, date: '2026-10-20', accountId: 'welfare', description: 'Welfare' }),
      tx({ id: 's', kind: 'uscita', amount: 30, date: '2026-10-10', accountId: 'hype' }),
      tx({ id: 'f', kind: 'uscita', amount: 200, date: '2026-10-25', accountId: 'welfare' }),
    ],
  });

  it('non cambiano il saldo di oggi', () => {
    expect(accountBalance(d, d.accounts[1], TODAY)).toBe(0);
    expect(accountBalance(d, d.accounts[1], '2026-10-31')).toBe(300);
  });

  it('nel riepilogo del mese finiscono tra i previsti', () => {
    const s = monthSummary(d, '2026-10', TODAY);
    expect(s.income).toBe(0);
    expect(s.expenses).toBe(30);
    expect(s.pendingIncome).toBe(500);
    expect(s.pendingExpenses).toBe(200);
    expect(s.forecast).toBe(270);
  });

  it('una spesa pagata col welfare prima che arrivi fa scattare l’avviso, che sparisce se arriva prima', () => {
    const early = data({ ...d, transactions: [...d.transactions, tx({ id: 'e', kind: 'uscita', amount: 50, date: '2026-10-18', accountId: 'welfare' })] });
    const f = forecast(early, TODAY).accounts.welfare;
    expect(f.shortfall).toBe(50);
    expect(f.shortDate).toBe('2026-10-18');

    const fine = forecast(d, TODAY).accounts.welfare;
    expect(fine.shortfall).toBe(0);
    expect(fine.end).toBe(300);
  });
});

describe('avviso soldi insufficienti', () => {
  it('considera le voci mensili non pagate, anche quelle scadute, e le entrate previste', () => {
    const d = data({
      accounts: [account({ id: 'bank', initialBalance: 600 })],
      recurring: [rec({ id: 'affitto', amount: 700, day: 5, accountId: 'bank' }), rec({ id: 'stipendio', kind: 'entrata', amount: 1500, day: 27, accountId: 'bank' })],
    });
    const events = scheduledEvents(d, TODAY);
    // affitto di ottobre (scaduto → oggi), stipendio 27/10, affitto 5/11, stipendio 27/11
    expect(events.map((e) => `${e.date}:${e.label}`)).toEqual([
      '2026-10-14:affitto',
      '2026-10-27:stipendio',
      '2026-11-05:affitto',
      '2026-11-27:stipendio',
    ]);
    const f = forecast(d, TODAY).accounts.bank;
    expect(f.shortfall).toBe(100);
    expect(f.shortDate).toBe(TODAY);
    expect(f.end).toBe(2200);
  });

  it('sparisce quando i soldi bastano', () => {
    const d = data({
      accounts: [account({ id: 'bank', initialBalance: 700 })],
      recurring: [rec({ id: 'affitto', amount: 700, day: 20, accountId: 'bank' })],
      transactions: [tx({ id: 'stip', kind: 'entrata', amount: 700, date: '2026-11-01', accountId: 'bank' })],
    });
    expect(forecast(d, TODAY).accounts.bank.shortfall).toBe(0);
  });

  it('per un conto in negativo dall’inizio (carta di credito) segnala solo il peggioramento', () => {
    const d = data({ accounts: [account({ id: 'cc', type: 'carta', initialBalance: -300 })] });
    expect(forecast(d, TODAY).accounts.cc.shortfall).toBe(0);
    const worse = data({ ...d, transactions: [tx({ id: 'x', kind: 'uscita', amount: 50, date: '2026-10-20', accountId: 'cc' })] });
    expect(forecast(worse, TODAY).accounts.cc.shortfall).toBe(50);
  });
});

describe('budget minimo e ricariche', () => {
  const base = (auto: boolean, satispay = 40) =>
    data({
      accounts: [account({ id: 'hype', initialBalance: 100 }), account({ id: 'sp', initialBalance: satispay, minBalance: 75, topUpFrom: 'hype', autoTopUp: auto })],
    });

  it('in modalità manuale propone la ricarica che riporta al budget', () => {
    const fc = forecast(base(false), TODAY);
    expect(fc.topUps).toEqual([{ accountId: 'sp', fromId: 'hype', amount: 35 }]);
    // la ricarica è già considerata nelle previsioni di entrambi i conti
    expect(fc.accounts.sp.end).toBe(75);
    expect(fc.accounts.hype.end).toBe(65);
  });

  it('in modalità automatica registra la ricarica di oggi e la aggiorna dopo ogni spesa', () => {
    let d = reconcileTopUps(base(true), TODAY, 1);
    const id = topUpId('sp', TODAY);
    expect(d.transactions).toEqual([
      expect.objectContaining({ id, kind: 'trasferimento', amount: 35, accountId: 'hype', toAccountId: 'sp', autoTopUp: true }),
    ]);
    expect(accountBalance(d, d.accounts[1], TODAY)).toBe(75);
    expect(reconcileTopUps(d, TODAY, 2)).toBe(d);

    d = { ...d, transactions: [...d.transactions, tx({ id: 'caffe', kind: 'uscita', amount: 1.5, date: TODAY, accountId: 'sp' })] };
    d = reconcileTopUps(d, TODAY, 3);
    expect(d.transactions.find((t) => t.id === id)!.amount).toBe(36.5);
    expect(forecast(d, TODAY).topUps).toEqual([]);
  });

  it('azzera la ricarica se non serve più e rispetta quella eliminata a mano', () => {
    let d = reconcileTopUps(base(true), TODAY, 1);
    d = { ...d, accounts: d.accounts.map((a) => (a.id === 'sp' ? { ...a, initialBalance: 90 } : a)) };
    d = reconcileTopUps(d, TODAY, 2);
    expect(d.transactions[0].amount).toBe(0);

    const deleted = { ...base(true), deleted: { [topUpId('sp', TODAY)]: 5 } };
    expect(reconcileTopUps(deleted, TODAY)).toBe(deleted);
  });

  it('nelle previsioni ricarica il conto anche per le spese future, pesando sul conto di origine', () => {
    const d = data({
      accounts: [account({ id: 'hype', initialBalance: 20 }), account({ id: 'sp', initialBalance: 75, minBalance: 75, topUpFrom: 'hype', autoTopUp: true })],
      transactions: [tx({ id: 'cena', kind: 'uscita', amount: 50, date: '2026-10-22', accountId: 'sp' })],
    });
    const fc = forecast(d, TODAY);
    expect(fc.accounts.sp.shortfall).toBe(0);
    expect(fc.accounts.hype.shortfall).toBe(30);
    expect(fc.accounts.hype.shortDate).toBe('2026-10-22');
  });
});
