/** Esportazione dei dati su file e promemoria per farlo ogni tanto quando non c'è la sincronizzazione. */
import { COLLECTIONS, today } from './finance';
import type { Data } from './types';

const LAST = 'finanze:backup-last';
const SNOOZE = 'finanze:backup-snooze';
const DAY = 86_400_000;
/** Dopo quanti giorni senza backup compare il promemoria. */
export const BACKUP_EVERY_DAYS = 30;
const SNOOZE_DAYS = 7;

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const readNumber = (key: string) => {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};

const writeNumber = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // non salvato: il promemoria tornerà alla prossima apertura
  }
};

/** Scarica il backup completo (testo JSON) e ricorda quando è stato fatto. */
export function exportBackup(json: string, now = Date.now()) {
  download(`finanze-backup-${today()}.json`, json, 'application/json');
  writeNumber(LAST, now);
}

export const lastBackup = () => readNumber(LAST);

export const snoozeBackup = (now = Date.now()) => writeNumber(SNOOZE, now + SNOOZE_DAYS * DAY);

/**
 * true se conviene ricordare il backup: ci sono dati, e dall'ultimo backup (o, se non ne è mai
 * stato fatto uno, dal primo dato inserito) è passato più di un mese.
 */
export function backupDue(data: Data, last = lastBackup(), snoozedUntil = readNumber(SNOOZE), now = Date.now()): boolean {
  if (!data.transactions.length && !data.recurring.length && !data.planned.length) return false;
  if (now < snoozedUntil) return false;
  let since = last;
  if (!since) {
    const stamps = COLLECTIONS.flatMap((c) => (data[c] as { updatedAt: number }[]).map((x) => x.updatedAt)).filter((t) => t > 0);
    since = stamps.length ? Math.min(...stamps) : 0;
  }
  return now - since > BACKUP_EVERY_DAYS * DAY;
}
