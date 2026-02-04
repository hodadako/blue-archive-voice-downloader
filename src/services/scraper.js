if (typeof global.File === 'undefined') {
  global.File = class File {};
}
if (typeof globalThis.File === 'undefined') {
  globalThis.File = global.File;
}

const axios = require('axios');
const crypto = require('crypto');
const cheerio = require('cheerio');

const {
  BLUE_UTILS_STUDENT_URLS,
  BLUE_UTILS_KO_STUDENT_URLS,
  USER_AGENT,
} = require('./constants');

const http = axios.create({
  timeout: 20000,
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  },
});

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function hasHangul(value) {
  return /[가-힣]/.test(value || '');
}

function normalizeHref(href) {
  if (!href) {
    return '';
  }
  return href.replace(/^https?:\/\/[^/]+/i, '').replace(/\/$/, '');
}

function getHrefSlug(href) {
  const normalized = normalizeHref(href);
  return decodeURIComponent(normalized.split('/').filter(Boolean).pop() || '');
}

function toEnglishSlugName(href) {
  return normalizeText(getHrefSlug(href).toLowerCase());
}

function toWikiSearchNameFromSlug(href) {
  const slug = getHrefSlug(href);
  if (!slug) {
    return '';
  }
  return normalizeText(slug.replace(/[_-]+/g, ' '));
}

function toKoreanNameFromBlueUtilsLabel(label) {
  const words = normalizeText(label).split(' ').filter(Boolean);
  if (!words.length) {
    return null;
  }

  const base = words[1] || words[0];
  const variant = words[words.length - 1];
  if (variant && variant !== '없음') {
    return `${base}_${variant}`;
  }
  return base;
}

async function fetchHtml(url) {
  const response = await http.get(url);
  return response.data;
}

function decodeWikiTitleFromHref(href) {
  const normalized = normalizeHref(href);
  const idx = normalized.toLowerCase().indexOf('/wiki/');
  if (idx < 0) {
    return null;
  }

  const titlePart = normalized.slice(idx + '/wiki/'.length);
  if (!titlePart || /^special:/i.test(titlePart) || /^file:/i.test(titlePart)) {
    return null;
  }

  return decodeURIComponent(titlePart.replace(/_/g, ' '));
}

function toWikiPageUrl(baseUrl, title) {
  const normalizedTitle = normalizeText(title).replace(/\s+/g, '_');
  const encodedTitle = encodeURIComponent(normalizedTitle).replace(/%2F/g, '/');
  return `${baseUrl}/wiki/${encodedTitle}`;
}

