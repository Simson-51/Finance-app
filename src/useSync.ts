import { useCallback, useEffect, useRef, useState } from 'react';
import { merge, sameData } from './finance';
import type { Store } from './store';
import { connect as connectGist, newSalt, pull, push, type SyncConfig } from './sync';
import type { Data } from './types';

const CONFIG_KEY = 'finanze:sync';
const LAST_KEY = 'finanze:sync-last';
const DEBOUNCE_MS = 1500;
const INTERVAL_MS = 60_000;

export type SyncState = 'off' | 'syncing' | 'ok' | 'error';

export interface SyncStatus {
  state: SyncState;
  message?: string;
  lastSync?: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage non disponibile: la sincronizzazione andrà riattivata alla prossima apertura
  }
}

/**
 * Tiene allineati i dati con il Gist cifrato: all'avvio, quando l'app torna in primo piano,
 * ogni minuto e poco dopo ogni modifica locale.
 */
export function useSync(store: Store) {
  const [config, setConfig] = useState<SyncConfig | null>(() => read<SyncConfig>(CONFIG_KEY));
  const [status, setStatus] = useState<SyncStatus>(() => ({
    state: read<SyncConfig>(CONFIG_KEY) ? 'syncing' : 'off',
    lastSync: read<number>(LAST_KEY) ?? undefined,
  }));

  const dataRef = useRef(store.data);
  dataRef.current = store.data;
  const configRef = useRef(config);
  configRef.current = config;
  const { mergeRemote } = store;

  const saltRef = useRef<string | null>(null);
  /** Ultimo stato noto per essere uguale a quello online. */
  const syncedRef = useRef<Data | null>(null);
  const running = useRef(false);
  const again = useRef(false);

  const run = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus((s) => ({ ...s, state: 'syncing', message: undefined }));
    try {
      do {
        again.current = false;
        const remote = await pull(cfg);
        if (configRef.current !== cfg) return; // disattivata nel frattempo
        const merged = remote ? merge(dataRef.current, remote.data) : dataRef.current;
        saltRef.current = remote?.salt ?? saltRef.current ?? newSalt();
        if (!remote || !sameData(merged, remote.data)) await push(cfg, merged, saltRef.current);
        syncedRef.current = merged;
        mergeRemote(merged);
      } while (again.current);
      const lastSync = Date.now();
      write(LAST_KEY, lastSync);
      setStatus({ state: 'ok', lastSync });
    } catch (e) {
      setStatus((s) => ({ ...s, state: 'error', message: e instanceof Error ? e.message : 'Errore di sincronizzazione' }));
    } finally {
      running.current = false;
    }
  }, [mergeRemote]);

  // Sincronizza poco dopo ogni modifica locale non ancora inviata.
  useEffect(() => {
    if (!config) return;
    if (syncedRef.current && sameData(store.data, syncedRef.current)) return;
    const t = setTimeout(run, syncedRef.current ? DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [store.data, config, run]);

  // Sincronizza quando l'app torna visibile, quando torna la connessione e periodicamente.
  useEffect(() => {
    if (!config) return;
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', run);
    const timer = setInterval(() => document.visibilityState === 'visible' && run(), INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', run);
      clearInterval(timer);
    };
  }, [config, run]);

  const connect = useCallback(
    async (token: string, passphrase: string) => {
      const { config: cfg, remote } = await connectGist(token.trim(), passphrase, dataRef.current);
      if (remote) mergeRemote(merge(dataRef.current, remote));
      saltRef.current = null;
      syncedRef.current = null;
      write(CONFIG_KEY, cfg);
      configRef.current = cfg;
      setConfig(cfg);
      await run();
    },
    [mergeRemote, run],
  );

  const disconnect = useCallback(() => {
    write(CONFIG_KEY, null);
    write(LAST_KEY, null);
    configRef.current = null;
    saltRef.current = null;
    syncedRef.current = null;
    setConfig(null);
    setStatus({ state: 'off' });
  }, []);

  return { enabled: !!config, gistId: config?.gistId, status, syncNow: run, connect, disconnect };
}

export type Sync = ReturnType<typeof useSync>;
