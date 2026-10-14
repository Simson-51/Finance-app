export type Kind = 'entrata' | 'uscita';

/** Un movimento reale: soldi entrati o usciti in una certa data. */
export interface Transaction {
  id: string;
  kind: Kind;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  category: string;
  description: string;
  /** Presente se il movimento registra il pagamento di una voce mensile. */
  recurringId?: string;
  /** Presente se il movimento registra un acquisto in programma completato. */
  plannedId?: string;
}

/** Voce che si ripete ogni mese (affitto, bollette, abbonamenti, stipendio...). */
export interface Recurring {
  id: string;
  kind: Kind;
  name: string;
  amount: number;
  category: string;
  /** Giorno del mese previsto (1-31). */
  day: number;
  active: boolean;
}

export type Priority = 'alta' | 'media' | 'bassa';

/** Acquisto che si vuole fare in futuro, con eventuale somma già messa da parte. */
export interface Planned {
  id: string;
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
  version: 1;
  transactions: Transaction[];
  recurring: Recurring[];
  planned: Planned[];
}
