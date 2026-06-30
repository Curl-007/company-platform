const today = "2026-06-29";

const programs = [
  {
    id: "PGM-001",
    name: "Company Management Platform",
    owner: "Project Manager",
    status: "active",
    healthScore: 82,
    progress: 64,
    projectIds: ["PRJ-001"],
    risks: ["Release approval requires one more regression pass."],
    updatedAt: today,
  },
];

const portfolios = [
  {
    id: "PF-001",
    name: "Internal Tools",
    owner: "Product Manager",
    status: "active",
    productIds: ["PROD-001"],
    roadmap: [
      { title: "AI analysis integration", version: "1.1.0", quarter: "2026-Q3", status: "planned" },
      { title: "Team governance refinement", version: "1.2.0", quarter: "2026-Q3", status: "active" },
    ],
  },
];

const products = [
  {
    id: "PROD-001",
    name: "Work Platform",
    owner: "Product Manager",
    version: "1.0.0",
    stage: "growth",
    description: "Integrated project, product, delivery, and AI analysis workspace.",
    imageUrl: "",
    imageUrls: [],
    systemName: "work",
    systemVersion: "2026.06",
    applicationVersion: "1.0.0",
    modules: [
      { name: "Project cockpit", owner: "Project Manager", status: "active" },
      { name: "Team management", owner: "System Admin", status: "active" },
      { name: "AI analysis", owner: "Product Manager", status: "beta" },
    ],
    hardwareInfo: {},
    systemInfo: {},
    applicationInfo: {},
    hardwareMetrics: [],
    systemMetrics: [],
    appMetrics: [],
    roadmap: [
      { title: "Permission strategy cleanup", version: "1.0.1", quarter: "2026-Q3", status: "active" },
    ],
  },
];

const projects = [
  {
    id: "PRJ-001",
    name: "Work Platform Optimization",
    code: "WORK",
    description: "UI, workflow, permissions, and AI capability optimization.",
    status: "active",
    healthScore: 84,
    owner: "Project Manager",
    programId: "PGM-001",
    productId: "PROD-001",
    processMode: "scrum",
    progress: 68,
    riskCount: 1,
    milestones: [
      { name: "Permission model", status: "done", date: "2026-06-26" },
      { name: "Team lifecycle", status: "active", date: "2026-06-29" },
    ],
    startDate: "2026-06-01",
    endDate: "2026-07-15",
    sourcePath: "",
    updatedAt: today,
  },
];

const requirements = [
  {
    id: "REQ-001",
    title: "Unify user lifecycle into team management",
    description: "System settings keeps platform configuration only; team management owns member lifecycle.",
    status: "in_dev",
    priority: "high",
    projectId: "PRJ-001",
    productId: "PROD-001",
    portfolioId: "PF-001",
    parentId: null,
    owner: "Product Manager",
    assignee: "System Admin",
    assigneeRole: "admin",
    assignmentStatus: "assigned",
    completion: 75,
    linkedTasks: ["TASK-001", "TASK-002"],
    acceptanceCriteria: [
      "Legacy structure page is removed.",
      "Admin can create, edit, enable, and disable members from team management.",
      "Non-admin roles can view collaboration information without account lifecycle actions.",
    ],
  },
];

const tasks = [
  {
    id: "TASK-001",
    title: "Remove legacy structure entry",
    description: "Remove route, nav entry, role page permission, and legacy endpoint.",
    status: "done",
    statusText: "Done",
    projectId: "PRJ-001",
    owner: "System Admin",
    dueDate: today,
    requirementId: "REQ-001",
    progress: 100,
    blocker: null,
    type: "task",
    parentId: null,
    wbsCode: "1.1",
    kanbanColumn: "done",
    sortOrder: 10,
    estimatedHours: 4,
    actualHours: 4,
    remainingHours: 0,
    assigneeRole: "admin",
  },
  {
    id: "TASK-002",
    title: "Move user lifecycle into team management",
    description: "Add edit, reset password, enable, and disable actions to team member details.",
    status: "in_progress",
    statusText: "In progress",
    projectId: "PRJ-001",
    owner: "System Admin",
    dueDate: today,
    requirementId: "REQ-001",
    progress: 80,
    blocker: null,
    type: "task",
    parentId: null,
    wbsCode: "1.2",
    kanbanColumn: "in_progress",
    sortOrder: 20,
    estimatedHours: 8,
    actualHours: 6,
    remainingHours: 2,
    assigneeRole: "admin",
  },
];

