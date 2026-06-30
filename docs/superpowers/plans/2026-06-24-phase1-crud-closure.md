# Phase 1 — 核心页面 CRUD 闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 Projects / Requirements / Testing / Documents 四个页面的编辑、删除、状态变更功能，形成完整操作闭环。

**Architecture:** 后端 Express + SQLite (`api/server.js`) 新增约 16 个 REST 端点，前端 `resources.ts` 新增约 15 个 API 函数，四个页面分别增加操作列、表单、确认对话框。

**Tech Stack:** Node.js (Express + `node:sqlite`), React 18 + TypeScript, 现有组件库 (DataTable / Overlay / Panel / FilterBar)

---

### Task 1: 后端 — 项目编辑 & 删除

**Files:**
- Modify: `api/server.js` (在 `app.patch("/api/projects/:id/status"` 之后追加)

- [ ] **Step 1: 新增 `PATCH /api/projects/:id`**

在 `app.patch("/api/projects/:id/status", ...)` 路由块之后追加：

```javascript
app.patch("/api/projects/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const { name, owner, status, progress, processMode } = req.body || {};
  if (name !== undefined) run("UPDATE projects SET name = @name WHERE id = @id", { id: req.params.id, name: String(name).trim() });
  if (owner !== undefined) run("UPDATE projects SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
  if (status !== undefined) run("UPDATE projects SET status = @status WHERE id = @id", { id: req.params.id, status });
  if (progress !== undefined) run("UPDATE projects SET progress = @progress WHERE id = @id", { id: req.params.id, progress: Number(progress) });
  if (processMode !== undefined) run("UPDATE projects SET process_mode = @mode WHERE id = @id", { id: req.params.id, mode: processMode });
  run("UPDATE projects SET updated_at = @updated WHERE id = @id", { id: req.params.id, updated: now() });
  const after = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  audit(req.user, "project.update", "project", req.params.id, before, after, req.ip);
  res.json(ok(mapProject(after)));
});
```

- [ ] **Step 2: 新增 `DELETE /api/projects/:id`**

在上一步路由之后追加：

```javascript
app.delete("/api/projects/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  // Cascade: remove related tasks, sprints
  run("DELETE FROM tasks WHERE project_id = @id", { id: req.params.id });
  run("DELETE FROM sprints WHERE project_id = @id", { id: req.params.id });
  run("DELETE FROM projects WHERE id = @id", { id: req.params.id });
  audit(req.user, "project.delete", "project", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});
```

---

### Task 2: 后端 — 任务编辑 & 删除

**Files:**
- Modify: `api/server.js` (在 `app.get("/api/tasks/:id"` 之后追加)

- [ ] **Step 1: 新增 `PATCH /api/tasks/:id`**

```javascript
app.patch("/api/tasks/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
  const { title, owner, progress, status, type, estimatedHours, actualHours, dueDate } = req.body || {};
  if (title !== undefined) run("UPDATE tasks SET title = @title WHERE id = @id", { id: req.params.id, title: String(title).trim() });
  if (owner !== undefined) run("UPDATE tasks SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
  if (progress !== undefined) run("UPDATE tasks SET progress = @progress WHERE id = @id", { id: req.params.id, progress: Number(progress) });
  if (status !== undefined) run("UPDATE tasks SET status = @status, status_text = @statusText, kanban_column = @status WHERE id = @id", { id: req.params.id, status, statusText: status.replace("_", " ") });
  if (type !== undefined) run("UPDATE tasks SET type = @type WHERE id = @id", { id: req.params.id, type });
  if (estimatedHours !== undefined) run("UPDATE tasks SET estimated_hours = @hours WHERE id = @id", { id: req.params.id, hours: Number(estimatedHours) });
  if (actualHours !== undefined) run("UPDATE tasks SET actual_hours = @hours WHERE id = @id", { id: req.params.id, hours: Number(actualHours) });
  if (dueDate !== undefined) run("UPDATE tasks SET due_date = @date WHERE id = @id", { id: req.params.id, date: dueDate });
  const after = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  audit(req.user, "task.update", "task", req.params.id, before, after, req.ip);
  res.json(ok(mapTask(after)));
});
```

