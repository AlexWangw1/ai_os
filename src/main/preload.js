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
  }
});
