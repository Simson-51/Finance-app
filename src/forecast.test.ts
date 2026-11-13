import { describe, expect, it } from 'vitest';
import { accountBalance, categoriesFor, emptyData, forecast, macroOf, macroSummary, merge, sameData, monthSummary, normalize, overdueRecurring, reconcileTopUps, scheduledEvents, topUpId } from './finance';
import type { Account, Data, Planned, Recurring, Transaction } from './types';

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

describe('giorno dello stipendio', () => {
  it('trova il prossimo stipendio e lo adatta ai mesi corti', async () => {
    const { nextPayday, dayBefore } = await import('./finance');
    expect(nextPayday(15, '2026-10-14')).toBe('2026-10-15');
    expect(nextPayday(15, '2026-10-15')).toBe('2026-11-15');
    expect(nextPayday(31, '2026-02-10')).toBe('2026-02-28');
    expect(nextPayday(15, '2026-12-20')).toBe('2027-01-15');
    expect(dayBefore('2026-11-01')).toBe('2026-10-31');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
  });

  it('gli avvisi guardano solo i pagamenti prima dello stipendio', () => {
    const d = data({
      accounts: [account({ id: 'bank', initialBalance: 100 })],
      transactions: [
        tx({ id: 'a', kind: 'uscita', amount: 80, date: '2026-10-20', accountId: 'bank' }),
        tx({ id: 'b', kind: 'uscita', amount: 80, date: '2026-11-16', accountId: 'bank' }),
      ],
    });
    // fino al 14/11 (stipendio il 15): basta
    expect(forecast(d, '2026-10-16', '2026-11-14').accounts.bank.shortfall).toBe(0);
    // con l'orizzonte lungo si vedrebbe anche la spesa del 16/11
    expect(forecast(d, '2026-10-16').accounts.bank.shortfall).toBe(60);
  });
});

describe('flussi del mese (Sankey)', () => {
  it('bilancia entrate e uscite con risparmio o prelievo dai risparmi', async () => {
    const { monthFlows } = await import('./finance');
    const d = data({
      transactions: [
        tx({ id: '1', kind: 'entrata', amount: 1500, date: '2026-10-01', accountId: 'x', category: 'Stipendio' }),
        tx({ id: '2', kind: 'uscita', amount: 700, date: '2026-10-02', accountId: 'x', category: 'Casa' }),
        tx({ id: '3', kind: 'uscita', amount: 100, date: '2026-10-03', accountId: 'x', category: 'Spesa' }),
        tx({ id: '4', kind: 'trasferimento', amount: 50, date: '2026-10-03', accountId: 'x', toAccountId: 'y' }),
        tx({ id: '5', kind: 'uscita', amount: 900, date: '2026-10-20', accountId: 'x', category: 'Viaggi' }),
      ],
    });
    const now = monthFlows(d, '2026-10', false, TODAY);
    expect(now).toEqual({
      incomes: [{ label: 'Stipendio', amount: 1500 }],
      expenses: [
        { label: 'Casa', amount: 700 },
        { label: 'Spesa', amount: 100 },
      ],
      saved: 700,
      fromSavings: 0,
      total: 1500,
    });
    const withFuture = monthFlows(d, '2026-10', true, TODAY);
    expect(withFuture.saved).toBe(0);
    expect(withFuture.fromSavings).toBe(200);
    expect(withFuture.total).toBe(1700);
  });

  it('raggruppa le categorie più piccole', async () => {
    const { monthFlows } = await import('./finance');
    const cats = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const d = data({ transactions: cats.map((c, i) => tx({ id: c, kind: 'uscita', amount: 100 - i, date: '2026-10-01', accountId: 'x', category: c })) });
    const f = monthFlows(d, '2026-10', false, TODAY);
    expect(f.expenses.map((e) => e.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'Altre spese']);
    expect(f.expenses.at(-1)!.amount).toBe(94 + 93 + 92);
  });
});

