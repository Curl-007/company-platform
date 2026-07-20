const { SYSTEM_ROLES } = require("../security/accessControl");
const { STATUS_VALUES } = require("../workflow/stateMachine");

const PROJECT_STATUSES = STATUS_VALUES.project;
const REQUIREMENT_STATUSES = STATUS_VALUES.requirement;
const TASK_STATUSES = STATUS_VALUES.task;
const SPRINT_STATUSES = STATUS_VALUES.sprint;
const AI_JOB_STATUSES = STATUS_VALUES.aiJob;

const TEST_CASE_STATUSES = Object.freeze(["draft", "active", "passed", "failed", "blocked"]);
const TEST_RUN_RESULTS = Object.freeze(["passed", "failed", "blocked"]);
const DEFECT_STATUSES = Object.freeze(["new", "confirmed", "in_fix", "resolved", "verified", "closed", "rejected"]);
const DEFECT_SEVERITIES = Object.freeze(["low", "medium", "high", "critical"]);
const REQUIREMENT_PRIORITIES = Object.freeze(["high", "medium", "low"]);
const TASK_TYPES = Object.freeze(["epic", "story", "task", "bug", "milestone", "work_package"]);
const BUILD_STATUSES = Object.freeze(["building", "testing", "released", "failed"]);
const RELEASE_STATUSES = Object.freeze(["draft", "staging", "released", "rollback"]);
const RELEASE_TYPES = Object.freeze(["official", "stable", "hotfix"]);
const RELEASE_APPROVAL_DECISIONS = Object.freeze(["approve", "reject"]);
const DOCUMENT_CATEGORIES = Object.freeze(["project", "general", "announcement"]);
const DOCUMENT_TYPES = Object.freeze(["requirement", "design", "test", "bid", "report", "other"]);
const USER_STATUSES = Object.freeze(["active", "disabled"]);
const WORK_ITEM_ROLES = Object.freeze(["pm", "pdm", "dev", "qa"]);

const ENUMS = Object.freeze({
  projectStatuses: PROJECT_STATUSES,
  requirementStatuses: REQUIREMENT_STATUSES,
  requirementPriorities: REQUIREMENT_PRIORITIES,
  taskStatuses: TASK_STATUSES,
  taskTypes: TASK_TYPES,
  sprintStatuses: SPRINT_STATUSES,
  testCaseStatuses: TEST_CASE_STATUSES,
  testRunResults: TEST_RUN_RESULTS,
  defectStatuses: DEFECT_STATUSES,
  defectSeverities: DEFECT_SEVERITIES,
  buildStatuses: BUILD_STATUSES,
  releaseStatuses: RELEASE_STATUSES,
  releaseTypes: RELEASE_TYPES,
  releaseApprovalDecisions: RELEASE_APPROVAL_DECISIONS,
  documentCategories: DOCUMENT_CATEGORIES,
  documentTypes: DOCUMENT_TYPES,
  userRoles: SYSTEM_ROLES,
  userStatuses: USER_STATUSES,
  workItemRoles: WORK_ITEM_ROLES,
  aiJobStatuses: AI_JOB_STATUSES,
});

function publicEnums() {
  return Object.fromEntries(Object.entries(ENUMS).map(([key, values]) => [key, [...values]]));
}

module.exports = {
  AI_JOB_STATUSES,
  BUILD_STATUSES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  DOCUMENT_CATEGORIES,
  DOCUMENT_TYPES,
  ENUMS,
  PROJECT_STATUSES,
  RELEASE_APPROVAL_DECISIONS,
  RELEASE_STATUSES,
  RELEASE_TYPES,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
  SPRINT_STATUSES,
  TASK_STATUSES,
  TASK_TYPES,
  TEST_CASE_STATUSES,
  TEST_RUN_RESULTS,
  USER_STATUSES,
  WORK_ITEM_ROLES,
  publicEnums,
};