- [ ] **Step 2: 新增 `DELETE /api/tasks/:id`**

```javascript
app.delete("/api/tasks/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM tasks WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Task not found.");
  run("DELETE FROM tasks WHERE id = @id", { id: req.params.id });
  audit(req.user, "task.delete", "task", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});
```

---

### Task 3: 后端 — 迭代编辑 & 删除 + 里程碑

**Files:**
- Modify: `api/server.js` (在 `app.post("/api/projects/:projectId/sprints"` 之后追加)

- [ ] **Step 1: 新增 `PATCH /api/sprints/:id`**

```javascript
app.patch("/api/sprints/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM sprints WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
  const { name, goal, status, startDate, endDate } = req.body || {};
  if (name !== undefined) run("UPDATE sprints SET name = @name WHERE id = @id", { id: req.params.id, name: String(name).trim() });
  if (goal !== undefined) run("UPDATE sprints SET goal = @goal WHERE id = @id", { id: req.params.id, goal });
  if (status !== undefined) run("UPDATE sprints SET status = @status WHERE id = @id", { id: req.params.id, status });
  if (startDate !== undefined) run("UPDATE sprints SET start_date = @date WHERE id = @id", { id: req.params.id, date: startDate });
  if (endDate !== undefined) run("UPDATE sprints SET end_date = @date WHERE id = @id", { id: req.params.id, date: endDate });
  const after = row("SELECT * FROM sprints WHERE id = @id", { id: req.params.id });
  audit(req.user, "sprint.update", "sprint", req.params.id, before, after, req.ip);
  res.json(ok(mapSprint(after)));
});
```

- [ ] **Step 2: 新增 `DELETE /api/sprints/:id`**

```javascript
app.delete("/api/sprints/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM sprints WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Sprint not found.");
  run("DELETE FROM sprints WHERE id = @id", { id: req.params.id });
  audit(req.user, "sprint.delete", "sprint", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});
```

- [ ] **Step 3: 新增里程碑相关路由**

在项目路由区域内追加：

```javascript
app.post("/api/projects/:id/milestones", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const { name, status, date } = req.body || {};
  if (!name) return fail(res, 400, "VALIDATION_FAILED", "Milestone name is required.");
  const milestones = parse(before.milestones, []);
  milestones.push({ name: String(name).trim(), status: status || "planned", date: date || now().slice(0, 10) });
  run("UPDATE projects SET milestones = @milestones, updated_at = @updated WHERE id = @id", { id: req.params.id, milestones: json(milestones), updated: now() });
  const after = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  audit(req.user, "project.milestone_add", "project", req.params.id, before, after, req.ip);
  res.status(201).json(ok({ milestones }));
});

app.delete("/api/projects/:id/milestones/:index", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Project not found.");
  const index = parseInt(req.params.index, 10);
  const milestones = parse(before.milestones, []);
  if (index < 0 || index >= milestones.length) return fail(res, 400, "VALIDATION_FAILED", "Invalid milestone index.");
  milestones.splice(index, 1);
  run("UPDATE projects SET milestones = @milestones, updated_at = @updated WHERE id = @id", { id: req.params.id, milestones: json(milestones), updated: now() });
  const after = row("SELECT * FROM projects WHERE id = @id", { id: req.params.id });
  audit(req.user, "project.milestone_remove", "project", req.params.id, before, after, req.ip);
  res.json(ok({ milestones }));
});
```

---

### Task 4: 后端 — 需求 & 删除

**Files:**
- Modify: `api/server.js` (在 `app.patch("/api/requirements/:id/status", ...)` 之后追加)

- [ ] **Step 1: 新增 `DELETE /api/requirements/:id`**

