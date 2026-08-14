# DeepSeek Harness Rebuild Blueprint

## Decision

This is a rebuild, not another model integration. DeepSeek Harness becomes the runtime foundation. The existing company management platform remains the source of business requirements, verified behavior, data definitions, role rules, and browser acceptance tests.

The target retains a company-owned control plane. Harness owns agent sessions, plugin composition, tool dispatch, model execution, agent interaction requests, and replayable agent events. Company plugins own identity, RBAC, project scope, audit, business-write confirmation, state transitions, transactions, Provider policy, and release policy.

## Target Architecture

```text
Trusted React web client
  -> Company HTTP / WebSocket BFF
    -> fixed Company Harness runtime composition
      -> Company tool and runtime-policy plugins
      -> Harness session / agent / tools / LLM runtime
        -> scoped execution gateway
          -> Company API capability endpoint
            -> RBAC + project scope + audit + transaction
        -> API-owned loopback Provider proxy
          -> configured model Provider
    -> SQLite migration baseline
```

The current React application remains a compiled, trusted client during migration. It is not a model-written Cordis browser plugin. Once business contracts stabilize, selected static UI regions may be rebuilt as compiled Harness client modules.

## Ownership Rules

| Layer | Owns | Must not own |
| --- | --- | --- |
| Harness | agent lifecycle, session events, model adapters, tool registry, static plugin composition | tenant authorization, business writes, Provider secret storage, arbitrary production UI code |
| Company control plane | identity, roles, project access, audit, state machines, Provider policy, human confirmation | browser rendering and direct Provider calls |
| Company runtime plugins | typed tool contracts, runtime policy, session mapping, scoped execution gateway | direct repository/SQLite access or business-write ownership |
| Company API/domain services | project, requirement, task, document, quality, delivery, workflow, reporting services | bypassing policy or audit |
| BFF | browser-safe DTOs, authentication, REST compatibility, WebSocket compatibility | duplicated domain logic or unmediated model access |
| React client | business UI, review flows, approved extension rendering | Provider keys, Harness tokens, raw Cordis config, dynamic script evaluation |

## Business Requirement Baseline

The following capability groups are non-negotiable requirements, not optional legacy behavior.

| Group | Current modules | Essential behavior |
| --- | --- | --- |
| Identity and governance | auth, organization, audit, meta | JWT/session invalidation, five roles, scoped audit access |
| Planning | products, strategy, projects, requirements | project membership, milestones, WBS, requirements, optimistic updates |
| Execution | tasks, workflow, timeEntries, workLogs, capacity, team | Kanban/Sprint transitions, handoffs, allocation, no employee scoring |
| Quality and delivery | testing, defects, delivery | case/run/defect lifecycle, build/release gates, approvals, rollback |
| Knowledge | documents, RAG | authorized objects, collaboration revision rules, citations |
| Intelligence | ai, AI Jobs, Provider/assistant settings | approved model execution, draft/review/confirm before writes |
| Presentation | dashboard, reports, feature React pages | 16-page role-aware navigation and responsive/accessibility behavior |

Across all slices, preserve server-side authorization, project-scoped visibility, audit evidence, state-machine rules, human confirmation before AI-proposed business writes, and SQLite as the default deployment path. PostgreSQL remains an optional validation path.

## Product Fork and Runtime Composition

Create a product fork rooted in Harness source, with Company applications and packages beside upstream packages. Keep the upstream CLI and developer web UI separate from the enterprise product. Do not modify Harness core packages unless an upstream contribution is genuinely required.

```text
company-platform-harness/
  apps/company-api/       trusted public HTTP/WebSocket BFF
  apps/company-web/       trusted business React application
  apps/company-runtime/   fixed stdio JSON-RPC Harness launcher
  packages/company/
    contracts/            capability DTOs and result schemas
    execution-gateway/    short-lived scoped API calls from the runtime
    context/              authorized compact model context
    tools/                static project, RAG, and draft tools
    runtime-policy/       tool allowlist and startup assertions
  config/company-runtime/
    cordis.yml            production-minimal fixed composition
    cordis.test.yml       test-only composition
```

Production starts the fixed `config/company-runtime/cordis.yml`, not a mutable Harness user Profile. It must not accept `$DSH_HOME` patches, user presets, `dsh plugin` installation, dynamic Cordis, Skills, MCP, Bash, filesystem, subagents, jobs, goals, or the upstream developer web UI. Replace the current example-only `dsh-agent-spine-demo` assembly with Company runtime composition before calling the rebuild complete. Development-only bundles may use profiles and plugin tooling in an isolated environment.

Every business capability uses three Harness roles:

1. A typed tool contract with caller context, result type, and policy requirements.
2. A runtime provider that validates a short-lived execution token and calls the Company API capability gateway.
3. A Company API/domain service that rechecks scope, state, transaction, and audit rules before returning data or writing anything.
4. A consumer exposed through an HTTP route, trusted React view, or explicitly approved model-facing tool.

Model-facing tools never access SQLite, external Providers, or business write APIs directly. The execution gateway re-enters the Company API, whose policy decisions are the same as an ordinary BFF request.

## Migration Order

Use a strangler migration. The existing service remains authoritative until a complete vertical slice passes parity checks. Each aggregate has exactly one writer at any time.

### Change-Control Rules

