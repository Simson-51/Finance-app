import { useEffect, useRef, useState } from 'react';
import { euro, formatMonth, monthFlows, monthOf, today } from '../finance';
import type { Data } from '../types';
import { Modal } from './ui';

type Tone = 'in' | 'out' | 'save' | 'mid';

interface Node {
  key: string;
  label: string;
  amount: number;
  tone: Tone;
  /** posizione verticale del rettangolo */
  y: number;
  h: number;
}

const NODE_W = 12;
/** Altezza (px) che corrisponde al totale del mese. */
const SCALE_H = 300;
const MIN_SLOT = 30;
const GAP = 8;
const PAD_TOP = 40;

/** Dispone i nodi di una colonna: ognuno ha almeno lo spazio per la sua etichetta. */
function layoutColumn(items: Omit<Node, 'y' | 'h'>[], k: number): { nodes: Node[]; height: number } {
  let y = PAD_TOP;
  const nodes = items.map((n) => {
    const h = Math.max(2, n.amount * k);
    const slot = Math.max(h, MIN_SLOT);
    const node = { ...n, h, y: y + (slot - h) / 2 };
    y += slot + GAP;
    return node;
  });
  return { nodes, height: y - GAP };
}

/** Banda curva tra due segmenti verticali (x0, y0..y0+t) → (x1, y1..y1+t). */
const band = (x0: number, y0: number, x1: number, y1: number, t: number) => {
  const mx = (x0 + x1) / 2;
  return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + t} C${mx},${y1 + t} ${mx},${y0 + t} ${x0},${y0 + t} Z`;
};

function SankeyChart({ data, month, includeFuture }: { data: Data; month: string; includeFuture: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  // il disegno usa la larghezza reale, così i testi restano leggibili anche sul telefono
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const f = monthFlows(data, month, includeFuture);
  if (f.total === 0)
    return (
      <div ref={box}>
        <p className="muted center">Nessuna entrata o uscita da mostrare per {formatMonth(month).toLowerCase()}.</p>
      </div>
    );

  const k = SCALE_H / f.total;
  const left = layoutColumn(
    [
      ...f.incomes.map((x) => ({ key: `in:${x.label}`, label: x.label, amount: x.amount, tone: 'in' as Tone })),
      ...(f.fromSavings > 0 ? [{ key: 'fromSavings', label: 'Dai risparmi', amount: f.fromSavings, tone: 'save' as Tone }] : []),
    ],
    k,
  );
  const right = layoutColumn(
    [
      ...f.expenses.map((x) => ({ key: `out:${x.label}`, label: x.label, amount: x.amount, tone: 'out' as Tone })),
      ...(f.saved > 0 ? [{ key: 'saved', label: 'Risparmiato', amount: f.saved, tone: 'save' as Tone }] : []),
    ],
    k,
  );
  const height = Math.max(left.height, right.height, PAD_TOP + SCALE_H) + 4;
  const midH = f.total * k;
  const midY = Math.max(PAD_TOP, (height - midH) / 2);
  const midX = W / 2 - NODE_W / 2;
  const rightX = W - NODE_W;

  // le bande entrano ed escono dal nodo centrale impilate nello stesso ordine dei nodi
  let inY = midY;
  let outY = midY;
  const links = [
    ...left.nodes.map((n) => {
      const t = n.amount * k;
      const y0 = n.y + (n.h - t) / 2;
      const d = band(NODE_W, y0, midX, inY, t);
      inY += t;
      return { key: n.key, d, tone: n.tone, label: `${n.label} → Disponibile: ${euro(n.amount)}` };
    }),
    ...right.nodes.map((n) => {
      const t = n.amount * k;
      const y1 = n.y + (n.h - t) / 2;
      const d = band(midX + NODE_W, outY, rightX, y1, t);
      outY += t;
      return { key: n.key, d, tone: n.tone, label: `Disponibile → ${n.label}: ${euro(n.amount)}` };
    }),
  ];
  const pct = (v: number) => `${Math.round((v / f.total) * 100)}%`;

  const nodeRect = (n: Node, x: number) => (
    <rect
      key={n.key}
      x={x}
      y={n.y}
      width={NODE_W}
      height={n.h}
      rx={3}
      className={`sk-node tone-${n.tone}`}
      onPointerEnter={() => setHover(n.key)}
      onPointerLeave={() => setHover(null)}
    >
      <title>{`${n.label}: ${euro(n.amount)} (${pct(n.amount)})`}</title>
    </rect>
  );

  const label = (n: Node, side: 'left' | 'right') => {
    const x = side === 'left' ? NODE_W + 8 : rightX - 8;
    const anchor = side === 'left' ? 'start' : 'end';
    const cy = n.y + n.h / 2;
    return (
      <g key={`l:${n.key}`} className="sk-label">
        <text x={x} y={cy - 2} textAnchor={anchor} className="sk-name">
          {n.label}
        </text>
        <text x={x} y={cy + 13} textAnchor={anchor} className="sk-value">
          {euro(n.amount)} · {pct(n.amount)}
        </text>
      </g>
    );
  };

  return (
    <div className="sankey" ref={box}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Flusso dei soldi di ${formatMonth(month)}`}>
        <g className={hover ? 'sk-links has-hover' : 'sk-links'}>
          {links.map((l) => (
            <path
              key={l.key}
              d={l.d}
              className={`sk-link tone-${l.tone} ${hover === l.key ? 'active' : ''}`}
              onPointerEnter={() => setHover(l.key)}
              onPointerLeave={() => setHover(null)}
            >
              <title>{l.label}</title>
            </path>
          ))}
        </g>
        {left.nodes.map((n) => nodeRect(n, 0))}
        {right.nodes.map((n) => nodeRect(n, rightX))}
        <rect x={midX} y={midY} width={NODE_W} height={midH} rx={3} className="sk-node tone-mid">
          <title>{`Disponibile: ${euro(f.total)}`}</title>
        </rect>
        <text x={W / 2} y={midY - 18} textAnchor="middle" className="sk-name">
          Disponibile
        </text>
        <text x={W / 2} y={midY - 4} textAnchor="middle" className="sk-value">
          {euro(f.total)}
        </text>
        {left.nodes.map((n) => label(n, 'left'))}
        {right.nodes.map((n) => label(n, 'right'))}
      </svg>
      <div className="legend sk-legend">
        <i className="dot sk-in" /> Entrate <i className="dot sk-out" /> Spese <i className="dot sk-save" /> Risparmi
      </div>
      <details className="sk-table">
        <summary>Mostra come tabella</summary>
        <table>
          <tbody>
            {[...left.nodes, ...right.nodes].map((n) => (
              <tr key={n.key}>
                <td>{n.tone === 'in' ? 'Entrata' : n.tone === 'out' ? 'Spesa' : 'Risparmi'}</td>
                <th scope="row">{n.label}</th>
                <td className="num">{euro(n.amount)}</td>
                <td className="num muted">{pct(n.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Casella del riepilogo che apre il diagramma dei flussi del mese. */
export function SankeyCard({ data, month }: { data: Data; month: string }) {
  const [open, setOpen] = useState(false);
  const [includeFuture, setIncludeFuture] = useState(false);
  const f = monthFlows(data, month, false);
  const hasFuture = data.transactions.some((t) => t.date > today() && monthOf(t.date) === month && t.kind !== 'trasferimento');

  return (
    <>
      <button className="card sankey-card" onClick={() => setOpen(true)} disabled={f.total === 0 && !hasFuture}>
        <span className="sankey-card-icon" aria-hidden>
          <svg viewBox="0 0 40 28" width="40" height="28">
            <path d="M0 2 C20 2 20 6 40 6 L40 12 C20 12 20 10 0 10Z" className="tone-in" />
            <path d="M0 12 C20 12 20 16 40 16 L40 20 C20 20 20 18 0 18Z" className="tone-out" />
            <path d="M0 20 C20 20 20 22 40 22 L40 26 C20 26 20 26 0 26Z" className="tone-save" />
          </svg>
        </span>
        <span className="list-main">
          <span className="list-title">Flusso dei soldi</span>
          <span className="list-sub">
            {f.total === 0 ? 'Ancora nessun movimento questo mese' : 'Da dove arrivano e dove vanno i soldi del mese'}
          </span>
        </span>
        <span className="chevron" aria-hidden>
          ›
        </span>
      </button>

      {open && (
        <Modal title={`Flusso dei soldi · ${formatMonth(month)}`} onClose={() => setOpen(false)} wide>
          {hasFuture && (
            <label className="check small">
              <input type="checkbox" checked={includeFuture} onChange={(e) => setIncludeFuture(e.target.checked)} />
              Includi i movimenti previsti
            </label>
          )}
          <SankeyChart data={data} month={month} includeFuture={includeFuture} />
        </Modal>
      )}
    </>
  );
}