```javascript
app.delete("/api/requirements/:id", requirePermission("requirement:*"), (req, res) => {
  const before = row("SELECT * FROM requirements WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Requirement not found.");
  run("DELETE FROM requirements WHERE id = @id", { id: req.params.id });
  audit(req.user, "requirement.delete", "requirement", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});
```

---

### Task 5: 后端 — 测试用例编辑/删除/状态 + 缺陷编辑/删除

**Files:**
- Modify: `api/server.js` (在测试用例路由区域内追加)

- [ ] **Step 1: 新增 `PATCH /api/test-cases/:id/status`**

```javascript
app.patch("/api/test-cases/:id/status", requirePermission("project:*"), (req, res) => {
  const ALLOWED_TC_STATUSES = ["draft", "active", "passed", "failed", "blocked"];
  const before = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
  const { status } = req.body || {};
  if (!status || !ALLOWED_TC_STATUSES.includes(status)) {
    return fail(res, 400, "VALIDATION_FAILED", `Test case status must be one of: ${ALLOWED_TC_STATUSES.join(", ")}`);
  }
  run("UPDATE test_cases SET status = @status WHERE id = @id", { id: req.params.id, status });
  const after = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  audit(req.user, "test_case.status_update", "test_case", req.params.id, before, after, req.ip);
  res.json(ok({ id: after.id, title: after.name, requirementId: after.requirement_id, status: after.status, owner: after.owner }));
});
```

- [ ] **Step 2: 新增 `PATCH /api/test-cases/:id`**

```javascript
app.patch("/api/test-cases/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
  const { name, owner, description, steps, expectedResult, requirementId } = req.body || {};
  if (name !== undefined) run("UPDATE test_cases SET name = @name WHERE id = @id", { id: req.params.id, name: String(name).trim() });
  if (owner !== undefined) run("UPDATE test_cases SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
  if (description !== undefined) run("UPDATE test_cases SET description = @desc WHERE id = @id", { id: req.params.id, desc: description });
  if (steps !== undefined) run("UPDATE test_cases SET steps = @steps WHERE id = @id", { id: req.params.id, steps: JSON.stringify(steps) });
  if (expectedResult !== undefined) run("UPDATE test_cases SET expected_result = @result WHERE id = @id", { id: req.params.id, result: expectedResult });
  if (requirementId !== undefined) run("UPDATE test_cases SET requirement_id = @rid WHERE id = @id", { id: req.params.id, rid: requirementId });
  const after = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  audit(req.user, "test_case.update", "test_case", req.params.id, before, after, req.ip);
  res.json(ok({ id: after.id, title: after.name, requirementId: after.requirement_id, status: after.status, owner: after.owner, description: after.description, steps: after.steps, expectedResult: after.expected_result }));
});
```

- [ ] **Step 3: 新增 `DELETE /api/test-cases/:id`**

```javascript
app.delete("/api/test-cases/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM test_cases WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Test case not found.");
  run("DELETE FROM test_cases WHERE id = @id", { id: req.params.id });
  audit(req.user, "test_case.delete", "test_case", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});
```

- [ ] **Step 4: 新增 `PATCH /api/defects/:id`**

```javascript
app.patch("/api/defects/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM defects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
  const { title, severity, assignee, requirementId } = req.body || {};
  if (title !== undefined) run("UPDATE defects SET title = @title WHERE id = @id", { id: req.params.id, title: String(title).trim() });
  if (severity !== undefined) run("UPDATE defects SET severity = @severity WHERE id = @id", { id: req.params.id, severity });
  if (assignee !== undefined) run("UPDATE defects SET assignee = @assignee WHERE id = @id", { id: req.params.id, assignee });
  if (requirementId !== undefined) run("UPDATE defects SET requirement_id = @rid WHERE id = @id", { id: req.params.id, rid: requirementId });
  const after = row("SELECT * FROM defects WHERE id = @id", { id: req.params.id });
  audit(req.user, "defect.update", "defect", req.params.id, before, after, req.ip);
  res.json(ok(mapDefect(after)));
});

app.delete("/api/defects/:id", requirePermission("project:*"), (req, res) => {
  const before = row("SELECT * FROM defects WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Defect not found.");
  run("DELETE FROM defects WHERE id = @id", { id: req.params.id });
  audit(req.user, "defect.delete", "defect", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});
```