const tests = [
  {
    id: "TC-001",
    name: "Admin member lifecycle",
    requirementId: "REQ-001",
    projectId: "PRJ-001",
    status: "active",
    owner: "QA Engineer",
    assigneeRole: "qa",
    totalCases: 5,
    passedCases: 4,
    failedCases: 0,
    blockedCases: 1,
  },
];

const documents = [
  {
    id: "DOC-001",
    title: "Permission and Team Governance Notes",
    type: "markdown",
    category: "project",
    version: "1.0",
    aiStatus: "ready",
    owner: "Project Manager",
    ownerRole: "pm",
    projectId: "PRJ-001",
    updatedAt: today,
    linkedRequirements: ["REQ-001"],
    risks: [],
    fileName: "permission-team-governance.md",
    fileSize: 2048,
    fileType: "text/markdown",
    storedFile: null,
  },
];

const sprints = [
  {
    id: "SPR-001",
    projectId: "PRJ-001",
    name: "Governance Sprint",
    goal: "Finish permission and team management ownership cleanup.",
    status: "active",
    startDate: "2026-06-24",
    endDate: "2026-07-05",
  },
];

const defects = [
  {
    id: "BUG-001",
    title: "Legacy user actions are split between settings and team views",
    severity: "medium",
    status: "resolved",
    projectId: "PRJ-001",
    requirementId: "REQ-001",
    assignee: "System Admin",
    assigneeRole: "admin",
    foundInBuild: "BLD-001",
    affectedVersion: "1.0.0",
    reporter: "QA Engineer",
  },
];

const builds = [
  {
    id: "BLD-001",
    projectId: "PRJ-001",
    name: "work-platform-governance-001",
    version: "1.0.1",
    buildDate: today,
    status: "testing",
    linkedStories: ["REQ-001"],
    linkedBugs: ["BUG-001"],
    scmHash: "local",
    creator: "System Admin",
    notes: "Includes team lifecycle and legacy structure removal changes.",
  },
];

const releases = [
  {
    id: "REL-001",
    productId: "PROD-001",
    name: "Work Platform 1.0.1",
    version: "1.0.1",
    releaseDate: "2026-07-05",
    buildId: "BLD-001",
    releaseType: "patch",
    linkedStories: ["REQ-001"],
    linkedBugs: ["BUG-001"],
    releaseNotes: "Governance cleanup release.",
    creator: "Project Manager",
    status: "planned",
  },
];

const workLogs = [];
const aiJobs = [];

const aiSummaries = {
  dashboard: {
    title: "Workspace overview",
    summary: "Project delivery is generally healthy. The main focus is completing team lifecycle governance and validating permissions.",
    risks: ["One QA case is blocked until account lifecycle verification is completed."],
    recommendations: ["Run admin and PM role smoke tests before release."],
  },
  projects: {
    title: "Project portfolio",
    summary: "The active project is progressing with one medium risk already resolved.",
    risks: [],
    recommendations: ["Keep release evidence attached to requirements."],
  },
  requirements: {
    title: "Requirement completion",
    summary: "The governance requirement is mostly complete and needs final acceptance testing.",
    risks: ["Confirm non-admin users cannot access lifecycle actions."],
    recommendations: ["Record acceptance results in the document center."],
  },
};

module.exports = {
  programs,
  portfolios,
  tasks,
  projects,
  products,
  requirements,
  tests,
  sprints,
  defects,
  documents,
  workLogs,
  aiJobs,
  aiSummaries,
  builds,
  releases,
};
