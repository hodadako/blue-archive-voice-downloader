const fs = require('fs');
const path = require('path');
const axios = require('axios');

if (typeof global.File === 'undefined') {
  global.File = class File {};
}

const { fetchCharacterEntriesFromWiki } = require('../src/services/scraper');
const { USER_AGENT } = require('../src/services/constants');

const http = axios.create({
  timeout: 30000,
  responseType: 'arraybuffer',
  headers: {
    'User-Agent': USER_AGENT,
  },
});

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function toWikiHref(title) {
  const normalized = normalizeText(title).replace(/\s+/g, '_');
  const encoded = encodeURIComponent(normalized).replace(/%2F/g, '/');
  return `/wiki/${encoded}`;
}

function ensureDir(target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

function sanitizeFileStem(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extractImageExt(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(png|jpe?g|webp|gif|svg)(?:$|\/)/i);
    if (match) {
      return `.${match[1].toLowerCase().replace('jpeg', 'jpg')}`;
    }
  } catch (_error) {
    return '.png';
  }
  return '.png';
}

function makeUniqueName(baseName, ext, used) {
  const cleanBase = sanitizeFileStem(baseName) || 'student';
  let name = `${cleanBase}${ext}`;
  let idx = 2;
  while (used.has(name)) {
    name = `${cleanBase}_${idx}${ext}`;
    idx += 1;
  }
  used.add(name);
  return name;
}

async function downloadFile(url, outputPath) {
  const response = await http.get(url);
  fs.writeFileSync(outputPath, Buffer.from(response.data));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  const studentsPath = path.join(__dirname, '..', 'src', 'data', 'students.json');
  const imageDir = path.join(__dirname, '..', 'src', 'data', 'images', 'students');
  const imagePathPrefix = 'data/images/students';

  const payload = readJson(studentsPath);
  const students = Array.isArray(payload?.students) ? payload.students : [];
  if (!students.length) {
    throw new Error('students.json has no students');
  }

  ensureDir(imageDir);

  const entries = await fetchCharacterEntriesFromWiki('https://bluearchive.wiki');
  const byHref = new Map();
  for (const entry of entries || []) {
    const href = toWikiHref(entry?.title);
    const imageUrl = normalizeText(entry?.imageUrl);
    if (!href || !imageUrl || byHref.has(href)) {
      continue;
    }
    byHref.set(href, imageUrl);
  }

  const usedNames = new Set();
  const existingFiles = fs.readdirSync(imageDir, { withFileTypes: true });
  for (const entry of existingFiles) {
    if (entry.isFile()) {
      usedNames.add(entry.name);
    }
  }

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  for (const student of students) {
    const href = normalizeText(student?.href);
    const remoteImageUrl = href ? byHref.get(href) : null;
    if (!remoteImageUrl) {
      skipped += 1;
      continue;
    }

    const ext = extractImageExt(remoteImageUrl);
    const baseName = student?.englishName || href.replace(/^\/wiki\//, '');
    const fileName = makeUniqueName(baseName, ext, usedNames);
    const outputPath = path.join(imageDir, fileName);

    try {
      await downloadFile(remoteImageUrl, outputPath);
      student.imageUrl = `${imagePathPrefix}/${fileName}`;
      ok += 1;
      console.log(`[OK] ${student.englishName || href} -> ${student.imageUrl}`);
    } catch (error) {
      failed += 1;
      console.log(`[FAIL] ${student.englishName || href}: ${error.message}`);
    }
  }

  payload.updatedAt = Date.now();
  payload.students = students;
  fs.writeFileSync(studentsPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`Saved students.json with local image paths: ${studentsPath}`);
  console.log(`Image sync result: ok=${ok}, skipped=${skipped}, failed=${failed}, total=${students.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