---

### Task 6: 后端 — 文档编辑 & 删除

**Files:**
- Modify: `api/server.js` (在文档路由区域内追加)

- [ ] **Step 1: 新增 `PATCH /api/documents/:id`**

```javascript
app.patch("/api/documents/:id", requirePermission("document:*"), (req, res) => {
  const before = row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
  const { title, type, owner } = req.body || {};
  if (title !== undefined) run("UPDATE documents SET title = @title WHERE id = @id", { id: req.params.id, title: String(title).trim() });
  if (type !== undefined) run("UPDATE documents SET type = @type WHERE id = @id", { id: req.params.id, type });
  if (owner !== undefined) run("UPDATE documents SET owner = @owner WHERE id = @id", { id: req.params.id, owner: String(owner).trim() });
  run("UPDATE documents SET updated_at = @updated WHERE id = @id", { id: req.params.id, updated: now() });
  const after = row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
  audit(req.user, "document.update", "document", req.params.id, before, after, req.ip);
  res.json(ok(mapDocument(after)));
});

app.delete("/api/documents/:id", requirePermission("document:*"), (req, res) => {
  const before = row("SELECT * FROM documents WHERE id = @id", { id: req.params.id });
  if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Document not found.");
  run("DELETE FROM documents WHERE id = @id", { id: req.params.id });
  // Also clean up the stored object if present
  if (before.storage_key) {
    try { fs.unlinkSync(path.join(STORAGE_DIR, before.storage_key)); } catch { /* file may not exist */ }
  }
  audit(req.user, "document.delete", "document", req.params.id, before, null, req.ip);
  res.json(ok({ deleted: true, id: req.params.id }));
});
```

---

### Task 7: 前端 — `api.ts` + `resources.ts` 补齐

**Files:**
- Modify: `web/src/services/api.ts` (已有 `del()` 函数，无需修改)
- Modify: `web/src/services/resources.ts` (追加新函数)

- [ ] **Step 1: 追加 PUT/DELETE 辅助函数到 resources.ts**

在 `import { get, post, patch } from './api'` 基础上追加导入 `del`，然后尾部增加以下函数：

```typescript
// --- Generic helpers --------------------------------------------------------

async function unwrapDel<T>(path: string): Promise<T> {
  const res = await del<ApiResponse<T>>(path);
  return res.data;
}

async function unwrapPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await put<ApiResponse<T>>(path, body);
  return res.data;
}
```

同时修改 import 行添加 `del`, `put`：

```typescript
import { get, post, patch, del, put } from './api';
```

并在 `api.ts` 尾部追加 `put` 函数：

```typescript
export function put<T>(path: string, body?: unknown, options?: { headers?: Record<string, string> }): Promise<T> {
  return request<T>('PUT', path, body, options);
}
```

- [ ] **Step 2: 在 resources.ts 追加所有新 API 函数**

```typescript
// --- Projects ---------------------------------------------------------------

export interface UpdateProjectInput {
  name?: string;
  owner?: string;
  status?: string;
  progress?: number;
  processMode?: string;
}

export function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  return unwrapPatch<Project>(`/api/projects/${id}`, input);
}

export function deleteProject(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/projects/${id}`);
}

// --- Tasks ------------------------------------------------------------------

export interface UpdateTaskInput {
  title?: string;
  owner?: string;
  progress?: number;
  status?: string;
  type?: string;
  estimatedHours?: number;
  actualHours?: number;
  dueDate?: string;
}

