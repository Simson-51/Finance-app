import { useRef, useState, type FormEvent } from 'react';
import { emptyData, parseBackup, toCsv, today } from '../finance';
import type { Store } from '../store';
import type { Sync } from '../useSync';
import { Field } from './ui';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type Theme = 'auto' | 'light' | 'dark';

const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=Le%20mie%20finanze&description=Sincronizzazione%20cifrata&expires_in=none&gists=write';

export const timeAgo = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'pochi secondi fa';
  if (s < 3600) return `${Math.round(s / 60)} min fa`;
  return new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function SyncSection({ sync }: { sync: Sync }) {
  const [token, setToken] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { status } = sync;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token.trim()) return setError('Incolla il token GitHub');
    if (passphrase.length < 8) return setError('La password deve avere almeno 8 caratteri');
    if (passphrase !== confirmPass) return setError('Le due password non coincidono');
    setBusy(true);
    try {
      await sync.connect(token, passphrase);
      setToken('');
      setPassphrase('');
      setConfirmPass('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile attivare la sincronizzazione');
    } finally {
      setBusy(false);
    }
  };

  if (sync.enabled) {
    return (
      <section className="card settings">
        <h3>Sincronizzazione tra dispositivi</h3>
        <p className={`sync-status ${status.state}`}>
          <span className="sync-dot" aria-hidden />
          {status.state === 'syncing' && 'Sincronizzazione in corso…'}
          {status.state === 'ok' && `Attiva · ultimo aggiornamento ${status.lastSync ? timeAgo(status.lastSync) : 'ora'}`}
          {status.state === 'error' && `Errore: ${status.message}`}
        </p>
        <p className="muted small">
          I dati sono cifrati su questo dispositivo con la tua password e salvati in un Gist segreto del tuo account GitHub. Sugli altri
          dispositivi attiva la sincronizzazione con un token dello stesso account e la stessa password.
        </p>
        <div className="button-row">
          <button className="btn primary" disabled={status.state === 'syncing'} onClick={() => sync.syncNow()}>
            Sincronizza ora
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              if (confirm('Disattivare la sincronizzazione su questo dispositivo? I dati restano qui e online, ma non verranno più aggiornati.')) {
                sync.disconnect();
              }
            }}
          >
            Disattiva
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card settings">
      <h3>Sincronizzazione tra dispositivi</h3>
      <p className="muted small">
        Usa gli stessi dati su telefono e computer. Prima di essere inviati, i dati vengono <strong>cifrati sul dispositivo</strong> con una
        password che scegli tu e che non lascia mai il dispositivo; poi vengono salvati in un Gist segreto del tuo account GitHub. Nessun
        altro, nemmeno GitHub, può leggerli.
      </p>
      <details className="howto">
        <summary>Come ottenere il token GitHub (una volta per dispositivo)</summary>
        <ol>
          <li>
            Apri{' '}
            <a href={TOKEN_URL} target="_blank" rel="noreferrer">
              la pagina di creazione del token
            </a>{' '}
            (accedi a GitHub se richiesto).
          </li>
          <li>
            In <em>Permissions → Account permissions</em> verifica che <strong>Gists</strong> sia su <strong>Read and write</strong>. Non serve
            nessun altro permesso.
          </li>
          <li>
            Premi <strong>Generate token</strong>, copia il codice (inizia con <code>github_pat_</code>) e incollalo qui sotto.
          </li>
        </ol>
      </details>
      <form className="form" onSubmit={submit}>
        <Field label="Token GitHub">
          {(id) => <input id={id} type="password" autoComplete="off" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />}
        </Field>
        <div className="row-2">
          <Field label="Password di cifratura">
            {(id) => <input id={id} type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />}
          </Field>
          <Field label="Ripeti la password">
            {(id) => <input id={id} type="password" autoComplete="new-password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />}
          </Field>
        </div>
        <p className="small muted">
          Usa la <strong>stessa password su tutti i dispositivi</strong> e conservala bene: se la perdi, i dati online non sono recuperabili
          (quelli su questo dispositivo restano). Se un altro dispositivo è già collegato, i dati dei due dispositivi verranno uniti.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="button-row">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Collegamento…' : 'Attiva sincronizzazione'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function SettingsView({ store, sync, theme, setTheme }: { store: Store; sync: Sync; theme: Theme; setTheme: (t: Theme) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const { accounts, transactions, recurring, planned } = store.data;

  const importFile = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      if (
        !confirm(
          `Importare il backup? I dati attuali verranno sostituiti (${data.accounts.length} conti, ${data.transactions.length} movimenti, ${data.recurring.length} voci mensili, ${data.planned.length} acquisti).`,
        )
      )
        return;
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

      <SyncSection sync={sync} />

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
        <h3>Backup</h3>
        <p className="muted small">
          {accounts.length} conti · {transactions.length} movimenti · {recurring.length} voci mensili · {planned.length} acquisti in programma.
          <br />
          {sync.enabled
            ? 'Con la sincronizzazione attiva i dati sono già salvati online; un backup in più non guasta.'
            : 'I dati sono salvati solo in questo browser: esporta regolarmente un backup per non perderli.'}
        </p>
        <div className="button-row">
          <button className="btn primary" onClick={() => download(`finanze-backup-${today()}.json`, JSON.stringify(store.data, null, 2), 'application/json')}>
            Esporta backup
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            Importa backup
          </button>
          <button className="btn ghost" disabled={!transactions.length} onClick={() => download(`movimenti-${today()}.csv`, '﻿' + toCsv(store.data), 'text/csv')}>
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
            const where = sync.enabled ? ' su tutti i dispositivi sincronizzati' : '';
            if (confirm(`Eliminare definitivamente tutti i dati${where}? Questa operazione non si può annullare.`)) {
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
