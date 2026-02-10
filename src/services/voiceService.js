const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
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
  const baseKoreanName = (student?.baseKoreanName || '').trim() || null;
  const baseEnglishName = (student?.baseEnglishName || '').trim() || null;
  const typeKey = (student?.typeKey || '').trim() || null;
  const koreanType = (student?.koreanType || '').trim() || null;
  const englishType = (student?.englishType || '').trim() || null;
  const wikiSearchName =
    (student?.wikiSearchName || '').trim() ||
    (englishName ? englishName.replace(/[_-]+/g, ' ') : '');

  const searchText = [
    koreanName,
    englishName,
    baseKoreanName,
    baseEnglishName,
    typeKey,
    koreanType,
    englishType,
    wikiSearchName,
  ]
    .filter(Boolean)
    .join(' ');

  const imageUrl = normalizeImageUrl(student?.imageUrl);

  return {
    href: student?.href || '',
    englishName,
    koreanName,
    baseEnglishName,
    baseKoreanName,
    typeKey,
    englishType,
    koreanType,
    wikiSearchName: wikiSearchName || englishName || koreanName || '',
    imageUrl,
    searchText,
  };
}

function normalizeStudents(students) {
  return (students || [])
    .map(normalizeStudentEntry)
    .filter((student) => student.href && (student.englishName || student.koreanName));
}

