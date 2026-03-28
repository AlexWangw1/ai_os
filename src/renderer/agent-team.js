import { classifyTaskDifficulty, normalizeActions } from "./analysis.js";

const TEAM_PRESETS = [
  {
    id: "solo-agent",
    name: "单 Agent",
    blurb: "一个通用 agent 负责从理解任务到交付结果的完整闭环，适合轻量和明确目标。",
    roles: [
      {
        id: "generalist",
        name: "Universal Agent",
        title: "通用代理",
        brief: "统一处理拆解、执行、复核与结果回写。",
        defaultOutput: "可继续执行的下一步与最终交付。"
      }
    ],
    handoffs: []
  },
  {
    id: "delivery-pod",
    name: "交付小队",
    blurb: "用计划、执行、复核三段式推进，适合大多数通用任务与中等复杂度任务。",
    roles: [
      {
        id: "planner",
        name: "Mission Planner",
        title: "任务规划师",
        brief: "拆解目标、定义边界、分配工作顺序。",
        defaultOutput: "可执行的阶段计划与上下文约束。"
      },
      {
        id: "operator",
        name: "Execution Agent",
        title: "执行代理",
        brief: "按照计划推进主任务，输出核心结果。",
        defaultOutput: "主流程执行结果与关键中间产物。"
      },
      {
        id: "reviewer",
        name: "Review Agent",
        title: "验收代理",
        brief: "校验结果、回看风险、提出加固建议。",
        defaultOutput: "质量检查结果与回归建议。"
      }
    ],
    handoffs: [
      {
        fromRoleId: "planner",
        toRoleId: "operator",
        label: "下发执行路线"
      },
      {
        fromRoleId: "operator",
        toRoleId: "reviewer",
        label: "提交执行结果"
      }
    ]
  },
  {
    id: "automation-squad",
    name: "自动化战队",
    blurb: "围绕可复用流程搭建观察、规划、执行、审查与沉淀的完整链路，适合网页动作与重复任务。",
    roles: [
      {
        id: "observer",
        name: "Context Observer",
        title: "上下文观察员",
        brief: "读取录制动作、页面环境与已有分析结果。",
        defaultOutput: "结构化上下文与可复用信号。"
      },
      {
        id: "planner",
        name: "Workflow Planner",
        title: "流程规划师",
        brief: "把目标整理成阶段任务，并决定执行路径。",
        defaultOutput: "任务树、阶段计划与模型调用策略。"
      },
      {
        id: "operator",
        name: "Operator Agent",
        title: "执行代理",
        brief: "根据计划回放动作或执行主流程。",
        defaultOutput: "已推进的流程与待确认结果。"
      },
      {
        id: "reviewer",
        name: "Stability Reviewer",
        title: "稳定性审查员",
        brief: "检查脆弱选择器、参数注入点与异常场景。",
        defaultOutput: "风险清单与稳定性修正建议。"
      },
      {
        id: "memory",
        name: "Memory Keeper",
        title: "记忆沉淀官",
        brief: "把本次执行沉淀成模板、知识或后续自动化资产。",
        defaultOutput: "可复用模板、提示词和知识条目。"
      }
    ],
    handoffs: [
      {
        fromRoleId: "observer",
        toRoleId: "planner",
        label: "交付上下文"
      },
      {
        fromRoleId: "planner",
        toRoleId: "operator",
        label: "下发执行计划"
      },
      {
        fromRoleId: "operator",
        toRoleId: "reviewer",
        label: "提交执行结果"
      },
      {
        fromRoleId: "reviewer",
        toRoleId: "memory",
        label: "沉淀知识资产"
      }
    ]
  }
];

const STATUS_LABELS = {
  pending: "待接手",
  active: "进行中",
  done: "已完成"
};

const DIFFICULTY_LABELS = {
  simple: "简单任务",
  complex: "复杂任务"
};

export function listTeamPresets() {
  return TEAM_PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    blurb: preset.blurb,
    roleCount: preset.roles.length
  }));
}

export function getTeamPreset(id) {
  return TEAM_PRESETS.find((preset) => preset.id === id) || TEAM_PRESETS[2];
}

export function getStatusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.pending;
}

