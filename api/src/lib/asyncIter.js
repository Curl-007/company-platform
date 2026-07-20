async function filterAsync(items, predicate) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of list) {
    if (await predicate(item)) out.push(item);
  }
  return out;
}

async function mapAsync(items, mapper) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  for (const item of list) {
    out.push(await mapper(item));
  }
  return out;
}

async function forEachAsync(items, worker) {
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    await worker(item);
  }
}

module.exports = {
  filterAsync,
  mapAsync,
  forEachAsync,
};
