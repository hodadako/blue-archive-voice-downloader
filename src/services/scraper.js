const axios = require('axios');
const cheerio = require('cheerio');

const {
  BLUE_UTILS_STUDENT_URLS,
  BLUE_UTILS_KO_STUDENT_URLS,
  BLUEARCHIVE_API_URL,
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

async function fetchHtml(url) {
  const response = await http.get(url);
  return response.data;
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
    if (hasHangul(entry.label)) {
      koByHref.set(normalizeHref(entry.href), entry.label);
    }
  }

  const merged = [];
  for (const entry of enList.students) {
    const href = normalizeHref(entry.href);
    const koreanName = koByHref.get(href) || null;
    merged.push({
      href,
      englishName: entry.label,
      koreanName,
    });
  }

  return merged;
}

async function searchAudioPagesByName(name) {
  const response = await http.get(BLUEARCHIVE_API_URL, {
    params: {
      action: 'query',
      list: 'search',
      srsearch: `${name}/audio`,
      srlimit: 5,
      format: 'json',
      origin: '*',
    },
    headers: {
      Accept: 'application/json',
    },
  });

  const hits = response.data?.query?.search || [];
  const exactAudio = hits.find((item) => /\/audio$/i.test(item.title));
  if (exactAudio) {
    return exactAudio.title;
  }

  if (hits[0]?.title) {
    return hits[0].title;
  }

  return null;
}

function parseFileTitlesFromHtml(html) {
  const $ = cheerio.load(html || '');
  const set = new Set();

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

async function fetchAudioFileTitles(audioPageTitle) {
  const response = await http.get(BLUEARCHIVE_API_URL, {
    params: {
      action: 'parse',
      page: audioPageTitle,
      prop: 'text',
      format: 'json',
      formatversion: 2,
      origin: '*',
    },
    headers: {
      Accept: 'application/json',
    },
  });

  const html = response.data?.parse?.text || '';
  return parseFileTitlesFromHtml(html);
}

async function fetchImageUrlsByFileTitles(fileTitles) {
  if (!fileTitles.length) {
    return {};
  }

  const joinedTitles = fileTitles.join('|');

  const response = await http.get(BLUEARCHIVE_API_URL, {
    params: {
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url',
      titles: joinedTitles,
      format: 'json',
      origin: '*',
    },
    headers: {
      Accept: 'application/json',
    },
  });

  const pages = response.data?.query?.pages || {};
  const out = {};

  Object.values(pages).forEach((page) => {
    if (!page?.title || !page?.imageinfo?.[0]?.url) {
      return;
    }
    out[page.title] = page.imageinfo[0].url;
  });

  return out;
}

module.exports = {
  fetchBlueUtilsStudents,
  searchAudioPagesByName,
  fetchAudioFileTitles,
  fetchImageUrlsByFileTitles,
};
