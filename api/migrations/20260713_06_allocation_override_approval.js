module.exports = {
  id: "20260713_06_allocation_override_approval",
  up({ db }) {
    try { db.exec("ALTER TABLE project_allocations ADD COLUMN overload_reason TEXT"); } catch { /* existing schema already has the column */ }
    try { db.exec("ALTER TABLE project_allocations ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'"); } catch { /* existing schema already has the column */ }
    try { db.exec("ALTER TABLE project_allocations ADD COLUMN approved_by TEXT"); } catch { /* existing schema already has the column */ }
    try { db.exec("ALTER TABLE project_allocations ADD COLUMN approved_at TEXT"); } catch { /* existing schema already has the column */ }
    db.exec("UPDATE project_allocations SET approval_status = 'approved' WHERE approval_status IS NULL OR approval_status = ''");
  },
};