describe('primo addebito delle voci mensili', () => {
  it('una spesa del giorno 1 creata il 15 parte dal mese dopo', async () => {
    const { defaultStartMonth, recurringStart } = await import('./finance');
    expect(defaultStartMonth(1, '2026-10-15')).toBe('2026-11');
    expect(defaultStartMonth(15, '2026-10-15')).toBe('2026-10');
    expect(defaultStartMonth(31, '2026-02-28')).toBe('2026-02');
    // voce creata prima dell'opzione: si deduce dall'ultima modifica
    expect(recurringStart(rec({ id: 'g', amount: 70, day: 1, updatedAt: new Date('2026-10-15T09:00:00').getTime() }))).toBe('2026-11');
    expect(recurringStart(rec({ id: 'g', amount: 70, day: 1, startMonth: '2026-10' }))).toBe('2026-10');
  });

  it('il garage aggiunto oggi non viene contato come scaduto a ottobre', () => {
    const d = data({
      accounts: [account({ id: 'hype', initialBalance: 100 })],
      recurring: [rec({ id: 'garage', amount: 70, day: 1, accountId: 'hype', startMonth: '2026-11' })],
    });
    const events = scheduledEvents(d, '2026-10-15', '2026-11-14');
    expect(events.map((e) => e.date)).toEqual(['2026-11-01']);
    expect(monthSummary(d, '2026-10', '2026-10-15').pendingExpenses).toBe(0);
    expect(monthSummary(d, '2026-11', '2026-10-15').pendingExpenses).toBe(70);
    expect(forecast(d, '2026-10-15', '2026-11-14').accounts.hype.end).toBe(30);
  });

  it('il dettaglio elenca i passaggi con il saldo dopo ciascuno e segnala le voci scadute', () => {
    const d = data({
      accounts: [account({ id: 'hype', name: 'Hype', initialBalance: 50 }), account({ id: 'sp', name: 'Satispay', minBalance: 75, topUpFrom: 'hype' })],
      recurring: [rec({ id: 'netflix', name: 'Netflix', amount: 13, day: 3, accountId: 'hype', startMonth: '2026-10' })],
      transactions: [tx({ id: 'w', kind: 'entrata', amount: 20, date: '2026-10-20', accountId: 'hype', description: 'Rimborso' })],
    });
    const steps = forecast(d, '2026-10-15', '2026-11-14').accounts.hype.steps;
    expect(steps.map((s) => [s.date, s.label, s.amount, s.balance, s.overdue])).toEqual([
      ['2026-10-15', 'Netflix', -13, 37, '2026-10-03'],
      ['2026-10-15', 'Ricarica Satispay (budget 75,00\u00a0€)', -75, -38, undefined],
      ['2026-10-20', 'Rimborso', 20, -18, undefined],
      ['2026-11-03', 'Netflix', -13, -31, undefined],
    ]);
  });
});

describe('frequenza e rate', () => {
  it('una voce trimestrale conta solo ogni 3 mesi e le rate finiscono', async () => {
    const { recurringDue, endMonthFor, installmentNumber, installmentsTotal, nextDueMonth } = await import('./finance');
    const assic = rec({ id: 'a', amount: 120, day: 5, startMonth: '2026-11', everyMonths: 3 });
    expect(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].map((m) => recurringDue(assic, m))).toEqual([false, true, false, false, true]);
    expect(nextDueMonth(assic, '2026-12')).toBe('2027-02');

    const dentista = rec({ id: 'd', amount: 62.5, day: 10, startMonth: '2026-10', endMonth: endMonthFor('2026-10', 1, 4) });
    expect(dentista.endMonth).toBe('2027-01');
    expect(installmentsTotal(dentista)).toBe(4);
    expect(installmentNumber(dentista, '2026-12')).toBe(3);
    expect(recurringDue(dentista, '2027-01')).toBe(true);
    expect(recurringDue(dentista, '2027-02')).toBe(false);
    expect(nextDueMonth(dentista, '2027-02')).toBeUndefined();
  });

  it('le previsioni seguono la cadenza', () => {
    const d = data({
      accounts: [account({ id: 'bank', initialBalance: 1000 })],
      recurring: [rec({ id: 'bim', amount: 100, day: 20, accountId: 'bank', startMonth: '2026-09', everyMonths: 2 })],
    });
    // settembre, novembre, gennaio: tra il 15/10 e il 31/01 cadono 20/11 e 20/01;
    // settembre non è stata registrata, quindi conta come scaduta e dovuta oggi
    expect(scheduledEvents(d, '2026-10-15', '2027-01-31').map((e) => [e.date, e.overdue])).toEqual([
      ['2026-10-15', '2026-09-20'],
      ['2026-11-20', undefined],
      ['2027-01-20', undefined],
    ]);
    const paid = { ...d, transactions: [tx({ id: 'p', kind: 'uscita', amount: 100, date: '2026-09-20', accountId: 'bank', recurringId: 'bim' })] };
    expect(scheduledEvents(paid, '2026-10-15', '2027-01-31').map((e) => e.date)).toEqual(['2026-11-20', '2027-01-20']);
    expect(overdueRecurring(d, '2026-10-15').map((o) => o.date)).toEqual(['2026-09-20']);
    // oltre tre mesi indietro non si guarda più
    expect(overdueRecurring(d, '2027-02-15').map((o) => o.date)).toEqual(['2026-11-20', '2027-01-20']);
  });
});

