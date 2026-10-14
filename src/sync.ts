/**
 * Sincronizzazione cifrata end-to-end tra dispositivi.
 *
 * I dati vengono cifrati nel browser (AES-GCM 256 bit, chiave derivata dalla password con
 * PBKDF2-SHA256) e salvati in un Gist segreto dell'account GitHub dell'utente. La password
 * non lascia mai il dispositivo: GitHub, e chiunque altro, vede solo dati illeggibili.
 */
import { normalize } from './finance';
import type { Data } from './types';

export const SYNC_FILE = 'finanze-sync.json';
const API = 'https://api.github.com';
const ITERATIONS = 600_000;

export interface SyncConfig {
  token: string;
  passphrase: string;
  gistId: string;
}

interface Envelope {
  app: 'finanze';
  v: 1;
  salt: string;
  iv: string;
  data: string;
}

export class SyncError extends Error {
  constructor(
    message: string,
    /** true se il problema richiede di riconfigurare la sincronizzazione (token o password). */
    readonly fatal = false,
  ) {
    super(message);
  }
}

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const keyCache = new Map<string, Promise<CryptoKey>>();

function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const id = `${salt}:${passphrase}`;
  let key = keyCache.get(id);
  if (!key) {
    key = crypto.subtle
      .importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
      .then((base) =>
        crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: fromB64(salt), iterations: ITERATIONS, hash: 'SHA-256' },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      );
    keyCache.set(id, key);
  }
  return key;
}

export const newSalt = () => toB64(crypto.getRandomValues(new Uint8Array(16)));

export async function encrypt(data: Data, passphrase: string, salt: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  const env: Envelope = { app: 'finanze', v: 1, salt, iv: toB64(iv), data: toB64(ct) };
  return JSON.stringify(env);
}

export async function decrypt(content: string, passphrase: string): Promise<{ data: Data; salt: string }> {
  let env: Envelope;
  try {
    env = JSON.parse(content);
    if (env.app !== 'finanze' || env.v !== 1) throw new Error();
  } catch {
    throw new SyncError('I dati salvati online non sono in un formato riconosciuto', true);
  }
  let plain: ArrayBuffer;
  try {
    const key = await deriveKey(passphrase, env.salt);
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.data));
  } catch {
    throw new SyncError('Password di cifratura errata', true);
  }
  return { data: normalize(JSON.parse(new TextDecoder().decode(plain))), salt: env.salt };
}

interface GistFile {
  filename: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

interface Gist {
  id: string;
  files: Record<string, GistFile>;
}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('Nessuna connessione: riprovo più tardi');
  }
  if (res.status === 401) throw new SyncError('Token GitHub non valido o scaduto', true);
  if (res.status === 403 || res.status === 404) {
    throw new SyncError('Il token non ha accesso ai Gist (serve il permesso "Gists: Read and write")', true);
  }
  if (!res.ok) throw new SyncError(`GitHub ha risposto con un errore (${res.status})`);
  return res.json() as Promise<T>;
}

async function fileContent(file: GistFile): Promise<string> {
  if (!file.truncated && file.content !== undefined) return file.content;
  // i file molto grandi vanno letti a parte
  const res = await fetch(file.raw_url!, { cache: 'no-store' }).catch(() => {
    throw new SyncError('Nessuna connessione: riprovo più tardi');
  });
  if (!res.ok) throw new SyncError(`GitHub ha risposto con un errore (${res.status})`);
  return res.text();
}

/** Legge i dati cifrati dal Gist. Restituisce null se il file non contiene ancora dati. */
export async function pull(cfg: SyncConfig): Promise<{ data: Data; salt: string } | null> {
  const gist = await gh<Gist>(cfg.token, `/gists/${cfg.gistId}`).catch((e) => {
    if (e instanceof SyncError && e.fatal) throw new SyncError('Il Gist di sincronizzazione non esiste più o il token non ha accesso', true);
    throw e;
  });
  const file = gist.files[SYNC_FILE];
  if (!file) return null;
  return decrypt(await fileContent(file), cfg.passphrase);
}

export async function push(cfg: SyncConfig, data: Data, salt: string): Promise<void> {
  const content = await encrypt(data, cfg.passphrase, salt);
  await gh(cfg.token, `/gists/${cfg.gistId}`, { method: 'PATCH', body: JSON.stringify({ files: { [SYNC_FILE]: { content } } }) });
}

/**
 * Collega il dispositivo: cerca tra i Gist dell'utente quello dell'app (creato da un altro
 * dispositivo) e verifica la password; se non esiste, lo crea con i dati locali.
 */
export async function connect(token: string, passphrase: string, local: Data): Promise<{ config: SyncConfig; remote: Data | null }> {
  for (let page = 1; page <= 10; page++) {
    const gists = await gh<Gist[]>(token, `/gists?per_page=100&page=${page}`);
    const found = gists.find((g) => g.files[SYNC_FILE]);
    if (found) {
      const config = { token, passphrase, gistId: found.id };
      const remote = await pull(config);
      return { config, remote: remote?.data ?? null };
    }
    if (gists.length < 100) break;
  }
  const content = await encrypt(local, passphrase, newSalt());
  const created = await gh<Gist>(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: 'Le mie finanze: dati cifrati (illeggibili senza la password)',
      public: false,
      files: { [SYNC_FILE]: { content } },
    }),
  });
  return { config: { token, passphrase, gistId: created.id }, remote: null };
}
