# nabava.XP — Frontend

Vue 3 + Quasar Framework (SPA, Composition API, `<script setup>`)

## Razvoj

```bash
npm install
npm run dev
```

Quasar dev server pokreće se na `http://localhost:9000`.

API adresa konfigurira se kroz env varijablu `API_URL` (zadano: `http://localhost:3000/api`).  
Za drugačiju adresu postaviti u `client/.env`:

```env
API_URL=http://localhost:3000/api
```

## Testovi

```bash
npm test
```

Pokreće Vitest unit testove iz `src/__tests__/`.

## Lint

```bash
npm run lint
```

## Production build

```bash
npm run build
```

Output: `dist/spa/` — servira se putem nginx-a u Docker setupu.

## Docker

Nije potrebno ručno buildati — `docker compose up --build` iz root direktorija projekta pokreće sve.  
`API_URL` se prosljeđuje kao Docker build argument i bakeuje u SPA bundle.
