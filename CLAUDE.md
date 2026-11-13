# CLAUDE.md — contesto del progetto "Le mie finanze"

Questo file riassume l'app per le sessioni di Claude Code. **Leggilo prima di esplorare il codice** e aggiornalo quando l'utente lo chiede (o quando cambia qualcosa descritto qui).

## Cos'è

PWA personale (un solo utente, italiano) per gestire le proprie finanze: conti, entrate/uscite, spese ricorrenti, acquisti e spese sicure, previsioni e avvisi. Usata soprattutto da **iPhone** (installata sulla schermata Home) e da PC.

- Online su GitHub Pages: `https://simson-51.github.io/Finance-app/` (repo pubblico `Simson-51/Finance-app`).
- **Nessun server**: i dati stanno nel `localStorage` del browser. Sincronizzazione facoltativa tra dispositivi, **cifrata lato client**, in un Gist segreto dell'utente.
- Interfaccia, commenti nel codice, messaggi di commit e PR: **in italiano**.

## Stack e comandi

- React 19 + TypeScript + Vite. Nessuna libreria per stato, grafici o UI: grafici in SVG scritti a mano, CSS in un solo file.
- `npm test` (Vitest, logica pura) e `npm run build` (typecheck `tsc --noEmit` + build): **eseguirli prima di ogni push**.
- `npm run dev` / `npm run preview` (porta 4173) per provare. Le prove nel browser si fanno con Playwright (Chromium in `/opt/pw-browsers`, playwright installato globalmente: importarlo con il percorso di `npm root -g`). Per date fisse usare `context.clock.install(...)`.
- `.github/workflows/deploy.yml`: test + build + deploy su Pages a ogni push su `main`.

## Mappa dei file

| File | Contenuto |
|---|---|
| `src/types.ts` | Modello dati: `Account`, `Transaction`, `Recurring`, `Planned`, `Category`, `Data` (version 2). |
| `src/finance.ts` | **Tutta la logica pura** (date, importi, riepiloghi, saldi, previsioni, ricariche, pagamenti automatici, spese sicure, unione dati, Sankey, serie del saldo, CSV, migrazione). Testata. |
| `src/store.ts` | Hook `useStore`: stato + salvataggio in `localStorage`, azioni (save/delete/…), timbro `updatedAt`, marcatori di eliminazione, riconciliazione automatica (`reconcileAutoPay` + `reconcileTopUps`) a ogni modifica e al cambio giorno. |
| `src/sync.ts` | Cifratura (AES-GCM 256, chiave PBKDF2-SHA256 600k iterazioni dalla password) e API dei Gist (`connect`, `pull`, `push`). |
| `src/useSync.ts` | Hook di sincronizzazione: all'avvio, in primo piano, ogni minuto, 1,5 s dopo ogni modifica; unisce con `merge`. |
| `src/backup.ts` | Esportazione del backup su file, data dell'ultimo backup e promemoria mensile (`backupDue`, solo senza sincronizzazione). |
| `src/components/categories.tsx` | `CategoriesContext`, `CategorySelect` (con «＋ Nuova categoria…»), `askCategory`. |
| `src/notify.ts` | Promemoria con notifiche di sistema **solo all'apertura** dell'app (`buildReminder`, `notifyIfNeeded`). |
| `src/App.tsx` | Navigazione a schede, mese selezionato, tema, giorno dello stipendio, trigger dei promemoria. |
| `src/components/Dashboard.tsx` | Riepilogo: avvisi, KPI, disponibile libero, previsione fine mese, Sankey, andamento saldo, conti, categorie, ultimi 6 mesi, voci da registrare, movimenti previsti/recenti. |
| `src/components/Transactions.tsx` | Modulo e lista movimenti (entrata/uscita/trasferimento, "Previsto"). |
| `src/components/Accounts.tsx` | Conti, saldo iniziale, budget minimo/ricarica, `AccountSelect`. |
| `src/components/Recurring.tsx` | Voci ricorrenti (tab "Mensili"): primo addebito, frequenza, rate, registrazione automatica. |
| `src/components/Planned.tsx` | Tab "Acquisti": **spese sicure** + desideri (acquisti in programma). |
| `src/components/Alerts.tsx` | Avvisi ⚠️ (cliccabili con dettaglio), ricariche proposte, hook `useForecast(data, payday)`. |
| `src/components/Sankey.tsx`, `BalanceChart.tsx` | Grafici SVG (flusso del mese, andamento del saldo). |
| `src/components/Settings.tsx` | Sincronizzazione, promemoria, giorno stipendio, tema, backup/import/CSV, reset. |
| `src/components/ui.tsx` | `Modal` (`<dialog>`, bottom sheet su mobile), `Field`, `Empty`, `Progress`. |
| `public/sw.js` | Service worker: pagine network-first con `cache: 'no-cache'`, asset cache-first, clic sulle notifiche. A ogni pagina scaricata (`storePage`) mette in cache i suoi JS/CSS (offline dalla prima apertura) ed elimina quelli delle versioni vecchie. Cambiare `CACHE` quando cambia il SW. |
| `src/main.tsx` | Avvio, `ErrorBoundary` (messaggio con "Ricarica" ed "Esporta backup" al posto della pagina bianca), registrazione del SW. |
| `src/*.test.ts` | `finance.test.ts`, `forecast.test.ts`, `sync.test.ts`. |

