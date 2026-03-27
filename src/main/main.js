const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1600,
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
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("recording:save", async (_event, recording) => {
  const defaultName = `${slugify(recording?.analysis?.title || "workflow")}.json`;
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

ipcMain.handle("ai:analyze", async (_event, payload) => {
  const apiKey = payload?.apiKey?.trim();

  if (!apiKey) {
    throw new Error("Missing API key.");
  }

  const endpoint = payload?.endpoint?.trim() || DEFAULT_ENDPOINT;
  const model = payload?.model?.trim() || DEFAULT_MODEL;
  const userPrompt = JSON.stringify(
    {
      pageUrl: payload.pageUrl,
      actions: payload.actions
    },
    null,
    2
  );

  const systemPrompt = [
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
    "Keep steps short, concrete, and ordered."
  ].join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
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
    const text = await response.text();
    throw new Error(`AI analysis failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("AI analysis returned an empty response.");
  }

  return JSON.parse(content);
});

function slugify(value) {
  return String(value || "workflow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workflow";
}
