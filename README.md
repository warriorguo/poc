# Tempo — Personal Planner & Tracker

A calendar-based personal planning and activity tracker. React + TypeScript, built with Vite.

## Run locally

```bash
npm install
npm run dev
```

Then open the local address printed by Vite.

## Quality checks

```bash
npm run lint
npm run test
npm run build
npm run check   # all three
```

## Where the data lives

Entries are stored in the browser's IndexedDB (`src/api/indexeddb-tracker-api.ts`)
behind the typed `TrackerApi` boundary, so they survive a reload and stay on the
device — there is no server and nothing leaves the browser. The four default
projects are seeded once on first run and never re-seeded.

If the browser refuses IndexedDB (private-browsing modes, blocked site data) the
app falls back to an in-memory adapter and shows a banner saying entries will not
be kept. `src/api/mock-tracker-api.ts` is that fallback, and is what the tests
run against.

Replacing browser storage with a real backend means writing one more `TrackerApi`
implementation; nothing above `src/api/` needs to change.

## Deployment

The `Dockerfile` builds the bundle with Node and serves it from nginx (`nginx.conf`,
which adds the SPA fallback, cache rules, and security headers). It is built and
deployed by the CI/CD platform as the app `tempo`, and `/healthz` is available as a
liveness probe.

See [docs/technical-design.md](docs/technical-design.md) for the domain model, API
contract, rendering rules, and delivery plan.
