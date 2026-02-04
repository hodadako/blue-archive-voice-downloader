const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceApi', {
  refreshStudents: () => ipcRenderer.invoke('students:refresh'),
  searchStudents: (query) => ipcRenderer.invoke('students:search', query),
  resolveVoices: (studentName) => ipcRenderer.invoke('voices:resolve', studentName),
  downloadVoices: (payload) => ipcRenderer.invoke('voices:download', payload),
});
