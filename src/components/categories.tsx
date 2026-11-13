import { createContext, useContext } from 'react';
import { categoriesFor } from '../finance';
import type { Category, Kind } from '../types';

/** Categorie personalizzate e azione per aggiungerne una, disponibili a tutti i moduli. */
export const CategoriesContext = createContext<{ custom: Category[]; add: (kind: Kind, name: string) => void }>({ custom: [], add: () => {} });

export const useCategories = () => useContext(CategoriesContext);

const NEW = '__nuova__';

/** Chiede il nome di una nuova categoria; restituisce quella già esistente se il nome coincide. */
export function askCategory(custom: Category[], kind: Kind, add: (kind: Kind, name: string) => void): string | null {
  const name = prompt(kind === 'uscita' ? 'Nome della nuova categoria di spesa' : 'Nome della nuova categoria di entrata')?.trim().slice(0, 40);
  if (!name) return null;
  const existing = categoriesFor(custom, kind).find((c) => c.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  add(kind, name);
  return name;
}

/** Elenco delle categorie con, in fondo, la voce per crearne una nuova. */
export function CategorySelect({ id, kind, value, onChange }: { id?: string; kind: Kind; value: string; onChange: (c: string) => void }) {
  const { custom, add } = useCategories();
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => {
        if (e.target.value !== NEW) return onChange(e.target.value);
        const name = askCategory(custom, kind, add);
        if (name) onChange(name);
      }}
    >
      {categoriesFor(custom, kind, value).map((c) => (
        <option key={c}>{c}</option>
      ))}
      <option value={NEW}>＋ Nuova categoria…</option>
    </select>
  );
}