export function classifyMissionDifficulty({ taskPrompt = "", actions = [], analysis = null }) {
  const actionDifficulty = classifyTaskDifficulty(actions);
  const reasons = [...actionDifficulty.reasons];
  let score = actionDifficulty.score;

  if (taskPrompt.trim().length >= 48) {
    score += 1;
    reasons.push("任务说明较长，包含额外上下文与约束。");
  }

  if (/(并且|同时|分析|研究|验证|review|报告|拆解|协作|集成|pipeline|workflow|阶段)/i.test(taskPrompt)) {
    score += 2;
    reasons.push("任务目标包含拆解、协作或复核信号。");
  }

  if ((analysis?.risks || []).length >= 2) {
    score += 1;
    reasons.push("当前流程已经暴露出多个风险点。");
  }

  if (!actions.length && !taskPrompt.trim()) {
    reasons.push("缺少额外上下文，默认按简单任务处理。");
  }

  const level = score >= 5 ? "complex" : "simple";

  return {
    level,
    label: DIFFICULTY_LABELS[level],
    score,
    reasons: uniqueStrings(reasons).slice(0, 4),
    actionDifficulty
  };
}

export function buildPreviewTeamState(teamPresetId) {
  const preset = getTeamPreset(teamPresetId);
  return preset.roles.map((role, index) => ({
    roleId: role.id,
    roleTitle: role.title,
    roleName: role.name,
    brief: role.brief,
    mission: role.brief,
    output: role.defaultOutput,
    status: index === 0 ? "active" : "pending"
  }));
}

export function buildLocalAgentPlan({
  taskPrompt = "",
  actions = [],
  analysis = null,
  pageUrl = "",
  teamPresetId = "automation-squad",
  routing = null,
  includeRecordingContext = true
}) {
  const normalizedActions = normalizeActions(includeRecordingContext ? actions : []);
  const preset = getTeamPreset(teamPresetId);
  const difficulty = classifyMissionDifficulty({
    taskPrompt,
    actions: normalizedActions,
    analysis
  });
  const objective = resolveObjective(taskPrompt, analysis, normalizedActions, pageUrl);
  const missionTitle = resolveMissionTitle(taskPrompt, analysis, objective);
  const hasContext = Boolean(normalizedActions.length || analysis);
  const activeRoleId = resolveActiveRoleId(preset);
  const roles = preset.roles.map((role, index) => {
    const status = resolveRoleStatus(role.id, index, {
      preset,
      hasContext,
      activeRoleId
    });

    return {
      roleId: role.id,
      roleTitle: role.title,
      roleName: role.name,
      brief: role.brief,
      mission: buildRoleMission(role.id, {
        objective,
        pageUrl,
        analysis,
        actions: normalizedActions
      }),
      output: buildRoleOutput(role.id, {
        objective,
        analysis,
        actions: normalizedActions
      }),
      status
    };
  });

  const stages = buildStages(preset, roles, {
    objective,
    analysis,
    actions: normalizedActions
  });
  const handoffs = buildHandoffs(preset, roles);
  const checkpoints = buildCheckpoints({
    objective,
    analysis,
    pageUrl,
    actions: normalizedActions,
    routing
  });
  const risks = buildMissionRisks({
    routing,
    analysis,
    actions: normalizedActions
  });
  const automationNotes = buildMissionNotes({
    analysis,
    actions: normalizedActions
  });

  return {
    missionTitle,
    missionSummary: buildMissionSummary({
      objective,
      analysis,
      actions: normalizedActions,
      preset,
      difficulty
    }),
    objective,
    teamNarrative: `${preset.name}会围绕“${objective}”推进：${preset.roles
      .map((role) => role.title)
      .join("、")}依次接手。`,
    roles,
    stages,
    handoffs,
    checkpoints,
    risks,
    automationNotes,
    difficultyLevel: difficulty.level,
    difficultyLabel: difficulty.label,
    presetId: preset.id,
    presetName: preset.name
  };
}

