import {
  buildHeuristicAnalysis,
  classifyTaskDifficulty,
  describeAction,
  normalizeActions
} from "./analysis.js";
import {
  buildLocalAgentPlan,
  buildPreviewTeamState,
  classifyMissionDifficulty,
  getStatusLabel,
  getTeamPreset,
  listTeamPresets,
  normalizeAgentPlan
} from "./agent-team.js";
import { replayActions, withComputedDelays } from "./replay.js";

const ROUTE_MODE_LABELS = {
  auto: "自动路由",
  simple: "固定简单模型",
  complex: "固定复杂模型"
};

const ROUTE_TIER_LABELS = {
  simple: "简单模型",
  complex: "复杂模型"
};

const DEFAULT_TEAM_PRESET_ID = "automation-squad";

const state = {
  isRecording: false,
  rawActions: [],
  normalizedActions: [],
  analysis: null,
  agentPlan: null,
  agentPlanStale: false,
  pageTitle: "",
  pageUrl: "",
  isReplaying: false,
  isPlanningAgent: false,
  restoreShortcut: "Ctrl+Shift+A",
  settingsSummary: null,
  missionDraft: "",
  teamPresetId: DEFAULT_TEAM_PRESET_ID,
  includeRecordingContext: true
};

const elements = {
  webview: document.getElementById("agentWebview"),
  urlInput: document.getElementById("urlInput"),
  openPageBtn: document.getElementById("openPageBtn"),
  startRecordingBtn: document.getElementById("startRecordingBtn"),
  stopRecordingBtn: document.getElementById("stopRecordingBtn"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  replayBtn: document.getElementById("replayBtn"),
  saveBtn: document.getElementById("saveBtn"),
  loadBtn: document.getElementById("loadBtn"),
  clearBtn: document.getElementById("clearBtn"),
  openSettingsBtn: document.getElementById("openSettingsBtn"),
  missionInput: document.getElementById("missionInput"),
  teamPresetSelect: document.getElementById("teamPresetSelect"),
  includeRecordingContextInput: document.getElementById("includeRecordingContextInput"),
  planAgentBtn: document.getElementById("planAgentBtn"),
  resetMissionBtn: document.getElementById("resetMissionBtn"),
  recordingBadge: document.getElementById("recordingBadge"),
  actionCount: document.getElementById("actionCount"),
  analysisMode: document.getElementById("analysisMode"),
  windowBehaviorText: document.getElementById("windowBehaviorText"),
  settingsStatusText: document.getElementById("settingsStatusText"),
  simpleRouteText: document.getElementById("simpleRouteText"),
  complexRouteText: document.getElementById("complexRouteText"),
  autoHideText: document.getElementById("autoHideText"),
  mcpSummaryText: document.getElementById("mcpSummaryText"),
  skillSummaryText: document.getElementById("skillSummaryText"),
  pageTitle: document.getElementById("pageTitle"),
  pageUrlDisplay: document.getElementById("pageUrlDisplay"),
  confidenceText: document.getElementById("confidenceText"),
  analysisEmpty: document.getElementById("analysisEmpty"),
  analysisContent: document.getElementById("analysisContent"),
  analysisTitle: document.getElementById("analysisTitle"),
  analysisSummary: document.getElementById("analysisSummary"),
  analysisGoal: document.getElementById("analysisGoal"),
  difficultyText: document.getElementById("difficultyText"),
  selectedModelText: document.getElementById("selectedModelText"),
  routingReasonText: document.getElementById("routingReasonText"),
  stepsList: document.getElementById("stepsList"),
  risksList: document.getElementById("risksList"),
  notesList: document.getElementById("notesList"),
  timeline: document.getElementById("timeline"),
  missionSyncText: document.getElementById("missionSyncText"),
  missionEmpty: document.getElementById("missionEmpty"),
  missionContent: document.getElementById("missionContent"),
  missionTitle: document.getElementById("missionTitle"),
  missionSummary: document.getElementById("missionSummary"),
  missionObjectiveText: document.getElementById("missionObjectiveText"),
  missionPresetText: document.getElementById("missionPresetText"),
  missionRouteText: document.getElementById("missionRouteText"),
  missionDifficultyText: document.getElementById("missionDifficultyText"),
  teamNarrativeText: document.getElementById("teamNarrativeText"),
  stageList: document.getElementById("stageList"),
  handoffList: document.getElementById("handoffList"),
  checkpointList: document.getElementById("checkpointList"),
  teamNotesList: document.getElementById("teamNotesList"),
  teamGraphCaption: document.getElementById("teamGraphCaption"),
  teamGraphBlurb: document.getElementById("teamGraphBlurb"),
  teamGraph: document.getElementById("teamGraph")
};

bootstrap();

async function bootstrap() {
  elements.webview.preload = new URL("../webview/preload.js", import.meta.url).toString();
  populateTeamPresets();
  bindUi();
  bindWebview();
  subscribeToSettings();
  await hydrateSettingsSummary();
  await hydrateWindowBehavior();
  render();
}

function populateTeamPresets() {
  elements.teamPresetSelect.innerHTML = "";

  for (const preset of listTeamPresets()) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = `${preset.name} · ${preset.roleCount} 个角色`;
    elements.teamPresetSelect.appendChild(option);
  }

  elements.teamPresetSelect.value = state.teamPresetId;
  elements.includeRecordingContextInput.checked = state.includeRecordingContext;
}

