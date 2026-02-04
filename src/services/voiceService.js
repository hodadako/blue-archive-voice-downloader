const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Fuse = require('fuse.js');

const {
  MAP_CACHE_FILE,
  MAP_CACHE_TTL_MS,
  USER_AGENT,
} = require('./constants');
const {
  fetchBlueUtilsStudents,
  searchAudioPagesByName,
  fetchAudioFileTitles,
  fetchImageUrlsByFileTitles,
} = require('./scraper');

const http = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': USER_AGENT,
  },
  responseType: 'arraybuffer',
});

function ensureDir(target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

function readCache(cachePath) {
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const json = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return json;
  } catch (_error) {
    return null;
  }
}

function writeCache(cachePath, payload) {
  ensureDir(path.dirname(cachePath));
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');
}

function getCachePath(userDataDir) {
  return path.join(userDataDir, MAP_CACHE_FILE);
}

function isCacheFresh(cache) {
  if (!cache?.updatedAt) {
    return false;
  }
  return Date.now() - cache.updatedAt < MAP_CACHE_TTL_MS;
}

async function loadStudentMap(userDataDir, forceRefresh = false) {
  const cachePath = getCachePath(userDataDir);
  const cache = readCache(cachePath);

  if (!forceRefresh && isCacheFresh(cache)) {
    return cache.students;
  }

  const students = await fetchBlueUtilsStudents();
  const payload = {
    updatedAt: Date.now(),
    students,
  };
  writeCache(cachePath, payload);
  return students;
}

function hasHangul(value) {
  return /[가-힣]/.test(value || '');
}

function buildFuse(students) {
  return new Fuse(students, {
    includeScore: true,
    threshold: 0.4,
    keys: ['englishName', 'koreanName'],
  });
}

async function refreshStudentMap(userDataDir) {
  const students = await loadStudentMap(userDataDir, true);
  return {
    ok: true,
    count: students.length,
    message: `학생 목록 ${students.length}명을 갱신했습니다.`,
  };
}

async function searchStudents(userDataDir, query) {
  const q = (query || '').trim();
  if (!q) {
    return [];
  }

  const students = await loadStudentMap(userDataDir, false);
  const fuse = buildFuse(students);

  let matches = fuse.search(q).map((entry) => entry.item);

  if (hasHangul(q)) {
    const exact = students.filter((s) => s.koreanName === q);
    matches = [...exact, ...matches];
  }

  const dedup = new Map();
  for (const item of matches) {
    const key = item.href;
    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  }

  return Array.from(dedup.values()).slice(0, 15);
}

function sanitizeForDir(name) {
  return (name || 'unknown')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
}

async function resolveStudentAndVoices(userDataDir, studentName) {
  const searchResult = await searchStudents(userDataDir, studentName);
  if (!searchResult.length) {
    return {
      ok: false,
      message: '학생을 찾지 못했습니다. 검색어를 바꿔보세요.',
    };
  }

  const picked = searchResult[0];
  const audioTitle = await searchAudioPagesByName(picked.englishName);

  if (!audioTitle) {
    return {
      ok: false,
      message: `${picked.englishName}의 오디오 페이지를 찾지 못했습니다.`,
      student: picked,
    };
  }

  const fileTitles = await fetchAudioFileTitles(audioTitle);

  if (!fileTitles.length) {
    return {
      ok: false,
      message: `${audioTitle}에서 음성 파일을 찾지 못했습니다.`,
      student: picked,
      audioTitle,
    };
  }

  return {
    ok: true,
    student: picked,
    audioTitle,
    fileTitles,
  };
}

async function downloadVoiceFiles(studentName, fileTitles, targetBaseDir) {
  if (!fileTitles?.length) {
    return {
      ok: false,
      message: '다운로드할 파일이 없습니다.',
    };
  }

  const fileToUrl = await fetchImageUrlsByFileTitles(fileTitles);
  const downloadRoot = path.join(targetBaseDir, sanitizeForDir(studentName));
  ensureDir(downloadRoot);

  const results = [];
  for (const fileTitle of fileTitles) {
    const url = fileToUrl[fileTitle];
    if (!url) {
      results.push({
        fileTitle,
        ok: false,
        reason: 'URL 매핑 실패',
      });
      continue;
    }

    const localName = fileTitle.replace(/^File:/, '');
    const localPath = path.join(downloadRoot, localName);

    try {
      const response = await http.get(url);
      fs.writeFileSync(localPath, Buffer.from(response.data));
      results.push({
        fileTitle,
        ok: true,
        path: localPath,
      });
    } catch (error) {
      results.push({
        fileTitle,
        ok: false,
        reason: error.message,
      });
    }
  }

  const successCount = results.filter((entry) => entry.ok).length;
  return {
    ok: successCount > 0,
    successCount,
    totalCount: results.length,
    targetDir: downloadRoot,
    results,
    message: `${successCount}/${results.length} 파일 다운로드 완료`,
  };
}

module.exports = {
  refreshStudentMap,
  searchStudents,
  resolveStudentAndVoices,
  downloadVoiceFiles,
};
