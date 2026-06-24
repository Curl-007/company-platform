const tasks = [
  {
    id: "TASK-118",
    title: "支付模块接口联调",
    status: "blocked",
    statusText: "阻塞",
    project: "研发平台一期",
    owner: "王辰",
    due: "今天",
    requirement: "REQ-204",
    progress: 62,
  },
  {
    id: "TASK-121",
    title: "日报分析结果确认",
    status: "running",
    statusText: "进行中",
    project: "AI 分析中心",
    owner: "李沐",
    due: "今天",
    requirement: "REQ-231",
    progress: 48,
  },
  {
    id: "TASK-132",
    title: "项目集状态字段校验",
    status: "waiting",
    statusText: "待验收",
    project: "项目治理",
    owner: "陈序",
    due: "明天",
    requirement: "REQ-196",
    progress: 88,
  },
  {
    id: "TASK-136",
    title: "标书响应矩阵模板",
    status: "done",
    statusText: "已完成",
    project: "文档中心",
    owner: "赵清",
    due: "昨天",
    requirement: "REQ-220",
    progress: 100,
  },
];

const projects = [
  ["研发平台一期", "开发中", "82", "张三", "64%", "3", "今天"],
  ["客户交付项目 A", "测试中", "76", "李四", "81%", "5", "昨天"],
  ["文档 AI 分析中心", "设计中", "88", "王五", "42%", "1", "今天"],
  ["组织权限改造", "验收中", "91", "周宁", "93%", "0", "今天"],
  ["产品路线图升级", "规划中", "79", "赵清", "28%", "2", "周一"],
];

const requirements = [
  ["REQ-204", "支付模块接口联调", "开发中", "高", "研发平台一期", "73%"],
  ["REQ-220", "标书响应矩阵生成", "待验收", "中", "文档中心", "86%"],
  ["REQ-231", "日报需求完成度分析", "测试中", "高", "AI 分析中心", "68%"],
  ["REQ-242", "项目健康度评分", "已排期", "中", "项目集", "31%"],
];

const documents = [
  ["需求规格说明书", "需求文档", "v1.8", "AI 已分析", "今天"],
  ["平台概要设计", "设计文档", "v0.9", "AI 待确认", "昨天"],
  ["客户招标文件", "标书", "v1.0", "解析中", "周一"],
  ["测试验收报告", "测试文档", "v1.2", "AI 已分析", "周一"],
];

const root = document.querySelector("#viewRoot");
const navItems = document.querySelectorAll(".nav-item");
const aiPanel = document.querySelector("#aiPanel");
const aiSubtitle = document.querySelector("#aiSubtitle");
const aiSummary = document.querySelector("#aiSummary");
const aiRisks = document.querySelector("#aiRisks");

const viewMeta = {
  dashboard: {
    subtitle: "个人工作台分析",
    summary: "今日 12 个任务中 5 个已完成，2 个逾期，1 个阻塞。建议优先处理接口联调阻塞和测试环境缺陷。",
    risks: ["支付模块需求缺少验收证据。", "接口联调阻塞超过 1 天。", "日报中提到的接口变更尚未关联需求。"],
  },
  projects: {
    subtitle: "项目集健康度分析",
    summary: "当前项目集中 1 个高风险项目、2 个中风险项目。主要风险来自测试阻塞和需求变更。",
    risks: ["客户交付项目 A 缺陷关闭率低于目标。", "产品路线图升级仍缺少确认里程碑。"],
  },
  products: {
    subtitle: "产品集规划分析",
    summary: "产品路线图中 Q3 版本需求集中，建议将 AI 文档分析能力拆分为两个小版本交付。",
    risks: ["需求池高优先级事项过多。", "版本目标与项目资源存在冲突。"],
  },
  flow: {
    subtitle: "开发流程分析",
    summary: "标准流程覆盖立项到复盘，当前瓶颈集中在需求评审和测试验收两个节点。",
    risks: ["部分流程节点缺少明确输出物。", "节点超期规则需要按项目类型区分。"],
  },
  requirements: {
    subtitle: "需求完成度分析",
    summary: "4 条重点需求平均完成度 64.5%。REQ-231 需要补充测试通过证据后才能进入验收。",
    risks: ["REQ-204 有阻塞缺陷，完成度上限应限制。", "REQ-242 任务拆解不足。"],
  },
  testing: {
    subtitle: "测试质量分析",
    summary: "测试执行率 78%，缺陷关闭率 69%。建议先处理阻塞缺陷，再推进验收报告。",
    risks: ["阻塞缺陷 3 个。", "两个需求缺少回归测试记录。"],
  },
  docs: {
    subtitle: "文档中心分析",
    summary: "已识别 4 类核心文档。标书解析仍在进行，概要设计需要人工确认 AI 风险项。",
    risks: ["概要设计缺少接口异常处理说明。", "客户招标文件尚未生成响应矩阵。"],
  },
  org: {
    subtitle: "组织负载分析",
    summary: "研发二组负载较高，测试资源在本周三后出现冲突。建议调整两个低优先级需求排期。",
    risks: ["关键成员同时参与 3 个项目。", "测试负责人审批积压。"],
  },
  ai: {
    subtitle: "AI 模型接口分析",
    summary: "AI 分析链路包含文档解析、切片、向量检索、模型路由、人工确认和写入业务数据。",
    risks: ["敏感文档需要默认使用私有模型。", "AI 结果必须保留证据引用。"],
  },
};

