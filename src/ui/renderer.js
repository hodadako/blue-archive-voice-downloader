const studentInput = document.getElementById('studentInput');
const searchBtn = document.getElementById('searchBtn');
const resolveBtn = document.getElementById('resolveBtn');
const downloadBtn = document.getElementById('downloadBtn');
const langSelect = document.getElementById('langSelect');
const themeToggle = document.getElementById('themeToggle');
const progressArea = document.getElementById('progressArea');
const progressValue = document.getElementById('progressValue');
const progressFill = document.getElementById('progressFill');
const progressFile = document.getElementById('progressFile');

const voiceStatus = document.getElementById('voiceStatus');
const searchResult = document.getElementById('searchResult');
const voiceList = document.getElementById('voiceList');

let selectedStudent = null;
let resolvedFiles = [];
let resolvedFileLinksByTitle = {};
let currentLanguage = 'ko';

const translations = {
  ko: {
    appTitle: 'Blue Archive Voice Downloader',
    appDesc:
      '한국어/영어 이름으로 학생을 검색하고, <code>bluearchive.wiki</code> 음성 파일을 내려받습니다.',
    langLabel: '언어',
    themeLabel: '다크모드',
    searchLabel: '학생 이름 검색',
    searchPlaceholder: '예: 호시노, Hoshino',
    searchBtn: '검색',
    resolveBtn: '음성 파일 조회',
    voiceListTitle: '음성 파일 목록',
    downloadBtn: '선택 파일 다운로드',
    statusPrompt: '학생을 검색하고 음성 파일 조회를 눌러주세요.',
    statusNeedName: '학생 이름을 입력해주세요.',
    statusSearchFail: '검색 실패: {error}',
    statusSelected: '{name} 선택됨. 음성 파일 조회를 눌러주세요.',
    statusResolving: '음성 파일 조회 중...',
    statusResolveFail: '조회 실패: {error}',
    statusResolveCount: '{name} - {count}개 파일 발견',
    statusNeedResolve: '먼저 음성 파일을 조회해주세요.',
    statusNeedSelect: '최소 1개 파일을 선택해주세요.',
    statusDownloading: '다운로드 중...',
    statusDownloadFail: '다운로드 실패: {error}',
    statusDownloadDone: '다운로드 완료',
    progressLabel: '다운로드 진행',
    progressFile: '현재 파일: {file}',
    resultEmpty: '검색 결과가 없습니다.',
    nameMissing: '이름없음',
  },
  en: {
    appTitle: 'Blue Archive Voice Downloader',
    appDesc:
      'Search students by Korean/English names and download <code>bluearchive.wiki</code> voice files.',
    langLabel: 'Language',
    themeLabel: 'Dark mode',
    searchLabel: 'Search student name',
    searchPlaceholder: 'e.g., Hoshino',
    searchBtn: 'Search',
    resolveBtn: 'Resolve voices',
    voiceListTitle: 'Voice file list',
    downloadBtn: 'Download selected',
    statusPrompt: 'Search a student and click resolve voices.',
    statusNeedName: 'Please enter a student name.',
    statusSearchFail: 'Search failed: {error}',
    statusSelected: '{name} selected. Click resolve voices.',
    statusResolving: 'Resolving voice files...',
    statusResolveFail: 'Resolve failed: {error}',
    statusResolveCount: '{name} - {count} files found',
    statusNeedResolve: 'Please resolve voices first.',
    statusNeedSelect: 'Select at least one file.',
    statusDownloading: 'Downloading...',
    statusDownloadFail: 'Download failed: {error}',
    statusDownloadDone: 'Download complete',
    progressLabel: 'Download progress',
    progressFile: 'Current file: {file}',
    resultEmpty: 'No search results.',
    nameMissing: 'Unknown',
  },
};

function t(key, vars = {}) {
  const dict = translations[currentLanguage] || translations.ko;
  let text = dict[key] || key;
  Object.entries(vars).forEach(([name, value]) => {
    text = text.replace(`{${name}}`, value);
  });
  return text;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  });
}

function setLanguage(lang) {
  currentLanguage = lang === 'en' ? 'en' : 'ko';
  langSelect.value = currentLanguage;
  document.documentElement.lang = currentLanguage === 'en' ? 'en' : 'ko';
  localStorage.setItem('language', currentLanguage);
  applyTranslations();
}

function setTheme(isDark, persist = true) {
  themeToggle.checked = isDark;
  document.body.dataset.theme = isDark ? 'dark' : 'light';
  if (persist) {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }
}

function formatStudentLabel(item) {
  const korean = item.koreanName || t('nameMissing');
  const english = item.englishName || '';
  if (currentLanguage === 'en') {
    return english ? `${english}${item.koreanName ? ` (${item.koreanName})` : ''}` : korean;
  }
  return english ? `${korean} (${english})` : korean;
}

function setVoiceStatus(text) {
  voiceStatus.textContent = text;
}

