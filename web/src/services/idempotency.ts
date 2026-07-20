export function createIdempotencyKey(operation: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${operation}-${uuid}`;
  return `${operation}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
