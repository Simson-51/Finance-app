/**
 * Promemoria con le notifiche di sistema, mostrati quando si apre l'app (non c'è un server,
 * quindi ad app chiusa non arrivano). Ogni promemoria viene mostrato al massimo una volta al giorno.
 */
import { accountName, dayAfter, dayBefore, euro, forecast, nextPayday, scheduledEvents, today } from './finance';
import type { Data } from './types';

const PREF = 'finanze:notify';
const LAST = 'finanze:notify-last';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

/** Su iPhone le notifiche funzionano solo con l'app aggiunta alla schermata Home. */
export const needsHomeScreen = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone;

export function notificationsEnabled(): boolean {
  try {
    return notificationsSupported() && Notification.permission === 'granted' && localStorage.getItem(PREF) === 'on';
  } catch {
    return false;
  }
}

export function setNotificationsPref(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? 'on' : 'off');
    if (!on) localStorage.removeItem(LAST);
  } catch {
    // preferenza non salvata
  }
}

export interface Reminder {
  title: string;
  lines: string[];
}

const signed = (kind: string, amount: number) => (kind === 'entrata' ? `+${euro(amount)}` : kind === 'uscita' ? `−${euro(amount)}` : euro(amount));

/** Cosa ricordare oggi: pagamenti di domani, voci scadute non registrate, conti che non bastano. */
export function buildReminder(data: Data, payday: number, day = today()): Reminder | null {
  const tomorrow = dayAfter(day);
  const lines: string[] = [];
  const events = scheduledEvents(data, day, tomorrow);

  const overdue = events.filter((e) => e.overdue);
  if (overdue.length) lines.push(`Da registrare: ${overdue.map((e) => `${e.label} ${signed(e.kind, e.amount)}`).join(', ')}`);
  const next = events.filter((e) => e.date === tomorrow);
  if (next.length) lines.push(`Domani: ${next.map((e) => `${e.label} ${signed(e.kind, e.amount)}`).join(', ')}`);

  const fc = forecast(data, day, dayBefore(nextPayday(payday, day)));
  for (const a of data.accounts) {
    const f = fc.accounts[a.id];
    if (f?.shortfall > 0) lines.push(`⚠️ ${accountName(data.accounts, a.id)}: mancano ${euro(f.shortfall)} prima dello stipendio`);
  }
  if (fc.unassigned.shortfall > 0) lines.push(`⚠️ Spese sicure senza conto: mancano ${euro(fc.unassigned.shortfall)} prima dello stipendio`);
  if (!lines.length) return null;
  const title = lines.some((l) => l.startsWith('⚠️')) ? 'Attenzione ai conti' : 'Promemoria pagamenti';
  return { title, lines };
}

async function show(title: string, body: string) {
  const options: NotificationOptions = { body, icon: './icon-192.png', badge: './icon-192.png', tag: 'finanze-promemoria' };
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
}

/** Mostra il promemoria se c'è qualcosa di nuovo rispetto all'ultimo mostrato oggi. */
export async function notifyIfNeeded(data: Data, payday: number, day = today()): Promise<boolean> {
  if (!notificationsEnabled()) return false;
  const r = buildReminder(data, payday, day);
  if (!r) return false;
  const key = `${day}|${r.lines.join('|')}`;
  try {
    if (localStorage.getItem(LAST) === key) return false;
    localStorage.setItem(LAST, key);
  } catch {
    return false;
  }
  await show(r.title, r.lines.join('\n'));
  return true;
}

/** Chiede il permesso (va chiamata da un tocco dell'utente) e mostra una notifica di prova. */
export async function enableNotifications(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  setNotificationsPref(true);
  await show('Promemoria attivi', "Quando apri l'app ti ricorderò i pagamenti di domani e gli avvisi sui conti.").catch(() => {});
  return 'granted';
}
