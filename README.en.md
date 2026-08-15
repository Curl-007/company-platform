# Company Project Management Platform

A deliverable full-stack project management platform, including a frontend Web application and a backend API service.

## Overview

An AI-driven enterprise project collaboration workspace covering the full project, requirement, task, and testing lifecycle, with Kanban drag-and-drop, sprint burndown visualization, AI document analysis, intelligent work log interpretation, operation audit trails, and activity tracking. Pages are organized into four groups:

- **Daily Work**: Dashboard, My Work, Team, Team Logs, Capacity, Activity
- **Project Delivery**: Projects, Requirements, Testing, Delivery
- **Knowledge & AI**: Documents, AI Analysis, Reports
- **Administration**: Products, Workflow, Settings

## Screenshots

The screenshots below were captured in the local development environment (signed in with the development test account `admin@example.com`). The full set lives in `docs/screenshots/`.

### Sign-in & Dashboard

| Sign-in | Dashboard |
| --- | --- |
| ![Sign-in](docs/screenshots/01-login.png) | ![Dashboard](docs/screenshots/02-dashboard.png) |

### Daily Work

| My Work | Team |
| --- | --- |
| ![My Work](docs/screenshots/03-mywork.png) | ![Team](docs/screenshots/04-team.png) |

| Team Logs | Capacity |
| --- | --- |
| ![Team Logs](docs/screenshots/05-teamlogs.png) | ![Capacity](docs/screenshots/06-capacity.png) |

| Activity |
| --- |
| ![Activity](docs/screenshots/07-dynamic.png) |

### Project Delivery

| Projects | Requirements |
| --- | --- |
| ![Projects](docs/screenshots/08-projects.png) | ![Requirements](docs/screenshots/09-requirements.png) |

| Testing | Delivery |
| --- | --- |
| ![Testing](docs/screenshots/10-testing.png) | ![Delivery](docs/screenshots/11-delivery.png) |

### Knowledge & AI

| Documents | AI Analysis |
| --- | --- |
| ![Documents](docs/screenshots/12-documents.png) | ![AI Analysis](docs/screenshots/13-ai.png) |

| Reports |
| --- |
| ![Reports](docs/screenshots/14-reports.png) |

### Administration

| Products | Workflow |
| --- | --- |
| ![Products](docs/screenshots/15-products.png) | ![Workflow](docs/screenshots/16-flow.png) |

| Settings |
| --- |
| ![Settings](docs/screenshots/17-settings.png) |

## Layout

- `web/`: React + TypeScript frontend application
- `api/`: Node.js + SQLite backend API service
- `docs/`: design docs and implementation notes (including `screenshots/`)

## Getting Started

Install dependencies:

```bash
npm install
```

Development (API + Vite proxy):

```bash
npm run dev
```

Default addresses:

- Frontend (Vite): http://localhost:5173
- Backend API: http://localhost:4010

## Internal Trial / Single-Machine Production (Same Origin)

A single-machine API service instance hosts **the API + the `web/dist` static frontend** (`/api` and `/ws` share the origin) and lazily owns a DeepSeek Harness JSON-RPC inference subprocess:

```bash
npm run build -w web
# Required production keys (>=16 chars, and AI_CONFIG_ENCRYPTION_KEY != JWT_SECRET)
export JWT_SECRET='replace-me-16chars'
export AI_CONFIG_ENCRYPTION_KEY='replace-me-ai-16'
export NODE_ENV=production
export SEED_DEMO_DATA=0
export SEED_ADMIN_EMAIL='owner@company.com'
export SEED_ADMIN_PASSWORD='replace-with-one-time-strong-password'
export HARNESS_HOME='/var/lib/pm/harness'  # persistent, service-account-only, outside the web root
# When AI_ENABLED=true, the API control plane alone owns Provider configuration
# and the real key; Harness receives only a random-token loopback proxy route.
npm run start:prod
```

Open http://localhost:4010/ in a browser.  
Health check (includes DB / migration readiness): `GET /api/health`. It represents API/database control-plane readiness, not Provider or Harness inference availability.

See [docs/deployment-and-ops.md](./docs/deployment-and-ops.md) for deployment, Harness operating boundaries, backup, and rollback.

## Build & Quality Gates

```bash
npm run build
npm run check          # audit+lint+test+build+preflight+drills+prod smoke
npm run check:rc       # check + disposable SQLite E2E
```

The production sign-in page never displays or pre-fills any account, email, or password. On first boot of a fresh database, both `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` must be set to create the initial administrator; after the first sign-in and password change, remove these two environment variables and restart.

## Development Test Accounts

The accounts below are for local development and automated testing only, not for production delivery. Business data is empty by default:

- Administrator: `admin@example.com` / `Admin@123`
- Project Manager: `pm@example.com` / `Pm@12345`
- Product Manager: `pdm@example.com` / `Pdm@12345`
- Developer: `dev@example.com` / `Dev@12345`
- QA: `qa@example.com` / `Qa@12345`

Production forbids `SEED_DEMO_DATA=1` and any role-specific `SEED_*_PASSWORD`. To persist an AI provider API key in the admin UI, you must also configure `AI_CONFIG_ENCRYPTION_KEY` separately (>=16 characters, and it must not equal `JWT_SECRET`). The real Provider key is visible only to the API control plane; Harness is the sole LLM inference kernel and receives only a short-lived loopback token, never public `DSH_*` credentials.