function parseStudentLinks(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('a[href]').each((_idx, el) => {
    const href = normalizeHref($(el).attr('href'));
    const label = normalizeText($(el).text());

    if (!label || !href) {
      return;
    }

    const lowerHref = href.toLowerCase();
    const seemsStudentPage =
      lowerHref.includes('/student/') ||
      lowerHref.includes('/students/') ||
      /^\/(student|students)\b/.test(lowerHref);

    if (!seemsStudentPage) {
      return;
    }

    results.push({ href, label });
  });

  const deduped = new Map();
  for (const item of results) {
    const key = `${item.href}::${item.label}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values());
}

async function fetchStudentListFromCandidates(candidates) {
  let lastError;
  for (const url of candidates) {
    try {
      const html = await fetchHtml(url);
      const parsed = parseStudentLinks(html);
      if (parsed.length > 0) {
        return { url, students: parsed };
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('학생 목록을 찾지 못했습니다.');
}

async function fetchBlueUtilsStudents() {
  const enList = await fetchStudentListFromCandidates(BLUE_UTILS_STUDENT_URLS);

  let koList;
  try {
    koList = await fetchStudentListFromCandidates(BLUE_UTILS_KO_STUDENT_URLS);
  } catch (_error) {
    koList = { students: [] };
  }

  const koByHref = new Map();
  for (const entry of koList.students) {
    const href = normalizeHref(entry.href);
    if (hasHangul(entry.label)) {
      koByHref.set(href, entry.label);
    }
  }

  const merged = [];
  for (const entry of enList.students) {
    const href = normalizeHref(entry.href);
    const koreanLabel = koByHref.get(href) || '';
    const englishName = toEnglishSlugName(href) || null;
    const koreanName = toKoreanNameFromBlueUtilsLabel(koreanLabel);

    merged.push({
      href,
      englishName,
      koreanName,
      wikiSearchName: toWikiSearchNameFromSlug(href) || normalizeText(entry.label) || englishName,
    });
  }

  return merged;
}

async function searchAudioPageByWeb(name, baseUrl) {
  const query = `${normalizeText(name)}/audio`;
  const url = `${baseUrl}/wiki/Special:Search?query=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  let bestTitle = null;
  $('a[href*="/wiki/"]').each((_idx, el) => {
    if (bestTitle) {
      return;
    }
    const href = $(el).attr('href') || '';
    const title = decodeWikiTitleFromHref(href);
    if (!title) {
      return;
    }
    if (/\/audio$/i.test(title)) {
      bestTitle = title;
    }
  });

  if (bestTitle) {
    return bestTitle;
  }

  const fallbackTitle = `${normalizeText(name).replace(/\b\w/g, (m) => m.toUpperCase())}/audio`;
  return fallbackTitle;
}

async function fetchAudioFileTitlesFromWikiPage(audioPageTitle, baseUrl) {
  const url = toWikiPageUrl(baseUrl, audioPageTitle);
  const html = await fetchHtml(url);
  return parseFileTitlesFromHtml(html);
}

async function resolveAudioFilesWithoutApi(name) {
  const bases = ['https://bluearchive.wiki', 'https://bluearchive.fandom.com'];
  let lastError;

  for (const baseUrl of bases) {
    try {
      const audioTitle = await searchAudioPageByWeb(name, baseUrl);
      const fileTitles = await fetchAudioFileTitlesFromWikiPage(audioTitle, baseUrl);
      if (fileTitles.length) {
        return { audioTitle, fileTitles, baseUrl };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  return { audioTitle: null, fileTitles: [], baseUrl: null };
}

function toAbsoluteUrl(baseUrl, href) {
  if (!href) {
    return null;
  }

  try {
    if (/^https?:\/\//i.test(href)) {
      return href;
    }
    if (href.startsWith('//')) {
      return `https:${href}`;
    }
    return new URL(href, baseUrl).toString();
  } catch (_error) {
    return null;
  }
}

function sortAudioLinkCandidates(urls) {
  return [...urls].sort((a, b) => {
    const score = (url) => {
      const lower = url.toLowerCase();
      let n = 0;
      if (lower.includes('static.wikitide.net')) n += 100;
      if (lower.includes('/transcoded/')) n += 80;
      if (/\.mp3(\?|$)/i.test(lower)) n += 60;
      if (/download/i.test(lower)) n += 30;
      if (/\.ogg(\?|$)/i.test(lower)) n += 20;
      return n;
    };
    return score(b) - score(a);
  });
}

async function fetchFilePageAudioLinks(fileTitle, baseUrl) {
  const title = normalizeText((fileTitle || '').replace(/^File:/i, ''));
  if (!title) {
    return [];
  }

  const url = toWikiPageUrl(baseUrl, `File:${title}`);
  const html = await fetchHtml(url);
  const $ = cheerio.load(html || '');
  const out = new Set();

  $('source[src], audio[src]').each((_idx, el) => {
    const src = ($(el).attr('src') || '').trim();
    if (!src) {
      return;
    }
    const abs = toAbsoluteUrl(baseUrl, src);
    if (!abs) {
      return;
    }
    const lower = abs.toLowerCase();
    if (/\.mp3(\?|$)/i.test(lower) || /\.ogg(\?|$)/i.test(lower) || lower.includes('/transcoded/')) {
      out.add(abs);
    }
  });

  $('a[href]').each((_idx, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href) {
      return;
    }
    const abs = toAbsoluteUrl(baseUrl, href);
    if (!abs) {
      return;
    }

    const lower = abs.toLowerCase();
    const seemsAudio =
      /\.mp3(\?|$)/i.test(lower) ||
      /\.ogg(\?|$)/i.test(lower) ||
      lower.includes('/transcoded/') ||
      (lower.includes('/wiki/special:redirect/file/') &&
        (lower.includes('.ogg') || lower.includes('.mp3')));

    if (seemsAudio) {
      out.add(abs);
    }
  });

  const fallback = buildStaticAudioUrl(fileTitle);
  if (fallback) {
    out.add(fallback);
  }

  return sortAudioLinkCandidates(Array.from(out));
}

async function resolveAudioFilesWithLinksWithoutApi(name) {
  const resolved = await resolveAudioFilesWithoutApi(name);
  if (!resolved.audioTitle || !resolved.fileTitles?.length || !resolved.baseUrl) {
    return {
      audioTitle: resolved.audioTitle,
      fileTitles: resolved.fileTitles || [],
      baseUrl: resolved.baseUrl || null,
      files: [],
    };
  }

  const files = [];
  for (const fileTitle of resolved.fileTitles) {
    const links = await fetchFilePageAudioLinks(fileTitle, resolved.baseUrl);
    files.push({ fileTitle, links });
  }

  return {
    audioTitle: resolved.audioTitle,
    fileTitles: resolved.fileTitles,
    baseUrl: resolved.baseUrl,
    files,
  };
}

function buildStaticAudioUrl(fileTitle) {
  const rawName = decodeURIComponent((fileTitle || '').replace(/^File:/, '').trim());
  const fileName = rawName.replace(/\s+/g, '_');
  if (!fileName) {
    return null;
  }

  const hash = crypto.createHash('md5').update(fileName).digest('hex');
  const encoded = encodeURIComponent(fileName);
  return `https://static.wikitide.net/bluearchivewiki/transcoded/${hash[0]}/${hash.slice(0, 2)}/${encoded}/${encoded}.mp3?download`;
}

function parseFileTitlesFromHtml(html) {
  const $ = cheerio.load(html || '');
  const set = new Set();

  $('[data-mwtitle]').each((_idx, el) => {
    const title = normalizeText($(el).attr('data-mwtitle') || '');
    if (!title) {
      return;
    }
    set.add(/^File:/i.test(title) ? title : `File:${title}`);
  });

  $('a[href]').each((_idx, el) => {
    const href = $(el).attr('href') || '';

    if (href.includes('/wiki/File:') && /\.ogg($|\?)/i.test(href)) {
      const filePart = decodeURIComponent(href.split('/wiki/File:')[1].split('?')[0]);
      set.add(`File:${filePart}`);
      return;
    }

    if (/\.ogg($|\?)/i.test(href)) {
      const fileName = decodeURIComponent(href.split('/').pop().split('?')[0]);
      if (fileName) {
        set.add(`File:${fileName}`);
      }
    }
  });

  return Array.from(set);
}

module.exports = {
  fetchBlueUtilsStudents,
  resolveAudioFilesWithoutApi,
  resolveAudioFilesWithLinksWithoutApi,
  buildStaticAudioUrl,
};
