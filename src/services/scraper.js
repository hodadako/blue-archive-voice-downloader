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

async function fetchCharacterTitlesFromWiki(baseUrl = 'https://bluearchive.wiki') {
  const url = `${baseUrl}/wiki/Characters`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html || '');
  const out = new Set();
  const blockedTitles = new Set([
    'Affinity',
    'Characters StatChart',
    'Characters image list',
    'Characters trivia list',
    'Unique gear list',
    'Unique weapons list',
  ]);

  $('#mw-content-text a[href^="/wiki/"]').each((_idx, el) => {
    const href = ($(el).attr('href') || '').trim();
    const title = decodeWikiTitleFromHref(href);
    if (!title) {
      return;
    }

    const normalized = normalizeText(title);
    if (!normalized) {
      return;
    }
    if (blockedTitles.has(normalized)) {
      return;
    }
    if (/\/audio$/i.test(normalized)) {
      return;
    }
    if (/^characters$/i.test(normalized)) {
      return;
    }

    out.add(normalized);
  });

  return Array.from(out);
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
    const isDownloadableStatic =
      lower.startsWith('https://static.') &&
      lower.includes('?download') &&
      (/\.mp3(\?|$)/i.test(lower) || /\.ogg(\?|$)/i.test(lower) || lower.includes('/transcoded/'));
    if (isDownloadableStatic) {
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
      lower.startsWith('https://static.') &&
      lower.includes('?download') &&
      (/\.mp3(\?|$)/i.test(lower) || /\.ogg(\?|$)/i.test(lower) || lower.includes('/transcoded/'));

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
  fetchCharacterTitlesFromWiki,
  resolveAudioFilesWithoutApi,
  resolveAudioFilesWithLinksWithoutApi,
  buildStaticAudioUrl,
};