export function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return unwrapPatch<Task>(`/api/tasks/${id}`, input);
}

export function deleteTask(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/tasks/${id}`);
}

// --- Sprints ----------------------------------------------------------------

export interface UpdateSprintInput {
  name?: string;
  goal?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export function updateSprint(id: string, input: UpdateSprintInput): Promise<Sprint> {
  return unwrapPatch<Sprint>(`/api/sprints/${id}`, input);
}

export function deleteSprint(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/sprints/${id}`);
}

// --- Milestones -------------------------------------------------------------

export interface MilestoneInput {
  name: string;
  status?: string;
  date?: string;
}

export function addMilestone(projectId: string, input: MilestoneInput): Promise<{ milestones: Milestone[] }> {
  return unwrapPost<{ milestones: Milestone[] }>(`/api/projects/${projectId}/milestones`, input);
}

export function deleteMilestone(projectId: string, index: number): Promise<{ milestones: Milestone[] }> {
  return unwrapDel<{ milestones: Milestone[] }>(`/api/projects/${projectId}/milestones/${index}`);
}

// --- Requirements -----------------------------------------------------------

export function deleteRequirement(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/requirements/${id}`);
}

// --- Test cases -------------------------------------------------------------

export interface UpdateTestCaseInput {
  name?: string;
  owner?: string;
  description?: string;
  steps?: string[];
  expectedResult?: string;
  requirementId?: string;
}

export function updateTestCase(id: string, input: UpdateTestCaseInput): Promise<TestCase> {
  return unwrapPatch<TestCase>(`/api/test-cases/${id}`, input);
}

export function deleteTestCase(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/test-cases/${id}`);
}

// --- Defects ----------------------------------------------------------------

export interface UpdateDefectInput {
  title?: string;
  severity?: string;
  assignee?: string;
  requirementId?: string;
}

export function updateDefect(id: string, input: UpdateDefectInput): Promise<Defect> {
  return unwrapPatch<Defect>(`/api/defects/${id}`, input);
}

export function deleteDefect(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/defects/${id}`);
}

// --- Documents --------------------------------------------------------------

export interface UpdateDocumentInput {
  title?: string;
  type?: string;
  owner?: string;
}

export function updateDocument(id: string, input: UpdateDocumentInput): Promise<Document> {
  return unwrapPatch<Document>(`/api/documents/${id}`, input);
}

export function deleteDocument(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/documents/${id}`);
}
```

同时需要在 import 中添加 `Milestone` 类型：

```typescript
import type { ..., Milestone, ... } from '../types';
```

---

### Task 8: 前端 — ProjectsPage 增加编辑/删除

**Files:**
- Modify: `web/src/pages/ProjectsPage.tsx`

- [ ] **Step 1: 在 ProjectList 操作列追加编辑和删除按钮**

在 `columns` 数组末尾追加操作列：

```typescript
{
  key: 'actions',
  title: '操作',
  width: 120,
  render: (p) => (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button className="btn btn-text btn-xs" onClick={() => onEdit(p)}>编辑</button>
      <button className="btn btn-text btn-xs" style={{ color: 'var(--color-red, #dc2626)' }} onClick={() => handleDelete(p)}>删除</button>
    </div>
  ),
},
```

- [ ] **Step 2: 在 ProjectList 组件内增加状态和方法**

在组件内增加：

```typescript
const [editing, setEditing] = useState<Project | null>(null);

