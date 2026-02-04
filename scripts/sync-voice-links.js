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

  let successCount = 0;
  let failCount = 0;

  for (const student of students) {
    const key = student.href || student.englishName || student.koreanName;
    if (!key) {
      failCount += 1;
      continue;
    }

    const query = student.wikiSearchName || student.englishName || student.koreanName;
    if (!query) {
      failCount += 1;
      continue;
    }

    try {
      const resolved = await resolveAudioFilesWithLinksWithoutApi(query);
      const fileTitles = resolved.fileTitles || [];
      if (!resolved.audioTitle || !fileTitles.length) {
        failCount += 1;
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
    } catch (_error) {
      failCount += 1;
      console.log(`[FAIL] ${query}`);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(
    `Saved voice links to ${outputPath} (success=${successCount}, fail=${failCount}, total=${students.length})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
