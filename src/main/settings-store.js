const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { app } = require("electron");

const PROVIDER_CATALOG = [
  {
    id: "openai",
    name: "OpenAI",
    protocol: "openai-chat",
    authStrategy: "bearer",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    description: "Official OpenAI Chat Completions endpoint."
  },
  {
    id: "openai-compatible",
    name: "OpenAI Compatible",
    protocol: "openai-chat",
    authStrategy: "bearer",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    description: "Any provider that implements the OpenAI chat completions format."
  },
  {
    id: "anthropic",
    name: "Anthropic",
    protocol: "anthropic-messages",
    authStrategy: "x-api-key",
    defaultEndpoint: "https://api.anthropic.com/v1/messages",
    description: "Anthropic Messages API, suitable for Claude-family models."
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "openai-chat",
    authStrategy: "bearer",
    defaultEndpoint: "https://openrouter.ai/api/v1/chat/completions",
    description: "Router for many frontier and open-weight models."
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    protocol: "openai-chat",
    authStrategy: "bearer",
    defaultEndpoint: "https://api.deepseek.com/chat/completions",
    description: "DeepSeek hosted API."
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    protocol: "openai-chat",
    authStrategy: "bearer",
    defaultEndpoint: "https://api.siliconflow.cn/v1/chat/completions",
    description: "SiliconFlow models via OpenAI-compatible endpoint."
  },
  {
    id: "ollama",
    name: "Ollama",
    protocol: "openai-chat",
    authStrategy: "optional-bearer",
    defaultEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
    description: "Local models exposed through Ollama's OpenAI-compatible API."
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    protocol: "openai-chat",
    authStrategy: "optional-bearer",
    defaultEndpoint: "http://127.0.0.1:1234/v1/chat/completions",
    description: "Local inference server exposed by LM Studio."
  },
  {
    id: "custom",
    name: "Custom",
    protocol: "openai-chat",
    authStrategy: "bearer",
    defaultEndpoint: "",
    description: "Bring your own endpoint, headers, and model names."
  }
];

const MCP_CATALOG = [
  {
    id: "filesystem",
    name: "Filesystem MCP",
    transport: "stdio",
    command: "npx",
    args: ["@modelcontextprotocol/server-filesystem", "."],
    endpoint: "",
    scope: "execution",
    capabilitySummary: "让 agent 读取和写入本地工作目录中的文件。",
    description: "适合代码、配置和文档处理。"
  },
  {
    id: "playwright",
    name: "Playwright MCP",
    transport: "stdio",
    command: "npx",
    args: ["@playwright/mcp@latest"],
    endpoint: "",
    scope: "execution",
    capabilitySummary: "让 agent 通过浏览器自动化完成页面查看、点击和验证。",
    description: "适合网页测试、采集和交互自动化。"
  },
  {
    id: "fetch",
    name: "Fetch MCP",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-fetch"],
    endpoint: "",
    scope: "analysis",
    capabilitySummary: "让 agent 请求网页、接口和远程文本内容。",
    description: "适合信息抓取、接口联调和内容分析。"
  },
  {
    id: "custom-sse",
    name: "Custom SSE MCP",
    transport: "sse",
    command: "",
    args: [],
    endpoint: "http://127.0.0.1:3001/sse",
    scope: "all",
    capabilitySummary: "连接一个通过 SSE 暴露的自定义 MCP 服务。",
    description: "适合接入你自己的业务服务或内网工具。"
  }
];

const SKILL_CATALOG = [
  {
    id: "web-research",
    name: "网页研究",
    sourceType: "builtin",
    entry: "skill://web-research",
    description: "检索、比对和归纳网页信息。",
    applyTo: "analysis",
    tags: ["research", "web"],
    notes: "适合信息搜集、竞品研究和材料整理。"
  },
  {
    id: "browser-automation",
    name: "浏览器自动化",
    sourceType: "builtin",
    entry: "skill://browser-automation",
    description: "围绕页面交互、表单填写和验证构建稳定执行流程。",
    applyTo: "execution",
    tags: ["browser", "automation"],
    notes: "适合网页录制后的执行与加固。"
  },
  {
    id: "qa-review",
    name: "质量复核",
    sourceType: "builtin",
    entry: "skill://qa-review",
    description: "对结果进行检查、找风险和提出回归建议。",
    applyTo: "review",
    tags: ["review", "qa"],
    notes: "适合让 Reviewer 或 Review Agent 使用。"
  },
  {
    id: "report-writer",
    name: "报告沉淀",
    sourceType: "builtin",
    entry: "skill://report-writer",
    description: "把执行结果整理成总结、日报或结构化文档。",
    applyTo: "all",
    tags: ["report", "docs"],
    notes: "适合沉淀执行产物与知识资产。"
  }
];

