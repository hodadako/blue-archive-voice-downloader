const fs = require('fs');
const path = require('path');

if (typeof global.File === 'undefined') {
  global.File = class File {};
}

const { resolveAudioFilesWithoutApi } = require('../src/services/scraper');
const nameFormula = require('../src/data/student-name-formulas.json');

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function titleToEnglishSlug(title) {
  const tokenAliases = nameFormula?.tokenAliases || {};
  const normalized = normalizeText(title)
    .replace(/[()]/g, ' ')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return normalized
    .split('_')
    .filter(Boolean)
    .flatMap((token) => (tokenAliases[token] || token).split('_'))
    .join('_');
}

async function main() {
  const studentsPath = path.join(__dirname, '..', 'src', 'data', 'students.json');
  const outputPath = studentsPath;

  const existingPayload = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
  const existingStudents = Array.isArray(existingPayload?.students) ? existingPayload.students : [];
  const koreanByEnglish = new Map();
  for (const student of existingStudents) {
    if (student?.englishName && student?.koreanName) {
      koreanByEnglish.set(student.englishName, student.koreanName);
    }
  }

  const outByHref = new Map();
  for (const student of existingStudents) {
    const query = student.wikiSearchName || student.englishName || student.koreanName;
    if (!query) {
      continue;
    }

    try {
      const resolved = await resolveAudioFilesWithoutApi(query);
      const audioTitle = normalizeText((resolved.audioTitle || '').replace(/\/audio$/i, ''));
      if (!audioTitle) {
        continue;
      }

      const englishName = titleToEnglishSlug(audioTitle);
      if (!englishName) {
        continue;
      }

      const href = `/student-detail/${englishName}`;
      const koreanName =
        student.koreanName || koreanByEnglish.get(englishName) || null;

      outByHref.set(href, {
        href,
        englishName,
        koreanName,
        wikiSearchName: audioTitle,
      });
    } catch (_error) {
      if (student.href) {
        outByHref.set(student.href, {
          href: student.href,
          englishName: student.englishName || null,
          koreanName: student.koreanName || null,
          wikiSearchName: student.wikiSearchName || student.englishName || null,
        });
      }
    }
  }

  const students = Array.from(outByHref.values()).sort((a, b) =>
    (a.englishName || '').localeCompare(b.englishName || '')
  );
  const payload = {
    updatedAt: Date.now(),
    students,
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Saved ${students.length} students to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
