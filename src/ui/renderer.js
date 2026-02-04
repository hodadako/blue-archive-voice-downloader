const studentInput = document.getElementById('studentInput');
const refreshBtn = document.getElementById('refreshBtn');
const searchBtn = document.getElementById('searchBtn');
const resolveBtn = document.getElementById('resolveBtn');
const downloadBtn = document.getElementById('downloadBtn');

const refreshStatus = document.getElementById('refreshStatus');
const voiceStatus = document.getElementById('voiceStatus');
const searchResult = document.getElementById('searchResult');
const voiceList = document.getElementById('voiceList');

let selectedStudent = null;
let resolvedFiles = [];

function formatStudentLabel(item) {
  const base = item.koreanName || '이름없음';
  const english = item.englishName ? ` (${item.englishName})` : '';
  return `${base}${english}`;
}

function setRefreshStatus(text) {
  refreshStatus.textContent = text;
}

function setVoiceStatus(text) {
  voiceStatus.textContent = text;
}

function renderSearchItems(items) {
  searchResult.innerHTML = '';

  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = '검색 결과가 없습니다.';
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

      setVoiceStatus(`${formatStudentLabel(item)} 선택됨. 음성 파일 조회를 눌러주세요.`);
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
    setVoiceStatus('학생 이름을 입력해주세요.');
    return;
  }

  try {
    const items = await window.voiceApi.searchStudents(query);
    selectedStudent = items[0] || null;
    renderSearchItems(items);
  } catch (error) {
    setVoiceStatus(`검색 실패: ${error.message}`);
  }
}

refreshBtn.addEventListener('click', async () => {
  setRefreshStatus('학생 목록 갱신 중...');
  try {
    const result = await window.voiceApi.refreshStudents();
    setRefreshStatus(result.message);
  } catch (error) {
    setRefreshStatus(`갱신 실패: ${error.message}`);
  }
});

searchBtn.addEventListener('click', doSearch);
studentInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    doSearch();
  }
});

resolveBtn.addEventListener('click', async () => {
  const query = studentInput.value.trim();
  if (!query) {
    setVoiceStatus('학생 이름을 입력해주세요.');
    return;
  }

  setVoiceStatus('음성 파일 조회 중...');
  try {
    const result = await window.voiceApi.resolveVoices(query);
    if (!result.ok) {
      setVoiceStatus(result.message);
      downloadBtn.disabled = true;
      voiceList.innerHTML = '';
      return;
    }

    selectedStudent = result.student;
    resolvedFiles = result.fileTitles;
    renderVoiceList(resolvedFiles);
    downloadBtn.disabled = resolvedFiles.length === 0;

    setVoiceStatus(
      `${formatStudentLabel(result.student)} - ${resolvedFiles.length}개 파일 발견`
    );
  } catch (error) {
    setVoiceStatus(`조회 실패: ${error.message}`);
  }
});

downloadBtn.addEventListener('click', async () => {
  if (!selectedStudent || !resolvedFiles.length) {
    setVoiceStatus('먼저 음성 파일을 조회해주세요.');
    return;
  }

  const selectedFiles = Array.from(
    voiceList.querySelectorAll('input[type="checkbox"]:checked')
  ).map((node) => node.dataset.fileTitle);

  if (!selectedFiles.length) {
    setVoiceStatus('최소 1개 파일을 선택해주세요.');
    return;
  }

  setVoiceStatus('다운로드 중...');
  try {
    const result = await window.voiceApi.downloadVoices({
      studentName: selectedStudent.koreanName || selectedStudent.englishName || 'unknown',
      fileTitles: selectedFiles,
    });

    setVoiceStatus(result.message || '다운로드 완료');
  } catch (error) {
    setVoiceStatus(`다운로드 실패: ${error.message}`);
  }
});
