const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  getMcpCatalog,
  getProviderCatalog,
  getProviderSpec,
  getSettings,
  getSettingsSummary,
  getSkillCatalog,
  saveSettings
} = require("./settings-store");

const RESTORE_SHORTCUT = process.platform === "darwin" ? "Command+Shift+A" : "CommandOrControl+Shift+A";
const RESTORE_SHORTCUT_LABEL = process.platform === "darwin" ? "Cmd+Shift+A" : "Ctrl+Shift+A";

let mainWindow = null;
let settingsWindow = null;
let tray = null;

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1580,
    height: 980,
    minWidth: 1280,
    minHeight: 760,
    backgroundColor: "#f2efe7",
    autoHideMenuBar: true,
    title: "Action Agent Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 1260,
    height: 920,
    minWidth: 1080,
    minHeight: 760,
    backgroundColor: "#f4eee4",
    autoHideMenuBar: true,
    title: "Agent Config Center",
    parent: mainWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, "..", "settings", "index.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

app.whenReady().then(async () => {
  await getSettings();
  createMainWindow();
  createTray();
  registerShortcuts();

  app.on("activate", () => {
    if (!mainWindow) {
      createMainWindow();
      return;
    }

    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle("recording:save", async (_event, recording) => {
  const defaultName = `${slugify(recording?.analysis?.title || recording?.agentWorkspace?.agentPlan?.missionTitle || "workflow")}.json`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save workflow recording",
    defaultPath: defaultName,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  await fs.writeFile(filePath, JSON.stringify(recording, null, 2), "utf8");
  return { canceled: false, filePath };
});

ipcMain.handle("recording:load", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Open workflow recording",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }]
  });

  if (canceled || !filePaths?.length) {
    return { canceled: true };
  }

  const filePath = filePaths[0];
  const raw = await fs.readFile(filePath, "utf8");
  return {
    canceled: false,
    filePath,
    recording: JSON.parse(raw)
  };
});

ipcMain.handle("window:hide-for-recording", async () => {
  hideMainWindowForRecording();
  return {
    hidden: true,
    restoreShortcut: RESTORE_SHORTCUT_LABEL
  };
});

ipcMain.handle("window:show", async () => {
  showMainWindow();
  return {
    visible: true,
    restoreShortcut: RESTORE_SHORTCUT_LABEL
  };
});

ipcMain.handle("window:get-behavior", async () => ({
  restoreShortcut: RESTORE_SHORTCUT_LABEL
}));

ipcMain.handle("settings:open-window", async () => {
  createSettingsWindow();
  return { opened: true };
});

ipcMain.handle("settings:get-summary", async () => {
  const settings = await getSettings();
  return {
    summary: getSettingsSummary(settings),
    restoreShortcut: RESTORE_SHORTCUT_LABEL
  };
});

ipcMain.handle("settings:get-bundle", async () => {
  const settings = await getSettings();
  return {
    settings,
    summary: getSettingsSummary(settings),
    providerCatalog: getProviderCatalog(),
    mcpCatalog: getMcpCatalog(),
    skillCatalog: getSkillCatalog(),
    restoreShortcut: RESTORE_SHORTCUT_LABEL
  };
});

ipcMain.handle("settings:save", async (_event, nextSettings) => {
  const saved = await saveSettings(nextSettings);
  const summary = getSettingsSummary(saved);
  broadcastSettingsUpdate(summary);
  return {
    settings: saved,
    summary,
    restoreShortcut: RESTORE_SHORTCUT_LABEL
  };
});

ipcMain.handle("ai:analyze", async (_event, payload) => {
  const settings = await getSettings();
  const route = resolveAnalysisRoute(settings, payload?.routing);
  const provider = resolveProviderForRoute(settings, route);

  const analysis = await analyzeWithProvider(provider, route.model, payload, route, settings);
  return {
    analysis,
    route: buildRouteResponse(route, provider)
  };
});

ipcMain.handle("ai:agent-plan", async (_event, payload) => {
  const settings = await getSettings();
  const route = resolveAnalysisRoute(settings, payload?.routing);
  const provider = resolveProviderForRoute(settings, route);

  const plan = await planAgentWithProvider(provider, route.model, payload, route, settings);
  return {
    plan,
    route: buildRouteResponse(route, provider)
  };
});

function resolveProviderForRoute(settings, route) {
  const provider = settings.providers.find((item) => item.id === route.providerId && item.enabled);

  if (!provider) {
    throw new Error("No enabled provider is assigned to the selected route.");
  }

  return provider;
}

function buildRouteResponse(route, provider) {
  return {
    selectedTier: route.selectedTier,
    selectedModel: route.model,
    providerId: provider.id,
    providerName: provider.name,
    providerType: provider.providerType
  };
}

function broadcastSettingsUpdate(summary) {
  const payload = {
    summary,
    restoreShortcut: RESTORE_SHORTCUT_LABEL
  };

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("settings:updated", payload);
    }
  }
}

