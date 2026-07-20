function createProjectVersionGuard({ fail }) {
  function expectedProjectVersion(req, res, project) {
    const version = Number(req.body?.version);
    if (!Number.isInteger(version) || version < 1) {
      fail(res, 400, "VERSION_REQUIRED", "Project version is required for updates.");
      return null;
    }
    const currentVersion = Number(project.version) || 1;
    if (version !== currentVersion) {
      fail(res, 409, "VERSION_CONFLICT", "Project was changed by another user. Refresh and retry your update.", {
        expectedVersion: version,
        currentVersion,
      });
      return null;
    }
    return version;
  }

  return { expectedProjectVersion };
}

module.exports = { createProjectVersionGuard };
