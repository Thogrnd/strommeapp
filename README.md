# Strømmeapp

En webapp for telefonen som samler strømmetjenestene dine på ett sted:

- **Søk** på tvers av tjenestene. Treff på tjenester du har, vises øverst.
- **Se senere**: én felles liste for alt, lagret bare på telefonen din.
- **Mine tjenester**: velg land og hvilke tjenester du abonnerer på.

Data om hvor titlene finnes kommer fra JustWatch, via TMDB.

## Kom i gang (første gang)

### 1. Slå på GitHub Pages
1. Åpne repoet på GitHub og gå til **Settings → Pages**.
2. Under **Build and deployment**, velg **Source: Deploy from a branch**.
3. Velg **Branch: main** og mappen **/ (root)**, og trykk **Save**.
4. Etter 1–2 minutter ligger appen her:

```
https://thogrnd.github.io/strommeapp/
```

### 2. Hent en gratis TMDB-nøkkel
1. Lag en konto på themoviedb.org og bekreft e-posten.
2. Gå til denne siden og be om en API-nøkkel (velg personlig bruk):

```
https://www.themoviedb.org/settings/api
```

3. Kopier **API Read Access Token** (den lange som starter med `eyJ`).

### 3. Sett opp appen
1. Åpne appen på telefonen. Den starter på **Tjenester**.
2. Lim inn nøkkelen og trykk **Lagre og test**.
3. Kryss av for tjenestene du har.
4. Legg appen på hjemskjermen: i Chrome, åpne menyen (⋮) og velg **Legg til på startsiden** eller **Installer app**.

## Godt å vite
- Nøkkelen og lista lagres bare i nettleseren på telefonen. Ta en kopi under **Tjenester → Sikkerhetskopi** av og til.
- «Åpne i …»-knappen åpner tjenestens eget søk med tittelen ferdig utfylt. **Alle direktelenker (JustWatch)** i detaljvisningen går rett til tittelen.
- Oversikten fra JustWatch oppdateres daglig, men kan henge litt etter.

Denne appen bruker TMDB API, men er ikke godkjent eller sertifisert av TMDB.
