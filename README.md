# Le mie finanze

App web (installabile anche su telefono e computer come PWA) per gestire le finanze personali:

- **Entrate e uscite**: registra i movimenti con importo, data, categoria e descrizione; filtra per tipo, categoria o testo.
- **Spese mensili**: imposta le voci fisse (affitto, bollette, abbonamenti, stipendio…) e ogni mese segnale come pagate/incassate con un tocco; il movimento viene registrato in automatico.
- **Acquisti in programma**: annota cosa vuoi comprare, il costo, la priorità e la data obiettivo; l'app calcola quanto mettere da parte ogni mese. Quando compri, l'uscita viene registrata.
- **Riepilogo mensile**: entrate, uscite, saldo, previsione di fine mese (con le voci fisse ancora da registrare), spese per categoria e andamento degli ultimi 6 mesi.
- **Backup**: esporta/importa i dati in JSON ed esporta i movimenti in CSV (apribile con Excel).
- Tema chiaro/scuro, funziona offline.

I dati sono salvati **solo nel browser del dispositivo** (localStorage): nessun server, nessun account. Usa *Impostazioni → Esporta backup* per conservarli o trasferirli su un altro dispositivo.

## Sviluppo

Richiede Node.js 20+.

```bash
npm install
npm run dev      # server di sviluppo su http://localhost:5173
npm test         # test della logica di calcolo
npm run build    # build di produzione in dist/
npm run preview  # anteprima della build
```

## Pubblicazione

Il workflow `.github/workflows/deploy.yml` pubblica l'app su GitHub Pages a ogni push su `main`.
Per attivarlo: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
L'app sarà disponibile su `https://<utente>.github.io/<repository>/`.

La cartella `dist/` è statica e può essere pubblicata anche su Netlify, Vercel, Cloudflare Pages o qualsiasi hosting.

## Installazione sul telefono

Apri l'indirizzo dell'app dal browser del telefono e scegli **Aggiungi a schermata Home** (Safari su iPhone) o **Installa app** (Chrome su Android).
