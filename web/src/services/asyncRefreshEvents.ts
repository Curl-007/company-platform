export const ASYNC_REFRESH_FAILURE_EVENT = 'app:async-refresh-failure' as const;

export interface AsyncRefreshFailureDetail {
  cacheKey: string;
  message: string;
  retry: () => void;
}

export type AsyncRefreshFailureEvent = CustomEvent<AsyncRefreshFailureDetail>;

export function dispatchAsyncRefreshFailure(detail: AsyncRefreshFailureDetail): void {
  window.dispatchEvent(new CustomEvent<AsyncRefreshFailureDetail>(ASYNC_REFRESH_FAILURE_EVENT, {
    detail,
  }));
}

export function subscribeToAsyncRefreshFailures(
  listener: (event: AsyncRefreshFailureEvent) => void,
): () => void {
  const handleEvent: EventListener = (event) => listener(event as AsyncRefreshFailureEvent);
  window.addEventListener(ASYNC_REFRESH_FAILURE_EVENT, handleEvent);
  return () => window.removeEventListener(ASYNC_REFRESH_FAILURE_EVENT, handleEvent);
}
