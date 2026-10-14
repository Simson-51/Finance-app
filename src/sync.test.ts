import { describe, expect, it } from 'vitest';
import { emptyData } from './finance';
import { decrypt, encrypt, newSalt } from './sync';

describe('cifratura', () => {
  it('cifra e decifra i dati con la password giusta', async () => {
    const data = { ...emptyData(), deleted: { x: 1 } };
    const salt = newSalt();
    const content = await encrypt(data, 'password segreta', salt);
    expect(content).not.toContain('Conto principale');
    const out = await decrypt(content, 'password segreta');
    expect(out.data).toEqual(data);
    expect(out.salt).toBe(salt);
  });

  it('usa un vettore casuale diverso a ogni salvataggio', async () => {
    const salt = newSalt();
    const a = JSON.parse(await encrypt(emptyData(), 'pw123456', salt));
    const b = JSON.parse(await encrypt(emptyData(), 'pw123456', salt));
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('rifiuta una password errata', async () => {
    const content = await encrypt(emptyData(), 'giusta123', newSalt());
    await expect(decrypt(content, 'sbagliata')).rejects.toThrow('Password di cifratura errata');
  });
});