function bindUi() {
  elements.openPageBtn.addEventListener("click", navigateFromInput);
  elements.startRecordingBtn.addEventListener("click", startRecording);
  elements.stopRecordingBtn.addEventListener("click", stopRecording);
  elements.analyzeBtn.addEventListener("click", analyzeActions);
  elements.replayBtn.addEventListener("click", replayCurrentActions);
  elements.saveBtn.addEventListener("click", saveRecording);
  elements.loadBtn.addEventListener("click", loadRecording);
  elements.clearBtn.addEventListener("click", clearAll);
  elements.openSettingsBtn.addEventListener("click", openSettingsWindow);
  elements.planAgentBtn.addEventListener("click", planAgentMission);
  elements.resetMissionBtn.addEventListener("click", resetMissionWorkspace);

  elements.urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      navigateFromInput();
    }
  });

  elements.missionInput.addEventListener("input", () => {
    state.missionDraft = elements.missionInput.value;
    markAgentPlanStale();
    renderAgentWorkbench();
  });

  elements.teamPresetSelect.addEventListener("change", () => {
    state.teamPresetId = elements.teamPresetSelect.value;
    markAgentPlanStale();
    renderAgentWorkbench();
  });

  elements.includeRecordingContextInput.addEventListener("change", () => {
    state.includeRecordingContext = elements.includeRecordingContextInput.checked;
    markAgentPlanStale();
    renderAgentWorkbench();
  });
}

function bindWebview() {
  elements.webview.addEventListener("ipc-message", (event) => {
    if (event.channel !== "user-action" || !state.isRecording) {
      return;
    }

    appendAction(event.args[0]);
  });

  elements.webview.addEventListener("dom-ready", async () => {
    state.pageTitle = await elements.webview.getTitle();
    state.pageUrl = elements.webview.getURL();
    renderHeader();
  });

  elements.webview.addEventListener("page-title-updated", (event) => {
    state.pageTitle = event.title;
    renderHeader();
  });

  elements.webview.addEventListener("did-navigate", (event) => {
    state.pageUrl = event.url;
    renderHeader();
    if (state.isRecording) {
      appendAction({
        type: "navigate",
        url: event.url,
        label: state.pageTitle || event.url,
        capturedAt: Date.now()
      });
    }
  });

  elements.webview.addEventListener("did-navigate-in-page", (event) => {
    state.pageUrl = event.url;
    renderHeader();
    if (state.isRecording) {
      appendAction({
        type: "navigate",
        url: event.url,
        label: state.pageTitle || event.url,
        capturedAt: Date.now()
      });
    }
  });
}

function subscribeToSettings() {
  window.desktopBridge.onSettingsUpdated((payload) => {
    state.settingsSummary = payload.summary;
    applyWindowBehavior(payload);
    markAgentPlanStale();
    render();
  });
}

async function hydrateSettingsSummary() {
  try {
    const payload = await window.desktopBridge.getSettingsSummary();
    state.settingsSummary = payload.summary;
    applyWindowBehavior(payload);
  } catch (error) {
    console.error(error);
  }
}

async function hydrateWindowBehavior() {
  try {
    const behavior = await window.desktopBridge.getWindowBehavior();
    applyWindowBehavior(behavior);
  } catch (error) {
    console.error(error);
  }
}

async function openSettingsWindow() {
  try {
    await window.desktopBridge.openSettingsWindow();
  } catch (error) {
    console.error(error);
  }
}

