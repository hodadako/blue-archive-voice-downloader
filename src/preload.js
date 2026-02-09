const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceApi', {
  searchStudents: (query) => ipcRenderer.invoke('students:search', query),
  resolveVoices: (studentName) => ipcRenderer.invoke('voices:resolve', studentName),
  downloadVoices: (payload) => ipcRenderer.invoke('voices:download', payload),
  onDownloadProgress: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('voices:download:progress', handler);
    return () => ipcRenderer.removeListener('voices:download:progress', handler);
  },
});