describe('registrazione automatica alla scadenza', () => {
  it('registra le voci scadute una sola volta e rispetta la spunta tolta', async () => {
    const { reconcileAutoPay, autoPayId, recurringPayment } = await import('./finance');
    const base = data({
      accounts: [account({ id: 'hype' })],
      recurring: [
        rec({ id: 'spotify', name: 'Spotify', amount: 11.99, day: 10, accountId: 'hype', startMonth: '2026-08', autoPay: true }),
        rec({ id: 'garage', name: 'Garage', amount: 70, day: 1, accountId: 'hype', startMonth: '2026-11', autoPay: true }),
        rec({ id: 'manuale', amount: 5, day: 1, accountId: 'hype', startMonth: '2026-10' }),
      ],
    });
    const d = reconcileAutoPay(base, '2026-10-15', 1);
    // agosto, settembre e ottobre per Spotify (non oltre 3 mesi indietro); il garage parte a novembre
    expect(d.transactions.map((t) => t.id).sort()).toEqual(['autopay-spotify-2026-08', 'autopay-spotify-2026-09', 'autopay-spotify-2026-10']);
    expect(recurringPayment(d.transactions, d.recurring[0], '2026-10')).toMatchObject({ date: '2026-10-10', amount: 11.99, accountId: 'hype' });
    expect(reconcileAutoPay(d, '2026-10-15', 2)).toBe(d);

    // il garage viene registrato il giorno dell'addebito
    const nov = reconcileAutoPay(d, '2026-11-01', 3);
    expect(nov.transactions.some((t) => t.id === autoPayId('garage', '2026-11'))).toBe(true);

    // spunta tolta (eliminazione) → non viene ricreato
    const untick = { ...d, transactions: d.transactions.filter((t) => t.id !== autoPayId('spotify', '2026-10')), deleted: { [autoPayId('spotify', '2026-10')]: 5 } };
    expect(reconcileAutoPay(untick, '2026-10-15', 6)).toBe(untick);
  });

  it('un pagamento automatico spostato in un altro mese resta legato al suo mese', async () => {
    const { reconcileAutoPay, recurringPayment } = await import('./finance');
    const spotify = rec({ id: 'spotify', amount: 11.99, day: 10, accountId: 'hype', startMonth: '2026-10', autoPay: true });
    const d = reconcileAutoPay(data({ accounts: [account({ id: 'hype' })], recurring: [spotify] }), '2026-10-15', 1);
    // pagato in anticipo: la data passa al 30 settembre
    const moved = { ...d, transactions: d.transactions.map((t) => ({ ...t, date: '2026-09-30' })) };
    expect(recurringPayment(moved.transactions, spotify, '2026-10')?.id).toBe('autopay-spotify-2026-10');
    expect(recurringPayment(moved.transactions, spotify, '2026-09')).toBeUndefined();
    // niente doppione con lo stesso id
    expect(reconcileAutoPay(moved, '2026-10-15', 2)).toBe(moved);
  });
});

describe('andamento del saldo', () => {
  it('ricostruisce il saldo giorno per giorno e aggiunge la previsione', async () => {
    const { balanceSeries } = await import('./finance');
    const d = data({
      accounts: [account({ id: 'a', initialBalance: 100 }), account({ id: 'b', initialBalance: 50 })],
      transactions: [
        tx({ id: '1', kind: 'entrata', amount: 1000, date: '2026-10-12', accountId: 'a' }),
        tx({ id: '2', kind: 'uscita', amount: 30, date: '2026-10-13', accountId: 'b' }),
        tx({ id: '3', kind: 'trasferimento', amount: 500, date: '2026-10-13', accountId: 'a', toAccountId: 'b' }),
        tx({ id: '4', kind: 'uscita', amount: 200, date: '2026-10-17', accountId: 'a' }),
      ],
    });
    const s = balanceSeries(d, '2026-10-01', '2026-10-14', '2026-10-18');
    expect(s.map((p) => [p.date.slice(8), p.balance, !!p.projected])).toEqual([
      ['11', 150, false],
      ['12', 1150, false],
      ['13', 1120, false],
      ['14', 1120, false],
      ['15', 1120, true],
      ['16', 1120, true],
      ['17', 920, true],
      ['18', 920, true],
    ]);
  });
});

