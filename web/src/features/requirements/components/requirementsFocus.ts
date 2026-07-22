export function clearRequirementFocusFromHash() {
  const hash = window.location.hash;
  const [pathPart, queryPart] = hash.split('?');
  if (!queryPart) return;
  const params = new URLSearchParams(queryPart);
  if (!params.has('focus')) return;
  params.delete('focus');
  const nextQuery = params.toString();
  window.location.hash = nextQuery ? `${pathPart}?${nextQuery}` : pathPart;
}

export function readRequirementFocusFromHash(): string | null {
  const hash = window.location.hash;
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query).get('focus');
}
