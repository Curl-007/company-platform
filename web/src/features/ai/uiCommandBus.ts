import type { AgentUiDirective } from './models/uiDirectiveModel';

// ---------------------------------------------------------------------------
// Tiny window-event bus for AI UI commands that must cross component trees
// without prop drilling (same style as services/asyncRefreshEvents.ts).
//
// Currently carries openAiSidebar directives from the socket executor
// (mounted in App) to the Layout-owned AI sidebar state.
// ---------------------------------------------------------------------------

export const UI_COMMAND_EVENT = 'ai:ui-command' as const;

export interface UiCommandEventDetail {
  directive: AgentUiDirective;
}

export type UiCommandEvent = CustomEvent<UiCommandEventDetail>;

export function dispatchUiCommand(directive: AgentUiDirective): void {
  window.dispatchEvent(new CustomEvent<UiCommandEventDetail>(UI_COMMAND_EVENT, {
    detail: { directive },
  }));
}

export function subscribeToUiCommands(
  listener: (event: UiCommandEvent) => void,
): () => void {
  const handleEvent: EventListener = (event) => listener(event as UiCommandEvent);
  window.addEventListener(UI_COMMAND_EVENT, handleEvent);
  return () => window.removeEventListener(UI_COMMAND_EVENT, handleEvent);
}