async function handleDelete(p: Project) {
  if (!window.confirm(`确定删除项目 "${p.name}"？其下所有任务和迭代将被同时删除。`)) return;
  try {
    const { deleteProject } = await import('../services/resources');
    await deleteProject(p.id);
    reload();
  } catch (err: unknown) {
    alert(err instanceof ApiError ? err.message : '删除失败');
  }
}
```

在 `creating` 的 Overlay 关闭回调旁增加 `editing` 的渲染：

```tsx
{creating && (
  <CreateProjectForm onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />
)}
{editing && (
  <EditProjectForm project={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
)}
```

- [ ] **Step 3: 创建 EditProjectForm 组件**

```tsx
function EditProjectForm({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name);
  const [owner, setOwner] = useState(project.owner);
  const [status, setStatus] = useState(project.status);
  const [progress, setProgress] = useState(String(project.progress));
  const [processMode, setProcessMode] = useState(project.processMode);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError('项目名称不能为空。');
    setSubmitting(true);
    try {
      const { updateProject } = await import('../services/resources');
      await updateProject(project.id, {
        name: name.trim(),
        owner: owner.trim(),
        status,
        progress: Number(progress) || 0,
        processMode,
      });
      onSaved();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="编辑项目" subtitle={project.id}>
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">项目名称</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">状态</label>
            <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">进度 (%)</label>
            <input className="form-input" type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">流程模式</label>
            <select className="form-select" value={processMode} onChange={(e) => setProcessMode(e.target.value)}>
              <option value="scrum">Scrum</option>
              <option value="waterfall">Waterfall</option>
              <option value="kanban">Kanban</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
```

- [ ] **Step 4: 在项目详情页（ProjectDetail）的 WBS 任务表增加编辑/删除**

在 `WbsTab` 组件的 columns 末尾增加：

```typescript
{
  key: 'actions',
  title: '操作',
  width: 100,
  render: (task) => (
    <div className="flex items-center gap-1">
      <button className="btn btn-text btn-xs" onClick={() => setEditingTask(task)}>编辑</button>
      <button className="btn btn-text btn-xs" style={{ color: 'var(--color-red, #dc2626)' }} onClick={() => handleDeleteTask(task)}>删除</button>
    </div>
  ),
},
```

并增加 `editingTask` state 和处理函数。编辑 Task 的 Overlay 复用 `CreateWbsTaskForm` 的逻辑但改为编辑模式（填充已有值后调用 `updateTask`）。

- [ ] **Step 5: 在看板和迭代也增加操作列**

看板卡片内增加编辑/删除操作（略，模式同 WBS）。
迭代列表增加编辑/删除操作（略，模式同 WBS）。

---

### Task 9: 前端 — RequirementsPage 增加删除

**Files:**
- Modify: `web/src/pages/RequirementsPage.tsx`

- [ ] **Step 1: 在需求列表操作列增加删除按钮**

在 `columns` 末尾追加：

```typescript
{
  key: 'actions',
  title: '操作',
  width: 80,
  render: (r) => (
    <button
      className="btn btn-text btn-xs"
      style={{ color: 'var(--color-red, #dc2626)' }}
      onClick={(e) => { e.stopPropagation(); handleDelete(r); }}
    >删除</button>
  ),
},
```

- [ ] **Step 2: 增加删除 handler**

```typescript
async function handleDelete(r: Requirement) {
  if (!window.confirm(`确定删除需求 "${r.title}"？`)) return;
  try {
    const { deleteRequirement } = await import('../services/resources');
    await deleteRequirement(r.id);
    reload();
  } catch (err: unknown) {
    alert(err instanceof ApiError ? err.message : '删除失败');
  }
}
```

---

### Task 10: 前端 — TestingPage 增加编辑/删除

**Files:**
- Modify: `web/src/pages/TestingPage.tsx`

- [ ] **Step 1: 测试用例列表增加操作列**

在 `TestCasesTab` 的 `columns` 末尾追加：

```typescript
{
  key: 'actions',
  title: '操作',
  width: 120,
  render: (t) => (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button className="btn btn-text btn-xs" onClick={() => setEditing(t)}>编辑</button>
      <button className="btn btn-text btn-xs" style={{ color: 'var(--color-red, #dc2626)' }} onClick={() => handleDelete(t)}>删除</button>
    </div>
  ),
},
```

- [ ] **Step 2: 增加状态变量和 handler**

```typescript
const [editing, setEditing] = useState<TestCase | null>(null);

async function handleDelete(tc: TestCase) {
  if (!window.confirm(`确定删除测试套件 "${tc.name}"？`)) return;
  try {
    const { deleteTestCase } = await import('../services/resources');
    await deleteTestCase(tc.id);
    reload();
  } catch (err: unknown) {
    alert(err instanceof ApiError ? err.message : '删除失败');
  }
}
```

- [ ] **Step 3: 创建 EditTestCaseForm 组件**（类似 CreateTestCaseForm 但预填值）

```tsx
function EditTestCaseForm({ tc, onClose, onSaved }: { tc: TestCase; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(tc.name);
  const [owner, setOwner] = useState(tc.owner || '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!name.trim()) return setFormError('名称不能为空。');
    setSubmitting(true);
    try {
      const { updateTestCase } = await import('../services/resources');
      await updateTestCase(tc.id, { name: name.trim(), owner: owner.trim() });
      onSaved();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="编辑测试套件" subtitle={tc.id}>
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">名称</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">负责人</label>
          <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
```

- [ ] **Step 4: 缺陷列表同样增加编辑/删除**

在 `DefectsTab` 增加同样的操作列、`editingDefect` 状态、`handleDeleteDefect` 函数、`EditDefectForm` 组件（模式同上，字段含 title, severity, assignee）。

---

### Task 11: 前端 — DocumentsPage 增加编辑/删除

**Files:**
- Modify: `web/src/pages/DocumentsPage.tsx`

- [ ] **Step 1: 文档列表增加操作列**

在 `docColumns` 末尾追加：

```typescript
{
  key: 'actions',
  title: '操作',
  width: 120,
  render: (doc) => (
    <div className="flex items-center gap-1">
      <button className="btn btn-text btn-xs" onClick={() => onEdit?.(doc)}>编辑</button>
      <button className="btn btn-text btn-xs" style={{ color: 'var(--color-red, #dc2626)' }} onClick={() => handleDelete(doc)}>删除</button>
    </div>
  ),
},
```

由于 `docColumns` 是顶层常量，需要改为函数或传入回调。简单做法：将 `docColumns` 移入组件内定义，或增加 `onEdit`/`handleDelete` 回调。

- [ ] **Step 2: 在 DocumentsPage 组件中增加删除 handler**

```typescript
async function handleDelete(doc: Document) {
  if (!window.confirm(`确定删除文档 "${doc.title}"？`)) return;
  try {
    const { deleteDocument } = await import('../services/resources');
    await deleteDocument(doc.id);
    reload();
  } catch (err: unknown) {
    alert(err instanceof ApiError ? err.message : '删除失败');
  }
}
```

- [ ] **Step 3: 增加编辑表单组件 EditDocumentForm**

```tsx
function EditDocumentForm({ doc, onClose, onSaved }: { doc: Document; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [type, setType] = useState(doc.type);
  const [owner, setOwner] = useState(doc.owner || '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError('文档标题不能为空。');
    setSubmitting(true);
    try {
      const { updateDocument } = await import('../services/resources');
      await updateDocument(doc.id, { title: title.trim(), type, owner: owner.trim() });
      onSaved();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="编辑文档" subtitle={doc.id}>
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">标题</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">类型</label>
            <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
              {DOC_UPLOAD_TYPES.filter((t) => t.key).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
```

---

### Task 12: 验证

**Files:** 无修改

- [ ] **Step 1: 后端验证**

```bash
cd api && node server.js
```

验证服务正常启动，无语法错误。

- [ ] **Step 2: 前端编译验证**

```bash
cd web && npx tsc --noEmit
```

确认无类型错误。

- [ ] **Step 3: 端到端验证**

```bash
npm run dev
```

手动测试：启动后分别访问 Projects / Requirements / Testing / Documents 页面，验证新增的编辑/删除功能。