export function normalizeAgentPlan(plan, teamPresetId, fallbackPlan) {
  const preset = getTeamPreset(teamPresetId);
  const source = plan && typeof plan === "object" ? plan : {};
  const fallback = fallbackPlan || buildLocalAgentPlan({ teamPresetId });
  const roleLookup = new Map((Array.isArray(source.roles) ? source.roles : []).map((role) => [role.roleId, role]));
  const fallbackRoleLookup = new Map(fallback.roles.map((role) => [role.roleId, role]));

  const roles = preset.roles.map((presetRole) => {
    const candidate = roleLookup.get(presetRole.id) || {};
    const base = fallbackRoleLookup.get(presetRole.id);

    return {
      roleId: presetRole.id,
      roleTitle: presetRole.title,
      roleName: presetRole.name,
      brief: presetRole.brief,
      mission: cleanText(candidate.mission) || base.mission,
      output: cleanText(candidate.output) || base.output,
      status: normalizeStatus(candidate.status) || base.status
    };
  });

  return {
    missionTitle: cleanText(source.missionTitle) || fallback.missionTitle,
    missionSummary: cleanText(source.missionSummary) || fallback.missionSummary,
    objective: cleanText(source.objective) || fallback.objective,
    teamNarrative: cleanText(source.teamNarrative) || fallback.teamNarrative,
    roles,
    stages: normalizeStages(source.stages, preset, roles, fallback.stages),
    handoffs: normalizeHandoffs(source.handoffs, preset, fallback.handoffs),
    checkpoints: normalizeStringList(source.checkpoints, fallback.checkpoints),
    risks: normalizeStringList(source.risks, fallback.risks),
    automationNotes: normalizeStringList(source.automationNotes, fallback.automationNotes),
    difficultyLevel: ["simple", "complex"].includes(source.difficultyLevel)
      ? source.difficultyLevel
      : fallback.difficultyLevel,
    difficultyLabel: cleanText(source.difficultyLabel) || fallback.difficultyLabel,
    presetId: preset.id,
    presetName: preset.name
  };
}

function resolveObjective(taskPrompt, analysis, actions, pageUrl) {
  if (taskPrompt.trim()) {
    return taskPrompt.trim();
  }

  if (analysis?.goal) {
    return analysis.goal;
  }

  if (actions.length) {
    return `围绕 ${pageUrl || "当前页面"} 重复执行录制流程`;
  }

  return "创建一个可复用的通用 Agent 任务";
}

function resolveMissionTitle(taskPrompt, analysis, objective) {
  if (taskPrompt.trim()) {
    return cropText(taskPrompt.trim(), 28);
  }

  if (analysis?.title) {
    return analysis.title;
  }

  return cropText(objective, 24);
}

function resolveActiveRoleId(preset) {
  return preset.roles.find((role) => role.id === "operator")?.id
    || preset.roles.find((role) => role.id === "generalist")?.id
    || preset.roles[0]?.id;
}

function resolveRoleStatus(roleId, index, context) {
  const { preset, hasContext, activeRoleId } = context;

  if (preset.roles.length === 1) {
    return "active";
  }

  if (!hasContext) {
    return index === 0 ? "active" : "pending";
  }

  if (roleId === "observer") {
    return "done";
  }

  if (roleId === "planner") {
    return "done";
  }

  if (roleId === activeRoleId) {
    return "active";
  }

  return "pending";
}

function buildRoleMission(roleId, context) {
  const { objective, pageUrl, analysis, actions } = context;

  switch (roleId) {
    case "observer":
      return actions.length
        ? `读取 ${actions.length} 条录制动作和页面上下文，整理稳定锚点与变量输入。`
        : "等待额外上下文进入，再建立任务环境基线。";
    case "planner":
      return `把“${objective}”拆成阶段任务，并选择最稳妥的执行路线。`;
    case "operator":
      return actions.length
        ? `依据录制流程与任务目标推进主执行，并准备回放或自动化脚本。`
        : `围绕“${objective}”执行主流程，并输出可验证结果。`;
    case "reviewer":
      return analysis?.risks?.length
        ? "逐条检查现有风险点，补足异常处理与回归验证。"
        : "复核输出结果，识别容易失败的步骤并提出加固建议。";
    case "memory":
      return pageUrl
        ? `把本次经验沉淀成面向 ${pageUrl} 的可复用模板与知识。`
        : "把可复用提示、参数和流程沉淀成后续可调用资产。";
    case "generalist":
      return `独立完成“${objective}”的理解、执行、校验与交付闭环。`;
    default:
      return `围绕“${objective}”推进自己负责的子任务。`;
  }
}