function navigateFromInput() {
  const url = normalizeUrl(elements.urlInput.value);
  if (!url) {
    return;
  }

  elements.urlInput.value = url;
  state.pageUrl = url;
  state.pageTitle = "页面加载中...";
  renderHeader();
  elements.webview.src = url;
}

function startRecording() {
  state.isRecording = true;
  state.rawActions = [];
  state.normalizedActions = [];
  state.analysis = null;
  state.agentPlan = null;
  state.agentPlanStale = false;

  if (elements.webview.getURL()) {
    appendAction({
      type: "navigate",
      url: elements.webview.getURL(),
      label: elements.webview.getTitle() || elements.webview.getURL(),
      capturedAt: Date.now()
    });
  }

  render();

  if (state.settingsSummary?.recording?.autoHideOnRecord) {
    hideWindowAfterRecordingStart();
  }
}

function stopRecording() {
  state.isRecording = false;
  state.normalizedActions = normalizeActions(state.rawActions);
  markAgentPlanStale();
  render();
}

function appendAction(action) {
  const enriched = {
    ...action,
    capturedAt: action.capturedAt || Date.now()
  };

  if (enriched.type === "input" && enriched.inputType === "password") {
    enriched.value = "********";
  }

  state.rawActions.push(enriched);
  state.normalizedActions = normalizeActions(state.rawActions);
  markAgentPlanStale();
  renderTimeline();
  renderStatus();
  renderAgentWorkbench();
}

async function analyzeActions() {
  const actions = getActiveActions();
  if (!actions.length) {
    return;
  }

  const routing = resolveActionRouting(actions, state.settingsSummary);

  if (!routing.configured) {
    state.analysis = decorateAnalysis(buildHeuristicAnalysis(actions), routing, "local");
    markAgentPlanStale();
    render();
    return;
  }

  elements.analyzeBtn.disabled = true;
  elements.analyzeBtn.textContent = "理解中...";

  try {
    const result = await window.desktopBridge.analyzeWithAi({
      pageUrl: state.pageUrl,
      actions,
      routing: {
        selectedTier: routing.selectedTier,
        difficultyLevel: routing.difficultyLevel,
        difficultyLabel: routing.difficultyLabel,
        reasons: routing.reasons
      }
    });

    const actualRouting = {
      ...routing,
      selectedModel: result.route?.selectedModel || routing.selectedModel,
      selectedProviderName: result.route?.providerName || routing.selectedProviderName,
      selectedProviderType: result.route?.providerType || routing.selectedProviderType
    };
    state.analysis = decorateAnalysis(result.analysis, actualRouting, "llm");
  } catch (error) {
    console.error(error);
    const fallback = buildHeuristicAnalysis(actions);
    fallback.risks = [
      `模型调用失败，已回退到本地理解：${error.message}`,
      ...(fallback.risks || [])
    ];
    state.analysis = decorateAnalysis(fallback, routing, "local");
  } finally {
    elements.analyzeBtn.disabled = false;
    elements.analyzeBtn.textContent = "理解动作";
    markAgentPlanStale();
    render();
  }
}

async function planAgentMission() {
  const taskPrompt = elements.missionInput.value.trim();
  const actions = state.includeRecordingContext ? getActiveActions() : [];

  if (!taskPrompt && !actions.length && !state.analysis) {
    return;
  }

  const routing = resolveMissionRouting(taskPrompt, actions, state.analysis, state.settingsSummary);
  const fallbackPlan = buildLocalAgentPlan({
    taskPrompt,
    actions,
    analysis: state.analysis,
    pageUrl: state.pageUrl,
    teamPresetId: state.teamPresetId,
    routing,
    includeRecordingContext: state.includeRecordingContext
  });

  if (!routing.configured) {
    state.agentPlan = decorateAgentPlan(fallbackPlan, routing, "local", state.teamPresetId);
    state.agentPlanStale = false;
    render();
    return;
  }

  state.isPlanningAgent = true;
  elements.planAgentBtn.disabled = true;
  elements.planAgentBtn.textContent = "生成中...";
  renderAgentWorkbench();

  try {
    const teamPreset = getTeamPreset(state.teamPresetId);
    const result = await window.desktopBridge.planAgentMission({
      taskPrompt,
      pageUrl: state.pageUrl,
      actions,
      analysis: state.analysis,
      teamPreset: {
        id: teamPreset.id,
        name: teamPreset.name,
        blurb: teamPreset.blurb,
        roles: teamPreset.roles.map((role) => ({
          roleId: role.id,
          title: role.title,
          brief: role.brief
        }))
      },
      routing: {
        selectedTier: routing.selectedTier,
        difficultyLevel: routing.difficultyLevel,
        difficultyLabel: routing.difficultyLabel,
        reasons: routing.reasons
      }
    });

    const actualRouting = {
      ...routing,
      selectedModel: result.route?.selectedModel || routing.selectedModel,
      selectedProviderName: result.route?.providerName || routing.selectedProviderName,
      selectedProviderType: result.route?.providerType || routing.selectedProviderType
    };
    const normalizedPlan = normalizeAgentPlan(result.plan, state.teamPresetId, fallbackPlan);
    state.agentPlan = decorateAgentPlan(normalizedPlan, actualRouting, "llm", state.teamPresetId);
  } catch (error) {
    console.error(error);
    fallbackPlan.risks = [
      `Agent Team 规划失败，已回退到本地规划：${error.message}`,
      ...(fallbackPlan.risks || [])
    ];
    state.agentPlan = decorateAgentPlan(fallbackPlan, routing, "local", state.teamPresetId);
  } finally {
    state.isPlanningAgent = false;
    state.agentPlanStale = false;
    elements.planAgentBtn.disabled = false;
    elements.planAgentBtn.textContent = "生成 Agent Team";
    render();
  }
}