- Pin one upstream Harness commit and matching package version set in the product fork and lockfile. The local checkout and the current API package versions must be reconciled before the fork starts; validate every upstream upgrade in an isolated environment before production use.
- Treat `app.db`, its WAL/SHM sidecars, `api/storage`, and `HARNESS_HOME` as separate durable assets. Back up all of them with a hash manifest and restore-test them together.
- Keep business facts in the Company database. `HARNESS_HOME` holds sensitive execution evidence, sessions, prompts, outputs, and attachments; it is owned by the API service account and is not shared between API instances.
- Do not dual-write. Before an aggregate changes owner, drain jobs, reject new writes, and move through a read-only cutover window.
- Add a deployment epoch or write lease to all business writes and AI Job transitions. A response from a stopped or superseded runtime must fail closed rather than commit late.
- SQLite supports one API writer during this migration. Horizontal scale requires a separate PostgreSQL and worker/queue project, not an incidental change during a Harness cutover.

### Phase 0: Freeze and Characterize

- Keep current API, database, UI, OpenAPI, and tests as executable specification.
- Produce a route-to-domain inventory containing role rule, scope rule, audit event, state transition, and write behavior.
- Capture representative admin, PM, product, developer, and QA flows as fixtures.
- Verify the actual database migration ledger before any data work; do not rely on historic documentation counts.

Exit condition: every migrated endpoint has a known owner and a contract test.

### Phase 1: Company Harness Shell

- Boot a fixed Company Harness runtime alongside the current service with no business writes.
- Add a static runtime-policy plugin and one scoped execution-gateway tool; identity, policy, audit, and domain rules remain in the Company API.
- Deliver a read-only `project-snapshot` capability through the BFF and existing AI workspace, with a short-lived scoped execution token.
- Record both Harness event evidence and platform audit evidence for every invocation.

Exit condition: an out-of-scope project request is denied, no browser can reach Harness or a Provider directly, and the capability passes role/audit tests.

### Phase 2: Core Planning

- Move project, requirement, task, Sprint, and Kanban services behind Company Harness service definitions.
- Keep existing REST URLs through BFF compatibility adapters.
- Switch an aggregate writer only after contract, role, audit, state-machine, and data-parity tests pass.

Exit condition: the project planning lifecycle has one writer and produces identical observable behavior.

### Phase 3: Knowledge and AI

- Move document indexing, RAG, analysis Jobs, assistant profiles, and approved AI capabilities into the Company composition.
- Keep Provider secrets in the control plane. Harness receives only a short-lived loopback-proxy token.
- Retain the existing draft/review/confirm model for write-capable outcomes.

Exit condition: chat, citations, analysis, retry, rejection, and confirmation have replayable Harness evidence and unchanged business/audit effects.

### Phase 4: Execution, Quality, and Delivery

- Migrate workflow, work logs, capacity, testing, defects, builds, releases, approvals, and rollback in cohesive vertical groups.
- Preserve task/defect handoff checks and delivery quality gates.

Exit condition: every group has a single writer, rollback behavior, role coverage, and browser acceptance coverage.

### Phase 5: Frontend Recomposition

- Keep React trusted and compiled.
- Introduce declarative extension manifests for approved business blocks, fields, views, and actions.
- Require preview, administrator approval, publish, kill switch, and rollback for every extension.

Exit condition: production views never evaluate plugin-supplied HTML, JavaScript, JSX, CSS, Cordis YAML, or package names at runtime.

### Phase 6: Retire Legacy Paths

- Remove an old module only after all endpoints, jobs, writes, audit events, and UI flows have a new owner.
- Keep removal milestones for compatibility adapters.
- Run backup/restore and production smoke checks before each cutover.

## AI-Driven Frontend Change Policy

Harness dynamic packages are useful in an isolated design sandbox, but their VM is explicitly not a security boundary and definitions are process-memory only. They cannot become the production extension mechanism.

| Change path | Output | Execution location | Publication rule |
| --- | --- | --- | --- |
| Declarative UI change | versioned UI manifest | trusted React renderer | validate, preview, administrator approves, then publish/rollback |
| Source UI change | patch, checks, screenshots | isolated worktree/container without production credentials | reviewer approves; CI builds and deploys |

The model may propose either artifact. It may not modify deployed UI, load arbitrary code in a production browser, access production credentials, or bypass BFF authorization.

## First Implementation Slice

Start with a static, read-only `project-snapshot` capability:

```text
AI workspace -> Company BFF -> RBAC + project scope + audit
             -> AI Job + scoped execution token -> Company Harness session
             -> project-snapshot tool -> execution gateway -> Company API
             -> approved Provider route -> structured result card
```

The Company API validates the token actor, project scope, capability version, and expiry again before it returns a compact, already-authorized business context. The runtime receives an opaque project ID and cannot enumerate projects, read unrelated documents, query SQLite, or write business data.

## Verification Gates

- Keep current OpenAPI/HTTP contract tests until the legacy BFF path is gone.
- Add Harness composition tests for each plugin tree and policy refusal.
- Add role tests for each capability and each HTTP route.
- Run data-parity checks before changing a writer; create and restore-test SQLite backups.
- Test Harness timeout, crash, restart, duplicate submission, and stale deployment-epoch behavior before enabling an AI capability.
- Run React build and browser regressions for affected views.
- Record plugin version, assistant profile, Provider/model, policy decision, actor, scope, and outcome for every AI invocation.
- A disabled capability must fail at both BFF and provider layers, regardless of frontend state.

## Explicit Non-Goals

- Replacing RBAC, audit, transactions, or state machines with prompt instructions.
- Browser-to-Harness or browser-to-Provider connectivity.
- Treating model-written or third-party dynamic plugins as trusted production code.
- Making PostgreSQL, Redis, or a microservice split a prerequisite.
- Rebuilding every current page in a single release.