function buildRoleOutput(roleId, context) {
  const { analysis, actions } = context;

  switch (roleId) {
    case "observer":
      return actions.length
        ? "结构化动作摘要、可变参数与稳定锚点。"
        : "等待上下文后生成结构化观察结果。";
    case "planner":
      return "阶段计划、优先级和执行顺序。";
    case "operator":
      return actions.length
        ? "可回放流程与执行中的关键结果。"
        : "主任务的完成结果与中间产物。";
    case "reviewer":
      return analysis?.risks?.length
        ? "基于现有风险点的稳定性回查结果。"
        : "验收结论与回归清单。";
    case "memory":
      return "模板、规则、提示词和知识沉淀。";
    case "generalist":
      return "完整交付物与下一步建议。";
    default:
      return "阶段性结果。";
  }
}

function buildStages(preset, roles, context) {
  const { objective, analysis, actions } = context;

  return roles.map((role, index) => ({
    title: stageTitleForRole(role.roleId, index, preset.roles.length),
    ownerRoleId: role.roleId,
    detail: stageDetailForRole(role.roleId, {
      objective,
      analysis,
      actions
    }),
    status: role.status
  }));
}

function stageTitleForRole(roleId, index, roleCount) {
  if (roleCount === 1) {
    return "统一推进任务";
  }

  switch (roleId) {
    case "observer":
      return "读取上下文";
    case "planner":
      return "拆解任务";
    case "operator":
      return "执行主流程";
    case "reviewer":
      return "验收与加固";
    case "memory":
      return "沉淀为模板";
    default:
      return `阶段 ${index + 1}`;
  }
}

function stageDetailForRole(roleId, context) {
  const { objective, analysis, actions } = context;

  switch (roleId) {
    case "observer":
      return actions.length
        ? "收集录制动作、页面定位信息与上下文依赖。"
        : "等待录制或任务补充后再建立上下文。";
    case "planner":
      return `把“${objective}”拆成可执行工作流，并安排交接顺序。`;
    case "operator":
      return analysis?.steps?.length
        ? `优先对齐现有 ${analysis.steps.length} 个步骤，再推进主执行。`
        : "依据任务目标执行主流程并整理结果。";
    case "reviewer":
      return "检查脆弱点、回看异常路径并给出稳定性建议。";
    case "memory":
      return "输出可复用模板、变量位和知识资产。";
    case "generalist":
      return `独立完成“${objective}”的计划与交付。`;
    default:
      return "推进本阶段责任。";
  }
}

function buildHandoffs(preset, roles) {
  const roleLookup = new Map(roles.map((role) => [role.roleId, role]));

  return preset.handoffs
    .filter((handoff) => roleLookup.has(handoff.fromRoleId) && roleLookup.has(handoff.toRoleId))
    .map((handoff) => ({
      fromRoleId: handoff.fromRoleId,
      toRoleId: handoff.toRoleId,
      label: handoff.label
    }));
}

function buildCheckpoints(context) {
  const { objective, analysis, pageUrl, actions, routing } = context;
  const checkpoints = [
    `目标对齐：${cropText(objective, 64)}`
  ];

  if (pageUrl) {
    checkpoints.push(`页面上下文：${pageUrl}`);
  }

  if (actions.length) {
    checkpoints.push(`录制上下文：已归一化 ${actions.length} 个动作`);
  }

  if (analysis?.steps?.length) {
    checkpoints.push(`已有理解：分析出了 ${analysis.steps.length} 个可执行步骤`);
  }

  if (routing?.selectedModel) {
    checkpoints.push(`模型路由：${routing.selectedProviderName || "Provider"} / ${routing.selectedModel}`);
  } else if (!routing?.configured) {
    checkpoints.push("当前未接入可用模型，本次采用本地规则规划。");
  }

  return uniqueStrings(checkpoints).slice(0, 5);
}

