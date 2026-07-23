/**
 * Wrap async Express handlers so rejected promises always reach error middleware.
 * Keeps the process alive and returns consistent 4xx/5xx via the global handler.
 *
 * @template {import("express").RequestHandler} T
 * @param {T} handler
 * @returns {import("express").RequestHandler}
 */
function asyncHandler(handler) {
  return function wrappedAsyncHandler(req, res, next) {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}

/**
 * Apply asyncHandler to every route method registered on a router.
 * Call after all routes are defined (or wrap individual handlers).
 *
 * @param {import("express").Router} router
 */
function wrapRouterAsync(router) {
  if (!router || typeof router.stack !== "object") return router;
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const route = layer.route;
    for (const method of Object.keys(route.methods || {})) {
      const stack = route.stack;
      if (!Array.isArray(stack)) continue;
      for (const layerHandler of stack) {
        if (typeof layerHandler.handle === "function" && layerHandler.handle.length < 4) {
          const original = layerHandler.handle;
          if (original.__asyncWrapped) continue;
          const wrapped = asyncHandler(original);
          wrapped.__asyncWrapped = true;
          layerHandler.handle = wrapped;
        }
      }
    }
  }
  return router;
}

module.exports = {
  asyncHandler,
  wrapRouterAsync,
};