async function replayCurrentActions() {
  const actions = getActiveActions();
  if (!actions.length || state.isReplaying) {
    return;
  }

  state.isReplaying = true;
  elements.replayBtn.disabled = true;
  elements.replayBtn.textContent = "回放中...";

  try {
    await replayActions(elements.webview, withComputedDelays(actions), {
      speedMultiplier: 1.2
    });
  } finally {
    state.isReplaying = false;
    elements.replayBtn.disabled = false;
    elements.replayBtn.textContent = "回放流程";
  }
}

async function saveRecording() {
  const recording = buildRecordingPayload();
  if (!recording.actions.length && !recording.agentWorkspace.taskPrompt) {
    return;
  }

  try {
    await window.desktopBridge.saveRecording(recording);
  } catch (error) {
    console.error(error);
  }
}

async function loadRecording() {
  try {
    const result = await window.desktopBridge.loadRecording();
    if (result?.canceled || !result?.recording) {
      return;
    }

    const recording = result.recording;
    state.isRecording = false;
    state.rawActions = recording.actions || [];
    state.normalizedActions = normalizeActions(recording.actions || []);
    state.analysis = recording.analysis || null;
    state.pageUrl = recording.pageUrl || "";
    state.pageTitle = recording.pageTitle || "已导入流程";

    const workspace = recording.agentWorkspace || {};
    state.missionDraft = workspace.taskPrompt || "";
    state.teamPresetId = workspace.teamPresetId || DEFAULT_TEAM_PRESET_ID;
    state.includeRecordingContext = workspace.includeRecordingContext !== false;
    state.agentPlan = workspace.agentPlan || null;
    state.agentPlanStale = false;

    syncMissionControls();

    if (recording.pageUrl) {
      elements.urlInput.value = recording.pageUrl;
      elements.webview.src = recording.pageUrl;
    }

    render();
  } catch (error) {
    console.error(error);
  }
}

function clearAll() {
  state.isRecording = false;
  state.rawActions = [];
  state.normalizedActions = [];
  state.analysis = null;
  resetMissionWorkspace();
}

function resetMissionWorkspace() {
  state.missionDraft = "";
  state.teamPresetId = DEFAULT_TEAM_PRESET_ID;
  state.includeRecordingContext = true;
  state.agentPlan = null;
  state.agentPlanStale = false;
  syncMissionControls();
  render();
}

function buildRecordingPayload() {
  return {
    version: 1,
    pageUrl: state.pageUrl,
    pageTitle: state.pageTitle,
    savedAt: new Date().toISOString(),
    actions: getActiveActions(),
    analysis: state.analysis || null,
    agentWorkspace: {
      taskPrompt: state.missionDraft,
      teamPresetId: state.teamPresetId,
      includeRecordingContext: state.includeRecordingContext,
      agentPlan: state.agentPlan || null
    }
  };
}

function getActiveActions() {
  return state.normalizedActions.length ? state.normalizedActions : normalizeActions(state.rawActions);
}

function resolveActionRouting(actions, settingsSummary) {
  const difficulty = classifyTaskDifficulty(actions);
  return buildRoutingDecision(difficulty, settingsSummary);
}