const SETTINGS_VERSION = 2;
const VALID_ROUTE_MODES = ["auto", "simple", "complex"];
const VALID_MCP_TRANSPORTS = ["stdio", "sse", "http"];
const VALID_EXTENSION_SCOPES = ["all", "planning", "execution", "analysis", "review"];
const VALID_SKILL_SOURCES = ["builtin", "local", "git", "custom"];

async function getSettings() {
  const filePath = getSettingsPath();

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeSettings(parsed);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to read settings:", error);
    }

    const defaults = createDefaultSettings();
    await writeSettings(defaults);
    return defaults;
  }
}

async function saveSettings(nextSettings) {
  const normalized = normalizeSettings(nextSettings);
  await writeSettings(normalized);
  return normalized;
}

function getSettingsSummary(settings) {
  const normalized = normalizeSettings(settings);
  const providers = normalized.providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    providerType: provider.providerType,
    endpoint: provider.endpoint,
    enabled: provider.enabled,
    hasApiKey: Boolean(provider.apiKey)
  }));

  const enabledMcpServers = normalized.mcpServers.filter((item) => item.enabled);
  const enabledSkills = normalized.skills.filter((item) => item.enabled);

  return {
    version: normalized.version,
    providers,
    routing: {
      routeMode: normalized.routing.routeMode,
      simple: buildRouteSummary(normalized, normalized.routing.simple),
      complex: buildRouteSummary(normalized, normalized.routing.complex)
    },
    recording: {
      autoHideOnRecord: normalized.recording.autoHideOnRecord
    },
    extensions: {
      mcpServers: enabledMcpServers.map((item) => ({
        id: item.id,
        name: item.name,
        transport: item.transport,
        scope: item.scope,
        capabilitySummary: item.capabilitySummary
      })),
      skills: enabledSkills.map((item) => ({
        id: item.id,
        name: item.name,
        applyTo: item.applyTo,
        description: item.description
      })),
      mcpEnabledCount: enabledMcpServers.length,
      skillEnabledCount: enabledSkills.length
    }
  };
}

function getProviderCatalog() {
  return PROVIDER_CATALOG.map((item) => ({ ...item }));
}

function getProviderSpec(providerType) {
  return PROVIDER_CATALOG.find((item) => item.id === providerType) || PROVIDER_CATALOG[1];
}

function getMcpCatalog() {
  return MCP_CATALOG.map((item) => ({
    ...item,
    args: [...item.args]
  }));
}

function getSkillCatalog() {
  return SKILL_CATALOG.map((item) => ({
    ...item,
    tags: [...item.tags]
  }));
}

function normalizeSettings(input) {
  const base = input && typeof input === "object" ? input : {};
  const providers = normalizeProviders(base.providers);
  const fallbackProviderId = providers[0].id;
  const routing = normalizeRouting(base.routing, providers, fallbackProviderId);

  return {
    version: SETTINGS_VERSION,
    providers,
    routing,
    recording: {
      autoHideOnRecord: base.recording?.autoHideOnRecord !== false
    },
    mcpServers: normalizeMcpServers(base.mcpServers),
    skills: normalizeSkills(base.skills)
  };
}

function normalizeProviders(inputProviders) {
  const source = Array.isArray(inputProviders) && inputProviders.length
    ? inputProviders
    : createDefaultSettings().providers;

  const normalized = source.map((provider, index) => normalizeProvider(provider, index));
  return normalized.length ? normalized : createDefaultSettings().providers;
}

function normalizeProvider(provider, index) {
  const spec = getProviderSpec(provider?.providerType);
  return {
    id: provider?.id || `provider-${index + 1}-${randomUUID().slice(0, 8)}`,
    name: String(provider?.name || `${spec.name} ${index + 1}`).trim(),
    providerType: spec.id,
    endpoint: String(provider?.endpoint || spec.defaultEndpoint || "").trim(),
    apiKey: String(provider?.apiKey || "").trim(),
    enabled: provider?.enabled !== false,
    customHeaders: String(provider?.customHeaders || "").trim(),
    notes: String(provider?.notes || "").trim()
  };
}

