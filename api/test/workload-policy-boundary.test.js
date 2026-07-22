const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workspaceRoot = path.resolve(__dirname, "..", "..");

function source(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

test("team and capacity views keep workload data in the resource-coordination boundary", () => {
  // Thin page shells only re-export feature views; policy copy lives in features/*
  const teamView = source("web/src/features/team/components/TeamView.tsx");
  const memberDetail = source("web/src/features/team/components/MemberDetail.tsx");
  const capacityView = source("web/src/features/capacity/components/CapacityView.tsx");
  const allocationForm = source("web/src/features/capacity/components/AllocationForm.tsx");

  assert.doesNotMatch(teamView, /completionRate/);
  assert.doesNotMatch(teamView, /任务完成率/);
  assert.match(teamView, /仅用于资源协调和风险提示，不用于个人绩效评价/);
  assert.match(memberDetail, /不用于绩效、排名、薪酬、晋升或淘汰/);
  assert.match(capacityView, /不代表低绩效/);
  assert.match(allocationForm, /投入用于资源平衡，不作为个人绩效评分/);
});