function resolveMissionRouting(taskPrompt, actions, analysis, settingsSummary) {
  const difficulty = classifyMissionDifficulty({
    taskPrompt,
    actions,
    analysis
  });
  return buildRoutingDecision(difficulty, settingsSummary);
}

function buildRoutingDecision(difficulty, settingsSummary) {
  const summary = settingsSummary?.routing;

  if (!summary?.simple || !summary?.complex) {
    return {
      configured: false,
      selectedTier: difficulty.level,
      selectedTierLabel: ROUTE_TIER_LABELS[difficulty.level],
      difficultyLevel: difficulty.level,
      difficultyLabel: difficulty.label,
      routeMode: "auto",
      routeModeLabel: ROUTE_MODE_LABELS.auto,
      reasons: difficulty.reasons,
      selectedModel: "",
      selectedProviderName: ""
    };
  }

  let selectedTier = difficulty.level;
  if (summary.routeMode === "simple") {
    selectedTier = "simple";
  } else if (summary.routeMode === "complex") {
    selectedTier = "complex";
  }

  const selectedRoute = summary[selectedTier];

  return {
    configured: Boolean(selectedRoute?.providerId && selectedRoute?.model),
    selectedTier,
    selectedTierLabel: ROUTE_TIER_LABELS[selectedTier] || ROUTE_TIER_LABELS.simple,
    difficultyLevel: difficulty.level,
    difficultyLabel: difficulty.label,
    routeMode: summary.routeMode,
    routeModeLabel: ROUTE_MODE_LABELS[summary.routeMode] || ROUTE_MODE_LABELS.auto,
    reasons: summary.routeMode === "auto"
      ? difficulty.reasons
      : [
        `已手动固定为${ROUTE_TIER_LABELS[selectedTier]}。`,
        `自动判定原本是${difficulty.label}。`
      ],
    selectedModel: selectedRoute?.model || "",
    selectedProviderId: selectedRoute?.providerId || "",
    selectedProviderName: selectedRoute?.providerName || "",
    selectedProviderType: selectedRoute?.providerType || ""
  };
}

function decorateAnalysis(analysis, routing, source) {
  return {
    ...analysis,
    _meta: {
      source,
      routing
    }
  };
}

function decorateAgentPlan(plan, routing, source, teamPresetId) {
  return {
    ...plan,
    _meta: {
      source,
      routing,
      teamPresetId
    }
  };
}

function render() {
  syncMissionControls();
  renderHeader();
  renderStatus();
  renderRouteSummary();
  renderTimeline();
  renderAnalysis();
  renderAgentWorkbench();
}

function syncMissionControls() {
  if (elements.missionInput.value !== state.missionDraft) {
    elements.missionInput.value = state.missionDraft;
  }

  if (elements.teamPresetSelect.value !== state.teamPresetId) {
    elements.teamPresetSelect.value = state.teamPresetId;
  }

  elements.includeRecordingContextInput.checked = state.includeRecordingContext;
}

function renderHeader() {
  elements.pageTitle.textContent = state.pageTitle || "等待载入页面";
  elements.pageUrlDisplay.textContent = state.pageUrl || "尚未打开任何网页";
}

function renderStatus() {
  const routing = resolveActionRouting(getActiveActions(), state.settingsSummary);

  elements.recordingBadge.dataset.state = state.isRecording ? "recording" : "idle";
  elements.recordingBadge.textContent = state.isRecording ? "录制中" : "待机中";
  elements.actionCount.textContent = String(getActiveActions().length);
  elements.startRecordingBtn.disabled = state.isRecording;
  elements.stopRecordingBtn.disabled = !state.isRecording;
  elements.analysisMode.textContent = routing.configured
    ? `${routing.routeModeLabel} · ${routing.selectedTierLabel}`
    : "等待配置";
  elements.windowBehaviorText.textContent = state.settingsSummary?.recording?.autoHideOnRecord
    ? `录制后隐藏 · ${state.restoreShortcut}`
    : "前台显示";
}

