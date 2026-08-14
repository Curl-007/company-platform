const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workspaceRoot = path.resolve(__dirname, "..", "..");

function source(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function locale(relativePath) {
  return JSON.parse(source(relativePath));
}

test("team and capacity views keep workload data in the resource-coordination boundary", () => {
  const teamView = source("web/src/features/team/components/TeamView.tsx");
  const memberDetail = source("web/src/features/team/components/MemberDetail.tsx");
  const capacityView = source("web/src/features/capacity/components/CapacityView.tsx");
  const allocationForm = source("web/src/features/capacity/components/AllocationForm.tsx");
  const zh = locale("web/src/i18n/locales/zh-CN.json");
  const en = locale("web/src/i18n/locales/en-US.json");

  assert.doesNotMatch(teamView, /completionRate/);
  assert.doesNotMatch(teamView, /task.*completion/i);
  assert.match(memberDetail, /features\.team\.memberDetail\.workloadDisclaimer/);
  assert.match(capacityView, /features\.capacity\.capacityView\.thresholdsSubtitle/);
  assert.match(allocationForm, /features\.capacity\.allocationForm\.subtitle/);

  assert.match(zh.features.team.memberDetail.workloadDisclaimer, /\u4e0d\u7528\u4e8e\u7ee9\u6548\u3001\u6392\u540d\u3001\u85aa\u916c\u3001\u664b\u5347\u6216\u6dd8\u6c70/);
  assert.match(zh.features.capacity.capacityView.thresholdsSubtitle, /\u4e0d\u4ee3\u8868\u4f4e\u7ee9\u6548/);
  assert.match(zh.features.capacity.allocationForm.subtitle, /\u4e0d\u4f5c\u4e3a\u4e2a\u4eba\u7ee9\u6548\u8bc4\u5206/);
  assert.match(en.features.team.memberDetail.workloadDisclaimer, /never for performance, ranking, compensation, promotion, or demotion/i);
  assert.match(en.features.capacity.capacityView.thresholdsSubtitle, /not low performance/i);
  assert.match(en.features.capacity.allocationForm.subtitle, /(?:never|not) for individual performance scoring/i);
});