async function analyzeWithProvider(provider, model, payload, route, settings) {
  return requestJsonWithProvider(provider, model, {
    systemPrompt: [
      "You are an automation analyst.",
      "Turn the action log into a reusable workflow description.",
      "Return valid JSON only with this shape:",
      "{",
      '  "title": "short title",',
      '  "summary": "one concise paragraph",',
      '  "goal": "the likely user objective",',
      '  "replayConfidence": 0.0,',
      '  "risks": ["risk 1"],',
      '  "steps": [{"title":"step title","detail":"what happened","selector":"optional","type":"click|input|scroll|navigate|keyboard"}],',
      '  "automationNotes": ["note 1"]',
      "}",
      "Keep steps short, concrete, and ordered.",
      "If extensionContext is present, mention MCP or Skills only when they are genuinely relevant to the workflow."
    ].join("\n"),
    userPayload: {
      pageUrl: payload?.pageUrl || "",
      routing: {
        selectedTier: route.selectedTier,
        selectedModel: model,
        difficultyLabel: payload?.routing?.difficultyLabel || "",
        reasons: payload?.routing?.reasons || []
      },
      extensionContext: buildExtensionPromptContext(settings),
      actions: payload?.actions || []
    }
  });
}

async function planAgentWithProvider(provider, model, payload, route, settings) {
  return requestJsonWithProvider(provider, model, {
    systemPrompt: [
      "You design reusable multi-agent execution plans.",
      "Return valid JSON only with this shape:",
      "{",
      '  "missionTitle": "short title",',
      '  "missionSummary": "one concise paragraph",',
      '  "objective": "main objective",',
      '  "teamNarrative": "how the team collaborates",',
      '  "roles": [{"roleId":"planner","mission":"what this role should do","output":"expected output","status":"done|active|pending"}],',
      '  "stages": [{"title":"stage title","ownerRoleId":"planner","detail":"what happens in this stage","status":"done|active|pending"}],',
      '  "handoffs": [{"fromRoleId":"planner","toRoleId":"operator","label":"handoff label"}],',
      '  "checkpoints": ["checkpoint 1"],',
      '  "risks": ["risk 1"],',
      '  "automationNotes": ["note 1"],',
      '  "difficultyLevel": "simple|complex",',
      '  "difficultyLabel": "human readable difficulty"',
      "}",
      "Only use role ids that appear in the provided team preset.",
      "If recording actions or analysis already exist, mark context and planning roles as done, and the main execution role as active.",
      "Keep the plan compact, practical, and execution-oriented.",
      "If extensionContext is present, reflect relevant MCP servers or Skills in checkpoints, notes, or role missions."
    ].join("\n"),
    userPayload: {
      taskPrompt: payload?.taskPrompt || "",
      pageUrl: payload?.pageUrl || "",
      routing: {
        selectedTier: route.selectedTier,
        selectedModel: model,
        difficultyLevel: payload?.routing?.difficultyLevel || "simple",
        difficultyLabel: payload?.routing?.difficultyLabel || "",
        reasons: payload?.routing?.reasons || []
      },
      extensionContext: buildExtensionPromptContext(settings),
      teamPreset: payload?.teamPreset || null,
      analysis: payload?.analysis || null,
      actions: payload?.actions || []
    }
  });
}

async function requestJsonWithProvider(provider, model, promptBundle) {
  const providerSpec = getProviderSpec(provider.providerType);
  const endpoint = provider.endpoint || providerSpec.defaultEndpoint;

  if (!endpoint) {
    throw new Error(`Provider "${provider.name}" is missing an endpoint.`);
  }

  if (!model) {
    throw new Error(`Provider "${provider.name}" does not have a model assigned to this route.`);
  }

  const userPrompt = JSON.stringify(promptBundle.userPayload, null, 2);

  if (providerSpec.protocol === "anthropic-messages") {
    return requestJsonWithAnthropic(endpoint, provider, model, promptBundle.systemPrompt, userPrompt);
  }

  return requestJsonWithOpenAiCompatible(endpoint, provider, model, promptBundle.systemPrompt, userPrompt);
}

