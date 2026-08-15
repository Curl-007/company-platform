import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Minimal component test harness (no @testing-library dependency).
//
// Renders into a happy-dom container inside a fresh QueryClientProvider so
// TanStack Query components can be exercised against stubbed fetch calls.
// ---------------------------------------------------------------------------

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface RenderResult {
  container: HTMLElement;
  root: Root;
  queryClient: QueryClient;
  unmount: () => void;
}

export function renderWithQueryClient(ui: ReactElement): RenderResult {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: 0,
      },
    },
  });
  const root = createRoot(container);
  act(() => {
    root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  });
  return {
    container,
    root,
    queryClient,
    unmount: () => {
      act(() => { root.unmount(); });
      queryClient.clear();
      container.remove();
    },
  };
}

/** Flushes pending fetch → setState cycles inside the act() boundary. */
export async function flushAct(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
}