describe('promemoria', () => {
  it('riassume i pagamenti di domani, le voci scadute e gli avvisi', async () => {
    const { buildReminder } = await import('./notify');
    const d = data({
      accounts: [account({ id: 'hype', name: 'Hype', initialBalance: 50 })],
      recurring: [
        rec({ id: 'garage', name: 'Garage', amount: 70, day: 1, accountId: 'hype', startMonth: '2026-11' }),
        rec({ id: 'spotify', name: 'Spotify', amount: 11.99, day: 10, accountId: 'hype', startMonth: '2026-10' }),
      ],
    });
    const r = buildReminder(d, 15, '2026-10-31')!;
    expect(r.title).toBe('Attenzione ai conti');
    expect(r.lines[0]).toMatch(/^Da registrare: Spotify −11,99/);
    expect(r.lines[1]).toMatch(/^Domani: Garage −70,00/);
    expect(r.lines[2]).toMatch(/^⚠️ Hype: mancano/);
    expect(buildReminder(data({ accounts: [account({ id: 'x', initialBalance: 10 })] }), 15, '2026-10-31')).toBeNull();
  });
});

describe('spese sicure', () => {
  const plan = (p: Partial<Planned> & Pick<Planned, 'id' | 'name' | 'cost'>): Planned => ({
    saved: 0,
    priority: 'media',
    category: 'Altro',
    notes: '',
    updatedAt: 0,
    committed: true,
    ...p,
  });
  const base = (planned: Planned[], hype = 600) =>
    data({ accounts: [account({ id: 'hype', name: 'Hype', initialBalance: hype }), account({ id: 'amz', name: 'Carta Amazon', initialBalance: 100 })], planned });

  it('calcola impegnati per conto e senza conto, escludendo desideri e già pagate', async () => {
    const { commitments } = await import('./finance');
    const c = commitments(
      base([
        plan({ id: 'debito', name: 'Debito con i miei', cost: 500 }),
        plan({ id: 'switch', name: 'Switch 2', cost: 469.99, accountId: 'amz' }),
        plan({ id: 'pagata', name: 'Vecchia', cost: 50, accountId: 'hype', boughtDate: '2026-10-01' }),
        plan({ id: 'desiderio', name: 'Bici', cost: 300, committed: undefined }),
      ]),
    );
    expect(c.total).toBe(969.99);
    expect(c.byAccount).toEqual({ amz: 469.99 });
    expect(c.unassignedTotal).toBe(500);
  });

  it('con un conto contano da subito se senza data, oppure alla data prevista', () => {
    const d = base([
      plan({ id: 'switch', name: 'Switch 2', cost: 469.99, accountId: 'amz' }),
      plan({ id: 'cuffie', name: 'Cuffie', cost: 80, accountId: 'hype', targetDate: '2026-10-25' }),
      plan({ id: 'dopo', name: 'Dopo lo stipendio', cost: 80, accountId: 'hype', targetDate: '2026-11-20' }),
    ]);
    const fc = forecast(d, '2026-10-15', '2026-11-14');
    expect(fc.accounts.amz.shortfall).toBe(369.99);
    expect(fc.accounts.amz.steps[0]).toMatchObject({ date: '2026-10-15', committed: true, undated: true });
    expect(fc.accounts.hype.steps.map((s) => [s.date, s.label])).toEqual([['2026-10-25', 'Cuffie']]);
    // la previsione di fine mese conta anche quella senza data (da pagare da subito)
    expect(monthSummary(d, '2026-10', '2026-10-15').pendingExpenses).toBe(549.99);
    expect(monthSummary(d, '2026-11', '2026-10-15').pendingExpenses).toBe(80);
  });

  it('quelle senza conto avvisano quando quello che resta su tutti i conti non basta', () => {
    const ok = forecast(base([plan({ id: 'debito', name: 'Debito', cost: 500 })]), '2026-10-15', '2026-11-14');
    expect(ok.unassigned).toMatchObject({ total: 500, available: 700, shortfall: 0 });
    const short = forecast(base([plan({ id: 'debito', name: 'Debito', cost: 500 })], 300), '2026-10-15', '2026-11-14');
    expect(short.unassigned).toMatchObject({ total: 500, available: 400, shortfall: 100 });
    // con data oltre lo stipendio non conta ancora
    const later = forecast(base([plan({ id: 'debito', name: 'Debito', cost: 500, targetDate: '2026-12-01' })], 300), '2026-10-15', '2026-11-14');
    expect(later.unassigned.shortfall).toBe(0);
  });
});

