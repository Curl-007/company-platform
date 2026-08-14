import Timer from "@deepseek-ai/cordis-plugin-timer";
import AgentRegistry from "@deepseek-ai/dsh-agent";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import * as agentInvariant from "@deepseek-ai/dsh-agent/invariant";
import InvariantRegistry from "@deepseek-ai/dsh-invariants";
import LlmRuntime from "@deepseek-ai/dsh-llm";
import * as llmRetry from "@deepseek-ai/dsh-llm-retry";
import * as scopeInvariant from "@deepseek-ai/dsh-scope/invariant";
import SessionStore from "@deepseek-ai/dsh-session";
import * as sessionInvariant from "@deepseek-ai/dsh-session/invariant";
import SessionTitleService from "@deepseek-ai/dsh-session-title";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";

export const name = "company-agent-spine";

// This intentionally composes only the services required for a headless,
// read-only agent. Skills, workspace context, shell, jobs, goals, and
// subagents are not imported, configured, or reachable from this runtime.
export function apply(ctx, config = {}) {
  ctx.plugin(Timer);
  ctx.plugin(LlmRuntime);
  ctx.plugin(SessionStore);
  ctx.plugin(SessionTitleService, {
    fallbackMaxBytes: 80,
    fallbackMaxWords: 8,
    maxTitleBytes: 120,
  });
  ctx.plugin(SystemPrompt, {
    includeHarnessIdentity: false,
    includeRuntimeContext: false,
    persona: String(config.persona || ""),
  });
  ctx.plugin(ToolRuntime, {});
  ctx.plugin(AgentRegistry);
  ctx.plugin(llmRetry);
  ctx.plugin(InvariantRegistry, {});
  ctx.plugin(sessionInvariant);
  ctx.plugin(agentInvariant);
  ctx.plugin(scopeInvariant);
  ctx.plugin(AgentLoop, {
    agents: [],
    maxParallelToolCalls: 1,
  });
}