async function requestJsonWithOpenAiCompatible(endpoint, provider, model, systemPrompt, userPrompt) {
  const headers = buildProviderHeaders(provider, {
    "Content-Type": "application/json"
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`Model request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = normalizeMessageContent(data?.choices?.[0]?.message?.content);

  if (!content) {
    throw new Error("Model response was empty.");
  }

  return parseJsonContent(content);
}

async function requestJsonWithAnthropic(endpoint, provider, model, systemPrompt, userPrompt) {
  const headers = buildProviderHeaders(provider, {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01"
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Model request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = Array.isArray(data?.content)
    ? data.content
      .filter((item) => item?.type === "text")
      .map((item) => item.text)
      .join("\n")
    : "";

  if (!content) {
    throw new Error("Model response was empty.");
  }

  return parseJsonContent(content);
}

function buildProviderHeaders(provider, baseHeaders) {
  const spec = getProviderSpec(provider.providerType);
  const headers = {
    ...baseHeaders
  };

  if (provider.apiKey) {
    if (spec.authStrategy === "bearer" || spec.authStrategy === "optional-bearer") {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    } else if (spec.authStrategy === "x-api-key") {
      headers["x-api-key"] = provider.apiKey;
    }
  }

  if (provider.customHeaders) {
    let customHeaders;

    try {
      customHeaders = JSON.parse(provider.customHeaders);
    } catch (error) {
      throw new Error(`Custom headers for "${provider.name}" are not valid JSON.`);
    }

    if (!customHeaders || typeof customHeaders !== "object" || Array.isArray(customHeaders)) {
      throw new Error(`Custom headers for "${provider.name}" must be a JSON object.`);
    }

    Object.assign(headers, customHeaders);
  }

  return headers;
}

function resolveAnalysisRoute(settings, routingPayload) {
  const routeMode = settings.routing.routeMode;
  const difficultyLevel = routingPayload?.difficultyLevel === "complex" ? "complex" : "simple";
  let selectedTier = difficultyLevel;

  if (routeMode === "simple") {
    selectedTier = "simple";
  } else if (routeMode === "complex") {
    selectedTier = "complex";
  }

  const binding = settings.routing[selectedTier];

  return {
    selectedTier,
    providerId: binding.providerId,
    model: binding.model
  };
}

function parseJsonContent(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    const match = content.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("Model did not return valid JSON.");
    }

    return JSON.parse(match[0]);
  }
}

function normalizeMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item?.type === "text") {
          return item.text;
        }

        return "";
      })
      .join("\n");
  }

  return "";
}

function buildExtensionPromptContext(settings) {
  return {
    mcpServers: (settings.mcpServers || [])
      .filter((item) => item.enabled)
      .map((item) => ({
        name: item.name,
        transport: item.transport,
        scope: item.scope,
        capabilitySummary: item.capabilitySummary,
        endpoint: item.transport === "stdio" ? "" : item.endpoint
      })),
    skills: (settings.skills || [])
      .filter((item) => item.enabled)
      .map((item) => ({
        name: item.name,
        applyTo: item.applyTo,
        autoAttach: item.autoAttach,
        description: item.description,
        entry: item.entry,
        notes: item.notes
      }))
  };
}

function createTray() {
  if (tray) {
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Action Agent Studio");
  tray.on("click", () => {
    if (!mainWindow || !mainWindow.isVisible()) {
      showMainWindow();
      return;
    }

    mainWindow.hide();
  });
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Studio",
        click: () => showMainWindow()
      },
      {
        label: "Open Settings Center",
        click: () => createSettingsWindow()
      },
      {
        label: "Hide To Background",
        click: () => {
          if (mainWindow) {
            mainWindow.hide();
          }
        }
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        click: () => app.quit()
      }
    ])
  );
}

function showMainWindow() {
  const window = createMainWindow();

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
}

function hideMainWindowForRecording() {
  if (!mainWindow) {
    return;
  }

  mainWindow.hide();

  if (Notification.isSupported()) {
    new Notification({
      title: "Action Agent Studio Moved To Background",
      body: `Recording started. Restore the window with ${RESTORE_SHORTCUT_LABEL} or the tray icon.`
    }).show();
  }
}

function registerShortcuts() {
  globalShortcut.register(RESTORE_SHORTCUT, () => {
    showMainWindow();
  });
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <rect width="16" height="16" rx="4" fill="#0e7f6d"/>
      <path d="M4 11.5V4.5h3.1c2.1 0 3.4 1.1 3.4 3s-1.3 3-3.4 3H5.6v1H4zm1.6-2.4h1.3c1.2 0 1.9-.6 1.9-1.6S8.1 5.9 6.9 5.9H5.6v3.2z" fill="#ffffff"/>
    </svg>
  `;

  return nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`)
    .resize({ width: 16, height: 16 });
}

function slugify(value) {
  return String(value || "workflow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workflow";
}
