import { useMemo, useState } from 'react';
import { accountName, dayBefore, euro, forecast, formatDate, nextPayday, today, uid, type Forecast } from '../finance';
import type { Store } from '../store';
import type { Account, Data } from '../types';
import { Modal } from './ui';

export type PaydayForecast = Forecast & { payday: string };

/**
 * Previsione dei saldi fino al giorno prima del prossimo stipendio: è il periodo che i soldi
 * di oggi devono coprire. Ricalcolata a ogni modifica.
 */
export function useForecast(data: Data, payday: number): PaydayForecast {
  return useMemo(() => {
    const day = today();
    const next = nextPayday(payday, day);
    return { ...forecast(data, day, dayBefore(next)), payday: next };
  }, [data, payday]);
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

const STEP_ICON = { entrata: '↓', uscita: '↑', trasferimento: '⇄', ricarica: '⇄' } as const;

/** Spiega un avviso: saldo di oggi e, uno per uno, i movimenti previsti con il saldo che ne risulta. */
function ForecastDetail({ account, fc, onClose }: { account: Account; fc: PaydayForecast; onClose: () => void }) {
  const f = fc.accounts[account.id];
  const overdue = f.steps.filter((s) => s.overdue);
  return (
    <Modal title={`Perché ${account.name} va in rosso`} onClose={onClose}>
      <p className="muted small detail-intro">
        Movimenti previsti fino allo stipendio del {formatDate(fc.payday)}, nell'ordine in cui avverranno.
      </p>
      <ol className="steps">
        <li className="step start">
          <span className="step-main">
            <span className="list-title">Saldo di oggi</span>
            <span className="list-sub">{formatDate(today())}</span>
          </span>
          <span className={`step-balance ${f.current < 0 ? 'neg' : ''}`}>{euro(f.current)}</span>
        </li>
        {f.steps.map((s, i) => (
          <li key={i} className={`step ${s.balance < 0 ? 'neg' : ''}`}>
            <span className={`badge small ${s.amount >= 0 ? 'entrata' : 'uscita'}`} aria-hidden>
              {STEP_ICON[s.kind]}
            </span>
            <span className="step-main">
              <span className="list-title">{s.label}</span>
              <span className="list-sub">
                {formatDate(s.date)}
                {s.recurring && ' · voce mensile'}
                {s.overdue && <strong className="overdue"> · scaduta il {formatDate(s.overdue)}, non segnata come pagata</strong>}
              </span>
            </span>
            <span className="step-amounts">
              <span className={`amount ${s.amount >= 0 ? 'entrata' : 'uscita'}`}>
                {s.amount >= 0 ? '+' : '−'}
                {euro(Math.abs(s.amount))}
              </span>
              <span className={`step-balance ${s.balance < 0 ? 'neg' : ''}`}>{euro(s.balance)}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="detail-summary">
        <span>
          Saldo più basso: <strong className={f.min < 0 ? 'amount uscita' : 'amount'}>{euro(f.min)}</strong>
        </span>
        {f.shortfall > 0 && (
          <span>
            Per coprire tutto servono altri <strong>{euro(f.shortfall)}</strong> entro il {formatDate(f.shortDate!)}.
          </span>
        )}
      </div>
      {overdue.length > 0 && (
        <p className="note">
          💡 Le voci mensili scadute e non ancora segnate come pagate vengono contate come da pagare oggi. Se le hai già pagate, segnale
          come pagate in <strong>Mensili</strong>; se iniziano più avanti, cambia il loro <strong>Primo addebito</strong>.
        </p>
      )}
    </Modal>
  );
}

export const shortfallText = (shortfall: number, date?: string) =>
  `Mancano ${euro(shortfall)} per i pagamenti previsti${date ? ` (dal ${formatDate(date)})` : ''}`;

/** Avvisi su conti senza fondi sufficienti e ricariche da fare per mantenere il budget. */
export function Alerts({ store, fc }: { store: Store; fc: PaydayForecast }) {
  const { accounts } = store.data;
  const [detail, setDetail] = useState<Account | null>(null);
  const short = accounts.filter((a) => fc.accounts[a.id]?.shortfall > 0);
  if (!short.length && !fc.topUps.length) return null;

  return (
    <div className="alerts">
      {short.map((a) => {
        const f = fc.accounts[a.id];
        return (
          <button key={a.id} className="alert warn clickable" onClick={() => setDetail(a)}>
            <WarnIcon />
            <div>
              <strong>{a.name}: soldi insufficienti</strong>
              <p>
                {shortfallText(f.shortfall, f.shortDate)}. Prima dello stipendio del {formatDate(fc.payday)} il saldo scenderebbe a{' '}
                {euro(f.min)}.
              </p>
              <span className="alert-more">Vedi il dettaglio ›</span>
            </div>
          </button>
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
      {detail && <ForecastDetail account={detail} fc={fc} onClose={() => setDetail(null)} />}
    </div>
  );
}
