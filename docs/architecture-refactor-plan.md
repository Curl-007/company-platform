# Architecture Refactor Plan

## Goal

Move the project from prototype-style large files to feature-oriented modules without changing user-facing behavior.

## Target Backend Shape

```text
api/
  server.js                 # temporary compatibility entry
  src/
    security/
      accessControl.js
    middleware/
      auth.js
      errorHandler.js
    modules/
      projects/
        routes.js
        service.js
        repository.js
      documents/
      workLogs/
      requirements/
      delivery/
      ai/
    db/
      connection.js
      migrations.js
      seed.js
```

## Target Frontend Shape

```text
web/src/
  services/
    api.ts                  # low-level fetch/token wrapper
    apiClient.ts            # response unwrap/query/cache helpers
  features/
    projects/
      api.ts
      components/
      pages/
    workLogs/
      api.ts
    documents/
    requirements/
```

## Execution Order

1. Extract shared infrastructure first: API client, auth, permissions, error handling.
2. Move one feature at a time into feature-local API modules so pages can depend on their domain boundary directly.
3. Split backend routes by domain, then move business logic into services and database access into repositories.
4. Split large React pages by stable UI sections before changing behavior.
5. Add focused tests around extracted permission and service modules before tightening security rules.

## Current Implementation Status

Completed structural work keeps all existing route URLs and response shapes intact:

- `projects`: routes, service, and repository are separated; project membership operations use the same repository boundary.
- `projects`: source browsing, project delivery-flow reads, and milestone mutations now also use the project router/repository boundary; source browsing keeps path-traversal, binary-file, hidden-directory, and file-size protections.
- `requirements`: create/update defaults live in `service.js`; queries, optimistic-lock updates, child lookups, and dependency guards live in `repository.js`.
- `tasks` and `sprints`: create/update builders and dependency normalization live in `service.js`; task/Sprint persistence, list filters, versioned updates, and delete guards live in `repository.js`.
- `governance`: project risk and decision defaults live in `service.js`; risk-count synchronization and all governance persistence live in `repository.js`.
- `delivery`: build, release, approval, and rollback record construction lives in `service.js`; all build/release persistence and dependent-record deletion live in `repository.js`.
- `audit`: audit-log query filters and retention cap live in `repository.js`; the route remains responsible for permission checks and JSON field mapping.
- `defects`: defect creation defaults live in `service.js`; defect persistence and the associated derived-task cleanup live in `repository.js`.
- `capacity`: calendar, capacity plan, allocation, workload, and supporting lookup persistence now live in `repository.js`; the service builds capacity projections without direct SQL, and the route only handles HTTP validation, authorization, and audit orchestration.
- `dashboard`: project-scoped aggregation, personal dashboard filtering, and AI-summary input assembly now live in `service.js`; query operations live in `repository.js` and the route only binds the two existing dashboard URLs.
- `ai`: document-analysis jobs now have a dedicated route, service, repository, document-analysis service, model client, provider store, runner, timeout monitor, and asynchronous dispatcher boundary. Their `queued → running → awaiting_review → confirmed/rejected → retried/failed` lifecycle is validated centrally; prompt/result construction, shared model-call fallback, Provider persistence/health recording, secret migration, and local rule fallback live in the AI module; requirement creation and confirmation are committed in one transaction, and stale running jobs fail with audit evidence. The local dispatcher is intentionally replaceable by a Redis/Worker adapter without changing the HTTP contract.
- `auth`: login, current-user capabilities, and profile changes now have dedicated route, service, and repository boundaries. Credential checks remain server-side and every login/profile mutation keeps its audit record.
- `ai` provider administration: provider configuration, activation, enable/disable and deletion now sit behind a dedicated service and route boundary. API keys remain encrypted at rest and are contractually write-only/masked in all public responses.
- `ai` interactions: requirement scoring, scoped business advice, chat, and AI operational summaries now share a dedicated interaction route/service boundary. The summary contains Job and workflow evidence only; it does not produce employee performance scores or rankings.
- `workflow`: flow overview, project-flow reads, and fixed-template binding now use a feature-local repository. The service owns flow evaluation, while the router retains access checks and the two built-in-template contract.
- `team`: user CRUD, session-invalidating password changes, and team-context reads now use a feature-local repository. Auth and organization retain their existing ownership boundaries.
- `testing`: test-case, test-run, dependency, test-plan, and derived-task persistence now use a feature-local repository. The route continues to own transaction, permission, and audit orchestration; task synchronization stays transactional.
- `documents`: REST and WebSocket collaboration now share the same document-management policy and repository boundary. Collaboration updates require an optimistic `baseRevision`, re-check the active user and document scope for every write, broadcast only committed updates, and retain revision-aware audit evidence.
- `strategy`: strategic goals, programs, portfolios, project-program cache maintenance, and link lookups now use a feature-local repository. `projects.program_id` remains the source of truth, and strategy keeps canonical ownership of the persisted `/programs` and `/portfolios` responses.
- `products`: product CRUD, visibility lookups, image metadata/object rows, dependency checks, and product cascade persistence now use a feature-local repository. The route retains file cleanup after commit, authorization, validation, and audit sequencing.
- The project page now consumes its own feature API directly for project, member, risk, decision, flow, and source operations.
- The former frontend compatibility barrel `web/src/services/resources.ts` has been removed after all runtime callers migrated to feature APIs or `apiClient`.
- Project-list sorting and filtering live in `web/src/features/projects/listModel.ts`, separating business display rules from page state and interactions.
- Project-member management and source-browser tabs now live in `web/src/features/projects/components/`, keeping their loading, error, confirmation, and API behavior encapsulated outside the page shell.

