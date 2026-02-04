const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');
const Fuse = require('fuse.js');

const {
  MAP_CACHE_FILE,
  VOICE_LINK_CACHE_FILE,
  BUNDLED_STUDENT_MAP_RELATIVE_PATH,
  BUNDLED_VOICE_LINK_MAP_RELATIVE_PATH,
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

function getVoiceCachePath(userDataDir) {
  return path.join(userDataDir, VOICE_LINK_CACHE_FILE);
}

function getBundledStudentMapPath() {
  return path.join(__dirname, '..', BUNDLED_STUDENT_MAP_RELATIVE_PATH);
}

function getBundledVoiceMapPath() {
  return path.join(__dirname, '..', BUNDLED_VOICE_LINK_MAP_RELATIVE_PATH);
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

function readVoiceCache(userDataDir) {
  const cachePath = getVoiceCachePath(userDataDir);
  const cache = readCache(cachePath);
  if (!cache || typeof cache !== 'object') {
    return { updatedAt: 0, students: {} };
  }
  if (!cache.students || typeof cache.students !== 'object') {
    return { updatedAt: cache.updatedAt || 0, students: {} };
  }
  return cache;
}

function writeVoiceCache(userDataDir, cache) {
  const cachePath = getVoiceCachePath(userDataDir);
  writeCache(cachePath, cache);
}

function readBundledVoiceMap() {
  const bundledPath = getBundledVoiceMapPath();
  const payload = readCache(bundledPath);
  if (!payload || typeof payload !== 'object' || typeof payload.students !== 'object') {
    return { updatedAt: 0, students: {} };
  }
  return payload;
}

function buildFileLinksByTitle(cachedEntry) {
  const map = {};
  if (!cachedEntry || typeof cachedEntry !== 'object') {
    return map;
  }

  if (Array.isArray(cachedEntry.files)) {
    for (const file of cachedEntry.files) {
      if (!file?.fileTitle) {
        continue;
      }
      const links = Array.isArray(file.links) ? file.links.filter(Boolean) : [];
      if (links.length) {
        map[file.fileTitle] = links;
      }
    }
  }

  if (Array.isArray(cachedEntry.links)) {
    for (const entry of cachedEntry.links) {
      if (!entry?.fileTitle || !entry?.url) {
        continue;
      }
      if (!map[entry.fileTitle]) {
        map[entry.fileTitle] = [];
      }
      if (!map[entry.fileTitle].includes(entry.url)) {
        map[entry.fileTitle].push(entry.url);
      }
    }
  }

  return map;
}

async function loadStudentMap(userDataDir, forceRefresh = false) {
  const cachePath = getCachePath(userDataDir);
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

  if (forceRefresh) {
    return [];
  }
  return [];
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
    message: `학생 목록 ${students.length}명을 로컬 데이터로 갱신했습니다.`,
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

function toLocalDownloadName(fileTitle, url) {
  const rawName = decodeURIComponent((fileTitle || '').replace(/^File:/, '').trim()) || 'unknown';
  if (url && /\.ogg\.mp3(\?|$)/i.test(url)) {
    return rawName.replace(/\.ogg$/i, '.mp3');
  }
  return rawName;
}

function createZipFromDirectory(sourceDir, zipPath) {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${zipPath}" -Force`,
      ],
      { stdio: 'ignore' }
    );
    return;
  }

  execFileSync('zip', ['-rq', zipPath, '.'], { cwd: sourceDir, stdio: 'ignore' });
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
  const cacheKey = picked.href || picked.englishName || picked.koreanName;
  const bundledVoiceMap = readBundledVoiceMap();
  const voiceCache = readVoiceCache(userDataDir);
  const cachedEntry = cacheKey
    ? voiceCache.students?.[cacheKey] || bundledVoiceMap.students?.[cacheKey]
    : null;
  if (cachedEntry?.audioTitle && Array.isArray(cachedEntry.fileTitles) && cachedEntry.fileTitles.length) {
    return {
      ok: true,
      student: picked,
      audioTitle: cachedEntry.audioTitle,
      fileTitles: cachedEntry.fileTitles,
      fileLinksByTitle: buildFileLinksByTitle(cachedEntry),
      fromCache: true,
    };
  }

  return {
    ok: false,
    message: '음성 링크 DB에 데이터가 없습니다. 먼저 voices:sync로 링크 DB를 생성해주세요.',
    student: picked,
  };
}

async function downloadVoiceFiles(studentName, fileTitles, targetBaseDir, fileLinksByTitle = {}) {
  if (!fileTitles?.length) {
    return {
      ok: false,
      message: '다운로드할 파일이 없습니다.',
    };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-voice-'));
  const downloadRoot = path.join(tempRoot, sanitizeForDir(studentName));
  ensureDir(downloadRoot);

  const { buildStaticAudioUrl } = getScraper();
  const results = [];
  for (const fileTitle of fileTitles) {
    const candidates = [];
    const cachedLinks = Array.isArray(fileLinksByTitle?.[fileTitle])
      ? fileLinksByTitle[fileTitle].filter(Boolean)
      : [];
    candidates.push(...cachedLinks);
    const fallback = buildStaticAudioUrl(fileTitle);
    if (fallback) {
      candidates.push(fallback);
    }

    if (!candidates.length) {
      results.push({
        fileTitle,
        ok: false,
        reason: 'URL 생성 실패',
      });
      continue;
    }

    let downloaded = false;
    let lastError = null;
    for (const url of candidates) {
      const localName = toLocalDownloadName(fileTitle, url);
      const localPath = path.join(downloadRoot, localName);
      try {
        const response = await http.get(url);
        fs.writeFileSync(localPath, Buffer.from(response.data));
        results.push({
          fileTitle,
          ok: true,
          path: localPath,
          url,
        });
        downloaded = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!downloaded) {
      results.push({
        fileTitle,
        ok: false,
        reason: lastError?.message || '다운로드 실패',
      });
    }
  }

  const successCount = results.filter((entry) => entry.ok).length;
  if (successCount > 0) {
    const zipName = `${sanitizeForDir(studentName)}.zip`;
    const zipPath = path.join(targetBaseDir, zipName);
    try {
      createZipFromDirectory(downloadRoot, zipPath);
    } catch (error) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      return {
        ok: false,
        successCount,
        totalCount: results.length,
        results,
        message: `ZIP 생성 실패: ${error.message}`,
      };
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return {
      ok: true,
      successCount,
      totalCount: results.length,
      zipPath,
      results,
      message: `${successCount}/${results.length} 파일 다운로드 완료 (${zipName})`,
    };
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
  return {
    ok: false,
    successCount,
    totalCount: results.length,
    results,
    message: `${successCount}/${results.length} 파일 다운로드 실패`,
  };
}

module.exports = {
  refreshStudentMap,
  searchStudents,
  resolveStudentAndVoices,
  downloadVoiceFiles,
};
