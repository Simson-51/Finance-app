import { createContext, useContext } from 'react';
import { categoriesFor } from '../finance';
import type { Category, Kind, Macro } from '../types';

/** Categorie personalizzate e azione per aggiungerne una, disponibili a tutti i moduli. */
type AddCategory = (kind: Kind, name: string, macro?: Macro) => void;

export const CategoriesContext = createContext<{ custom: Category[]; add: AddCategory }>({ custom: [], add: () => {} });

export const useCategories = () => useContext(CategoriesContext);

const NEW = '__nuova__';

/** Chiede il nome di una nuova categoria; restituisce quella già esistente se il nome coincide. */
export function askCategory(custom: Category[], kind: Kind, add: AddCategory): string | null {
  const name = prompt(kind === 'uscita' ? 'Nome della nuova categoria di spesa' : 'Nome della nuova categoria di entrata')?.trim().slice(0, 40);
  if (!name) return null;
  const existing = categoriesFor(custom, kind).find((c) => c.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  // per le spese si chiede subito se è un bisogno o un desiderio (si può cambiare dalle Impostazioni)
  const macro: Macro | undefined =
    kind !== 'uscita'
      ? undefined
      : confirm(`“${name}” è un desiderio, cioè una spesa che potresti tagliare?\n\nOK = Desideri · Annulla = Bisogni`)
        ? 'desideri'
        : 'bisogni';
  add(kind, name, macro);
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