function normalizeRouting(routing, providers, fallbackProviderId) {
  const source = routing && typeof routing === "object" ? routing : {};
  return {
    routeMode: VALID_ROUTE_MODES.includes(source.routeMode) ? source.routeMode : "auto",
    simple: normalizeRouteBinding(source.simple, providers, fallbackProviderId, "gpt-4.1-mini"),
    complex: normalizeRouteBinding(source.complex, providers, fallbackProviderId, "gpt-4.1")
  };
}

function normalizeRouteBinding(binding, providers, fallbackProviderId, fallbackModel) {
  const source = binding && typeof binding === "object" ? binding : {};
  const validProviderId = providers.some((provider) => provider.id === source.providerId)
    ? source.providerId
    : fallbackProviderId;

  return {
    providerId: validProviderId,
    model: String(source.model || fallbackModel).trim() || fallbackModel
  };
}

function buildRouteSummary(settings, binding) {
  const provider = settings.providers.find((item) => item.id === binding.providerId);
  return {
    providerId: binding.providerId,
    providerName: provider?.name || "Unassigned",
    providerType: provider?.providerType || "custom",
    model: binding.model
  };
}

function normalizeMcpServers(inputServers) {
  if (!Array.isArray(inputServers) || !inputServers.length) {
    return [];
  }

  return inputServers.map((server, index) => normalizeMcpServer(server, index));
}

function normalizeMcpServer(server, index) {
  const source = server && typeof server === "object" ? server : {};
  const transport = VALID_MCP_TRANSPORTS.includes(source.transport) ? source.transport : "stdio";
  return {
    id: source.id || `mcp-${index + 1}-${randomUUID().slice(0, 8)}`,
    name: String(source.name || `MCP Server ${index + 1}`).trim(),
    transport,
    command: String(source.command || "").trim(),
    args: normalizeJsonText(source.args, []),
    endpoint: String(source.endpoint || "").trim(),
    env: normalizeJsonText(source.env, {}),
    scope: VALID_EXTENSION_SCOPES.includes(source.scope) ? source.scope : "execution",
    enabled: source.enabled !== false,
    capabilitySummary: String(source.capabilitySummary || "").trim(),
    notes: String(source.notes || "").trim()
  };
}

function normalizeSkills(inputSkills) {
  if (!Array.isArray(inputSkills) || !inputSkills.length) {
    return [];
  }

  return inputSkills.map((skill, index) => normalizeSkill(skill, index));
}

function normalizeSkill(skill, index) {
  const source = skill && typeof skill === "object" ? skill : {};
  return {
    id: source.id || `skill-${index + 1}-${randomUUID().slice(0, 8)}`,
    name: String(source.name || `Skill ${index + 1}`).trim(),
    sourceType: VALID_SKILL_SOURCES.includes(source.sourceType) ? source.sourceType : "custom",
    entry: String(source.entry || "").trim(),
    description: String(source.description || "").trim(),
    applyTo: VALID_EXTENSION_SCOPES.includes(source.applyTo) ? source.applyTo : "all",
    enabled: source.enabled !== false,
    autoAttach: source.autoAttach !== false,
    tags: normalizeTagString(source.tags),
    notes: String(source.notes || "").trim()
  };
}

function createDefaultSettings() {
  const defaultProvider = {
    id: `provider-default-${randomUUID().slice(0, 8)}`,
    name: "Primary OpenAI",
    providerType: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKey: "",
    enabled: true,
    customHeaders: "",
    notes: ""
  };

  return {
    version: SETTINGS_VERSION,
    providers: [defaultProvider],
    routing: {
      routeMode: "auto",
      simple: {
        providerId: defaultProvider.id,
        model: "gpt-4.1-mini"
      },
      complex: {
        providerId: defaultProvider.id,
        model: "gpt-4.1"
      }
    },
    recording: {
      autoHideOnRecord: true
    },
    mcpServers: [],
    skills: []
  };
}

function normalizeJsonText(value, fallbackValue) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return JSON.stringify(fallbackValue, null, 2);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return JSON.stringify(fallbackValue, null, 2);
  }
}

function normalizeTagString(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  return String(value || "").trim();
}

async function writeSettings(settings) {
  const filePath = getSettingsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2), "utf8");
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

module.exports = {
  getProviderCatalog,
  getProviderSpec,
  getMcpCatalog,
  getSettings,
  getSettingsSummary,
  getSkillCatalog,
  saveSettings
};
