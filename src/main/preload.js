const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  saveRecording(recording) {
    return ipcRenderer.invoke("recording:save", recording);
  },
  loadRecording() {
    return ipcRenderer.invoke("recording:load");
  },
  analyzeWithAi(payload) {
    return ipcRenderer.invoke("ai:analyze", payload);
  },
  planAgentMission(payload) {
    return ipcRenderer.invoke("ai:agent-plan", payload);
  },
  hideWindowForRecording() {
    return ipcRenderer.invoke("window:hide-for-recording");
  },
  showWindow() {
    return ipcRenderer.invoke("window:show");
  },
  getWindowBehavior() {
    return ipcRenderer.invoke("window:get-behavior");
  },
  openSettingsWindow() {
    return ipcRenderer.invoke("settings:open-window");
  },
  getSettingsSummary() {
    return ipcRenderer.invoke("settings:get-summary");
  },
  getSettingsBundle() {
    return ipcRenderer.invoke("settings:get-bundle");
  },
  saveSettings(settings) {
    return ipcRenderer.invoke("settings:save", settings);
  },
  onSettingsUpdated(callback) {
    const listener = (_event, payload) => {
      callback(payload);
    };

    ipcRenderer.on("settings:updated", listener);
    return () => {
      ipcRenderer.removeListener("settings:updated", listener);
    };
  }
});
