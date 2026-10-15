import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { addMonths, balanceSeries, dayBefore, euro, formatDate, monthOf, nextPayday, today, type BalancePoint } from '../finance';
import type { Data } from '../types';

const RANGES = [
  { months: 1, label: '1 mese' },
  { months: 3, label: '3 mesi' },
  { months: 6, label: '6 mesi' },
  { months: 12, label: '1 anno' },
];

const H = 190;
const PAD = { top: 30, right: 14, bottom: 26, left: 52 };

const compact = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Tacche "tonde" per l'asse Y. */
function ticks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 100;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const shortDate = (date: string) => new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

/** Andamento del saldo totale con la previsione fino al prossimo stipendio. */
export function BalanceChart({ data, payday }: { data: Data; payday: number }) {
  const [range, setRange] = useState(3);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const day = today();
  const until = dayBefore(nextPayday(payday, day));
  const points = useMemo(
    () => balanceSeries(data, `${addMonths(monthOf(day), -range)}-${day.slice(8)}`, day, until),
    [data, range, day, until],
  );

  const values = points.map((p) => p.balance);
  const yt = ticks(Math.min(0, ...values), Math.max(...values));
  const yMin = yt[0];
  const yMax = yt[yt.length - 1];
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;

  const todayIdx = points.findIndex((p) => p.projected) - 1;
  const lastReal = todayIdx >= 0 ? todayIdx : points.length - 1;
  const path = (list: { p: BalancePoint; i: number }[]) => list.map(({ p, i }, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const indexed = points.map((p, i) => ({ p, i }));
  const real = indexed.slice(0, lastReal + 1);
  const proj = indexed.slice(lastReal);
  const area = real.length ? `${path(real)} L${x(lastReal).toFixed(1)},${y(yMin)} L${x(0).toFixed(1)},${y(yMin)} Z` : '';

  // tacche sull'asse X: il primo di ogni mese, diradate se sono troppe
  const monthStarts = indexed.filter(({ p }) => p.date.endsWith('-01'));
  const every = Math.max(1, Math.ceil(monthStarts.length / Math.max(1, Math.floor(innerW / 60))));
  const xt = monthStarts.filter((_, k) => k % every === 0);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  };

  const h = hover !== null ? points[hover] : null;
  const end = points[points.length - 1];
  const minProj = proj.length > 1 ? proj.reduce((m, q) => (q.p.balance < m.p.balance ? q : m)) : null;
  const monthEnds = points.filter((p, i) => !p.projected && (i === lastReal || p.date.slice(0, 7) !== points[i + 1]?.date.slice(0, 7)));

  return (
    <section className="card span-2 balance-card">
      <div className="card-head">
        <h3>Andamento del saldo</h3>
        <div className="segmented small" role="radiogroup" aria-label="Periodo">
          {RANGES.map((r) => (
            <button key={r.months} type="button" role="radio" aria-checked={range === r.months} className={range === r.months ? 'active' : ''} onClick={() => setRange(r.months)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="balance-chart" ref={box}>
        {points.length < 2 ? (
          <p className="muted small">Registra qualche movimento per vedere l'andamento.</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Saldo totale giorno per giorno, con la previsione fino al prossimo stipendio">
              <defs>
                <linearGradient id="bal-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" className="bal-fill-top" />
                  <stop offset="100%" className="bal-fill-bottom" />
                </linearGradient>
              </defs>
              {yt.map((v) => (
                <g key={v}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'bal-zero' : 'bal-grid'} />
                  <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="bal-axis">
                    {compact.format(v)}
                  </text>
                </g>
              ))}
              {xt.map(({ p, i }) => (
                <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" className="bal-axis">
                  {new Date(p.date + 'T00:00:00').toLocaleDateString('it-IT', { month: 'short' })}
                </text>
              ))}
              {area && <path d={area} fill="url(#bal-fill)" />}
              {real.length > 1 && <path d={path(real)} className="bal-line" />}
              {proj.length > 1 && <path d={path(proj)} className="bal-line projected" />}
              {todayIdx >= 0 && (
                <g>
                  <line x1={x(lastReal)} x2={x(lastReal)} y1={PAD.top} y2={H - PAD.bottom} className="bal-today" />
                  <text x={x(lastReal)} y={14} textAnchor="middle" className="bal-axis">
                    oggi
                  </text>
                </g>
              )}
              {proj.length > 1 && (
                <text x={x(points.length - 1)} y={y(end.balance) - PAD.top < 24 ? y(end.balance) + 20 : y(end.balance) - 10} textAnchor="end" className="bal-label">
                  previsto {compact.format(end.balance)}
                </text>
              )}
              {h && hover !== null && (
                <g pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="bal-cross" />
                  <circle cx={x(hover)} cy={y(h.balance)} r={5} className="bal-dot" />
                </g>
              )}
              <rect
                x={PAD.left}
                y={0}
                width={innerW}
                height={H}
                fill="transparent"
                onPointerMove={onMove}
                onPointerDown={onMove}
                onPointerLeave={() => setHover(null)}
              />
            </svg>
            {h && hover !== null && (
              <div className={`bal-tip ${x(hover) > W / 2 ? 'left' : ''}`} style={{ left: x(hover) }} role="status">
                <span className="muted">
                  {formatDate(h.date)}
                  {h.projected ? ' · previsto' : ''}
                </span>
                <strong className={h.balance < 0 ? 'amount uscita' : 'amount'}>{euro(h.balance)}</strong>
              </div>
            )}
          </>
        )}
      </div>
      {points.length >= 2 && (
        <p className="small muted bal-caption">
          Totale di tutti i conti. La linea tratteggiata è la previsione fino allo stipendio del {shortDate(nextPayday(payday, day))}
          {minProj && minProj.p.balance < points[lastReal].balance ? `: il punto più basso è ${euro(minProj.p.balance)} il ${shortDate(minProj.p.date)}` : ''}.
        </p>
      )}
      {monthEnds.length > 0 && (
        <details className="sk-table">
          <summary>Mostra come tabella</summary>
          <table>
            <tbody>
              {monthEnds.map((p) => (
                <tr key={p.date}>
                  <th scope="row">{p.date === points[lastReal].date ? `Oggi (${shortDate(p.date)})` : `Fine ${new Date(p.date + 'T00:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`}</th>
                  <td className="num">{euro(p.balance)}</td>
                </tr>
              ))}
              {proj.length > 1 && (
                <tr>
                  <th scope="row">Previsto al {shortDate(end.date)}</th>
                  <td className="num">{euro(end.balance)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
