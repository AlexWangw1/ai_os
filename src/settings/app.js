const VALID_EXTENSION_SCOPES = ["all", "planning", "execution", "analysis", "review"];
const VALID_MCP_TRANSPORTS = ["stdio", "sse", "http"];
const VALID_SKILL_SOURCES = ["builtin", "local", "git", "custom"];

const state = {
  settings: null,
  summary: null,
  providerCatalog: [],
  mcpCatalog: [],
  skillCatalog: [],
  selectedProviderId: "",
  selectedMcpId: "",
  selectedSkillId: "",
  restoreShortcut: "Ctrl+Shift+A",
  isDirty: false
};

const elements = {
  addProviderBtn: document.getElementById("addProviderBtn"),
  duplicateProviderBtn: document.getElementById("duplicateProviderBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  closeWindowBtn: document.getElementById("closeWindowBtn"),
  providerList: document.getElementById("providerList"),
  providerCountText: document.getElementById("providerCountText"),
  enabledMcpCountText: document.getElementById("enabledMcpCountText"),
  enabledSkillCountText: document.getElementById("enabledSkillCountText"),
  autoAttachCountText: document.getElementById("autoAttachCountText"),
  routeModeSelect: document.getElementById("routeModeSelect"),
  autoHideOnRecordInput: document.getElementById("autoHideOnRecordInput"),
  simpleProviderSelect: document.getElementById("simpleProviderSelect"),
  complexProviderSelect: document.getElementById("complexProviderSelect"),
  simpleModelInput: document.getElementById("simpleModelInput"),
  complexModelInput: document.getElementById("complexModelInput"),
  restoreShortcutText: document.getElementById("restoreShortcutText"),
  providerNameInput: document.getElementById("providerNameInput"),
  providerTypeSelect: document.getElementById("providerTypeSelect"),
  providerEndpointInput: document.getElementById("providerEndpointInput"),
  providerApiKeyInput: document.getElementById("providerApiKeyInput"),
  providerHeadersInput: document.getElementById("providerHeadersInput"),
  providerNotesInput: document.getElementById("providerNotesInput"),
  providerEnabledInput: document.getElementById("providerEnabledInput"),
  deleteProviderBtn: document.getElementById("deleteProviderBtn"),
  editingProviderText: document.getElementById("editingProviderText"),
  catalogGrid: document.getElementById("catalogGrid"),
  extensionMcpSummaryText: document.getElementById("extensionMcpSummaryText"),
  extensionSkillSummaryText: document.getElementById("extensionSkillSummaryText"),
  extensionAutoAttachSummaryText: document.getElementById("extensionAutoAttachSummaryText"),
  addMcpBtn: document.getElementById("addMcpBtn"),
  duplicateMcpBtn: document.getElementById("duplicateMcpBtn"),
  deleteMcpBtn: document.getElementById("deleteMcpBtn"),
  mcpList: document.getElementById("mcpList"),
  mcpCountText: document.getElementById("mcpCountText"),
  mcpTransportSelect: document.getElementById("mcpTransportSelect"),
  mcpScopeSelect: document.getElementById("mcpScopeSelect"),
  mcpNameInput: document.getElementById("mcpNameInput"),
  mcpCommandInput: document.getElementById("mcpCommandInput"),
  mcpArgsInput: document.getElementById("mcpArgsInput"),
  mcpEndpointInput: document.getElementById("mcpEndpointInput"),
  mcpEnvInput: document.getElementById("mcpEnvInput"),
  mcpCapabilityInput: document.getElementById("mcpCapabilityInput"),
  mcpNotesInput: document.getElementById("mcpNotesInput"),
  mcpEnabledInput: document.getElementById("mcpEnabledInput"),
  mcpCatalogGrid: document.getElementById("mcpCatalogGrid"),
  addSkillBtn: document.getElementById("addSkillBtn"),
  duplicateSkillBtn: document.getElementById("duplicateSkillBtn"),
  deleteSkillBtn: document.getElementById("deleteSkillBtn"),
  skillList: document.getElementById("skillList"),
  skillCountText: document.getElementById("skillCountText"),
  skillNameInput: document.getElementById("skillNameInput"),
  skillSourceTypeSelect: document.getElementById("skillSourceTypeSelect"),
  skillApplyToSelect: document.getElementById("skillApplyToSelect"),
  skillEntryInput: document.getElementById("skillEntryInput"),
  skillDescriptionInput: document.getElementById("skillDescriptionInput"),
  skillTagsInput: document.getElementById("skillTagsInput"),
  skillNotesInput: document.getElementById("skillNotesInput"),
  skillEnabledInput: document.getElementById("skillEnabledInput"),
  skillAutoAttachInput: document.getElementById("skillAutoAttachInput"),
  skillCatalogGrid: document.getElementById("skillCatalogGrid"),
  statusMessage: document.getElementById("statusMessage")
};

bootstrap();

async function bootstrap() {
  bindUi();
  await loadBundle();
  window.desktopBridge.onSettingsUpdated(async () => {
    await loadBundle(false);
  });
}

function bindUi() {
  elements.addProviderBtn.addEventListener("click", () => addProvider("openai-compatible"));
  elements.duplicateProviderBtn.addEventListener("click", duplicateSelectedProvider);
  elements.saveSettingsBtn.addEventListener("click", saveSettings);
  elements.closeWindowBtn.addEventListener("click", () => window.close());
  elements.deleteProviderBtn.addEventListener("click", deleteSelectedProvider);

  elements.providerList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-provider-id]");
    if (!button) {
      return;
    }

    state.selectedProviderId = button.dataset.providerId;
    render();
  });

  elements.catalogGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-template-id]");
    if (!card) {
      return;
    }

    addProvider(card.dataset.templateId);
  });

  elements.routeModeSelect.addEventListener("change", () => {
    updateRouting((routing) => {
      routing.routeMode = elements.routeModeSelect.value;
    }, "已更新任务路由模式。");
  });

  elements.autoHideOnRecordInput.addEventListener("change", () => {
    state.settings.recording.autoHideOnRecord = elements.autoHideOnRecordInput.checked;
    markDirty("已更新录制行为。");
  });

  elements.simpleProviderSelect.addEventListener("change", () => {
    updateRouting((routing) => {
      routing.simple.providerId = elements.simpleProviderSelect.value;
    }, "已更新简单任务路由。");
  });

  elements.complexProviderSelect.addEventListener("change", () => {
    updateRouting((routing) => {
      routing.complex.providerId = elements.complexProviderSelect.value;
    }, "已更新复杂任务路由。");
  });

  elements.simpleModelInput.addEventListener("input", () => {
    updateRouting((routing) => {
      routing.simple.model = elements.simpleModelInput.value;
    }, "已更新简单任务模型。");
  });

  elements.complexModelInput.addEventListener("input", () => {
    updateRouting((routing) => {
      routing.complex.model = elements.complexModelInput.value;
    }, "已更新复杂任务模型。");
  });

  elements.providerNameInput.addEventListener("input", () => {
    mutateSelectedProvider((provider) => {
      provider.name = elements.providerNameInput.value;
    }, "已修改当前模型接入。");
  });

  elements.providerTypeSelect.addEventListener("change", () => {
    mutateSelectedProvider((provider) => {
      const previousSpec = getProviderSpec(provider.providerType);
      const nextType = elements.providerTypeSelect.value;
      const nextSpec = getProviderSpec(nextType);
      provider.providerType = nextType;
      if (!provider.endpoint || provider.endpoint === previousSpec.defaultEndpoint) {
        provider.endpoint = nextSpec.defaultEndpoint;
      }
    }, "已切换 Provider 类型。");
  });

  elements.providerEndpointInput.addEventListener("input", () => {
    mutateSelectedProvider((provider) => {
      provider.endpoint = elements.providerEndpointInput.value;
    }, "已更新模型接入 endpoint。");
  });

  elements.providerApiKeyInput.addEventListener("input", () => {
    mutateSelectedProvider((provider) => {
      provider.apiKey = elements.providerApiKeyInput.value;
    }, "已更新 API Key。");
  });

  elements.providerHeadersInput.addEventListener("input", () => {
    mutateSelectedProvider((provider) => {
      provider.customHeaders = elements.providerHeadersInput.value;
    }, "已更新自定义 headers。");
  });

  elements.providerNotesInput.addEventListener("input", () => {
    mutateSelectedProvider((provider) => {
      provider.notes = elements.providerNotesInput.value;
    }, "已更新模型接入备注。");
  });

  elements.providerEnabledInput.addEventListener("change", () => {
    mutateSelectedProvider((provider) => {
      provider.enabled = elements.providerEnabledInput.checked;
    }, "已更新模型接入启用状态。");
  });

  bindMcpUi();
  bindSkillUi();
}

