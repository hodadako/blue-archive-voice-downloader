const fs = require('fs');
const path = require('path');

if (typeof global.File === 'undefined') {
  global.File = class File {};
}

const { fetchCharacterTitlesFromWiki } = require('../src/services/scraper');
const nameFormula = require('../src/data/student-name-formulas.json');
const typeFormula = require('../src/data/student-type-formulas.json');

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTypeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function titleToEnglishSlug(title) {
  return normalizeText(title)
    .replace(/[()]/g, ' ')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function toWikiHref(title) {
  const normalized = normalizeText(title).replace(/\s+/g, '_');
  const encoded = encodeURIComponent(normalized).replace(/%2F/g, '/');
  return `/wiki/${encoded}`;
}

function splitEnglishNameAndType(englishName) {
  const tokens = normalizeText(englishName).split('_').filter(Boolean);
  if (!tokens.length) {
    return { baseEnglishName: null, typeKey: null };
  }
  if (tokens.length === 1) {
    return { baseEnglishName: tokens[0], typeKey: null };
  }
  return {
    baseEnglishName: tokens[0],
    typeKey: tokens.slice(1).join('_'),
  };
}

function assertNoDuplicateKeys(label, obj) {
  const seenKeys = new Set();
  for (const [rawKey, rawValue] of Object.entries(obj || {})) {
    const key = normalizeTypeKey(rawKey);
    const value = normalizeText(rawValue);
    if (!key || !value) {
      throw new Error(`${label}: empty key/value found`);
    }
    if (seenKeys.has(key)) {
      throw new Error(`${label}: duplicated key "${key}"`);
    }
    seenKeys.add(key);
  }
}

function findDuplicateValues(obj) {
  const seen = new Set();
  const dup = new Set();
  for (const [rawKey, rawValue] of Object.entries(obj || {})) {
    const value = normalizeText(rawValue);
    if (!value) {
      continue;
    }
    if (seen.has(value)) {
      dup.add(value);
    }
    seen.add(value);
  }
  return Array.from(dup).sort();
}

function buildFormulaMaps() {
  const baseMapRaw = nameFormula?.baseNameMap || {};
  const baseNameMap = {};
  for (const [key, value] of Object.entries(baseMapRaw)) {
    const baseKey = normalizeTypeKey(key).split('_')[0];
    if (!baseKey) {
      continue;
    }
    if (!baseNameMap[baseKey]) {
      baseNameMap[baseKey] = normalizeText(value);
    }
  }

  assertNoDuplicateKeys('student-name-formulas.baseNameMap', baseNameMap);

  const englishTypeMap = {};
  const koreanTypeMap = {};

  for (const [key, value] of Object.entries(typeFormula?.englishTypeDisplay || {})) {
    englishTypeMap[normalizeTypeKey(key)] = normalizeText(value);
  }
  for (const [key, value] of Object.entries(typeFormula?.koreanTypeDisplay || {})) {
    koreanTypeMap[normalizeTypeKey(key)] = normalizeText(value);
  }

  assertNoDuplicateKeys('student-type-formulas.englishTypeDisplay', englishTypeMap);
  assertNoDuplicateKeys('student-type-formulas.koreanTypeDisplay', koreanTypeMap);

  for (const key of Object.keys(englishTypeMap)) {
    if (!koreanTypeMap[key]) {
      throw new Error(`student-type-formulas: missing koreanTypeDisplay for "${key}"`);
    }
  }

  const duplicateNameValues = findDuplicateValues(baseNameMap);
  const duplicateEnglishTypeValues = findDuplicateValues(englishTypeMap);
  const duplicateKoreanTypeValues = findDuplicateValues(koreanTypeMap);

  return {
    baseNameMap,
    englishTypeMap,
    koreanTypeMap,
    duplicateNameValues,
    duplicateEnglishTypeValues,
    duplicateKoreanTypeValues,
  };
}

async function main() {
  const studentsPath = path.join(__dirname, '..', 'src', 'data', 'students.json');
  const existing = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
  const existingStudents = Array.isArray(existing?.students) ? existing.students : [];
  const existingByEnglish = new Map(
    existingStudents
      .filter((s) => s?.englishName)
      .map((s) => [s.englishName, s])
  );

  const {
    baseNameMap,
    englishTypeMap,
    koreanTypeMap,
    duplicateNameValues,
    duplicateEnglishTypeValues,
    duplicateKoreanTypeValues,
  } = buildFormulaMaps();

  const titles = await fetchCharacterTitlesFromWiki('https://bluearchive.wiki');
  const outByEnglish = new Map();
  const missingBase = new Set();
  const missingType = new Set();

  for (const title of titles) {
    const wikiSearchName = normalizeText(title);
    if (!wikiSearchName) {
      continue;
    }

    const englishName = titleToEnglishSlug(wikiSearchName);
    if (!englishName) {
      continue;
    }

    const { baseEnglishName, typeKey } = splitEnglishNameAndType(englishName);
    const englishType = typeKey ? englishTypeMap[typeKey] || null : null;
    const koreanType = typeKey ? koreanTypeMap[typeKey] || null : null;
    const baseKoreanName = baseEnglishName ? baseNameMap[baseEnglishName] || null : null;

    if (baseEnglishName && !baseKoreanName) {
      missingBase.add(baseEnglishName);
    }
    if (typeKey && !englishType) {
      missingType.add(typeKey);
    }

    const existingRow = existingByEnglish.get(englishName);
    const koreanName = baseKoreanName
      ? (koreanType ? `${baseKoreanName}_${koreanType}` : baseKoreanName)
      : (existingRow?.koreanName || null);

    outByEnglish.set(englishName, {
      href: toWikiHref(wikiSearchName),
      englishName,
      koreanName,
      baseEnglishName,
      baseKoreanName,
      typeKey: typeKey || null,
      englishType,
      koreanType,
      wikiSearchName,
    });
  }

  const students = Array.from(outByEnglish.values()).sort((a, b) =>
    a.englishName.localeCompare(b.englishName)
  );

  const payload = {
    updatedAt: Date.now(),
    students,
  };

  fs.writeFileSync(studentsPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Saved ${students.length} students to ${studentsPath}`);
  if (duplicateNameValues.length) {
    console.log(`Duplicate korean names in name formula: ${duplicateNameValues.join(', ')}`);
  }
  if (duplicateEnglishTypeValues.length) {
    console.log(`Duplicate english type labels: ${duplicateEnglishTypeValues.join(', ')}`);
  }
  if (duplicateKoreanTypeValues.length) {
    console.log(`Duplicate korean type labels: ${duplicateKoreanTypeValues.join(', ')}`);
  }
  if (missingBase.size) {
    console.log(`Missing baseNameMap keys (${missingBase.size}): ${Array.from(missingBase).sort().join(', ')}`);
  }
  if (missingType.size) {
    console.log(`Missing type formulas (${missingType.size}): ${Array.from(missingType).sort().join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
