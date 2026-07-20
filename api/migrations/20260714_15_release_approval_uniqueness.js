module.exports = {
  id: "20260714_15_release_approval_uniqueness",
  up({ db }) {
    // Approval records are immutable evidence. Duplicate decisions from the
    // same approver would make release-gate evidence ambiguous, so fail closed
    // if historical data is already inconsistent instead of silently deleting it.
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_release_approvals_release_approver
      ON release_approvals(release_id, approver_id)
      WHERE approver_id IS NOT NULL`);
  },
};
