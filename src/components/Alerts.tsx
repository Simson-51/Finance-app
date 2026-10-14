import { useMemo } from 'react';
import { accountName, euro, forecast, forecastHorizon, formatDate, today, uid, type Forecast } from '../finance';
import type { Store } from '../store';
import type { Data } from '../types';

/** Previsione dei saldi fino a fine del mese prossimo, ricalcolata a ogni modifica. */
export function useForecast(data: Data): Forecast {
  return useMemo(() => forecast(data), [data]);
}

/** Triangolo giallo con punto esclamativo. */
export function WarnIcon({ title }: { title?: string }) {
  return (
    <svg className="warn-icon" viewBox="0 0 24 24" width="18" height="18" role="img" aria-label={title ?? 'Attenzione'}>
      {title && <title>{title}</title>}
      <path d="M12 2.5 1.5 21h21L12 2.5Z" fill="#facc15" stroke="#a16207" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 9v5.5" stroke="#422006" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="17.6" r="1.3" fill="#422006" />
    </svg>
  );
}

export const shortfallText = (shortfall: number, date?: string) =>
  `Mancano ${euro(shortfall)} per i pagamenti previsti${date ? ` (dal ${formatDate(date)})` : ''}`;

/** Avvisi su conti senza fondi sufficienti e ricariche da fare per mantenere il budget. */
export function Alerts({ store, fc }: { store: Store; fc: Forecast }) {
  const { accounts } = store.data;
  const short = accounts.filter((a) => fc.accounts[a.id]?.shortfall > 0);
  if (!short.length && !fc.topUps.length) return null;

  return (
    <div className="alerts">
      {short.map((a) => {
        const f = fc.accounts[a.id];
        return (
          <div key={a.id} className="alert warn" role="alert">
            <WarnIcon />
            <div>
              <strong>{a.name}: soldi insufficienti</strong>
              <p>
                {shortfallText(f.shortfall, f.shortDate)}. Fino al {formatDate(forecastHorizon())} il saldo scenderebbe a {euro(f.min)}.
              </p>
            </div>
          </div>
        );
      })}
      {fc.topUps.map((t) => (
        <div key={t.accountId} className="alert info">
          <span className="alert-icon" aria-hidden>
            ⇄
          </span>
          <div>
            <strong>Ricarica {accountName(accounts, t.accountId)}</strong>
            <p>
              È sotto il budget minimo: ricarica {euro(t.amount)} da {accountName(accounts, t.fromId)}.
            </p>
          </div>
          <button
            className="btn primary small"
            onClick={() =>
              store.saveTransaction({
                id: uid(),
                kind: 'trasferimento',
                amount: t.amount,
                date: today(),
                category: 'Trasferimento',
                description: `Ricarica ${accountName(accounts, t.accountId)}`,
                accountId: t.fromId,
                toAccountId: t.accountId,
              })
            }
          >
            Registra
          </button>
        </div>
      ))}
    </div>
  );
}
