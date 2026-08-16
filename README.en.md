# Company Project Management Platform

> An AI-native, full-stack project management platform: delivery workflows × an auditable agent runtime × a liquid-glass UI

[![Node](https://img.shields.io/badge/node-%3E%3D22%20%3C26-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> [English](README.en.md) | [中文](README.md)

---

## Why this platform

**1. AI with real security boundaries, not a bolt-on chat box**

- Ships a DeepSeek Harness (dsh) JSON-RPC inference subprocess: session persistence & replay, context compaction, checkpoints, token metering
- A three-tier AI tool surface: assistant sessions get **19 business-domain tools (152 platform operations)**; capability invocations run on **single-capability scoped tokens** (12 narrow tools); frontend management is **closed declarative directives** (no executable code accepted)
- Every AI write requires **user approval + audit-first** (a failed audit write aborts the side effect); browser control runs with DNS pinning, rebinding detection, and host allowlists; page text is masked before reaching the model

**2. Enterprise-grade defense in depth**

- 5-role RBAC (admin/pm/pdm/dev/qa) across 19 pages and the operation matrix, enforced per request server-side
- AI execution path: HMAC-signed scoped tokens (single-use / session), loopback-only gateway, token_version session revocation (a password change signs every device out)
- Full audit trail and activity timeline; OpenAPI contract and route-coverage tests keep the permission surface from drifting silently

**3. Verifiable engineering quality**

- **520 API + 196 web unit/integration tests**, multi-role Playwright E2E, and an RC drill chain (SQLite backup/restore, graceful shutdown, production smoke) in one command
- `npm run check:rc` = audit + lint + test + build + preflight + drills + smoke + disposable-database E2E

**4. Modern stack, zero-friction start**

- Frontend: React 19 + TypeScript + Vite + Tailwind, **bilingual EN/中文** (2,700+ keys), liquid-glass design system, drag-to-reorder detail sections, AI-driven UI directives
- Backend: Express + SQLite by default (no external services); single-process production mode serves **API + frontend from one origin**, with the inference subprocess started on demand

## Feature map

| Group | Pages | Highlights |
| --- | --- | --- |
| Daily work | Dashboard / My Work / Team / Team Logs / Capacity / Activity | Personal queues & handoffs, member profiles, overload alerts, audit timeline |
| Delivery | Projects / Requirements / Testing / Delivery Center | WBS · kanban · burndown, requirement state machine with optimistic locking, test-run matrix, build–release gates |
| Knowledge & AI | Documents / AI Analysis / DSH UI / Reports | Document collaboration + AI analysis, tool-calling assistant, declarative custom views, business reports |
| Administration | Products / Flow / Settings | Product–program–portfolio, fixed & lightweight delivery templates, AI provider & user management |

Reminder scheduling, AI requirement scoring, smart work-log analysis, and hybrid RAG search run across these pages.

## Screenshots

Taken from the local dev environment (signed in as `admin@example.com`); full set in `docs/screenshots/`.

### Login & Dashboard

| Login | Dashboard |
| --- | --- |
| ![Login](docs/screenshots/01-login.png) | ![Dashboard](docs/screenshots/02-dashboard.png) |

### Daily work

| My Work | Team |
| --- | --- |
| ![My Work](docs/screenshots/03-mywork.png) | ![Team](docs/screenshots/04-team.png) |

| Team Logs | Capacity |
| --- | --- |
| ![Team Logs](docs/screenshots/05-teamlogs.png) | ![Capacity](docs/screenshots/06-capacity.png) |

| Activity |
| --- |
| ![Activity](docs/screenshots/07-dynamic.png) |

### Delivery

| Projects | Requirements |
| --- | --- |
| ![Projects](docs/screenshots/08-projects.png) | ![Requirements](docs/screenshots/09-requirements.png) |

| Testing | Delivery |
| --- | --- |
| ![Testing](docs/screenshots/10-testing.png) | ![Delivery](docs/screenshots/11-delivery.png) |

### Knowledge & AI

| Documents | AI Analysis |
| --- | --- |
| ![Documents](docs/screenshots/12-documents.png) | ![AI](docs/screenshots/13-ai.png) |

| Reports |
| --- |
| ![Reports](docs/screenshots/14-reports.png) |

### Administration

| Products | Flow |
| --- | --- |
| ![Products](docs/screenshots/15-products.png) | ![Flow](docs/screenshots/16-flow.png) |

| Settings |
| --- |
| ![Settings](docs/screenshots/17-settings.png) |

## Architecture

```
┌────────────────────────── Browser ─────────────────────────┐
│  React 19 SPA (liquid-glass UI · i18n · sortable sections ·  │
│  realtime WS push)                                          │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (same-origin /api /ws)
┌───────────────▼─────────────────────────────────────────────┐
│  API control plane (Express)                                │
│  RBAC · audit · idempotency · REST (OpenAPI) · reminders ·  │
│  SQLite                                                      │
│  ┌───────────────────────────────────────────────┐          │
│  │ Execution gateway (loopback-only, HMAC tokens) │          │
│  │ Platform op proxy → own REST (short-lived      │          │
│  │ token + audit-first writes)                    │          │
│  └──────────────┬────────────────────────────────┘          │
└────────────────┼────────────────────────────────────────────┘
                 │ JSON-RPC (stdio, sanitized env + per-capability token)
┌────────────────▼────────────────────────────────────────────┐
│  Harness inference subprocess (dsh/cordis composition)      │
│  Company tools (19 domains) · skill catalog · ask-user &    │
│  approval bridges · session projection                      │
└─────────────────────────────────────────────────────────────┘
```

Key boundary: provider keys live only in the API control plane; the inference subprocess holds short-lived loopback tokens and can never see user credentials or the database.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19 · TypeScript 5.7 · Vite 6 · Tailwind CSS · react-i18next · Playwright (E2E) |
| Backend | Node.js ≥22 · Express 4 · SQLite (node:sqlite) · JWT · bcrypt · ws |
| AI runtime | @deepseek-ai/dsh SDK (cordis composition runtime, session persistence/projection, token metering, compaction) |
| Quality | node:test (520 API cases) · Vitest (196 web cases) · multi-role Playwright E2E · OpenAPI contract tests |

## Quick start (development)

```bash
npm install          # install monorepo deps (api + web workspaces)
npm run dev          # API on :4010 + Vite on :5173, concurrently
```

- Web: http://localhost:5173 (Vite proxies `/api` → 4010)
- API health: `GET http://localhost:4010/api/health`

Development-only accounts (empty business data by default):

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `Admin@123` |
| PM | `pm@example.com` | `Pm@12345` |
| PDM | `pdm@example.com` | `Pdm@12345` |
| Dev | `dev@example.com` | `Dev@12345` |
| QA | `qa@example.com` | `Qa@12345` |

## Internal trial / single-machine production (same origin)

One process serves **API + the `web/dist` frontend** (`/api`, `/ws` same-origin) and starts the Harness subprocess on demand:

```bash
npm run build -w web
export JWT_SECRET='replace-me-16chars'                       # >= 16 chars
export AI_CONFIG_ENCRYPTION_KEY='replace-me-ai-16'           # >= 16, != JWT_SECRET
export NODE_ENV=production
export SEED_ADMIN_EMAIL='owner@company.com'                  # first admin
export SEED_ADMIN_PASSWORD='one-time-strong-password'
export HARNESS_HOME='/var/lib/pm/harness'                    # dedicated to the API account
npm run start:prod     # http://localhost:4010/
```

- `GET /api/health` covers control-plane/DB readiness only — not provider or inference availability
- The production login page never shows or prefills credentials; after first login remove `SEED_ADMIN_*` and restart
- Never set `SEED_DEMO_DATA=1` or role `SEED_*_PASSWORD` in production
- Deployment, Harness boundaries, backup & rollback: [docs/deployment-and-ops.md](./docs/deployment-and-ops.md) (Chinese)

## Build & quality gates

```bash
npm run build        # production web build (with typecheck)
npm run test         # all API + web unit/integration tests
npm run lint         # ESLint (api + web)
npm run check        # audit + lint + test + build + preflight + backup/shutdown drills + prod smoke
npm run check:rc     # check + disposable-SQLite multi-role RC E2E
```

## Repository layout

```
├── api/                    # Express API
│   ├── config/harness/     # dsh composition runtime, company tool plugins, methodology skills
│   ├── src/modules/        # domain modules (projects/requirements/testing/ai/...)
│   ├── src/security/       # RBAC, project access, upload/URL policies
│   └── test/               # 520 node:test cases (incl. contract & security regressions)
├── web/                    # React SPA
│   ├── src/features/       # domain-organized feature components
│   ├── src/styles/global/  # layered styles (foundation → components → features → overlays)
│   └── e2e/                # multi-role Playwright E2E
├── docs/                   # design docs, as-built ledgers, ops manual, screenshots
└── scripts/                # RC E2E, runtime packaging, visual audit tooling
```

## Documentation

- [Design & architecture](./docs/design-and-architecture.md) · [Trade-offs & decisions](./docs/trade-offs-and-decisions.md) · [Deployment & ops](./docs/deployment-and-ops.md) (Chinese)
- [Implementation status ledger](./docs/10-实现状态与差异清单.md) · [One-page review summary](./docs/15-项目审查一页摘要.md) · [dsh foundation plan](./docs/17-dsh-foundation-plan.md) (Chinese)
- [Docs index](./docs/README.md)

## Contributing & license

- See [CONTRIBUTING.md](./CONTRIBUTING.md); security disclosure policy in [SECURITY.md](./SECURITY.md)
- [MIT License](./LICENSE) © 2026