The task/Sprint integration test covers idempotency, optimistic-lock conflicts, state transitions, dependency cycles, completion blocking, Sprint activation gates, and active-Sprint scope-change reasons. Focused service tests cover the extracted object-building rules.

## Post-Refactor Follow-up

The P0-P4 program below is complete. The following work is intentionally outside
this refactor's release scope:

1. Run a real PostgreSQL cutover only through a separately approved operations window; SQLite remains the default runtime.
2. Continue optional composition-root simplification only when it removes a concrete dependency or lifecycle concern.
3. Expand generated API types only when a consumer needs them; the existing enum and OpenAPI contract checks remain the current guardrail.

## Full Execution Program

The refactor is tracked as a complete sequence. P0 is a non-negotiable guardrail, not the stopping point for the work.

| Phase | Scope | Exit criteria | Status |
| --- | --- | --- | --- |
| P0: Behavioral baseline | Preserve public routes, response envelopes, authorization, audit evidence, transaction boundaries, and SQLite as the default runtime. | Focused regression tests and the full API/web build remain green after every extraction. | Complete, 2026-08-14 |
| P1: Data boundary | Reduce `db.js` to a compatibility facade over focused database modules; finish adapter contracts and static PostgreSQL export/import validation. | Existing `db.js` exports remain compatible; database preflight and export-manifest checks pass without requiring a PostgreSQL deployment. | Complete, 2026-08-14 |
| P2: Backend composition | Move residual `server.js` helpers into infrastructure or owning modules, leaving an explicit composition root and lifecycle wiring. | No new business policy or persistence logic is added to `server.js`; routes receive dependencies through module contracts. | Complete, 2026-08-14 |
| P3: Frontend feature boundaries | Split high-complexity presentation and interaction components by stable responsibility, while keeping feature-local API modules as the only domain entry points. | Page shells remain thin, component/model tests cover extracted behavior, and the production web build passes. | Complete, 2026-08-14 |
| P4: Contract and release closure | Consolidate generated enum/API-contract validation, run full regression/preflight checks, and update the as-built documents. | API tests, lint, web build, database preflight, and optional PostgreSQL static checks pass; remaining opt-in infrastructure work is explicitly recorded. | Complete, 2026-08-14 |

Execution was intentionally sequential at shared boundaries and parallel only for isolated modules. The final RC pass exposed a missing `GET /api/defects/:id` compatibility route used to refresh optimistic-lock versions; it was restored with project-scope authorization, OpenAPI documentation, and focused 200/403/404 regression coverage.

## Completion Record

- P1: `api/db.js` is a compatibility facade over focused bootstrap, seed, mapper, audit, burndown, and SQLite-baseline modules. PostgreSQL export/import/reconcile paths validate manifests before connection and fail closed.
- P2: runtime configuration, HTTP responses/errors, AI model composition, validation helpers, uploads, and lifecycle ownership are extracted; `server.js` is the explicit composition root.
- P3: `ProductForm` is split into image, module, and roadmap sections; `AiActionDraftCard` is split into controller, form, success, model, permission, and navigation boundaries.
- P4 verification on 2026-08-14: API tests `330` passed with `2` explicitly skipped PostgreSQL tests; Web tests `29` files / `88` tests passed; lint, typecheck, production build, and `git diff --check` passed; SQLite preflight reported `24/24` migrations with zero integrity, reference, or JSON violations; PostgreSQL static tests reported `32` passed and `2` opt-in skips; RC browser tests reported `59` passed and `1` conditional skip, and the multi-role API flow reported `194/194` passed.
- No real PostgreSQL connection test was run. It remains gated behind `RUN_PG_INTEGRATION=1` plus an explicit target URL.

## Remaining Optional Boundaries

- Backend: a production PostgreSQL cutover and any further composition-root shrinking.
- Frontend: optional generated API types and presentation-only refinements.

## Guardrails

- Keep route URLs and response shapes unchanged during structural moves.
- New frontend API functions should live in the relevant `web/src/features/<domain>/api.ts` module or, for shared primitives only, in `services/apiClient.ts`.
- Run `node --check api/server.js` and `npm run build` after every extraction.
- Fix authorization gaps as modules are extracted, not by scattering one-off checks.