## Modello dati e regole importanti

- **Sincronizzazione/unione**: ogni record ha `updatedAt` (ms); `Data.deleted` mappa id → istante di eliminazione. `merge()` è commutativa e idempotente: vince l'`updatedAt` più recente, un record eliminato resta eliminato salvo modifiche successive. Ogni nuova azione dello store deve timbrare `updatedAt` e usare i marcatori di eliminazione (vedi `upsertIn`, `removeFrom`, `patchTransactions`).
- **Id fissi** per i record creati in automatico, così due dispositivi producono lo stesso record: `topup-<conto>-<giorno>` (ricariche) e `autopay-<voce>-<mese>` (pagamenti automatici). Se l'utente li elimina, il marcatore di eliminazione impedisce di ricrearli.
- **Migrazione**: `normalize()` porta qualsiasi dato al formato attuale (aggiunge `updatedAt: 0`, crea il conto `default` "Conto principale" se mancano conti). Nuovi campi vanno aggiunti come **facoltativi** e gestiti se assenti.
- **Conti**: saldo = `initialBalance` + movimenti fino alla data. I trasferimenti (`kind: 'trasferimento'`, `toAccountId`) non sono né entrate né uscite. Budget minimo: `minBalance` + `topUpFrom` + `autoTopUp` (automatica = un trasferimento al giorno con id fisso, ricalcolato; manuale = proposta con tasto).
- **Movimenti con data futura** = "previsti": non cambiano il saldo di oggi, contano nelle previsioni, diventano reali alla data.
- **Voci ricorrenti**: `startMonth` (primo addebito; per le voci vecchie si deduce da `updatedAt` con `defaultStartMonth`), `everyMonths` (1/2/3/6/12), `endMonth` (rate), `autoPay`. Usare sempre `recurringDue(r, month)`, mai solo `r.active`. Il pagamento di un mese si trova con `recurringPayment` (mese da `paymentMonth`: i pagamenti automatici restano legati al mese del loro id anche se la data cambia). I movimenti si eliminano con `removeTransactions`, che blocca anche la ricreazione del pagamento automatico.
- **Voci scadute dei mesi passati**: `scheduledEvents` e `overdueRecurring` guardano fino a `OVERDUE_MONTHS` (3) mesi indietro; le voci non registrate contano come dovute oggi e compaiono nel Riepilogo tra le "Voci mensili da registrare". Escluse le voci senza inizio noto (`startMonth` assente e `updatedAt` 0).
- **Categorie**: predefinite in `CATEGORIES` + personalizzate in `Data.categories` (id fisso `cat-<tipo>-<nome minuscolo>`, sincronizzate come gli altri record). Usare `categoriesFor(custom, kind, keep)` per gli elenchi. Togliere una categoria non tocca i movimenti.
- **Allinea saldo**: `store.alignBalance(conto, saldoReale)` registra la differenza come movimento `adjustment: true` in categoria `UNCLASSIFIED` ("Da classificare"); `store.splitAdjustment` la divide in movimenti veri e quello che avanza resta da classificare. Nei moduli le differenze si aprono in `SplitForm` (dentro `TransactionForm`, se riceve `onSplit`).
- **Macro-categorie** (`Macro`: bisogni, desideri, risparmio): ogni categoria di spesa confluisce in una macro con `macroOf` (predefinite in `NEEDS`, il resto desideri; l'utente la cambia con un record `Category.macro`, anche per le predefinite). Nel risparmio contano i trasferimenti verso i conti di tipo `risparmio`. `macroSummary(data, mese)` dà speso, previsto e stato del **budget dei desideri** (`Data.settings.wantsBudget`, avviso dall'80%: `BUDGET_WARN_AT`). `Data.settings` è facoltativo e in `merge` vince l'`updatedAt` più recente.
- **Spese sicure** (`Planned.committed`): debiti/acquisti già fatti ma non addebitati, `accountId` e `targetDate` facoltativi. Saldo mostrato = reale; accanto "Impegnati" e **"Disponibile libero"** (saldo − spese sicure). Con conto: entrano in `scheduledEvents` (alla data o da subito se senza data). Senza conto: avviso globale `forecast().unassigned`.
- **Previsioni e avvisi**: `forecast(data, from, to)` simula giorno per giorno (movimenti futuri, voci ricorrenti non registrate, scadute = dovute oggi, spese sicure, ricariche) e registra `steps` per il dettaglio. Gli avvisi usano l'orizzonte **fino al giorno prima del prossimo stipendio** (`nextPayday`, giorno impostabile, predefinito **15**). Un conto nato negativo (carta di credito) segnala solo il peggioramento.
- La **previsione di fine mese** (`monthSummary`) nel mese in corso conta anche le spese sicure senza data o con data passata.
- La ricerca per testo in Movimenti guarda **tutti i mesi**.
- Importi: `parseAmount` accetta "12,50", "1.234,56" e "1.500" (migliaia); `euro()` usa uno **spazio non separabile** prima di € (attenzione nei test).