function buildMissionRisks(context) {
  const { routing, analysis, actions } = context;
  const risks = [
    ...(routing?.configured ? [] : ["模型未配置完成时，只能生成本地版 Agent 计划。"]),
    ...(analysis?.risks || [])
  ];

  if (actions.some((action) => action.type === "scroll")) {
    risks.push("任务依赖滚动定位时，页面布局变化可能影响执行稳定性。");
  }

  if (actions.some((action) => action.type === "input" && action.inputType === "password")) {
    risks.push("涉及密码或敏感输入时，建议改成运行时注入，而不是写入流程文件。");
  }

  if (!risks.length) {
    risks.push("当前任务结构清晰，但仍建议补一轮回放验证与异常路径检查。");
  }

  return uniqueStrings(risks).slice(0, 4);
}

function buildMissionNotes(context) {
  const { analysis, actions } = context;
  const notes = [
    "优先把变化频繁的输入参数抽成运行时变量。",
    "把关键节点的成功条件写清楚，便于 Agent team 交接。"
  ];

  if (actions.length) {
    notes.push("录制动作会作为 Operator 的执行参考，可以直接用于回放或脚本转换。");
  }

  if (analysis?.automationNotes?.length) {
    notes.push(...analysis.automationNotes);
  }

  return uniqueStrings(notes).slice(0, 4);
}

function buildMissionSummary(context) {
  const { objective, analysis, actions, preset, difficulty } = context;
  const actionFragment = actions.length
    ? `当前带入了 ${actions.length} 条录制动作`
    : "当前主要依据任务描述进行规划";
  const analysisFragment = analysis?.summary
    ? `已有分析结果会作为团队上下文。`
    : "目前还没有额外的分析补充。";

  return `${preset.name}将围绕“${objective}”展开。${actionFragment}，并按${difficulty.label}的节奏分工推进。${analysisFragment}`;
}

function normalizeStages(inputStages, preset, roles, fallbackStages) {
  const validRoleIds = new Set(preset.roles.map((role) => role.id));
  const fallback = Array.isArray(fallbackStages) ? fallbackStages : [];
  const normalized = Array.isArray(inputStages)
    ? inputStages
      .map((stage) => {
        const ownerRoleId = validRoleIds.has(stage?.ownerRoleId)
          ? stage.ownerRoleId
          : validRoleIds.has(stage?.ownerRole)
            ? stage.ownerRole
            : "";

        if (!ownerRoleId) {
          return null;
        }

        return {
          title: cleanText(stage.title) || stageTitleForRole(ownerRoleId, 0, roles.length),
          ownerRoleId,
          detail: cleanText(stage.detail) || fallback.find((item) => item.ownerRoleId === ownerRoleId)?.detail || "",
          status: normalizeStatus(stage.status) || "pending"
        };
      })
      .filter(Boolean)
    : [];

  return normalized.length ? normalized : fallback;
}

function normalizeHandoffs(inputHandoffs, preset, fallbackHandoffs) {
  const validRoleIds = new Set(preset.roles.map((role) => role.id));
  const normalized = Array.isArray(inputHandoffs)
    ? inputHandoffs
      .map((handoff) => {
        const fromRoleId = validRoleIds.has(handoff?.fromRoleId) ? handoff.fromRoleId : "";
        const toRoleId = validRoleIds.has(handoff?.toRoleId) ? handoff.toRoleId : "";

        if (!fromRoleId || !toRoleId) {
          return null;
        }

        return {
          fromRoleId,
          toRoleId,
          label: cleanText(handoff.label) || "交接"
        };
      })
      .filter(Boolean)
    : [];

  return normalized.length ? normalized : fallbackHandoffs;
}

function normalizeStringList(input, fallback) {
  const normalized = Array.isArray(input)
    ? input.map(cleanText).filter(Boolean)
    : [];
  return normalized.length ? uniqueStrings(normalized).slice(0, 5) : fallback;
}

function normalizeStatus(status) {
  return ["pending", "active", "done"].includes(status) ? status : "";
}

function cropText(value, maxLength) {
  const text = cleanText(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function cleanText(value) {
  return String(value || "").trim();
}

function uniqueStrings(entries) {
  return [...new Set(entries.filter(Boolean))];
}