function renderSearchItems(items) {
  searchResult.innerHTML = '';

  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = t('resultEmpty');
    searchResult.appendChild(li);
    return;
  }

  items.forEach((item, idx) => {
    const li = document.createElement('li');
    li.textContent = formatStudentLabel(item);

    li.addEventListener('click', () => {
      selectedStudent = item;
      studentInput.value = item.koreanName || item.englishName;

      Array.from(searchResult.children).forEach((child) => {
        child.classList.remove('active');
      });
      li.classList.add('active');

      setVoiceStatus(t('statusSelected', { name: formatStudentLabel(item) }));
    });

    if (idx === 0 && !selectedStudent) {
      li.classList.add('active');
      selectedStudent = item;
    }

    searchResult.appendChild(li);
  });
}

function renderVoiceList(fileTitles) {
  voiceList.innerHTML = '';

  fileTitles.forEach((file) => {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'file-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.fileTitle = file;

    const label = document.createElement('span');
    label.textContent = file.replace(/^File:/, '');

    row.appendChild(checkbox);
    row.appendChild(label);
    li.appendChild(row);
    voiceList.appendChild(li);
  });
}

async function doSearch() {
  const query = studentInput.value.trim();
  if (!query) {
    setVoiceStatus(t('statusNeedName'));
    return;
  }

  try {
    const items = await window.voiceApi.searchStudents(query);
    selectedStudent = items[0] || null;
    renderSearchItems(items);
  } catch (error) {
    setVoiceStatus(t('statusSearchFail', { error: error.message }));
  }
}

searchBtn.addEventListener('click', doSearch);
studentInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    doSearch();
  }
});

resolveBtn.addEventListener('click', async () => {
  const query = studentInput.value.trim();
  if (!query) {
    setVoiceStatus(t('statusNeedName'));
    return;
  }

  setVoiceStatus(t('statusResolving'));
  try {
    const result = await window.voiceApi.resolveVoices(query);
    if (!result.ok) {
      setVoiceStatus(result.message);
      downloadBtn.disabled = true;
      voiceList.innerHTML = '';
      resolvedFileLinksByTitle = {};
      return;
    }

    selectedStudent = result.student;
    resolvedFiles = result.fileTitles;
    resolvedFileLinksByTitle = result.fileLinksByTitle || {};
    renderVoiceList(resolvedFiles);
    downloadBtn.disabled = resolvedFiles.length === 0;

    setVoiceStatus(
      t('statusResolveCount', {
        name: formatStudentLabel(result.student),
        count: resolvedFiles.length,
      })
    );
  } catch (error) {
    setVoiceStatus(t('statusResolveFail', { error: error.message }));
  }
});

downloadBtn.addEventListener('click', async () => {
  if (!selectedStudent || !resolvedFiles.length) {
    setVoiceStatus(t('statusNeedResolve'));
    return;
  }

  const selectedFiles = Array.from(
    voiceList.querySelectorAll('input[type="checkbox"]:checked')
  ).map((node) => node.dataset.fileTitle);

  if (!selectedFiles.length) {
    setVoiceStatus(t('statusNeedSelect'));
    return;
  }

  setVoiceStatus(t('statusDownloading'));
  progressArea.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressValue.textContent = `0 / ${selectedFiles.length}`;
  progressFile.textContent = '';
  try {
    const result = await window.voiceApi.downloadVoices({
      studentName: selectedStudent.koreanName || selectedStudent.englishName || 'unknown',
      fileTitles: selectedFiles,
      fileLinksByTitle: resolvedFileLinksByTitle,
      language: currentLanguage,
    });

    setVoiceStatus(result.message || t('statusDownloadDone'));
    setTimeout(() => {
      progressArea.classList.add('hidden');
    }, 1500);
  } catch (error) {
    setVoiceStatus(t('statusDownloadFail', { error: error.message }));
    setTimeout(() => {
      progressArea.classList.add('hidden');
    }, 1500);
  }
});

window.voiceApi.onDownloadProgress((payload) => {
  if (!payload || !payload.total) {
    return;
  }
  progressArea.classList.remove('hidden');
  const completed = payload.completed || 0;
  const total = payload.total || 0;
  progressValue.textContent = `${completed} / ${total}`;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  progressFill.style.width = `${percent}%`;
  if (payload.currentFile) {
    progressFile.textContent = t('progressFile', {
      file: payload.currentFile.replace(/^File:/, ''),
    });
  }
});

langSelect.addEventListener('change', (event) => {
  setLanguage(event.target.value);
});

themeToggle.addEventListener('change', (event) => {
  setTheme(event.target.checked, true);
});

const savedLanguage = localStorage.getItem('language');
const savedTheme = localStorage.getItem('theme');
setLanguage(savedLanguage || 'ko');
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
const hasSavedTheme = savedTheme === 'dark' || savedTheme === 'light';
setTheme(hasSavedTheme ? savedTheme === 'dark' : systemPrefersDark.matches, hasSavedTheme);
systemPrefersDark.addEventListener('change', (event) => {
  const currentSavedTheme = localStorage.getItem('theme');
  if (currentSavedTheme === 'dark' || currentSavedTheme === 'light') {
    return;
  }
  setTheme(event.matches, false);
});
