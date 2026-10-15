# Le mie finanze

App web (installabile anche su telefono e computer come PWA) per gestire le finanze personali:

- **Conti e carte**: conto corrente, carte, contanti e risparmi, ciascuno con il proprio saldo iniziale; saldo per conto e disponibilità totale; trasferimenti tra conti.
- **Budget minimo**: per un conto come Satispay imposti la cifra da mantenere (es. 75 €) e il conto da cui ricaricarlo; la ricarica viene registrata in automatico o proposta con un tasto.
- **Entrate e uscite**: registra i movimenti con importo, data, categoria e descrizione; filtra per tipo, categoria o testo.
- **Movimenti previsti**: entrate, uscite e trasferimenti con data futura (es. il welfare aziendale in arrivo) non cambiano il saldo di oggi ma contano nelle previsioni, e diventano effettivi da soli alla data indicata.
- **Avviso soldi insufficienti** ⚠️: l'app simula i saldi fino al giorno prima del prossimo stipendio (giorno impostabile, predefinito il 15) considerando movimenti previsti, voci mensili da pagare e ricariche, e segnala con un triangolo giallo i conti che non coprirebbero i pagamenti; l'avviso sparisce quando i soldi bastano.
- **Flusso dei soldi**: dal riepilogo si apre un diagramma di Sankey del mese (entrate per categoria → spese per categoria e risparmio), con vista a tabella.
- **Spese ricorrenti**: voci fisse (affitto, bollette, abbonamenti, stipendio…) con giorno, primo addebito, frequenza (ogni mese, 2, 3, 6 mesi o ogni anno) ed eventuale numero di rate; alla scadenza vengono registrate da sole tra i movimenti (oppure le spunti tu).
- **Andamento del saldo**: grafico del saldo totale giorno per giorno (1, 3, 6 o 12 mesi) con la previsione tratteggiata fino al prossimo stipendio.
- **Promemoria**: all'apertura dell'app una notifica ricorda i pagamenti di domani, le voci scadute da registrare e gli avvisi sui conti (su iPhone serve l'app aggiunta alla schermata Home).
- **Acquisti in programma**: annota cosa vuoi comprare, il costo, la priorità e la data obiettivo; l'app calcola quanto mettere da parte ogni mese. Quando compri, l'uscita viene registrata.
- **Riepilogo mensile**: entrate, uscite, saldo, previsione di fine mese (con le voci fisse ancora da registrare), spese per categoria e andamento degli ultimi 6 mesi.
- **Backup**: esporta/importa i dati in JSON ed esporta i movimenti in CSV (apribile con Excel).
- Tema chiaro/scuro, funziona offline.

I dati sono salvati nel browser del dispositivo (localStorage): non c'è un server dell'app né un account da creare.

## Sincronizzazione tra dispositivi (facoltativa, cifrata)

Da *Impostazioni → Sincronizzazione tra dispositivi* puoi usare gli stessi dati su telefono e computer:

- i dati vengono **cifrati nel browser** (AES-GCM 256 bit, chiave derivata dalla tua password con PBKDF2-SHA256, 600.000 iterazioni) prima di lasciare il dispositivo;
- il file cifrato viene salvato in un **Gist segreto del tuo account GitHub**: né GitHub né altri possono leggerne il contenuto senza la password;
- su ogni dispositivo servono un token GitHub con il solo permesso *Gists: Read and write* e la stessa password;
- le modifiche fatte su più dispositivi vengono unite (per ogni voce vince la modifica più recente, le eliminazioni si propagano).

Token e password restano salvati solo nel browser di ciascun dispositivo. Se perdi la password i dati online non sono recuperabili, ma quelli sui dispositivi restano.

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
