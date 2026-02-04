const fs = require('fs');
const path = require('path');

if (typeof global.File === 'undefined') {
  global.File = class File {};
}

const { fetchBlueUtilsStudents } = require('../src/services/scraper');

async function main() {
  const students = await fetchBlueUtilsStudents();
  const outputPath = path.join(__dirname, '..', 'src', 'data', 'students.json');
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