function bindMcpUi() {
  elements.addMcpBtn.addEventListener("click", () => addMcpServer("filesystem"));
  elements.duplicateMcpBtn.addEventListener("click", duplicateSelectedMcp);
  elements.deleteMcpBtn.addEventListener("click", deleteSelectedMcp);

  elements.mcpList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mcp-id]");
    if (!button) {
      return;
    }

    state.selectedMcpId = button.dataset.mcpId;
    render();
  });

  elements.mcpCatalogGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-template-id]");
    if (!card) {
      return;
    }

    addMcpServer(card.dataset.templateId);
  });

  elements.mcpNameInput.addEventListener("input", () => {
    mutateSelectedMcp((server) => {
      server.name = elements.mcpNameInput.value;
    }, "已更新 MCP 名称。");
  });

  elements.mcpTransportSelect.addEventListener("change", () => {
    mutateSelectedMcp((server) => {
      server.transport = elements.mcpTransportSelect.value;
    }, "已更新 MCP 传输方式。");
  });

  elements.mcpScopeSelect.addEventListener("change", () => {
    mutateSelectedMcp((server) => {
      server.scope = elements.mcpScopeSelect.value;
    }, "已更新 MCP 作用阶段。");
  });

  elements.mcpCommandInput.addEventListener("input", () => {
    mutateSelectedMcp((server) => {
      server.command = elements.mcpCommandInput.value;
    }, "已更新 MCP 命令。");
  });

  elements.mcpArgsInput.addEventListener("input", () => {
    mutateSelectedMcp((server) => {
      server.args = elements.mcpArgsInput.value;
    }, "已更新 MCP 参数。");
  });

  elements.mcpEndpointInput.addEventListener("input", () => {
    mutateSelectedMcp((server) => {
      server.endpoint = elements.mcpEndpointInput.value;
    }, "已更新 MCP endpoint。");
  });

  elements.mcpEnvInput.addEventListener("input", () => {
    mutateSelectedMcp((server) => {
      server.env = elements.mcpEnvInput.value;
    }, "已更新 MCP 环境变量。");
  });

  elements.mcpCapabilityInput.addEventListener("input", () => {
    mutateSelectedMcp((server) => {
      server.capabilitySummary = elements.mcpCapabilityInput.value;
    }, "已更新 MCP 能力摘要。");
  });

  elements.mcpNotesInput.addEventListener("input", () => {
    mutateSelectedMcp((server) => {
      server.notes = elements.mcpNotesInput.value;
    }, "已更新 MCP 备注。");
  });

  elements.mcpEnabledInput.addEventListener("change", () => {
    mutateSelectedMcp((server) => {
      server.enabled = elements.mcpEnabledInput.checked;
    }, "已更新 MCP 启用状态。");
  });
}

