import { useEffect, useState } from 'react';
import type { PageKey } from '../../types';

// ---------------------------------------------------------------------------
// Page context bridge for the global agent sidebar (same window-event style
// as uiCommandBus.ts). Business pages publish "where am I" (page + optional
// project scope) without prop drilling; the sidebar subscribes and uses the
// project to prefill capability invocations and chat context.
//
// Semantics:
//   - The latest publication wins; unmounting a publisher clears it.
//   - Consumers should guard staleness by comparing context.page with the
//     router's current page (navigation unmounts the old publisher first).
// ---------------------------------------------------------------------------

export const AGENT_PAGE_CONTEXT_EVENT = 'ai:agent-page-context' as const;

export interface AgentPageContext {
  page: PageKey;
  /** Optional display label override; the sidebar falls back to the nav label. */
  pageLabel?: string;
  /** Project the current view is scoped to, when the page has one. */
  projectId?: string;
  projectName?: string;
}

export interface AgentPageContextEventDetail {
  context: AgentPageContext | null;
}

export type AgentPageContextEvent = CustomEvent<AgentPageContextEventDetail>;

let latestContext: AgentPageContext | null = null;

export function publishAgentPageContext(context: AgentPageContext | null): void {
  latestContext = context;
  window.dispatchEvent(new CustomEvent<AgentPageContextEventDetail>(AGENT_PAGE_CONTEXT_EVENT, {
    detail: { context },
  }));
}

export function subscribeAgentPageContext(
  listener: (event: AgentPageContextEvent) => void,
): () => void {
  const handleEvent: EventListener = (event) => listener(event as AgentPageContextEvent);
  window.addEventListener(AGENT_PAGE_CONTEXT_EVENT, handleEvent);
  return () => window.removeEventListener(AGENT_PAGE_CONTEXT_EVENT, handleEvent);
}

/** Latest published context (null before the first publication or after a clear). */
export function getAgentPageContext(): AgentPageContext | null {
  return latestContext;
}

/**
 * Publishes the partial page context on mount and on every change; unmount
 * clears the bridge so stale project scopes never leak into other pages.
 */
export function useAgentPageContextPublisher(context: AgentPageContext): void {
  const { page, pageLabel, projectId, projectName } = context;
  useEffect(() => {
    publishAgentPageContext({ page, pageLabel, projectId, projectName });
    return () => publishAgentPageContext(null);
  }, [page, pageLabel, projectId, projectName]);
}

/** Reactive subscription for sidebar-style consumers. */
export function useAgentPageContext(): AgentPageContext | null {
  const [context, setContext] = useState<AgentPageContext | null>(() => getAgentPageContext());
  useEffect(() => subscribeAgentPageContext(({ detail }) => {
    setContext(detail.context);
  }), []);
  return context;
}