function statusBadge(text, type) {
  return `<span class="status ${type}">${text}</span>`;
}

function renderHeader(title, desc, action = "") {
  return `
    <div class="view-header">
      <div>
        <div class="eyebrow">公司项目管理平台</div>
        <h1>${title}</h1>
        <p class="muted">${desc}</p>
      </div>
      <div>${action}</div>
    </div>
  `;
}

function renderMetric(label, value) {
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
    </div>
  `;
}

function renderDashboard() {
  const taskCards = tasks
    .map(
      (task, index) => `
        <article class="task-card ${index === 0 ? "active" : ""}">
          <div class="task-title">
            <span>${task.title}</span>
            ${statusBadge(task.statusText, task.status)}
          </div>
          <div class="task-meta">
            <span>${task.id}</span>
            <span>${task.project}</span>
            <span>${task.due}</span>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    ${renderHeader("个人工作台", "今日任务、流程位置、日报分析和需求完成度集中处理。", '<button class="primary-button">新建日报</button>')}
    <div class="metrics-grid">
      ${renderMetric("今日任务", "12")}
      ${renderMetric("已完成", "5")}
      ${renderMetric("逾期", "2")}
      ${renderMetric("阻塞", "1")}
      ${renderMetric("待审批", "3")}
      ${renderMetric("本周完成", "68%")}
    </div>

    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-toolbar">
          <h2>任务队列</h2>
          <button class="secondary-button">筛选</button>
        </div>
        <div class="task-list">${taskCards}</div>
      </section>

      <section class="detail-stack">
        <div class="panel">
          <div class="panel-toolbar">
            <div>
              <h2>支付模块接口联调</h2>
              <div class="inline-meta">
                <span>TASK-118</span>
                <span>负责人 王辰</span>
                <span>关联需求 REQ-204</span>
              </div>
            </div>
            ${statusBadge("阻塞", "blocked")}
          </div>
          <p class="muted">第三方支付回调字段发生变化，联调环境缺少最新签名样例。需要产品确认字段兼容策略，测试补充异常回调用例。</p>
          <div class="progress-line"><div class="progress-fill yellow" style="width: 62%"></div></div>
        </div>

        <div class="panel">
          <h2>工作流程图</h2>
          <div class="flow-strip">
            <div class="flow-node done"><strong>需求</strong><div class="muted">已确认</div></div>
            <div class="flow-node done"><strong>设计</strong><div class="muted">已评审</div></div>
            <div class="flow-node current"><strong>开发</strong><div class="muted">联调阻塞</div></div>
            <div class="flow-node"><strong>测试</strong><div class="muted">待进入</div></div>
            <div class="flow-node"><strong>验收</strong><div class="muted">未开始</div></div>
            <div class="flow-node"><strong>发布</strong><div class="muted">未开始</div></div>
          </div>
        </div>

        <div class="split-grid">
          <div class="panel log-box">
            <h2>每日工作日志</h2>
            <textarea id="dailyLog">完成支付模块回调接口联调 60%，发现签名字段和设计文档不一致。已与测试同步异常用例，等待产品确认兼容策略。</textarea>
            <button class="primary-button" id="analyzeLogButton">分析日志</button>
            <div class="analysis-result panel" id="analysisResult">
              <h3>AI 日志分析结果</h3>
              <ul class="plain-list">
                <li>完成事项：支付回调接口联调推进到 60%。</li>
                <li>阻塞问题：签名字段与设计文档不一致。</li>
                <li>需求完成度：REQ-204 从 68% 调整建议为 73%。</li>
                <li>下一步：确认兼容策略并补充异常回调用例。</li>
              </ul>
            </div>
          </div>
          <div class="panel">
            <h2>需求完成度</h2>
            <div class="score-grid">
              <div class="score-box"><div class="muted">任务</div><div class="score-value">62%</div></div>
              <div class="score-box"><div class="muted">测试</div><div class="score-value">38%</div></div>
              <div class="score-box"><div class="muted">文档</div><div class="score-value">74%</div></div>
              <div class="score-box"><div class="muted">日志</div><div class="score-value">86%</div></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderProjects() {
  const rows = projects
    .map(
      ([name, status, health, owner, progress, risks, updated]) => `
        <tr>
          <td><strong>${name}</strong><div class="table-subtext">项目组合 / 研发管理</div></td>
          <td>${statusBadge(status, status.includes("测试") ? "waiting" : "running")}</td>
          <td>${health}</td>
          <td>${owner}</td>
          <td>${progress}</td>
          <td>${risks}</td>
          <td>${updated}</td>
        </tr>
      `,
    )
    .join("");

  return `
    ${renderHeader("项目集", "以表格、看板和健康度视图管理全部项目状态。", '<button class="primary-button">新建项目</button>')}
    <div class="toolbar-row">
      <div class="segmented">
        <button class="active">表格</button>
        <button>看板</button>
        <button>甘特图</button>
        <button>健康度</button>
      </div>
      <button class="secondary-button">导出报表</button>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>项目</th><th>状态</th><th>健康度</th><th>负责人</th><th>进度</th><th>风险</th><th>更新时间</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderProducts() {
  return `
    ${renderHeader("产品集", "管理产品线、版本路线图、需求池和 AI 规划建议。", '<button class="primary-button">规划版本</button>')}
    <div class="product-layout">
      <section class="panel">
        <h2>产品树</h2>
        <ul class="tree-list">
          <li class="active">项目管理平台</li>
          <li>个人工作台</li>
          <li>项目集管理</li>
          <li>产品集管理</li>
          <li>AI 分析中心</li>
          <li>组织权限</li>
        </ul>
      </section>
      <section class="panel">
        <h2>版本路线图</h2>
        <div class="roadmap">
          <div class="timeline-item"><strong>V1.0</strong><span>个人任务、项目集、需求、文档中心</span>${statusBadge("开发中", "running")}</div>
          <div class="timeline-item"><strong>V1.1</strong><span>测试管理、流程模板、组织权限</span>${statusBadge("规划中", "waiting")}</div>
          <div class="timeline-item"><strong>V1.2</strong><span>AI 文档分析、日报完成度分析</span>${statusBadge("设计中", "running")}</div>
          <div class="timeline-item"><strong>V2.0</strong><span>自动排期、资源优化、知识库问答</span>${statusBadge("待评估", "waiting")}</div>
        </div>
      </section>
      <section class="panel">
        <h2>需求池</h2>
        <div class="task-list">
          <article class="task-card"><div class="task-title">标书响应矩阵</div><div class="task-meta">价值 高 · 风险 中</div></article>
          <article class="task-card"><div class="task-title">日志完成度分析</div><div class="task-meta">价值 高 · 风险 高</div></article>
          <article class="task-card"><div class="task-title">流程节点门禁</div><div class="task-meta">价值 中 · 风险 低</div></article>
        </div>
      </section>
    </div>
  `;
}

function renderFlow() {
  const nodes = ["立项", "需求", "设计", "开发", "联调", "测试", "验收", "发布", "运维", "复盘"];
  return `
    ${renderHeader("开发流程", "配置从立项到复盘的流程模板、节点门禁和交付物。", '<button class="primary-button">新建模板</button>')}
    <section class="panel">
      <h2>标准流程模板</h2>
      <div class="flow-strip">
        ${nodes.map((node, index) => `<div class="flow-node ${index < 4 ? "done" : index === 4 ? "current" : ""}"><strong>${node}</strong><div class="muted">${index < 4 ? "已配置" : index === 4 ? "当前瓶颈" : "待配置"}</div></div>`).join("")}
      </div>
    </section>
    <section class="panel" style="margin-top:16px">
      <h2>节点门禁</h2>
      <table class="data-table">
        <thead><tr><th>节点</th><th>输入</th><th>输出</th><th>审批</th><th>状态</th></tr></thead>
        <tbody>
          <tr><td>需求评审</td><td>需求文档</td><td>需求基线</td><td>产品负责人</td><td>${statusBadge("启用", "done")}</td></tr>
          <tr><td>设计评审</td><td>设计文档</td><td>评审记录</td><td>技术负责人</td><td>${statusBadge("启用", "done")}</td></tr>
          <tr><td>测试验收</td><td>测试报告</td><td>验收结论</td><td>项目经理</td><td>${statusBadge("需完善", "waiting")}</td></tr>
        </tbody>
      </table>
    </section>
  `;
}

function renderRequirements() {
  const rows = requirements
    .map(
      ([id, title, status, priority, project, score]) => `
        <tr>
          <td><strong>${id}</strong></td>
          <td>${title}</td>
          <td>${statusBadge(status, status.includes("测试") ? "waiting" : "running")}</td>
          <td>${priority}</td>
          <td>${project}</td>
          <td><div class="progress-line"><div class="progress-fill" style="width:${score}"></div></div><div class="table-subtext">${score}</div></td>
        </tr>
      `,
    )
    .join("");

  return `
    ${renderHeader("需求管理", "需求从评审、排期、开发、测试到验收形成完整追踪链路。", '<button class="primary-button">新建需求</button>')}
    <table class="data-table">
      <thead><tr><th>编号</th><th>标题</th><th>状态</th><th>优先级</th><th>项目</th><th>完成度</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderTesting() {
  return `
    ${renderHeader("测试管理", "管理测试计划、用例、执行、缺陷和验收报告。", '<button class="primary-button">新建测试计划</button>')}
    <div class="metrics-grid">
      ${renderMetric("测试计划", "8")}
      ${renderMetric("用例总数", "246")}
      ${renderMetric("执行率", "78%")}
      ${renderMetric("通过率", "82%")}
      ${renderMetric("阻塞缺陷", "3")}
      ${renderMetric("关闭率", "69%")}
    </div>
    <section class="panel">
      <h2>缺陷列表</h2>
      <table class="data-table">
        <thead><tr><th>缺陷</th><th>关联需求</th><th>严重级别</th><th>状态</th><th>负责人</th></tr></thead>
        <tbody>
          <tr><td>支付回调签名校验失败</td><td>REQ-204</td><td>高</td><td>${statusBadge("阻塞", "blocked")}</td><td>王辰</td></tr>
          <tr><td>日报解析未识别附件内容</td><td>REQ-231</td><td>中</td><td>${statusBadge("进行中", "running")}</td><td>李沐</td></tr>
          <tr><td>文档预览页码偏移</td><td>REQ-220</td><td>低</td><td>${statusBadge("已关闭", "done")}</td><td>赵清</td></tr>
        </tbody>
      </table>
    </section>
  `;
}

function renderDocs() {
  const rows = documents
    .map(
      ([title, type, version, ai, updated]) => `
        <tr>
          <td><strong>${title}</strong></td>
          <td>${type}</td>
          <td>${version}</td>
          <td>${statusBadge(ai, ai.includes("待") ? "waiting" : ai.includes("解析") ? "running" : "done")}</td>
          <td>${updated}</td>
        </tr>
      `,
    )
    .join("");
  return `
    ${renderHeader("文档中心", "统一管理需求、设计、测试、标书和复盘文档，并支持 AI 解析。", '<button class="primary-button">上传文档</button>')}
    <div class="doc-grid">
      <section class="panel">
        <table class="data-table">
          <thead><tr><th>文档</th><th>类型</th><th>版本</th><th>AI 状态</th><th>更新</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>AI 文档分析</h2>
        <ul class="plain-list">
          <li>提取 12 条业务需求。</li>
          <li>识别 4 个外部接口。</li>
          <li>发现 3 个交付风险。</li>
          <li>建议生成 18 个开发任务和 23 个测试点。</li>
        </ul>
      </section>
    </div>
  `;
}

function renderOrg() {
  return `
    ${renderHeader("组织管理", "维护公司、部门、项目组、角色、权限和人员负载。", '<button class="primary-button">新增成员</button>')}
    <div class="split-grid">
      <section class="panel">
        <h2>组织架构</h2>
        <ul class="tree-list">
          <li class="active">公司总部</li>
          <li>研发中心 · 42 人</li>
          <li>产品中心 · 12 人</li>
          <li>测试中心 · 16 人</li>
          <li>交付中心 · 21 人</li>
        </ul>
      </section>
      <section class="panel">
        <h2>人员负载</h2>
        <table class="data-table">
          <thead><tr><th>成员</th><th>角色</th><th>项目数</th><th>本周负载</th><th>风险</th></tr></thead>
          <tbody>
            <tr><td>王辰</td><td>开发</td><td>3</td><td>92%</td><td>${statusBadge("偏高", "risk")}</td></tr>
            <tr><td>李沐</td><td>算法</td><td>2</td><td>78%</td><td>${statusBadge("正常", "done")}</td></tr>
            <tr><td>赵清</td><td>文档</td><td>2</td><td>64%</td><td>${statusBadge("正常", "done")}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  `;
}

function renderAi() {
  return `
    ${renderHeader("AI 分析", "统一管理模型接口、文档分析、日报分析、规划建议和人工确认。", '<button class="primary-button">新建分析任务</button>')}
    <div class="metrics-grid">
      ${renderMetric("今日分析", "36")}
      ${renderMetric("待确认", "9")}
      ${renderMetric("文档解析", "18")}
      ${renderMetric("日报分析", "12")}
      ${renderMetric("平均置信度", "87%")}
      ${renderMetric("写入业务", "21")}
    </div>
    <section class="panel">
      <h2>模型接口</h2>
      <table class="data-table">
        <thead><tr><th>场景</th><th>模型策略</th><th>状态</th><th>人工确认</th><th>审计</th></tr></thead>
        <tbody>
          <tr><td>需求文档分析</td><td>高上下文模型</td><td>${statusBadge("启用", "done")}</td><td>必须</td><td>已开启</td></tr>
          <tr><td>日报分析</td><td>快速低成本模型</td><td>${statusBadge("启用", "done")}</td><td>低置信度时必须</td><td>已开启</td></tr>
          <tr><td>敏感文档分析</td><td>私有化模型</td><td>${statusBadge("启用", "done")}</td><td>必须</td><td>已开启</td></tr>
        </tbody>
      </table>
    </section>
  `;
}

const renderers = {
  dashboard: renderDashboard,
  projects: renderProjects,
  products: renderProducts,
  flow: renderFlow,
  requirements: renderRequirements,
  testing: renderTesting,
  docs: renderDocs,
  org: renderOrg,
  ai: renderAi,
};

function updateAi(view) {
  const meta = viewMeta[view] || viewMeta.dashboard;
  aiSubtitle.textContent = meta.subtitle;
  aiSummary.textContent = meta.summary;
  aiRisks.innerHTML = meta.risks.map((risk) => `<li>${risk}</li>`).join("");
}

function showView(view) {
  root.innerHTML = renderers[view]();
  updateAi(view);
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));

  const analyzeButton = document.querySelector("#analyzeLogButton");
  if (analyzeButton) {
    analyzeButton.addEventListener("click", () => {
      document.querySelector("#analysisResult").classList.add("visible");
      updateAi("dashboard");
    });
  }
}

navItems.forEach((item) => {
  item.addEventListener("click", () => showView(item.dataset.view));
});

document.querySelector("#openAiButton").addEventListener("click", () => {
  aiPanel.classList.remove("collapsed");
});

document.querySelector("#collapseAiButton").addEventListener("click", () => {
  aiPanel.classList.add("collapsed");
});

showView("dashboard");