function bindSkillUi() {
  elements.addSkillBtn.addEventListener("click", () => addSkill("browser-automation"));
  elements.duplicateSkillBtn.addEventListener("click", duplicateSelectedSkill);
  elements.deleteSkillBtn.addEventListener("click", deleteSelectedSkill);

  elements.skillList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-skill-id]");
    if (!button) {
      return;
    }

    state.selectedSkillId = button.dataset.skillId;
    render();
  });

  elements.skillCatalogGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-template-id]");
    if (!card) {
      return;
    }

    addSkill(card.dataset.templateId);
  });

  elements.skillNameInput.addEventListener("input", () => {
    mutateSelectedSkill((skill) => {
      skill.name = elements.skillNameInput.value;
    }, "已更新 Skill 名称。");
  });

  elements.skillSourceTypeSelect.addEventListener("change", () => {
    mutateSelectedSkill((skill) => {
      skill.sourceType = elements.skillSourceTypeSelect.value;
    }, "已更新 Skill 来源类型。");
  });

  elements.skillApplyToSelect.addEventListener("change", () => {
    mutateSelectedSkill((skill) => {
      skill.applyTo = elements.skillApplyToSelect.value;
    }, "已更新 Skill 挂载阶段。");
  });

  elements.skillEntryInput.addEventListener("input", () => {
    mutateSelectedSkill((skill) => {
      skill.entry = elements.skillEntryInput.value;
    }, "已更新 Skill 入口。");
  });

  elements.skillDescriptionInput.addEventListener("input", () => {
    mutateSelectedSkill((skill) => {
      skill.description = elements.skillDescriptionInput.value;
    }, "已更新 Skill 描述。");
  });

  elements.skillTagsInput.addEventListener("input", () => {
    mutateSelectedSkill((skill) => {
      skill.tags = elements.skillTagsInput.value;
    }, "已更新 Skill 标签。");
  });

  elements.skillNotesInput.addEventListener("input", () => {
    mutateSelectedSkill((skill) => {
      skill.notes = elements.skillNotesInput.value;
    }, "已更新 Skill 备注。");
  });

  elements.skillEnabledInput.addEventListener("change", () => {
    mutateSelectedSkill((skill) => {
      skill.enabled = elements.skillEnabledInput.checked;
    }, "已更新 Skill 启用状态。");
  });

  elements.skillAutoAttachInput.addEventListener("change", () => {
    mutateSelectedSkill((skill) => {
      skill.autoAttach = elements.skillAutoAttachInput.checked;
    }, "已更新 Skill 自动挂载设置。");
  });
}