function normalizeImageUrl(rawImageUrl) {
  const raw = String(rawImageUrl || '').trim();
  if (!raw) {
    return null;
  }
  if (/^(https?:)?\/\//i.test(raw) || /^data:/i.test(raw) || /^file:/i.test(raw)) {
    return raw;
  }

  const normalizedRelative = raw.replace(/^\.?\//, '');
  const localPath = path.join(__dirname, '..', normalizedRelative);
  if (!fs.existsSync(localPath)) {
    return null;
  }
  return pathToFileURL(localPath).toString();
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

function normalizeLatinText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_()\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scoreHangulCandidate(candidate, query) {
  if (!candidate || !query) {
    return null;
  }
  if (candidate === query) {
    return 0;
  }
  if (candidate.startsWith(query)) {
    return 1;
  }
  if (candidate.includes(query)) {
    return 2;
  }
  return null;
}

function scoreLatinCandidate(candidate, query) {
  if (!candidate || !query) {
    return null;
  }

  const normalizedCandidate = normalizeLatinText(candidate);
  if (!normalizedCandidate) {
    return null;
  }

  if (normalizedCandidate === query) {
    return 0;
  }
  if (normalizedCandidate.startsWith(query)) {
    return 1;
  }

  const tokenPrefixMatch = normalizedCandidate
    .split(' ')
    .filter(Boolean)
    .some((token) => token.startsWith(query));
  if (tokenPrefixMatch) {
    return 2;
  }

  const boundaryPattern = new RegExp(`(^|\\s)${escapeRegExp(query)}`);
  if (boundaryPattern.test(normalizedCandidate)) {
    return 3;
  }

  return null;
}

function rankStudentsByQuery(students, rawQuery) {
  const isHangulQuery = hasHangul(rawQuery);
  const normalizedQuery = isHangulQuery ? rawQuery.trim() : normalizeLatinText(rawQuery);
  if (!normalizedQuery) {
    return [];
  }

  const ranked = [];
  for (const student of students) {
    let bestScore = null;
    if (isHangulQuery) {
      const candidates = [student.koreanName, student.baseKoreanName];
      for (const candidate of candidates) {
        const score = scoreHangulCandidate(String(candidate || '').trim(), normalizedQuery);
        if (score === null) {
          continue;
        }
        bestScore = bestScore === null ? score : Math.min(bestScore, score);
      }
    } else {
      const candidates = [student.englishName, student.baseEnglishName, student.wikiSearchName];
      for (const candidate of candidates) {
        const score = scoreLatinCandidate(candidate, normalizedQuery);
        if (score === null) {
          continue;
        }
        bestScore = bestScore === null ? score : Math.min(bestScore, score);
      }
    }

    if (bestScore === null) {
      continue;
    }
    ranked.push({ student, score: bestScore });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    const aName = (a.student.englishName || a.student.koreanName || '').toLowerCase();
    const bName = (b.student.englishName || b.student.koreanName || '').toLowerCase();
    return aName.localeCompare(bName);
  });

  return ranked.map((entry) => entry.student);
}

function buildFuse(students) {
  return new Fuse(students, {
    includeScore: true,
    threshold: 0.24,
    ignoreLocation: true,
    keys: ['englishName', 'koreanName', 'baseEnglishName', 'baseKoreanName', 'wikiSearchName'],
  });
}

async function searchStudents(userDataDir, query) {
  const q = (query || '').trim();
  if (!q) {
    return [];
  }

  const students = await loadStudentMap(userDataDir, false);
  const ranked = rankStudentsByQuery(students, q);
  if (ranked.length > 0) {
    return ranked.slice(0, 15);
  }

  const fuse = buildFuse(students);
  const matches = fuse.search(q).map((entry) => entry.item);
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

function logDownload(level, message, extra = null) {
  const stamp = new Date().toISOString();
  const line = `[voice-download][${stamp}] ${message}`;
  if (level === 'error') {
    if (extra) {
      console.error(line, extra);
      return;
    }
    console.error(line);
    return;
  }
  if (extra) {
    console.log(line, extra);
    return;
  }
  console.log(line);
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

async function downloadVoiceFiles(
  studentName,
  fileTitles,
  targetBaseDir,
  fileLinksByTitle = {},
  onProgress
) {
  if (!fileTitles?.length) {
    return {
      ok: false,
      message: '다운로드할 파일이 없습니다.',
    };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-voice-'));
  const downloadRoot = path.join(tempRoot, sanitizeForDir(studentName));
  ensureDir(downloadRoot);
  logDownload('info', `start student="${studentName}" files=${fileTitles.length}`);

  const { buildStaticAudioUrl } = getScraper();
  const results = [];
  const totalCount = fileTitles.length;
  let completedCount = 0;
  if (typeof onProgress === 'function') {
    onProgress({
      completed: completedCount,
      total: totalCount,
      currentFile: null,
    });
  }
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
      logDownload('error', `no candidates student="${studentName}" file="${fileTitle}"`);
      results.push({
        fileTitle,
        ok: false,
        reason: 'URL 생성 실패',
      });
      completedCount += 1;
      if (typeof onProgress === 'function') {
        onProgress({
          completed: completedCount,
          total: totalCount,
          currentFile: fileTitle,
          ok: false,
          reason: 'URL 생성 실패',
        });
      }
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
        logDownload(
          'error',
          `request failed student="${studentName}" file="${fileTitle}" url="${url}"`,
          { message: error?.message || 'unknown error' }
        );
      }
    }

    if (!downloaded) {
      logDownload('error', `all urls failed student="${studentName}" file="${fileTitle}"`, {
        candidates,
        lastError: lastError?.message || '다운로드 실패',
      });
      results.push({
        fileTitle,
        ok: false,
        reason: lastError?.message || '다운로드 실패',
      });
    }
    completedCount += 1;
    if (typeof onProgress === 'function') {
      const lastResult = results[results.length - 1];
      onProgress({
        completed: completedCount,
        total: totalCount,
        currentFile: fileTitle,
        ok: lastResult?.ok ?? false,
        reason: lastResult?.reason ?? null,
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
      logDownload('error', `zip failed student="${studentName}" zip="${zipPath}"`, {
        message: error?.message || 'unknown error',
      });
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
    logDownload('info', `done student="${studentName}" success=${successCount}/${results.length}`);
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
  logDownload('error', `done with no success student="${studentName}" total=${results.length}`);
  return {
    ok: false,
    successCount,
    totalCount: results.length,
    results,
    message: `${successCount}/${results.length} 파일 다운로드 실패`,
  };
}

module.exports = {
  searchStudents,
  resolveStudentAndVoices,
  downloadVoiceFiles,
};