describe('categorie personalizzate', () => {
  const cat = (kind: 'entrata' | 'uscita', name: string, updatedAt = 1) => ({ id: `cat-${kind}-${name.toLowerCase()}`, kind, name, updatedAt });

  it('si aggiungono a quelle predefinite, con "Altro" in fondo e senza doppioni', () => {
    const list = categoriesFor([cat('uscita', 'Palestra'), cat('uscita', 'spesa'), cat('entrata', 'Welfare')], 'uscita');
    expect(list.slice(-2)).toEqual(['Palestra', 'Altro']);
    expect(list.filter((c) => c.toLowerCase() === 'spesa')).toEqual(['Spesa']);
    expect(categoriesFor([], 'uscita', 'Vecchia')[0]).toBe('Vecchia');
  });

  it('i dati salvati prima delle categorie restano validi e si uniscono', () => {
    const old = normalize({ version: 2, accounts: [account({ id: 'a' })], transactions: [], recurring: [], planned: [], deleted: {} } as never);
    expect(old.categories).toEqual([]);
    const merged = merge(old, { ...old, categories: [cat('uscita', 'Palestra')] });
    expect(merged.categories.map((c) => c.name)).toEqual(['Palestra']);
    expect(merged.accounts).toHaveLength(1);
  });
});

describe('bisogni, desideri, risparmio', () => {
  const d = data({
    accounts: [account({ id: 'hype', initialBalance: 1000 }), account({ id: 'salvadanaio', type: 'risparmio' })],
    categories: [{ id: 'cat-uscita-palestra', kind: 'uscita', name: 'Palestra', macro: 'bisogni', updatedAt: 1 }],
    recurring: [rec({ id: 'netflix', amount: 14, day: 20, category: 'Abbonamenti', accountId: 'hype', startMonth: '2026-10' })],
    transactions: [
      tx({ id: 'a', kind: 'uscita', amount: 60, date: '2026-10-02', accountId: 'hype', category: 'Spesa' }),
      tx({ id: 'b', kind: 'uscita', amount: 30, date: '2026-10-03', accountId: 'hype', category: 'Ristoranti' }),
      tx({ id: 'c', kind: 'uscita', amount: 40, date: '2026-10-04', accountId: 'hype', category: 'Palestra' }),
      tx({ id: 'd', kind: 'trasferimento', amount: 100, date: '2026-10-05', accountId: 'hype', toAccountId: 'salvadanaio', category: 'Trasferimento' }),
      tx({ id: 'e', kind: 'uscita', amount: 25, date: '2026-10-06', accountId: 'hype', category: 'Da classificare', adjustment: true }),
      tx({ id: 'f', kind: 'uscita', amount: 20, date: '2026-10-28', accountId: 'hype', category: 'Svago' }),
    ],
  });

  it('assegna ogni categoria alla sua macro-categoria, con le scelte dell\'utente', () => {
    expect(macroOf([], 'Spesa')).toBe('bisogni');
    expect(macroOf([], 'Ristoranti')).toBe('desideri');
    expect(macroOf([], 'Categoria nuova')).toBe('desideri');
    expect(macroOf(d.categories, 'Palestra')).toBe('bisogni');
    expect(macroOf([], 'Da classificare')).toBeNull();
  });

  it('somma lo speso e il previsto del mese, compresi i trasferimenti ai risparmi', () => {
    const m = macroSummary(d, '2026-10', TODAY);
    expect(m.spent).toEqual({ bisogni: 100, desideri: 30, risparmio: 100 });
    // Netflix non ancora registrata e lo svago con data futura
    expect(m.pending.desideri).toBe(34);
    expect(m.unclassified).toBe(25);
    expect(m.wants).toBeNull();
  });

  it('avvisa quando il budget dei desideri sta per essere raggiunto o è superato', () => {
    const withBudget = (wantsBudget: number) => macroSummary({ ...d, settings: { wantsBudget, updatedAt: 1 } }, '2026-10', TODAY).wants;
    expect(withBudget(200)).toMatchObject({ total: 64, left: 136, state: 'ok' });
    expect(withBudget(80)).toMatchObject({ left: 16, state: 'near' });
    expect(withBudget(50)).toMatchObject({ left: -14, state: 'over' });
  });

  it('le impostazioni si uniscono tra dispositivi: vince la più recente', () => {
    const a = { ...d, settings: { wantsBudget: 100, updatedAt: 1 } };
    const b = { ...d, settings: { wantsBudget: 250, updatedAt: 2 } };
    expect(merge(a, b).settings?.wantsBudget).toBe(250);
    expect(merge(b, a).settings?.wantsBudget).toBe(250);
    expect(merge(d, b).settings?.wantsBudget).toBe(250);
    expect(sameData(a, b)).toBe(false);
    expect(normalize(JSON.parse(JSON.stringify(b))).settings?.wantsBudget).toBe(250);
  });
});