function renderRouteSummary() {
  const summary = state.settingsSummary;

  if (!summary) {
    elements.settingsStatusText.textContent = "未加载";
    elements.simpleRouteText.textContent = "未配置";
    elements.complexRouteText.textContent = "未配置";
    elements.autoHideText.textContent = "未加载";
    elements.mcpSummaryText.textContent = "未启用";
    elements.skillSummaryText.textContent = "未启用";
    return;
  }

  const simple = summary.routing.simple;
  const complex = summary.routing.complex;
  const extensionSummary = summary.extensions || {
    mcpEnabledCount: 0,
    skillEnabledCount: 0,
    mcpServers: [],
    skills: []
  };

  elements.settingsStatusText.textContent = `${summary.providers.length} 个接入`;
  elements.simpleRouteText.textContent = `${simple.providerName} · ${simple.model}`;
  elements.complexRouteText.textContent = `${complex.providerName} · ${complex.model}`;
  elements.autoHideText.textContent = summary.recording.autoHideOnRecord ? "开启" : "关闭";
  elements.mcpSummaryText.textContent = formatExtensionSummary(
    extensionSummary.mcpEnabledCount,
    extensionSummary.mcpServers,
    "MCP"
  );
  elements.skillSummaryText.textContent = formatExtensionSummary(
    extensionSummary.skillEnabledCount,
    extensionSummary.skills,
    "Skill"
  );
}

function renderTimeline() {
  const actions = getActiveActions();
  elements.timeline.innerHTML = "";

  if (!actions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "这里会按顺序显示录制到的动作。";
    elements.timeline.appendChild(empty);
    return;
  }

  for (const [index, action] of actions.entries()) {
    const item = document.createElement("article");
    item.className = "timeline-item";
    item.innerHTML = `
      <strong>${index + 1}. ${escapeHtml(describeAction(action))}</strong>
      <div>${escapeHtml(action.selector || action.url || action.value || "")}</div>
      <small>${escapeHtml(formatActionMeta(action))}</small>
    `;
    elements.timeline.appendChild(item);
  }
}

