const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const Fuse = require('fuse.js');

const {
  MAP_CACHE_FILE,
  BUNDLED_STUDENT_MAP_RELATIVE_PATH,
  BLUEARCHIVE_API_URL,
  BLUEARCHIVE_FANDOM_API_URL,
  USER_AGENT,
} = require('./constants');

function getScraper() {
  return require('./scraper');
}

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

function getBundledStudentMapPath() {
  return path.join(__dirname, '..', BUNDLED_STUDENT_MAP_RELATIVE_PATH);
}

function normalizeStudentEntry(student) {
  const koreanName = (student?.koreanName || '').trim() || null;
  const englishName = (student?.englishName || '').trim() || null;
  const wikiSearchName =
    (student?.wikiSearchName || '').trim() ||
    (englishName ? englishName.replace(/[_-]+/g, ' ') : '');

  const searchText = [
    koreanName,
    englishName,
    wikiSearchName,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    href: student?.href || '',
    englishName,
    koreanName,
    wikiSearchName: wikiSearchName || englishName || koreanName || '',
    searchText,
  };
}

function normalizeStudents(students) {
  return (students || [])
    .map(normalizeStudentEntry)
    .filter((student) => student.href && (student.englishName || student.koreanName));
}

function readBundledStudents() {
  const bundledPath = getBundledStudentMapPath();
  if (!fs.existsSync(bundledPath)) {
    return [];
  }

  try {
    const payload = JSON.parse(fs.readFileSync(bundledPath, 'utf8'));
    if (Array.isArray(payload)) {
      return normalizeStudents(payload);
    }
    if (Array.isArray(payload?.students)) {
      return normalizeStudents(payload.students);
    }
    return [];
  } catch (_error) {
    return [];
  }
}

async function loadStudentMap(userDataDir, forceRefresh = false) {
  const cachePath = getCachePath(userDataDir);
  if (!forceRefresh) {
    const bundledStudents = readBundledStudents();
    if (bundledStudents.length > 0) {
      writeCache(cachePath, {
        updatedAt: Date.now(),
        source: 'bundled',
        students: bundledStudents,
      });
      return bundledStudents;
    }

    const cache = readCache(cachePath);
    const cachedStudents = normalizeStudents(cache?.students);
    if (cachedStudents.length > 0) {
      return cachedStudents;
    }
  }

  const { fetchBlueUtilsStudents } = getScraper();
  const students = normalizeStudents(await fetchBlueUtilsStudents());
  const payload = {
    updatedAt: Date.now(),
    source: 'remote',
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
    keys: ['englishName', 'koreanName', 'searchText'],
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

function buildDirectAudioUrl(fileTitle) {
  const rawName = decodeURIComponent((fileTitle || '').replace(/^File:/, '').trim());
  const fileName = rawName.replace(/\s+/g, '_');
  if (!fileName) {
    return null;
  }

  const hash = crypto.createHash('md5').update(fileName).digest('hex');
  const encoded = encodeURIComponent(fileName);
  return `https://static.wikitide.net/bluearchivewiki/transcoded/${hash[0]}/${hash.slice(0, 2)}/${encoded}/${encoded}.mp3?download`;
}

function toLocalDownloadName(fileTitle, url) {
  const rawName = decodeURIComponent((fileTitle || '').replace(/^File:/, '').trim()) || 'unknown';
  if (url && /\.ogg\.mp3(\?|$)/i.test(url)) {
    return rawName.replace(/\.ogg$/i, '.mp3');
  }
  return rawName;
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
  const { searchAudioPagesByName, fetchAudioFileTitles } = getScraper();
  const audioQuery = picked.wikiSearchName || picked.englishName;
  let audioTitle = await searchAudioPagesByName(audioQuery, BLUEARCHIVE_API_URL);
  let audioApiUrl = BLUEARCHIVE_API_URL;

  if (!audioTitle) {
    audioTitle = await searchAudioPagesByName(audioQuery, BLUEARCHIVE_FANDOM_API_URL);
    audioApiUrl = BLUEARCHIVE_FANDOM_API_URL;
  }

  if (!audioTitle) {
    return {
      ok: false,
      message: `${audioQuery}의 오디오 페이지를 찾지 못했습니다.`,
      student: picked,
    };
  }

  let fileTitles = await fetchAudioFileTitles(audioTitle, audioApiUrl);

  if (!fileTitles.length && audioApiUrl !== BLUEARCHIVE_FANDOM_API_URL) {
    const fandomAudioTitle = await searchAudioPagesByName(audioQuery, BLUEARCHIVE_FANDOM_API_URL);
    if (fandomAudioTitle) {
      const fandomFileTitles = await fetchAudioFileTitles(
        fandomAudioTitle,
        BLUEARCHIVE_FANDOM_API_URL
      );
      if (fandomFileTitles.length) {
        audioTitle = fandomAudioTitle;
        audioApiUrl = BLUEARCHIVE_FANDOM_API_URL;
        fileTitles = fandomFileTitles;
      }
    }
  }

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

  const downloadRoot = path.join(targetBaseDir, sanitizeForDir(studentName));
  ensureDir(downloadRoot);

  const results = [];
  for (const fileTitle of fileTitles) {
    const url = buildDirectAudioUrl(fileTitle);
    if (!url) {
      results.push({
        fileTitle,
        ok: false,
        reason: 'URL 생성 실패',
      });
      continue;
    }

    const localName = toLocalDownloadName(fileTitle, url);
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
