const fs = require('fs');
const path = require('path');

if (typeof global.File === 'undefined') {
  global.File = class File {};
}

const {
  resolveAudioFilesWithLinksWithoutApi,
} = require('../src/services/scraper');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  const studentsPath = path.join(__dirname, '..', 'src', 'data', 'students.json');
  const outputPath = path.join(__dirname, '..', 'src', 'data', 'voice-links.json');

  const studentsPayload = readJson(studentsPath);
  const students = Array.isArray(studentsPayload?.students) ? studentsPayload.students : [];
  const out = {
    updatedAt: Date.now(),
    students: {},
  };
  const existing = fs.existsSync(outputPath) ? readJson(outputPath) : null;
  const existingStudents = existing?.students && typeof existing.students === 'object' ? existing.students : {};

  let successCount = 0;
  let failCount = 0;
  const requestedConcurrency = Number(process.env.VOICE_SYNC_CONCURRENCY || '6');
  const concurrency = Math.min(4, Math.max(1, requestedConcurrency));
  const queryFilter = (process.env.VOICE_SYNC_QUERY || '').trim();
  const linkFilter = (process.env.VOICE_SYNC_LINK || '').trim();
  const forceSync = String(process.env.VOICE_SYNC_FORCE || '').toLowerCase() === 'true';
  let cursor = 0;

  const filteredStudents = students.filter((student) => {
    if (linkFilter) {
      const normalized = linkFilter.startsWith('/wiki/') ? linkFilter : `/wiki/${linkFilter}`;
      return student.href === normalized;
    }
    if (!queryFilter) {
      return true;
    }
    const query = queryFilter.toLowerCase();
    const haystack = [
      student.wikiSearchName,
      student.englishName,
      student.koreanName,
      student.href,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return haystack.some((value) => value.includes(query));
  });

  async function worker() {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= filteredStudents.length) {
        return;
      }

      const student = filteredStudents[idx];
      const key = student.href || student.englishName || student.koreanName;
      if (!key) {
        failCount += 1;
        console.log('[FAIL] missing key');
        continue;
      }

      if (!forceSync && existingStudents[key]) {
        out.students[key] = existingStudents[key];
        console.log(`[SKIP] ${key}: cached`);
        continue;
      }

      const query = student.wikiSearchName || student.englishName || student.koreanName;
      if (!query) {
        failCount += 1;
        console.log(`[FAIL] ${key}: missing query`);
        continue;
      }

      try {
        const resolved = await resolveAudioFilesWithLinksWithoutApi(query);
        const fileTitles = resolved.fileTitles || [];
        if (!resolved.audioTitle || !fileTitles.length) {
          failCount += 1;
          console.log(`[FAIL] ${query}: no audio titles found`);
          continue;
        }

        const files = resolved.files || [];

        out.students[key] = {
          audioTitle: resolved.audioTitle,
          fileTitles,
          files,
        };
        successCount += 1;
        console.log(`[OK] ${query} -> ${fileTitles.length} files`);
      } catch (error) {
        failCount += 1;
        console.log(`[FAIL] ${query}: ${error.message}`);
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);

  fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(
    `Saved voice links to ${outputPath} (success=${successCount}, fail=${failCount}, total=${filteredStudents.length})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
