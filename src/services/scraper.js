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

function normalizeHref(href) {
  if (!href) {
    return '';
  }
  return href.replace(/^https?:\/\/[^/]+/i, '').replace(/\/$/, '');
}

async function fetchWikiParsedHtml(title, baseUrl) {
  const response = await http.get(`${baseUrl}/w/api.php`, {
    params: {
      action: 'parse',
      page: title,
      prop: 'text',
      format: 'json',
      formatversion: 2,
    },
  });

  const payload = response.data || {};
  if (payload.error) {
    throw new Error(`Wiki API parse failed for ${title}: ${payload.error.info || payload.error.code}`);
  }

  const parsedText = payload.parse?.text;
  if (typeof parsedText === 'string') {
    return parsedText;
  }
  if (typeof parsedText?.['*'] === 'string') {
    return parsedText['*'];
  }

  throw new Error(`Wiki API returned no parsed HTML for ${title}`);
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

function extractImageUrl($, el, baseUrl) {
  const img = $(el).find('img').first();
  if (!img.length) {
    return null;
  }
  const srcset = (img.attr('srcset') || '').trim();
  const dataSrc = (img.attr('data-src') || '').trim();
  const src = (img.attr('src') || '').trim();
  let candidate = dataSrc || src;
  if (!candidate && srcset) {
    candidate = srcset.split(',')[0].trim().split(' ')[0];
  }
  const abs = toAbsoluteUrl(baseUrl, candidate);
  return abs || null;
}

function getCharacterBlockedTitles() {
  return new Set([
    'Affinity',
    'Characters StatChart',
    'Characters image list',
    'Characters trivia list',
    'Unique gear list',
    'Unique weapons list',
  ]);
}

function shouldIncludeCharacterTitle(title, blockedTitles) {
  const normalized = normalizeText(title);
  if (!normalized) {
    return false;
  }
  if (blockedTitles.has(normalized)) {
    return false;
  }
  if (/\/audio$/i.test(normalized)) {
    return false;
  }
  if (/^characters$/i.test(normalized)) {
    return false;
  }
  return true;
}

function addCharacterEntry(out, title, imageUrl) {
  const normalized = normalizeText(title);
  if (!normalized || out.has(normalized)) {
    return;
  }
  out.set(normalized, { title: normalized, imageUrl: imageUrl || null });
}

async function fetchCharacterEntriesFromWiki(baseUrl = 'https://bluearchive.wiki') {
  const html = await fetchWikiParsedHtml('Characters', baseUrl);
  const $ = cheerio.load(html || '');
  const out = new Map();
  const blockedTitles = getCharacterBlockedTitles();
  const contentRoot = $('#mw-content-text').length ? $('#mw-content-text') : $.root();
  const tableRows = contentRoot.find('table tbody tr');

  tableRows.each((_idx, row) => {
    let pickedTitle = null;

    $(row).find('a[href^="/wiki/"]').each((_aIdx, a) => {
      if (pickedTitle) {
        return;
      }
      const href = ($(a).attr('href') || '').trim();
      const title = decodeWikiTitleFromHref(href);
      if (!title || !shouldIncludeCharacterTitle(title, blockedTitles)) {
        return;
      }
      pickedTitle = normalizeText(title);
    });

    if (!pickedTitle) {
      return;
    }

    const imageUrl = extractImageUrl($, row, baseUrl);
    addCharacterEntry(out, pickedTitle, imageUrl);
  });

  if (!out.size) {
    contentRoot.find('a[href^="/wiki/"]').each((_idx, el) => {
      const href = ($(el).attr('href') || '').trim();
      const title = decodeWikiTitleFromHref(href);
      if (!title || !shouldIncludeCharacterTitle(title, blockedTitles)) {
        return;
      }
      const imageUrl = extractImageUrl($, el, baseUrl);
      addCharacterEntry(out, title, imageUrl);
    });
  }

  return Array.from(out.values());
}

async function fetchCharacterTitlesFromWiki(baseUrl = 'https://bluearchive.wiki') {
  const entries = await fetchCharacterEntriesFromWiki(baseUrl);
  return entries.map((entry) => entry.title);
}

async function searchAudioPageByWeb(name, baseUrl) {
  const query = `${normalizeText(name)}/audio`;
  const response = await http.get(`${baseUrl}/w/api.php`, {
    params: {
      action: 'query',
      list: 'search',
      srsearch: query,
      srnamespace: 0,
      srlimit: 10,
      format: 'json',
      formatversion: 2,
    },
  });

  const searchResults = response.data?.query?.search || [];
  const bestTitle = searchResults
    .map((result) => normalizeText(result?.title))
    .find((title) => /\/audio$/i.test(title));

  if (bestTitle) {
    return bestTitle;
  }

  const fallbackTitle = `${normalizeText(name).replace(/\b\w/g, (m) => m.toUpperCase())}/audio`;
  return fallbackTitle;
}

async function fetchAudioFileTitlesFromWikiPage(audioPageTitle, baseUrl) {
  const html = await fetchWikiParsedHtml(audioPageTitle, baseUrl);
  return parseFileTitlesFromHtml(html);
}

async function resolveAudioFilesWithoutApi(name) {
  const bases = ['https://bluearchive.wiki'];
  let lastError;
  const normalized = normalizeText(name).replace(/\/audio$/i, '');

  for (const baseUrl of bases) {
    try {
      let audioTitle = `${normalized}/audio`;
      let fileTitles = await fetchAudioFileTitlesFromWikiPage(audioTitle, baseUrl);

      if (!fileTitles.length) {
        audioTitle = await searchAudioPageByWeb(name, baseUrl);
        fileTitles = await fetchAudioFileTitlesFromWikiPage(audioTitle, baseUrl);
      }

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

async function fetchFilePageAudioLinks(fileTitle, baseUrl) {
  const title = normalizeText((fileTitle || '').replace(/^File:/i, ''));
  if (!title) {
    return [];
  }
  const fallback = buildStaticAudioUrl(fileTitle);
  return fallback ? [fallback] : [];
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
  fetchCharacterTitlesFromWiki,
  fetchCharacterEntriesFromWiki,
  resolveAudioFilesWithoutApi,
  resolveAudioFilesWithLinksWithoutApi,
  buildStaticAudioUrl,
};