function renderAnalysis() {
  const analysis = state.analysis;
  if (!analysis) {
    elements.analysisEmpty.classList.remove("hidden");
    elements.analysisContent.classList.add("hidden");
    elements.confidenceText.textContent = "等待分析";
    return;
  }

  const meta = analysis._meta || {};
  const routing = meta.routing || resolveActionRouting(getActiveActions(), state.settingsSummary);
  const source = meta.source || "local";

  elements.analysisEmpty.classList.add("hidden");
  elements.analysisContent.classList.remove("hidden");
  elements.analysisTitle.textContent = analysis.title || "未命名流程";
  elements.analysisSummary.textContent = analysis.summary || "";
  elements.analysisGoal.textContent = analysis.goal || "重复执行当前操作";
  elements.confidenceText.textContent = `回放信心 ${(Number(analysis.replayConfidence || 0) * 100).toFixed(0)}%`;
  elements.difficultyText.textContent = `${routing.difficultyLabel} · ${routing.routeModeLabel}`;
  elements.selectedModelText.textContent = source === "llm"
    ? `${routing.selectedProviderName || "Provider"} · ${routing.selectedModel}`
    : routing.selectedModel
      ? `下一次将调用 ${routing.selectedModel}`
      : "本地理解";
  elements.routingReasonText.textContent = routing.reasons.join(" ");

  fillList(elements.stepsList, analysis.steps || [], (step) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${escapeHtml(step.title || "步骤")}</strong><br>${escapeHtml(step.detail || "")}`;
    return item;
  });

  fillList(elements.risksList, analysis.risks || [], (text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  });

  fillList(elements.notesList, analysis.automationNotes || [], (text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  });
}

function renderAgentWorkbench() {
  const plan = state.agentPlan;
  const planMeta = plan?._meta || {};
  const selectedPreset = getTeamPreset(planMeta.teamPresetId || state.teamPresetId);
  const graphRoles = plan
    ? plan.roles || buildPreviewTeamState(selectedPreset.id)
    : buildPreviewTeamState(selectedPreset.id);

  elements.teamGraphCaption.textContent = selectedPreset.name;
  elements.teamGraphBlurb.textContent = plan
    ? plan.teamNarrative || selectedPreset.blurb
    : `${selectedPreset.blurb} 生成任务后会在这里显示各角色当前状态、任务与交接。`;
  renderTeamGraphPeople(graphRoles);

  if (state.isPlanningAgent) {
    elements.missionSyncText.textContent = "生成中";
  } else if (state.agentPlanStale) {
    elements.missionSyncText.textContent = "需要刷新";
  } else if (plan) {
    elements.missionSyncText.textContent = "已同步";
  } else {
    elements.missionSyncText.textContent = "等待生成";
  }

  if (!plan) {
    elements.missionEmpty.classList.remove("hidden");
    elements.missionContent.classList.add("hidden");
    return;
  }

  const routing = planMeta.routing || resolveMissionRouting(
    state.missionDraft,
    state.includeRecordingContext ? getActiveActions() : [],
    state.analysis,
    state.settingsSummary
  );

  elements.missionEmpty.classList.add("hidden");
  elements.missionContent.classList.remove("hidden");
  elements.missionTitle.textContent = plan.missionTitle || "未命名任务";
  elements.missionSummary.textContent = plan.missionSummary || "";
  elements.missionObjectiveText.textContent = plan.objective || "未填写";
  elements.missionPresetText.textContent = plan.presetName || selectedPreset.name;
  elements.missionRouteText.textContent = formatMissionRoute(planMeta.source, routing);
  elements.missionDifficultyText.textContent = `${plan.difficultyLabel || routing.difficultyLabel} · ${routing.selectedTierLabel}`;
  elements.teamNarrativeText.textContent = plan.teamNarrative || selectedPreset.blurb;

  renderStages(plan.stages || [], plan.roles || []);
  renderHandoffs(plan.handoffs || [], plan.roles || []);
  renderTextList(elements.checkpointList, plan.checkpoints || [], "这里会列出关键检查点。");
  renderTextList(elements.teamNotesList, plan.automationNotes || [], "这里会列出团队备注与沉淀建议。");
}

function renderTeamGraph(roles) {
  elements.teamGraph.innerHTML = "";

  if (!roles.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "选择团队模板后，这里会展示 Agent Team 结构。";
    elements.teamGraph.appendChild(empty);
    return;
  }

  for (const [index, role] of roles.entries()) {
    const item = document.createElement("article");
    item.className = "team-node";
    item.dataset.state = role.status || "pending";
    item.style.setProperty("--index", String(index));
    item.innerHTML = `
      <div class="team-node-head">
        <span class="team-node-role">${escapeHtml(role.roleTitle || role.title || "角色")}</span>
        <span class="team-node-state">${escapeHtml(getStatusLabel(role.status))}</span>
      </div>
      <strong>${escapeHtml(role.roleName || role.name || "")}</strong>
      <p>${escapeHtml(role.mission || role.brief || "")}</p>
      <small>${escapeHtml(role.output || "")}</small>
    `;
    elements.teamGraph.appendChild(item);
  }
}

function renderTeamGraphPeople(roles) {
  elements.teamGraph.innerHTML = "";

  if (!roles.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "閫夋嫨鍥㈤槦妯℃澘鍚庯紝杩欓噷浼氬睍绀?Agent Team 缁撴瀯銆?;
    elements.teamGraph.appendChild(empty);
    return;
  }

  for (const [index, role] of roles.entries()) {
    const item = document.createElement("article");
    item.className = "team-node";
    item.dataset.state = role.status || "pending";
    item.dataset.role = role.roleId || "agent";
    item.style.setProperty("--index", String(index));
    item.innerHTML = `
      <div class="team-avatar-stage">
        <div class="team-avatar-aura"></div>
        <div class="team-avatar-figure">
          <div class="team-avatar-head">
            <span class="team-avatar-eye team-avatar-eye-left"></span>
            <span class="team-avatar-eye team-avatar-eye-right"></span>
            <span class="team-avatar-mouth"></span>
          </div>
          <div class="team-avatar-body">
            <span class="team-avatar-arm team-avatar-arm-left"></span>
            <span class="team-avatar-torso"></span>
            <span class="team-avatar-arm team-avatar-arm-right"></span>
            <span class="team-avatar-leg team-avatar-leg-left"></span>
            <span class="team-avatar-leg team-avatar-leg-right"></span>
            <span class="team-avatar-badge">${escapeHtml(getRoleBadge(role.roleId))}</span>
          </div>
        </div>
        <div class="team-avatar-shadow"></div>
      </div>
      <div class="team-node-copy">
        <div class="team-node-head">
          <span class="team-node-role">${escapeHtml(role.roleTitle || role.title || "瑙掕壊")}</span>
          <span class="team-node-state">${escapeHtml(getStatusLabel(role.status))}</span>
        </div>
        <strong>${escapeHtml(role.roleName || role.name || "")}</strong>
        <p>${escapeHtml(role.mission || role.brief || "")}</p>
        <small>${escapeHtml(role.output || "")}</small>
      </div>
    `;
    elements.teamGraph.appendChild(item);
  }
}

function renderStages(stages, roles) {
  const roleLookup = new Map((roles || []).map((role) => [role.roleId, role]));
  elements.stageList.innerHTML = "";

  if (!stages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "生成任务后，这里会显示阶段推进。";
    elements.stageList.appendChild(empty);
    return;
  }

  for (const [index, stage] of stages.entries()) {
    const role = roleLookup.get(stage.ownerRoleId);
    const item = document.createElement("article");
    item.className = "stage-item";
    item.dataset.state = stage.status || "pending";
    item.innerHTML = `
      <div class="stage-topline">
        <span class="stage-index">阶段 ${index + 1}</span>
        <span class="stage-state">${escapeHtml(getStatusLabel(stage.status))}</span>
      </div>
      <strong>${escapeHtml(stage.title || "阶段")}</strong>
      <p>${escapeHtml(stage.detail || "")}</p>
      <small>${escapeHtml(role?.roleTitle || stage.ownerRoleId || "")}</small>
    `;
    elements.stageList.appendChild(item);
  }
}

function renderHandoffs(handoffs, roles) {
  const roleLookup = new Map((roles || []).map((role) => [role.roleId, role]));
  elements.handoffList.innerHTML = "";

  if (!handoffs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "当前模板只有单角色，或还没有生成交接链路。";
    elements.handoffList.appendChild(empty);
    return;
  }

  for (const handoff of handoffs) {
    const item = document.createElement("div");
    item.className = "handoff-pill";
    item.innerHTML = `
      <strong>${escapeHtml(roleLookup.get(handoff.fromRoleId)?.roleTitle || handoff.fromRoleId)}</strong>
      <span>→</span>
      <strong>${escapeHtml(roleLookup.get(handoff.toRoleId)?.roleTitle || handoff.toRoleId)}</strong>
      <small>${escapeHtml(handoff.label || "交接")}</small>
    `;
    elements.handoffList.appendChild(item);
  }
}

function renderTextList(container, entries, emptyText) {
  container.innerHTML = "";

  if (!entries.length) {
    const item = document.createElement("li");
    item.className = "empty-list-item";
    item.textContent = emptyText;
    container.appendChild(item);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement("li");
    item.textContent = entry;
    container.appendChild(item);
  }
}

function fillList(container, entries, buildItem) {
  container.innerHTML = "";

  if (!entries.length) {
    const item = document.createElement("li");
    item.className = "empty-list-item";
    item.textContent = "暂无内容。";
    container.appendChild(item);
    return;
  }

  for (const entry of entries) {
    container.appendChild(buildItem(entry));
  }
}

function formatActionMeta(action) {
  if (action.type === "input") {
    return `字段类型: ${action.inputType || "text"}`;
  }

  if (action.type === "scroll") {
    return `滚动位置: Y=${Math.round(action.scrollY || 0)}`;
  }

  if (action.type === "keyboard") {
    return `按键: ${action.key || "unknown"}`;
  }

  return action.pageUrl || action.pageTitle || action.tagName || "";
}

async function hideWindowAfterRecordingStart() {
  try {
    const result = await window.desktopBridge.hideWindowForRecording();
    applyWindowBehavior(result);
  } catch (error) {
    console.error(error);
  }
}

function applyWindowBehavior(behavior) {
  const shortcut = behavior?.restoreShortcut || state.restoreShortcut;
  state.restoreShortcut = shortcut;
}

function markAgentPlanStale() {
  if (state.agentPlan) {
    state.agentPlanStale = true;
  }
}

function formatMissionRoute(source, routing) {
  if (source === "llm") {
    return `${routing.selectedProviderName || "Provider"} · ${routing.selectedModel}`;
  }

  if (routing.selectedModel) {
    return `本地规划 · 下次将调用 ${routing.selectedModel}`;
  }

  return "本地规划";
}

function getRoleBadge(roleId) {
  const badgeMap = {
    observer: "O",
    planner: "P",
    operator: "X",
    reviewer: "R",
    memory: "M",
    generalist: "G"
  };

  return badgeMap[roleId] || "A";
}

function formatExtensionSummary(count, entries, singularLabel) {
  if (!count) {
    return `未启用${singularLabel}`;
  }

  const names = (entries || [])
    .slice(0, 2)
    .map((item) => item.name)
    .filter(Boolean);
  const suffix = count > names.length ? " 等" : "";

  return names.length
    ? `${count} 个 · ${names.join("、")}${suffix}`
    : `${count} 个已启用`;
}

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
