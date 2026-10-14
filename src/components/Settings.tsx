import { useRef, useState } from 'react';
import { emptyData, parseBackup, toCsv, today } from '../finance';
import type { Store } from '../store';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type Theme = 'auto' | 'light' | 'dark';

export function SettingsView({ store, theme, setTheme }: { store: Store; theme: Theme; setTheme: (t: Theme) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const { transactions, recurring, planned } = store.data;

  const importFile = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      if (!confirm(`Importare il backup? I dati attuali verranno sostituiti (${data.transactions.length} movimenti, ${data.recurring.length} voci mensili, ${data.planned.length} acquisti).`)) return;
      store.replaceAll(data);
      setMessage({ ok: true, text: 'Backup importato correttamente.' });
    } catch (e) {
      setMessage({ ok: false, text: `Impossibile importare: ${e instanceof Error ? e.message : 'file non valido'}` });
    }
  };

  return (
    <div className="view">
      <div className="view-head">
        <h2>Impostazioni</h2>
      </div>

      <section className="card settings">
        <h3>Aspetto</h3>
        <div className="segmented" role="radiogroup" aria-label="Tema">
          {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} className={theme === t ? 'active' : ''} onClick={() => setTheme(t)}>
              {t === 'auto' ? 'Automatico' : t === 'light' ? 'Chiaro' : 'Scuro'}
            </button>
          ))}
        </div>
      </section>

      <section className="card settings">
        <h3>I tuoi dati</h3>
        <p className="muted small">
          {transactions.length} movimenti · {recurring.length} voci mensili · {planned.length} acquisti in programma.
          <br />I dati sono salvati solo in questo browser: esporta regolarmente un backup per non perderli o per spostarli su un altro dispositivo.
        </p>
        <div className="button-row">
          <button className="btn primary" onClick={() => download(`finanze-backup-${today()}.json`, JSON.stringify(store.data, null, 2), 'application/json')}>
            Esporta backup
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            Importa backup
          </button>
          <button className="btn ghost" disabled={!transactions.length} onClick={() => download(`movimenti-${today()}.csv`, '﻿' + toCsv(transactions), 'text/csv')}>
            Esporta movimenti (CSV)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {message && <p className={message.ok ? 'success' : 'error'}>{message.text}</p>}
      </section>

      <section className="card settings">
        <h3>Zona pericolosa</h3>
        <button
          className="btn danger"
          onClick={() => {
            if (confirm('Eliminare definitivamente tutti i dati? Questa operazione non si può annullare.')) {
              store.replaceAll(emptyData());
              setMessage({ ok: true, text: 'Tutti i dati sono stati eliminati.' });
            }
          }}
        >
          Elimina tutti i dati
        </button>
      </section>

      <p className="muted small center">Puoi installare l'app sul telefono o sul computer dal menu del browser (“Aggiungi a schermata Home” / “Installa app”).</p>
    </div>
  );
}
