const fs = require('fs');
const path = require('path');

if (typeof global.File === 'undefined') {
  global.File = class File {};
}

const {
  fetchCharacterTitlesFromWiki,
  resolveAudioFilesWithoutApi,
} = require('../src/services/scraper');
const nameFormula = require('../src/data/student-name-formulas.json');
const typeFormula = require('../src/data/student-type-formulas.json');

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function toSlugParts(title) {
  return normalizeText(title)
    .replace(/[()]/g, ' ')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .split('_')
    .filter(Boolean);
}

function toEnglishSlug(title) {
  return toSlugParts(title).join('_');
}

function splitEnglishNameAndType(englishName) {
  const tokens = normalizeText(englishName).split('_').filter(Boolean);
  if (!tokens.length) {
    return { baseEnglishName: null, typeKey: null };
  }
  return {
    baseEnglishName: tokens[0],
    typeKey: tokens.length > 1 ? tokens.slice(1).join('_') : null,
  };
}

function validateNameFormula() {
  const baseNameMap = nameFormula?.baseNameMap || {};
  const baseSeen = new Set();
  const koreanSeen = new Set();

  for (const [rawKey, korean] of Object.entries(baseNameMap)) {
    const baseKey = normalizeText(rawKey).toLowerCase().split('_')[0];
    if (!baseKey) {
      throw new Error('student-name-formulas.json: empty base key');
    }
    if (baseSeen.has(baseKey)) {
      throw new Error(`student-name-formulas.json: duplicated base key "${baseKey}"`);
    }
    baseSeen.add(baseKey);

    const normalizedKorean = normalizeText(korean);
    if (!normalizedKorean) {
      throw new Error(`student-name-formulas.json: empty korean value for "${rawKey}"`);
    }
    if (koreanSeen.has(normalizedKorean)) {
      throw new Error(`student-name-formulas.json: duplicated korean value "${normalizedKorean}"`);
    }
    koreanSeen.add(normalizedKorean);
  }
}

function validateTypeFormula() {
  const en = typeFormula?.englishTypeDisplay || {};
  const ko = typeFormula?.koreanTypeDisplay || {};

  const allTypeKeys = new Set([...Object.keys(en), ...Object.keys(ko)]);
  const enSeen = new Set();
  const koSeen = new Set();

  for (const key of allTypeKeys) {
    if (!en[key]) {
      throw new Error(`student-type-formulas.json: missing englishTypeDisplay for "${key}"`);
    }
    if (!ko[key]) {
      throw new Error(`student-type-formulas.json: missing koreanTypeDisplay for "${key}"`);
    }
  }

  for (const value of Object.values(en)) {
    const text = normalizeText(value);
    if (enSeen.has(text)) {
      throw new Error(`student-type-formulas.json: duplicated englishTypeDisplay "${text}"`);
    }
    enSeen.add(text);
  }

  for (const value of Object.values(ko)) {
    const text = normalizeText(value);
    if (koSeen.has(text)) {
      throw new Error(`student-type-formulas.json: duplicated koreanTypeDisplay "${text}"`);
    }
    koSeen.add(text);
  }
}

async function main() {
  validateNameFormula();
  validateTypeFormula();

  const studentsPath = path.join(__dirname, '..', 'src', 'data', 'students.json');
  const existingPayload = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
  const existingStudents = Array.isArray(existingPayload?.students) ? existingPayload.students : [];

  const fallbackBaseKoreanByEnglish = new Map();
  for (const student of existingStudents) {
    const englishBase = normalizeText(student?.englishName || '').toLowerCase().split('_')[0];
    const koreanBase = normalizeText(student?.koreanName || '').split('_')[0];
    if (englishBase && koreanBase && !fallbackBaseKoreanByEnglish.has(englishBase)) {
      fallbackBaseKoreanByEnglish.set(englishBase, koreanBase);
    }
  }

  const formulaBaseKoreanByEnglish = new Map(
    Object.entries(nameFormula?.baseNameMap || {}).map(([k, v]) => [
      normalizeText(k).toLowerCase().split('_')[0],
      normalizeText(v),
    ])
  );

  const characterTitles = await fetchCharacterTitlesFromWiki('https://bluearchive.wiki');
  const outByHref = new Map();
  const typeKeys = new Set(Object.keys(typeFormula?.englishTypeDisplay || {}));

  for (const characterTitle of characterTitles) {
    try {
      const resolved = await resolveAudioFilesWithoutApi(characterTitle);
      const audioTitle = normalizeText((resolved.audioTitle || '').replace(/\/audio$/i, ''));
      if (!audioTitle) {
        continue;
      }

      const englishName = toEnglishSlug(audioTitle);
      if (!englishName) {
        continue;
      }

      const { baseEnglishName, typeKey } = splitEnglishNameAndType(englishName);
      if (typeKey && !typeKeys.has(typeKey)) {
        continue;
      }

      const baseKoreanName =
        formulaBaseKoreanByEnglish.get(baseEnglishName) ||
        fallbackBaseKoreanByEnglish.get(baseEnglishName) ||
        null;
      const englishType = typeKey ? typeFormula.englishTypeDisplay[typeKey] : null;
      const koreanType = typeKey ? typeFormula.koreanTypeDisplay[typeKey] : null;
      const koreanName = baseKoreanName
        ? (koreanType ? `${baseKoreanName}_${koreanType}` : baseKoreanName)
        : null;

      const href = `/student-detail/${englishName}`;
      outByHref.set(href, {
        href,
        englishName,
        koreanName,
        baseEnglishName,
        baseKoreanName,
        typeKey: typeKey || null,
        englishType,
        koreanType,
        wikiSearchName: audioTitle,
      });
    } catch (_error) {
      // Skip titles that are not playable character audio pages.
    }
  }

  const students = Array.from(outByHref.values()).sort((a, b) =>
    (a.englishName || '').localeCompare(b.englishName || '')
  );

  const payload = {
    updatedAt: Date.now(),
    students,
  };

  fs.writeFileSync(studentsPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Saved ${students.length} students to ${studentsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
