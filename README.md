# 🚗 Lift Runner — PezzaliAPP Edition  
**Un esperimento di logica, velocità e precisione.**  
Sviluppato, scritto e diretto da **Alessandro Pezzali**.

---

## 🎮 Introduzione

**Lift Runner** nasce come esperimento tecnico e creativo: un gioco costruito interamente in **HTML5 + JavaScript puro**, ottimizzato per funzionare **offline come PWA** su qualsiasi dispositivo — desktop, smartphone o tablet.  

Il concetto è semplice, ma solo in apparenza:  
> Evita gli ostacoli, allinea l’auto su un sollevatore e sali di livello.  
> Ogni piano è più veloce, più stretto, più imprevedibile.  

Nato all’interno del progetto **[pezzaliAPP.com](https://pezzaliapp.com/#giochi)**, Lift Runner rappresenta un esercizio di equilibrio tra **design minimale, logica dei percorsi e fisica di gioco**, con un codice interamente scritto a mano, senza framework né librerie esterne.

---

## 🧠 Filosofia del progetto

Lift Runner è molto più di un semplice arcade:  
è una metafora del **tempo, del rischio e delle decisioni rapide**.  
Il giocatore deve scegliere quando salire o restare, quando rischiare un turbo o attendere un’apertura, quando fidarsi di un "ghost lift" o evitare un ostacolo che rotola all’improvviso.

Come nella vita — e nelle vendite, — ogni errore costa tempo, ma ogni riflesso giusto moltiplica il punteggio.

---

## ⚙️ Caratteristiche tecniche

- **Motore canvas 2D** sviluppato da zero (senza engine o framework).  
- **Frequenza di aggiornamento** a 60 FPS ottimizzata per Safari, Chrome, Edge e Firefox.  
- **Supporto completo PWA:** installabile da browser e giocabile offline.  
- **Touch HUD arcade-style** per iPhone e Android, con D-pad e pulsanti virtuali `A` / `B`.  
- **Salvataggio automatico del punteggio migliore** (localStorage).  
- **Musiche ed effetti sonori generati in tempo reale** via *Web Audio API*.  
- **Versioni mobili e desktop perfettamente integrate**, con layout responsive e controlli adattivi.  

---

## 🚀 Funzionalità di gioco

- **Jump fisico realistico** con gravità e spinta verticale.  
- **Lift system dinamico:** sollevatori up/down con NPC e “Ghost lift” che teletrasporta.  
- **Turbo con barra di energia** e rigenerazione automatica.  
- **Combo e punteggi moltiplicati** in caso di bonus consecutivi.  
- **Shield temporaneo** per proteggerti una volta dagli urti.  
- **Pneumatici e cespugli rotolanti**, ostacoli mobili con fisica e caduta dai piani alti.  
- **NPC “Family”**: una madre col bambino che se investita termina la partita.  
- **UFO casuali** e bonus segreti ad alto punteggio.  

---

## 🧩 Compatibilità

| Dispositivo | Supporto | Note |
|--------------|-----------|------|
| 🖥️ Desktop (macOS / Windows) | ✅ | Giocabile da tastiera (`← → ↑ ↓` `L` `X` `Space`) |
| 📱 iPhone / iPad | ✅ | HUD touch ottimizzato, installabile come App PWA |
| 🤖 Android | ✅ | Funziona anche in modalità offline |
| 💻 Browser | ✅ | Chrome, Safari, Edge, Firefox, Brave |

---

## 🧱 Struttura del progetto

```text
LiftRunner/
├─ index.html                 # Interfaccia principale e HUD
├─ app.js                     # Motore del gioco (canvas, logica, audio, input)
├─ sw.js                      # Service Worker PWA (cache-first + auto-update)
├─ manifest.webmanifest       # Metadati PWA / installazione
├─ icons/
│  ├─ icon-192.png
│  ├─ icon-512.png
│  ├─ icon-192-maskable.png
│  ├─ icon-512-maskable.png
│  ├─ kubeapp-icon.png
│  └─ pezzaliAPP-logo.png
└─ README.md                  # Questo file
---

## 🧩 Collegamenti integrati

Lift Runner fa parte dell’universo **PezzaliAPP**:  
una costellazione di app, giochi e strumenti open-source creati per **divulgare cultura digitale**.

- 🎲 [KubeApp — Il Cubo Logico](https://www.alessandropezzali.it/KubeApp/)  
- 🚀 [pezzaliAPP.com — Cultura Digitale](https://pezzaliapp.com/#giochi)  
- 📚 eBook e manuali su Amazon Kindle firmati *Alessandro Pezzali / Il Quarto Attore*

---

## 🧩 Autore

**Alessandro Pezzali**  
Fondatore e sviluppatore open-source di [pezzaliAPP.com](https://pezzaliapp.com)  
Autore di eBook tecnici e noir pubblicati su Amazon Kindle.  
Appassionato di logica, vintage computing, PWA e cultura digitale.

📧 [info@alessandropezzali.it](mailto:info@alessandropezzali.it)  
🌐 [www.alessandropezzali.it](https://www.alessandropezzali.it)  
🐙 [github.com/pezzaliapp](https://github.com/pezzaliapp)

---

## ⚖️ Licenza

**MIT License**  
© 2025 — Alessandro Pezzali / PezzaliAPP  

Il codice può essere riutilizzato liberamente per scopi didattici e sperimentali, citando la fonte.  
Non è consentita la rivendita commerciale senza autorizzazione esplicita.

---

## ❤️ Ringraziamenti

Grazie a chi sostiene la filosofia *no-cloud, no-cost, open-source*.  
Lift Runner è dedicato a chi crede che la programmazione possa ancora essere un atto poetico.

> “Ogni riga di codice è una decisione.  
> E ogni decisione, se fatta con coraggio, diventa un salto di livello.”
>
> — *Alessandro Pezzali*
