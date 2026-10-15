/** Tipo di una voce con categoria (movimenti, voci mensili). */
export type Kind = 'entrata' | 'uscita';

/** Tipo di un movimento: oltre a entrate e uscite, i trasferimenti tra due conti. */
export type TxKind = Kind | 'trasferimento';

/**
 * Ogni record porta `updatedAt` (ms): quando due dispositivi si sincronizzano
 * vince la versione modificata più di recente.
 */
interface Synced {
  id: string;
  updatedAt: number;
}

export type AccountType = 'conto' | 'carta' | 'contanti' | 'risparmio';

/** Conto corrente, carta, contanti o deposito, con il saldo da cui si parte. */
export interface Account extends Synced {
  name: string;
  type: AccountType;
  /** Saldo del conto prima di tutti i movimenti registrati nell'app. */
  initialBalance: number;
  /** I conti archiviati non compaiono nei moduli ma restano nello storico. */
  archived: boolean;
  /**
   * Budget minimo (es. Satispay): quando il saldo scende sotto questa cifra il conto
   * viene ricaricato da `topUpFrom` fino a tornare al budget.
   */
  minBalance?: number;
  /** Conto da cui prelevare le ricariche. */
  topUpFrom?: string;
  /** true: l'app registra da sola la ricarica; false: la propone con un tasto. */
  autoTopUp?: boolean;
}

/** Un movimento reale: soldi entrati, usciti o spostati tra conti in una certa data. */
export interface Transaction extends Synced {
  kind: TxKind;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  category: string;
  description: string;
  /** Conto su cui avviene il movimento (per i trasferimenti: il conto di partenza). */
  accountId: string;
  /** Solo per i trasferimenti: il conto di arrivo. */
  toAccountId?: string;
  /** Presente se il movimento registra il pagamento di una voce mensile. */
  recurringId?: string;
  /** Presente se il movimento registra un acquisto in programma completato. */
  plannedId?: string;
  /** Ricarica registrata automaticamente per mantenere il budget minimo di un conto. */
  autoTopUp?: boolean;
}

/** Voce che si ripete ogni mese (affitto, bollette, abbonamenti, stipendio...). */
export interface Recurring extends Synced {
  kind: Kind;
  name: string;
  amount: number;
  category: string;
  /** Giorno del mese previsto (1-31). */
  day: number;
  active: boolean;
  /** Primo mese (YYYY-MM) in cui la voce è dovuta: i mesi precedenti non la contano. */
  startMonth?: string;
  /** Ogni quanti mesi si ripete (1 = ogni mese, 3 = trimestrale, 12 = annuale). */
  everyMonths?: number;
  /** Ultimo mese (YYYY-MM) in cui è dovuta, per le rate; assente = senza fine. */
  endMonth?: string;
  /** Registra da sola il pagamento/incasso alla scadenza, senza spuntarla. */
  autoPay?: boolean;
  /** Conto su cui registrare il movimento; se assente si usa il primo conto. */
  accountId?: string;
}

export type Priority = 'alta' | 'media' | 'bassa';

/** Acquisto che si vuole fare in futuro, con eventuale somma già messa da parte. */
export interface Planned extends Synced {
  name: string;
  cost: number;
  saved: number;
  priority: Priority;
  /** Categoria usata per l'uscita quando l'acquisto viene fatto. */
  category: string;
  /** YYYY-MM-DD, facoltativa */
  targetDate?: string;
  notes: string;
  /** YYYY-MM-DD in cui è stato acquistato; assente se ancora da fare. */
  boughtDate?: string;
}

export interface Data {
  version: 2;
  accounts: Account[];
  transactions: Transaction[];
  recurring: Recurring[];
  planned: Planned[];
  /** Record eliminati (id → momento dell'eliminazione), per propagare le eliminazioni tra dispositivi. */
  deleted: Record<string, number>;
}

export type Collection = 'accounts' | 'transactions' | 'recurring' | 'planned';