async function loadBundle(showMessage = true) {
  const bundle = await window.desktopBridge.getSettingsBundle();
  state.settings = bundle.settings;
  state.summary = bundle.summary;
  state.providerCatalog = bundle.providerCatalog;
  state.mcpCatalog = bundle.mcpCatalog || [];
  state.skillCatalog = bundle.skillCatalog || [];
  state.restoreShortcut = bundle.restoreShortcut || state.restoreShortcut;

  ensureSelections();
  state.isDirty = false;
  render();

  if (showMessage) {
    setStatus("配置已加载。");
  }
}

function ensureSelections() {
  if (!state.selectedProviderId || !state.settings.providers.some((provider) => provider.id === state.selectedProviderId)) {
    state.selectedProviderId = state.settings.providers[0]?.id || "";
  }

  if (!state.selectedMcpId || !state.settings.mcpServers.some((item) => item.id === state.selectedMcpId)) {
    state.selectedMcpId = state.settings.mcpServers[0]?.id || "";
  }

  if (!state.selectedSkillId || !state.settings.skills.some((item) => item.id === state.selectedSkillId)) {
    state.selectedSkillId = state.settings.skills[0]?.id || "";
  }
}

function render() {
  renderProviderList();
  renderRouting();
  renderProviderEditor();
  renderCatalog();
  renderExtensionSummary();
  renderMcpSection();
  renderSkillSection();
  renderStatus();
}

function renderProviderList() {
  elements.providerCountText.textContent = `${state.settings.providers.length} 个`;
  elements.providerList.innerHTML = "";

  for (const provider of state.settings.providers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `provider-card${provider.id === state.selectedProviderId ? " provider-card-active" : ""}`;
    button.dataset.providerId = provider.id;

    const routeTags = [];
    if (state.settings.routing.simple.providerId === provider.id) {
      routeTags.push("简单");
    }
    if (state.settings.routing.complex.providerId === provider.id) {
      routeTags.push("复杂");
    }

    button.innerHTML = `
      <span class="provider-card-title">${escapeHtml(provider.name || "未命名接入")}</span>
      <span class="provider-card-meta">${escapeHtml(getProviderSpec(provider.providerType).name)}</span>
      <span class="provider-card-endpoint">${escapeHtml(provider.endpoint || "未填写 endpoint")}</span>
      <span class="provider-card-tags">
        <span>${provider.enabled ? "已启用" : "已停用"}</span>
        ${routeTags.map((tag) => `<span>${escapeHtml(tag)}路由</span>`).join("")}
      </span>
    `;
    elements.providerList.appendChild(button);
  }
}

