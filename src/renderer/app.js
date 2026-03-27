import { buildHeuristicAnalysis, describeAction, normalizeActions } from "./analysis.js";
import { replayActions, withComputedDelays } from "./replay.js";

const state = {
  isRecording: false,
  rawActions: [],
  normalizedActions: [],
  analysis: null,
  pageTitle: "",
  pageUrl: "",
  isReplaying: false
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
  recordingBadge: document.getElementById("recordingBadge"),
  actionCount: document.getElementById("actionCount"),
  analysisMode: document.getElementById("analysisMode"),
  pageTitle: document.getElementById("pageTitle"),
  pageUrlDisplay: document.getElementById("pageUrlDisplay"),
  confidenceText: document.getElementById("confidenceText"),
  analysisEmpty: document.getElementById("analysisEmpty"),
  analysisContent: document.getElementById("analysisContent"),
  analysisTitle: document.getElementById("analysisTitle"),
  analysisSummary: document.getElementById("analysisSummary"),
  analysisGoal: document.getElementById("analysisGoal"),
  stepsList: document.getElementById("stepsList"),
  risksList: document.getElementById("risksList"),
  notesList: document.getElementById("notesList"),
  timeline: document.getElementById("timeline"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  modelInput: document.getElementById("modelInput"),
  endpointInput: document.getElementById("endpointInput")
};

bootstrap();

function bootstrap() {
  elements.webview.preload = new URL("../webview/preload.js", import.meta.url).toString();
  hydrateStoredSettings();
  bindUi();
  bindWebview();
  render();
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

  elements.urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      navigateFromInput();
    }
  });

  for (const input of [elements.apiKeyInput, elements.modelInput, elements.endpointInput]) {
    input.addEventListener("change", persistSettings);
    input.addEventListener("blur", persistSettings);
  }
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

function navigateFromInput() {
  const url = normalizeUrl(elements.urlInput.value);
  if (!url) {
    return;
  }

  elements.urlInput.value = url;
  state.pageUrl = url;
  state.pageTitle = "页面载入中...";
  renderHeader();
  elements.webview.src = url;
}

function startRecording() {
  state.isRecording = true;
  state.rawActions = [];
  state.normalizedActions = [];
  state.analysis = null;

  if (elements.webview.getURL()) {
    appendAction({
      type: "navigate",
      url: elements.webview.getURL(),
      label: elements.webview.getTitle() || elements.webview.getURL(),
      capturedAt: Date.now()
    });
  }

  render();
}

function stopRecording() {
  state.isRecording = false;
  state.normalizedActions = normalizeActions(state.rawActions);
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
  renderTimeline();
  renderStatus();
}

async function analyzeActions() {
  const actions = getActiveActions();
  if (!actions.length) {
    return;
  }

  const apiKey = elements.apiKeyInput.value.trim();
  if (!apiKey) {
    state.analysis = buildHeuristicAnalysis(actions);
    elements.analysisMode.textContent = "本地理解";
    renderAnalysis();
    return;
  }

  elements.analyzeBtn.disabled = true;
  elements.analyzeBtn.textContent = "理解中...";

  try {
    state.analysis = await window.desktopBridge.analyzeWithAi({
      apiKey,
      model: elements.modelInput.value,
      endpoint: elements.endpointInput.value,
      pageUrl: state.pageUrl,
      actions
    });
    elements.analysisMode.textContent = "LLM 增强";
  } catch (error) {
    console.error(error);
    state.analysis = buildHeuristicAnalysis(actions);
    state.analysis.risks = [
      `AI 接口调用失败，已回退到本地理解：${error.message}`,
      ...(state.analysis.risks || [])
    ];
    elements.analysisMode.textContent = "本地理解";
  } finally {
    elements.analyzeBtn.disabled = false;
    elements.analyzeBtn.textContent = "理解动作";
    renderAnalysis();
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
  if (!recording.actions.length) {
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
    state.analysis = recording.analysis || buildHeuristicAnalysis(state.normalizedActions);
    state.pageUrl = recording.pageUrl || "";
    state.pageTitle = recording.pageTitle || "已导入流程";

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
  render();
}

function buildRecordingPayload() {
  return {
    version: 1,
    pageUrl: state.pageUrl,
    pageTitle: state.pageTitle,
    savedAt: new Date().toISOString(),
    actions: getActiveActions(),
    analysis: state.analysis || null
  };
}

function getActiveActions() {
  return state.normalizedActions.length ? state.normalizedActions : normalizeActions(state.rawActions);
}

function render() {
  renderHeader();
  renderStatus();
  renderTimeline();
  renderAnalysis();
}

function renderHeader() {
  elements.pageTitle.textContent = state.pageTitle || "等待载入页面";
  elements.pageUrlDisplay.textContent = state.pageUrl || "尚未打开任何网页";
}

function renderStatus() {
  elements.recordingBadge.dataset.state = state.isRecording ? "recording" : "idle";
  elements.recordingBadge.textContent = state.isRecording ? "录制中" : "待机中";
  elements.actionCount.textContent = String(getActiveActions().length);
  elements.startRecordingBtn.disabled = state.isRecording;
  elements.stopRecordingBtn.disabled = !state.isRecording;
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

  elements.analysisEmpty.classList.add("hidden");
  elements.analysisContent.classList.remove("hidden");
  elements.analysisTitle.textContent = analysis.title || "未命名流程";
  elements.analysisSummary.textContent = analysis.summary || "";
  elements.analysisGoal.textContent = analysis.goal || "重复执行当前操作";
  elements.confidenceText.textContent = `回放信心 ${(Number(analysis.replayConfidence || 0) * 100).toFixed(0)}%`;

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

function fillList(container, entries, buildItem) {
  container.innerHTML = "";
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

function persistSettings() {
  const payload = {
    apiKey: elements.apiKeyInput.value,
    model: elements.modelInput.value,
    endpoint: elements.endpointInput.value
  };
  localStorage.setItem("agent-settings", JSON.stringify(payload));
}

function hydrateStoredSettings() {
  const raw = localStorage.getItem("agent-settings");
  if (!raw) {
    return;
  }

  try {
    const data = JSON.parse(raw);
    elements.apiKeyInput.value = data.apiKey || "";
    elements.modelInput.value = data.model || "gpt-4.1-mini";
    elements.endpointInput.value = data.endpoint || "https://api.openai.com/v1/chat/completions";
  } catch (error) {
    console.error(error);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
