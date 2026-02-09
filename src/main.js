const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

const {
  searchStudents,
  resolveStudentAndVoices,
  downloadVoiceFiles,
} = require('./services/voiceService');

function createWindow() {
  const windowIcon = path.join(__dirname, '..', 'icons', 'icon.png');
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('students:search', async (_event, query) => {
  return searchStudents(app.getPath('userData'), query);
});

ipcMain.handle('voices:resolve', async (_event, studentName) => {
  return resolveStudentAndVoices(app.getPath('userData'), studentName);
});

ipcMain.handle('voices:download', async (_event, payload) => {
  const { studentName, fileTitles, fileLinksByTitle, language } = payload || {};
  const chosen = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: language === 'en' ? 'Choose a save folder' : '저장 폴더를 선택하세요',
  });

  if (chosen.canceled || chosen.filePaths.length === 0) {
    return {
      ok: false,
      message:
        language === 'en' ? 'Save folder selection was canceled.' : '저장 폴더 선택이 취소되었습니다.',
    };
  }

  const targetDir = chosen.filePaths[0];
  const sender = _event.sender;
  return downloadVoiceFiles(
    studentName,
    fileTitles,
    targetDir,
    fileLinksByTitle,
    (progress) => {
      sender.send('voices:download:progress', progress);
    }
  );
});