## Decisioni prese con l'utente

- Notifiche: **solo all'apertura dell'app**, niente server push (scelta per privacy). L'alternativa del file calendario (.ics) è stata proposta ma per ora non voluta.
- Avvisi fino allo stipendio del 15 (l'utente riceve lo stipendio quel giorno).
- Spese sicure dentro la tab Acquisti; saldo reale + disponibile libero (non scalate dal saldo); generano avvisi.
- Registrazione automatica delle voci ricorrenti attiva di default per le nuove.
- **Mai cancellare o riscrivere i dati dell'utente** con una modifica: solo campi nuovi facoltativi, gestiti da `normalize()`.
- La sincronizzazione resta (l'utente usa solo l'iPhone: gli serve come copia online); senza sincronizzazione c'è il promemoria mensile del backup.
- Budget: non per singola categoria ma per macro-categoria; solo i desideri hanno un limite. Le categorie confluiscono da sole nella macro (niente doppia scelta nei moduli).
- Rimandati: import CSV dagli estratti conto (formati diversi per banca), obiettivi di risparmio collegati a un conto, promemoria via calendario.

## Convenzioni UI

- Mobile-first (iPhone, ~390–430 px): barra in basso con 5 schede, Impostazioni dall'icona ⚙ in alto; su desktop schede in alto. Moduli in `Modal` (bottom sheet su mobile). Su iOS attenzione ai campi data (già corretti in CSS).
- Tema chiaro/scuro con variabili CSS in `styles.css` (sia `prefers-color-scheme` sia `data-theme`).
- Grafici: colori validati per daltonismo — entrate `--flow-in`, spese `--flow-out`, risparmi `--flow-save`; griglie a linea sottile continua, tratteggio solo per le previsioni, tooltip al passaggio, vista a tabella. I grafici misurano la larghezza reale (ResizeObserver) per tenere i testi leggibili.
- Dopo modifiche visibili: provare nel browser (telefono + desktop, tema scuro) e inviare screenshot all'utente.

## Flusso di lavoro Git

- Sviluppo sul branch `claude/personal-finance-app-vr8p6y`; una PR verso `main` per ogni blocco di lavoro, descrizione in italiano. L'utente unisce le PR da GitHub.
- **Dopo ogni merge**, ripartire da `main`: `git fetch origin main && git checkout -B claude/personal-finance-app-vr8p6y origin/main`.
- Pages: se il deploy dopo il merge fallisce, è di solito la regola dell'environment `github-pages` (deve consentire `main`); si può rilanciare da Actions → "Deploy su GitHub Pages".