function renderRouting() {
  const providerOptions = state.settings.providers
    .map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)}</option>`)
    .join("");

  elements.routeModeSelect.value = state.settings.routing.routeMode;
  elements.autoHideOnRecordInput.checked = state.settings.recording.autoHideOnRecord;
  elements.simpleProviderSelect.innerHTML = providerOptions;
  elements.complexProviderSelect.innerHTML = providerOptions;
  elements.simpleProviderSelect.value = state.settings.routing.simple.providerId;
  elements.complexProviderSelect.value = state.settings.routing.complex.providerId;
  elements.simpleModelInput.value = state.settings.routing.simple.model;
  elements.complexModelInput.value = state.settings.routing.complex.model;
  elements.restoreShortcutText.textContent = `恢复快捷键 ${state.restoreShortcut}`;
}

function renderProviderEditor() {
  const provider = getSelectedProvider();
  const options = state.providerCatalog
    .map((spec) => `<option value="${escapeHtml(spec.id)}">${escapeHtml(spec.name)}</option>`)
    .join("");

  elements.providerTypeSelect.innerHTML = options;

  if (!provider) {
    elements.editingProviderText.textContent = "未选择";
    elements.providerNameInput.value = "";
    elements.providerTypeSelect.value = "openai-compatible";
    elements.providerEndpointInput.value = "";
    elements.providerApiKeyInput.value = "";
    elements.providerHeadersInput.value = "";
    elements.providerNotesInput.value = "";
    elements.providerEnabledInput.checked = false;
    elements.deleteProviderBtn.disabled = true;
    return;
  }

  elements.editingProviderText.textContent = provider.name || "未命名接入";
  elements.providerNameInput.value = provider.name;
  elements.providerTypeSelect.value = provider.providerType;
  elements.providerEndpointInput.value = provider.endpoint;
  elements.providerApiKeyInput.value = provider.apiKey;
  elements.providerHeadersInput.value = provider.customHeaders;
  elements.providerNotesInput.value = provider.notes;
  elements.providerEnabledInput.checked = provider.enabled;
  elements.deleteProviderBtn.disabled = state.settings.providers.length <= 1;
}

function renderCatalog() {
  elements.catalogGrid.innerHTML = "";

  for (const spec of state.providerCatalog) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "catalog-card";
    card.dataset.templateId = spec.id;
    card.innerHTML = `
      <strong>${escapeHtml(spec.name)}</strong>
      <p>${escapeHtml(spec.description)}</p>
      <small>${escapeHtml(spec.defaultEndpoint || "Custom endpoint")}</small>
    `;
    elements.catalogGrid.appendChild(card);
  }
}

function renderExtensionSummary() {
  const enabledMcpCount = state.settings.mcpServers.filter((item) => item.enabled).length;
  const enabledSkillCount = state.settings.skills.filter((item) => item.enabled).length;
  const autoAttachCount = state.settings.skills.filter((item) => item.enabled && item.autoAttach).length;

  elements.enabledMcpCountText.textContent = String(enabledMcpCount);
  elements.enabledSkillCountText.textContent = String(enabledSkillCount);
  elements.autoAttachCountText.textContent = String(autoAttachCount);
  elements.extensionMcpSummaryText.textContent = `${enabledMcpCount} 个启用`;
  elements.extensionSkillSummaryText.textContent = `${enabledSkillCount} 个启用`;
  elements.extensionAutoAttachSummaryText.textContent = `${autoAttachCount} 个 Skill`;
}

function renderMcpSection() {
  elements.mcpCountText.textContent = `${state.settings.mcpServers.length} 个连接`;
  elements.mcpList.innerHTML = "";

  for (const server of state.settings.mcpServers) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `entity-card${server.id === state.selectedMcpId ? " entity-card-active" : ""}`;
    item.dataset.mcpId = server.id;
    item.innerHTML = `
      <strong>${escapeHtml(server.name || "未命名 MCP")}</strong>
      <p>${escapeHtml(server.capabilitySummary || "尚未填写能力摘要")}</p>
      <small>${escapeHtml(server.transport)} · ${escapeHtml(server.scope)} · ${server.enabled ? "已启用" : "已停用"}</small>
    `;
    elements.mcpList.appendChild(item);
  }

  elements.mcpCatalogGrid.innerHTML = "";
  for (const spec of state.mcpCatalog) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "mini-catalog-card";
    card.dataset.templateId = spec.id;
    card.innerHTML = `
      <strong>${escapeHtml(spec.name)}</strong>
      <p>${escapeHtml(spec.description)}</p>
    `;
    elements.mcpCatalogGrid.appendChild(card);
  }

  const server = getSelectedMcp();
  if (!server) {
    elements.mcpNameInput.value = "";
    elements.mcpTransportSelect.value = "stdio";
    elements.mcpScopeSelect.value = "execution";
    elements.mcpCommandInput.value = "";
    elements.mcpArgsInput.value = "[]";
    elements.mcpEndpointInput.value = "";
    elements.mcpEnvInput.value = "{}";
    elements.mcpCapabilityInput.value = "";
    elements.mcpNotesInput.value = "";
    elements.mcpEnabledInput.checked = false;
    elements.duplicateMcpBtn.disabled = true;
    elements.deleteMcpBtn.disabled = true;
    return;
  }

  elements.mcpNameInput.value = server.name;
  elements.mcpTransportSelect.value = server.transport;
  elements.mcpScopeSelect.value = server.scope;
  elements.mcpCommandInput.value = server.command;
  elements.mcpArgsInput.value = server.args;
  elements.mcpEndpointInput.value = server.endpoint;
  elements.mcpEnvInput.value = server.env;
  elements.mcpCapabilityInput.value = server.capabilitySummary;
  elements.mcpNotesInput.value = server.notes;
  elements.mcpEnabledInput.checked = server.enabled;
  elements.duplicateMcpBtn.disabled = false;
  elements.deleteMcpBtn.disabled = false;
}

function renderSkillSection() {
  elements.skillCountText.textContent = `${state.settings.skills.length} 个能力包`;
  elements.skillList.innerHTML = "";

  for (const skill of state.settings.skills) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `entity-card${skill.id === state.selectedSkillId ? " entity-card-active" : ""}`;
    item.dataset.skillId = skill.id;
    item.innerHTML = `
      <strong>${escapeHtml(skill.name || "未命名 Skill")}</strong>
      <p>${escapeHtml(skill.description || "尚未填写 Skill 描述")}</p>
      <small>${escapeHtml(skill.sourceType)} · ${escapeHtml(skill.applyTo)} · ${skill.enabled ? "已启用" : "已停用"}</small>
    `;
    elements.skillList.appendChild(item);
  }

  elements.skillCatalogGrid.innerHTML = "";
  for (const spec of state.skillCatalog) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "mini-catalog-card";
    card.dataset.templateId = spec.id;
    card.innerHTML = `
      <strong>${escapeHtml(spec.name)}</strong>
      <p>${escapeHtml(spec.description)}</p>
    `;
    elements.skillCatalogGrid.appendChild(card);
  }

  const skill = getSelectedSkill();
  if (!skill) {
    elements.skillNameInput.value = "";
    elements.skillSourceTypeSelect.value = "custom";
    elements.skillApplyToSelect.value = "all";
    elements.skillEntryInput.value = "";
    elements.skillDescriptionInput.value = "";
    elements.skillTagsInput.value = "";
    elements.skillNotesInput.value = "";
    elements.skillEnabledInput.checked = false;
    elements.skillAutoAttachInput.checked = true;
    elements.duplicateSkillBtn.disabled = true;
    elements.deleteSkillBtn.disabled = true;
    return;
  }

  elements.skillNameInput.value = skill.name;
  elements.skillSourceTypeSelect.value = skill.sourceType;
  elements.skillApplyToSelect.value = skill.applyTo;
  elements.skillEntryInput.value = skill.entry;
  elements.skillDescriptionInput.value = skill.description;
  elements.skillTagsInput.value = skill.tags;
  elements.skillNotesInput.value = skill.notes;
  elements.skillEnabledInput.checked = skill.enabled;
  elements.skillAutoAttachInput.checked = skill.autoAttach;
  elements.duplicateSkillBtn.disabled = false;
  elements.deleteSkillBtn.disabled = false;
}

function renderStatus() {
  elements.saveSettingsBtn.textContent = state.isDirty ? "保存配置" : "已保存";
}

function getSelectedProvider() {
  return state.settings.providers.find((provider) => provider.id === state.selectedProviderId) || null;
}

function getSelectedMcp() {
  return state.settings.mcpServers.find((item) => item.id === state.selectedMcpId) || null;
}

function getSelectedSkill() {
  return state.settings.skills.find((item) => item.id === state.selectedSkillId) || null;
}

function mutateSelectedProvider(mutator, message) {
  const provider = getSelectedProvider();
  if (!provider) {
    return;
  }

  mutator(provider);
  markDirty(message);
  render();
}

function mutateSelectedMcp(mutator, message) {
  const server = getSelectedMcp();
  if (!server) {
    return;
  }

  mutator(server);
  markDirty(message);
  render();
}

function mutateSelectedSkill(mutator, message) {
  const skill = getSelectedSkill();
  if (!skill) {
    return;
  }

  mutator(skill);
  markDirty(message);
  render();
}

function updateRouting(mutator, message) {
  mutator(state.settings.routing);
  markDirty(message);
  render();
}

function addProvider(templateId) {
  const spec = getProviderSpec(templateId);
  const provider = {
    id: `provider-${crypto.randomUUID().slice(0, 8)}`,
    name: `${spec.name} ${state.settings.providers.length + 1}`,
    providerType: spec.id,
    endpoint: spec.defaultEndpoint,
    apiKey: "",
    enabled: true,
    customHeaders: "",
    notes: ""
  };

  state.settings.providers.push(provider);
  state.selectedProviderId = provider.id;
  markDirty(`已新增 ${spec.name} 接入。`);
  render();
}

function duplicateSelectedProvider() {
  const provider = getSelectedProvider();
  if (!provider) {
    return;
  }

  const nextProvider = {
    ...provider,
    id: `provider-${crypto.randomUUID().slice(0, 8)}`,
    name: `${provider.name} Copy`
  };

  state.settings.providers.push(nextProvider);
  state.selectedProviderId = nextProvider.id;
  markDirty("已复制当前模型接入。");
  render();
}

function deleteSelectedProvider() {
  if (state.settings.providers.length <= 1) {
    setStatus("至少保留一个模型接入。", true);
    return;
  }

  const deletingId = state.selectedProviderId;
  state.settings.providers = state.settings.providers.filter((provider) => provider.id !== deletingId);
  const fallbackId = state.settings.providers[0].id;

  if (state.settings.routing.simple.providerId === deletingId) {
    state.settings.routing.simple.providerId = fallbackId;
  }
  if (state.settings.routing.complex.providerId === deletingId) {
    state.settings.routing.complex.providerId = fallbackId;
  }

  state.selectedProviderId = fallbackId;
  markDirty("已删除当前模型接入。");
  render();
}

function addMcpServer(templateId) {
  const spec = getMcpSpec(templateId);
  const server = {
    id: `mcp-${crypto.randomUUID().slice(0, 8)}`,
    name: `${spec.name} ${state.settings.mcpServers.length + 1}`,
    transport: spec.transport,
    command: spec.command,
    args: JSON.stringify(spec.args || [], null, 2),
    endpoint: spec.endpoint || "",
    env: "{}",
    scope: spec.scope || "execution",
    enabled: true,
    capabilitySummary: spec.capabilitySummary || "",
    notes: ""
  };

  state.settings.mcpServers.push(server);
  state.selectedMcpId = server.id;
  markDirty(`已新增 ${spec.name}。`);
  render();
}

function duplicateSelectedMcp() {
  const server = getSelectedMcp();
  if (!server) {
    return;
  }

  const nextServer = {
    ...server,
    id: `mcp-${crypto.randomUUID().slice(0, 8)}`,
    name: `${server.name} Copy`
  };

  state.settings.mcpServers.push(nextServer);
  state.selectedMcpId = nextServer.id;
  markDirty("已复制当前 MCP。");
  render();
}

function deleteSelectedMcp() {
  const deletingId = state.selectedMcpId;
  if (!deletingId) {
    return;
  }

  state.settings.mcpServers = state.settings.mcpServers.filter((item) => item.id !== deletingId);
  state.selectedMcpId = state.settings.mcpServers[0]?.id || "";
  markDirty("已删除当前 MCP。");
  render();
}

function addSkill(templateId) {
  const spec = getSkillSpec(templateId);
  const skill = {
    id: `skill-${crypto.randomUUID().slice(0, 8)}`,
    name: `${spec.name} ${state.settings.skills.length + 1}`,
    sourceType: spec.sourceType,
    entry: spec.entry,
    description: spec.description,
    applyTo: spec.applyTo || "all",
    enabled: true,
    autoAttach: true,
    tags: Array.isArray(spec.tags) ? spec.tags.join(", ") : "",
    notes: spec.notes || ""
  };

  state.settings.skills.push(skill);
  state.selectedSkillId = skill.id;
  markDirty(`已新增 ${spec.name} Skill。`);
  render();
}

function duplicateSelectedSkill() {
  const skill = getSelectedSkill();
  if (!skill) {
    return;
  }

  const nextSkill = {
    ...skill,
    id: `skill-${crypto.randomUUID().slice(0, 8)}`,
    name: `${skill.name} Copy`
  };

  state.settings.skills.push(nextSkill);
  state.selectedSkillId = nextSkill.id;
  markDirty("已复制当前 Skill。");
  render();
}

function deleteSelectedSkill() {
  const deletingId = state.selectedSkillId;
  if (!deletingId) {
    return;
  }

  state.settings.skills = state.settings.skills.filter((item) => item.id !== deletingId);
  state.selectedSkillId = state.settings.skills[0]?.id || "";
  markDirty("已删除当前 Skill。");
  render();
}

async function saveSettings() {
  try {
    validateSettings();
    const result = await window.desktopBridge.saveSettings(state.settings);
    state.settings = result.settings;
    state.summary = result.summary;
    state.restoreShortcut = result.restoreShortcut || state.restoreShortcut;
    state.isDirty = false;
    ensureSelections();
    render();
    setStatus("配置已保存，主窗口会自动刷新。");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "保存失败。", true);
  }
}

function validateSettings() {
  validateProviders();
  validateRouting();
  validateMcpServers();
  validateSkills();
}

function validateProviders() {
  if (!state.settings.providers.length) {
    throw new Error("至少需要一个模型接入。");
  }

  for (const provider of state.settings.providers) {
    if (!String(provider.name || "").trim()) {
      throw new Error("模型接入名称不能为空。");
    }

    if (!String(provider.endpoint || "").trim()) {
      throw new Error(`模型接入 "${provider.name}" 缺少 endpoint。`);
    }

    if (provider.customHeaders) {
      const parsed = parseJson(provider.customHeaders, `模型接入 "${provider.name}" 的自定义 headers 必须是 JSON 对象。`);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`模型接入 "${provider.name}" 的自定义 headers 必须是 JSON 对象。`);
      }
    }
  }
}

function validateRouting() {
  if (!String(state.settings.routing.simple.model || "").trim()) {
    throw new Error("简单任务模型不能为空。");
  }

  if (!String(state.settings.routing.complex.model || "").trim()) {
    throw new Error("复杂任务模型不能为空。");
  }

  const simpleProvider = state.settings.providers.find((provider) => provider.id === state.settings.routing.simple.providerId);
  const complexProvider = state.settings.providers.find((provider) => provider.id === state.settings.routing.complex.providerId);

  if (!simpleProvider?.enabled) {
    throw new Error("简单任务路由绑定到了未启用的模型接入。");
  }

  if (!complexProvider?.enabled) {
    throw new Error("复杂任务路由绑定到了未启用的模型接入。");
  }
}

function validateMcpServers() {
  for (const server of state.settings.mcpServers) {
    if (!String(server.name || "").trim()) {
      throw new Error("MCP 名称不能为空。");
    }

    if (!VALID_MCP_TRANSPORTS.includes(server.transport)) {
      throw new Error(`MCP "${server.name}" 的 transport 不合法。`);
    }

    if (!VALID_EXTENSION_SCOPES.includes(server.scope)) {
      throw new Error(`MCP "${server.name}" 的作用阶段不合法。`);
    }

    if (server.transport === "stdio" && !String(server.command || "").trim()) {
      throw new Error(`MCP "${server.name}" 使用 stdio 时必须填写 command。`);
    }

    if (server.transport !== "stdio" && !String(server.endpoint || "").trim()) {
      throw new Error(`MCP "${server.name}" 使用 ${server.transport} 时必须填写 endpoint。`);
    }

    if (server.args) {
      const parsedArgs = parseJson(server.args, `MCP "${server.name}" 的参数必须是 JSON 数组。`);
      if (!Array.isArray(parsedArgs)) {
        throw new Error(`MCP "${server.name}" 的参数必须是 JSON 数组。`);
      }
    }

    if (server.env) {
      const parsedEnv = parseJson(server.env, `MCP "${server.name}" 的环境变量必须是 JSON 对象。`);
      if (!parsedEnv || typeof parsedEnv !== "object" || Array.isArray(parsedEnv)) {
        throw new Error(`MCP "${server.name}" 的环境变量必须是 JSON 对象。`);
      }
    }
  }
}

function validateSkills() {
  for (const skill of state.settings.skills) {
    if (!String(skill.name || "").trim()) {
      throw new Error("Skill 名称不能为空。");
    }

    if (!VALID_SKILL_SOURCES.includes(skill.sourceType)) {
      throw new Error(`Skill "${skill.name}" 的来源类型不合法。`);
    }

    if (!VALID_EXTENSION_SCOPES.includes(skill.applyTo)) {
      throw new Error(`Skill "${skill.name}" 的挂载阶段不合法。`);
    }

    if (!String(skill.entry || "").trim()) {
      throw new Error(`Skill "${skill.name}" 缺少入口。`);
    }
  }
}

function markDirty(message) {
  state.isDirty = true;
  setStatus(message);
}

function setStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.dataset.error = isError ? "true" : "false";
}

function parseJson(value, errorMessage) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(errorMessage);
  }
}

function getProviderSpec(providerType) {
  return state.providerCatalog.find((item) => item.id === providerType) || state.providerCatalog[0];
}

function getMcpSpec(templateId) {
  return state.mcpCatalog.find((item) => item.id === templateId) || state.mcpCatalog[0];
}

function getSkillSpec(templateId) {
  return state.skillCatalog.find((item) => item.id === templateId) || state.skillCatalog[0];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
