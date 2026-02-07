const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceApi', {
  searchStudents: (query) => ipcRenderer.invoke('students:search', query),
  resolveVoices: (studentName) => ipcRenderer.invoke('voices:resolve', studentName),
  downloadVoices: (payload) => ipcRenderer.invoke('voices:download', payload),
});
