const ACTION_TITLES = {
  navigate: "打开页面",
  click: "点击元素",
  input: "输入内容",
  keyboard: "触发键盘动作",
  scroll: "滚动页面"
};

export function normalizeActions(actions) {
  const result = [];

  for (const action of actions || []) {
    if (!action || !action.type) {
      continue;
    }

    const previous = result[result.length - 1];

    if (
      previous &&
      action.type === "input" &&
      previous.type === "input" &&
      action.selector === previous.selector
    ) {
      previous.value = action.value;
      previous.capturedAt = action.capturedAt;
      previous.label = action.label || previous.label;
      previous.inputType = action.inputType || previous.inputType;
      continue;
    }

    if (previous && action.type === "scroll" && previous.type === "scroll") {
      previous.scrollX = action.scrollX;
      previous.scrollY = action.scrollY;
      previous.capturedAt = action.capturedAt;
      continue;
    }

    if (
      previous &&
      action.type === "navigate" &&
      previous.type === "navigate" &&
      action.url === previous.url
    ) {
      previous.capturedAt = action.capturedAt;
      continue;
    }

    result.push({ ...action });
  }

  return result;
}

export function buildHeuristicAnalysis(actions) {
  const normalized = normalizeActions(actions);
  const hints = normalized.map(extractHint).filter(Boolean);
  const intent = inferIntent(hints);

  return {
    title: intent.title,
    summary: buildSummary(normalized, intent),
    goal: intent.goal,
    replayConfidence: estimateConfidence(normalized),
    risks: buildRisks(normalized),
    steps: normalized.map(toStep),
    automationNotes: buildAutomationNotes(normalized)
  };
}

export function describeAction(action) {
  const title = ACTION_TITLES[action.type] || action.type;
  const detail = action.label || action.selector || action.url || "";
  return detail ? `${title} · ${detail}` : title;
}

function toStep(action, index) {
  return {
    title: actionTitle(action),
    detail: actionDetail(action),
    selector: action.selector || "",
    type: action.type,
    order: index + 1
  };
}

function actionTitle(action) {
  if (action.type === "navigate") {
    return "进入目标页面";
  }

  if (action.type === "click") {
    return `点击 ${fallbackLabel(action, "页面元素")}`;
  }

  if (action.type === "input") {
    return `填写 ${fallbackLabel(action, "输入框")}`;
  }

  if (action.type === "keyboard") {
    return `按下 ${action.key || "快捷键"}`;
  }

  if (action.type === "scroll") {
    return "滚动到目标区域";
  }

  return ACTION_TITLES[action.type] || "执行动作";
}

function actionDetail(action) {
  if (action.type === "navigate") {
    return action.url || action.pageUrl || "";
  }

  if (action.type === "input") {
    const value = typeof action.value === "string" ? action.value : "";
    const preview = value.length > 36 ? `${value.slice(0, 36)}...` : value;
    return preview ? `输入值：${preview}` : fallbackLabel(action, "输入内容");
  }

  if (action.type === "click") {
    return action.selector || fallbackLabel(action, "目标元素");
  }

  if (action.type === "keyboard") {
    const modifiers = [
      action.ctrlKey ? "Ctrl" : "",
      action.metaKey ? "Meta" : "",
      action.altKey ? "Alt" : "",
      action.shiftKey ? "Shift" : ""
    ].filter(Boolean);
    return [...modifiers, action.key].filter(Boolean).join(" + ");
  }

  if (action.type === "scroll") {
    return `滚动到 Y=${Math.round(action.scrollY || 0)}`;
  }

  return fallbackLabel(action, action.selector || "");
}

function buildSummary(actions, intent) {
  const clickCount = actions.filter((item) => item.type === "click").length;
  const inputCount = actions.filter((item) => item.type === "input").length;
  const navigationCount = actions.filter((item) => item.type === "navigate").length;

  return `该流程主要用于${intent.goal}，共识别到 ${actions.length} 个有效动作，其中包含 ${navigationCount} 次页面进入、${inputCount} 次表单输入和 ${clickCount} 次点击操作。`;
}

function inferIntent(hints) {
  const joined = hints.join(" ").toLowerCase();

  if (containsAny(joined, ["password", "login", "sign in", "signin", "邮箱", "账号", "密码", "登录"])) {
    return {
      title: "登录类自动化流程",
      goal: "登录或进入账户"
    };
  }

  if (containsAny(joined, ["search", "query", "keyword", "搜索", "查找"])) {
    return {
      title: "搜索类自动化流程",
      goal: "搜索目标信息"
    };
  }

  if (containsAny(joined, ["checkout", "cart", "buy now", "购买", "下单", "结算"])) {
    return {
      title: "购买类自动化流程",
      goal: "完成购买或结算"
    };
  }

  if (containsAny(joined, ["upload", "附件", "上传", "file"])) {
    return {
      title: "上传类自动化流程",
      goal: "上传文件或材料"
    };
  }

  if (containsAny(joined, ["submit", "save", "提交", "保存", "create"])) {
    return {
      title: "表单提交流程",
      goal: "填写并提交表单"
    };
  }

  return {
    title: "通用网页自动化流程",
    goal: "在网页中重复执行同一串操作"
  };
}

function buildRisks(actions) {
  const risks = [];

  if (actions.some((item) => item.type === "input" && item.inputType === "password")) {
    risks.push("流程中包含密码输入，建议改成运行前动态注入，不要直接保存在录制文件中。");
  }

  if (actions.filter((item) => item.type === "click").length > 6) {
    risks.push("点击动作较多，页面结构变化时选择器可能失效。");
  }

  if (actions.some((item) => item.type === "scroll")) {
    risks.push("存在滚动动作，页面布局变化时回放位置可能偏移。");
  }

  if (!risks.length) {
    risks.push("当前流程适合做演示级回放，如需生产使用，建议补充元素校验与异常处理。");
  }

  return risks;
}

function buildAutomationNotes(actions) {
  const notes = ["优先使用 id、name、aria-label 等稳定属性作为回放锚点。"];

  if (actions.some((item) => item.type === "input")) {
    notes.push("输入框动作已经被折叠成最终值，回放时会直接写入字段。");
  }

  if (actions.some((item) => item.type === "navigate")) {
    notes.push("如果目标站点会重定向，建议在回放前增加页面已加载检查。");
  }

  return notes;
}

function estimateConfidence(actions) {
  let score = 0.56;
  const stableSelectorActions = actions.filter((item) => item.selector && /#|\[name=|\[data-|\[aria-label=/.test(item.selector)).length;

  score += Math.min(stableSelectorActions * 0.04, 0.2);

  if (actions.some((item) => item.type === "navigate")) {
    score += 0.08;
  }

  if (actions.some((item) => item.type === "scroll")) {
    score -= 0.05;
  }

  if (actions.length > 12) {
    score -= 0.06;
  }

  return Number(Math.max(0.2, Math.min(0.95, score)).toFixed(2));
}

function extractHint(action) {
  return [action.label, action.selector, action.url, action.value].filter(Boolean).join(" ");
}

function containsAny(source, tokens) {
  return tokens.some((token) => source.includes(token));
}

function fallbackLabel(action, defaultValue) {
  const label = String(action.label || "").trim();
  return label || defaultValue;
}
