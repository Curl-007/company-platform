const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workspaceRoot = path.resolve(__dirname, "..", "..");

function source(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

test("team and capacity views keep workload data in the resource-coordination boundary", () => {
  const teamPage = source("web/src/pages/TeamPage.tsx");
  const capacityPage = source("web/src/pages/CapacityPage.tsx");

  assert.doesNotMatch(teamPage, /completionRate/);
  assert.doesNotMatch(teamPage, /任务完成率/);
  assert.match(teamPage, /仅用于资源协调和风险提示，不用于个人绩效评价/);
  assert.match(teamPage, /不用于绩效、排名、薪酬、晋升或淘汰/);
  assert.match(capacityPage, /不代表低绩效/);
  assert.match(capacityPage, /投入用于资源平衡，不作为个人绩效评分/);
});
