# Tempo — Personal Planner & Tracker

A calendar-based personal planning and activity tracker. React + TypeScript
frontend, Go API, PostgreSQL.

## Run locally

The frontend needs the API for anything beyond the sign-in screen.

```bash
# 1. API (expects a reachable PostgreSQL; it creates its own tables on start)
cd server
DATABASE_URL='postgres://user@host:5432/tempo?sslmode=disable' go run ./cmd/server

# 2. Frontend, in another shell
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8080` in development.

## Quality checks

```bash
npm run lint
npm run test
npm run build
npm run check          # all three

cd server && go vet ./... && go test ./...
```

Backend tests need a real database, because the queries, CHECK constraints and
composite foreign keys are what they exercise. They skip when
`TEMPO_TEST_DATABASE_URL` is unset:

```bash
cd server
TEMPO_TEST_DATABASE_URL='postgres://user@host:5432/tempo_test?sslmode=disable' go test ./...
```

## Architecture

| Layer | Where |
| --- | --- |
| Typed API boundary | `src/api/tracker-api.ts` |
| HTTP client | `src/api/http-tracker-api.ts`, `src/api/auth-api.ts` |
| Test double | `src/api/mock-tracker-api.ts` |
| Go API | `server/internal/api` |
| Queries and schema | `server/internal/store` |

Every row is owned by a user and every query is scoped by `user_id`; no endpoint
accepts a user id from the client. Sessions are opaque tokens in an HttpOnly
cookie, and passwords are bcrypt hashes.

Registration seeds the four default projects for the new account.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `PORT` | no | API port, default `8080` |
| `SECURE_COOKIES` | no | Set `true` when served over TLS |

## Deployment

The `Dockerfile` builds the bundle and the Go binary, then runs nginx and the
API under supervisord in one image. nginx serves the SPA, proxies `/api/`, and
adds the security headers. `/healthz` is liveness; `/api/healthz` is readiness
and checks the database.

## Assistant access

Tempo ships an MCP server (`mcp/`) so Claude can create projects and log hours
conversationally, authenticated with a personal API token rather than your
password. See [docs/agent-setup.md](docs/agent-setup.md).

See [docs/technical-design.md](docs/technical-design.md) for the domain model,
API contract, and rendering rules.
