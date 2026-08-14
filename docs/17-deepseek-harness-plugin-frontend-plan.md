# DeepSeek Harness Plugin Frontend Integration Plan

## Objective

Keep DeepSeek Harness as the only AI execution core and keep this platform as the business control plane. The frontend should expose approved business capabilities and reviewable outcomes, rather than becoming a general-purpose Harness, Cordis, or package-management console.

The current Provider, model selection, and AI assistant settings are the prerequisite. A plugin capability is attached to a published assistant profile and always runs through the platform API, not from the browser to Harness or a model provider.

## Product Boundary

The browser may receive an approved capability's name, version, purpose, risk level, health state, declared inputs, output schema, and confirmation requirement. It must never receive Provider keys, Harness tokens, raw Cordis YAML, arbitrary package names, dynamic JavaScript, or a direct Harness RPC endpoint.

Every invocation goes through the platform BFF, which enforces RBAC, project scope, audit logging, AI Job policy, and human confirmation before it asks the managed Harness runtime to execute an approved adapter.

```text
React capability entry point
  -> Platform BFF capability API
    -> RBAC + project scope + audit + AI Job policy
      -> approved Harness plugin adapter
        -> API-owned loopback Provider proxy
          -> model service
```

## Frontend Information Architecture

1. **Settings / AI model configuration**
   Keep Provider and AI assistant configuration as separate panels. Add an administrator-only "Approved capabilities" panel later; it lists only platform-reviewed capabilities, their rollout state, allowed assistant profiles, health, and a kill switch.

2. **AI assistant workspace**
   Add a compact capability tray near the chat composer. It shows only capabilities allowed for the active page, selected assistant, and current user. Each action opens a typed form or uses page context; it must never expose arbitrary tool arguments or a raw plugin configuration editor.

3. **AI Job and review**
   An invocation creates an AI Job. Read-only results render as structured result cards. Any capability that proposes a business write renders the existing draft/review flow, with confirm and reject actions owned by platform APIs.

4. **Runtime diagnostics**
   Provide a read-only administrator view for approved capability version, health, latest failure category, and rollout state. This is operational visibility, not an install/update surface.

## BFF Contract

The BFF owns declarative manifests. The frontend renders them with trusted local components and does not interpret plugin-supplied JavaScript or HTML.

```json
{
  "id": "project-snapshot",
  "version": "1.0.0",
  "status": "approved",
  "risk": "read_only",
  "scopes": ["project-management"],
  "inputSchema": {
    "projectId": { "type": "string", "required": true }
  },
  "outputSchema": {
    "summary": "markdown",
    "risks": "string[]"
  },
  "requiresConfirmation": false
}
```

Recommended API surface:

- `GET /api/ai/capabilities`: returns only capabilities available to the caller, page scope, and published assistant.
- `POST /api/ai/capabilities/:id/invocations`: validates typed input, creates an AI Job, and records the resolved assistant/provider/model/plugin version snapshot.
- `GET /api/ai/jobs/:id`: reuses the existing job polling and result review model.
- `GET/PATCH /api/admin/ai-capabilities/:id`: administrator-only status, rollout, and kill-switch controls for already-approved capabilities. It does not accept arbitrary package names or Cordis patches.

## Delivery Phases

### Phase 0: Configuration Foundation

Finish the three configuration layers: Provider connection, selectable model, and published AI assistant profile. Connection testing and model discovery remain server-side and keep the private-host allowlist. The current settings work belongs here.

### Phase 1: Approved Read-Only Capabilities

Create a small capability registry backed by platform-owned adapters. Start with project snapshot, document retrieval, and risk/summary generation. Add the capability tray in `AiView`, typed input controls, result cards, RBAC checks, and audit records. No business write is allowed in this phase.

### Phase 2: Draft-Producing Capabilities

Allow selected capabilities to propose requirements, tasks, or document metadata. They must emit a typed draft to an AI Job and reuse the existing human confirmation route. The plugin never writes directly to SQLite or another business API.

### Phase 3: Plugin Governance

Add package allowlisting, pinned version metadata, reviewed manifest revisions, declared permissions, rollout state, health checks, audit events, kill switch, and rollback. A capability disable must take effect at the BFF on the next call without a frontend release.

### Phase 4: High-Trust Extension Evaluation

Evaluate third-party plugins only in a separate, isolated high-trust environment. Dynamic Cordis patches, arbitrary npm packages, shell/file-system access, Skills, Jobs, and Goals do not enter this business platform.

## Implementation Mapping

| Area | Planned responsibility |
| --- | --- |
| `web/src/features/settings/` | Provider, assistant, approved-capability administration and read-only diagnostics |
| `web/src/features/ai/` | Contextual capability tray, typed input form, AI Job result and review presentation |
| `api/src/modules/ai/` | Capability registry, policy checks, manifest validation, Harness adapter, audit snapshot |
| Existing AI Jobs | Queue, progress, structured result, proposal/review lifecycle |
| Harness runtime | Executes only an adapter chosen by the BFF; it is not exposed to the browser |

## Acceptance Criteria

- No browser request can target Harness or a Provider URL directly.
- A disabled, unapproved, or out-of-scope capability cannot run, including through a forged request.
- Each invocation records actor, scope, assistant version, Provider/model selection, plugin version, policy decision, and outcome.
- Write-capable capabilities create proposals only; platform business APIs perform the confirmed write.
- A capability can be disabled immediately at the control plane without restarting the frontend.
- The UI remains usable when a capability is unavailable: it shows a stable status and does not expose internal Harness failure details.
