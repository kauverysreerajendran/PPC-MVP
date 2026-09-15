# Frontend (Next.js 15, App Router)

## Local development

```bash
npm install
npm run dev        # http://localhost:3000, Turbopack
```

### Why the first click on each page is slow in `next dev`

`next dev` compiles every route the first time it is visited in a session, so the
first navigation to a page can take several seconds (10–20 s for the larger
feature screens). That is a development-only cost and says nothing about
production speed.

To judge navigation speed, use a production build:

```bash
npm run build && npm run start   # http://localhost:3000
```

## Checks

```bash
npm run lint && npm run typecheck && npm run test
```
