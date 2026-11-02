// Rebuilds student_dashboard_data.js (the cohort comparison dashboard's built-in
// baseline) from the student number download, using the same groupings as the
// dashboard itself (student_dashboard_mis.js).
//
// Usage, from the repository root:
//   node analysis/build_dashboard_baseline.js "path/to/Student_number_data.xlsx" [year]
//
// year is the Academic Year Enrolment Term (for example 2025 for 2025/26) and
// defaults to the latest in the file. The output holds counts and percentages only.
// Categories with fewer than 10 students are combined, so no small groups are shown.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const JSZip = require(path.join(root, 'lib', 'jszip.min.js'));
const P = require(path.join(root, 'student_dashboard_mis.js'));

const MIN = 10;
const SKIP = { 'Free school meals (code)': 1 };
const ALIASES = {
  'Faculty': ['faculty', 'programme faculty'],
  'Level of study': ['level of study', 'level', 'student level'],
  'Mode of study': ['mode of study', 'mode'],
  'Residency': ['residency', 'fee status', 'domicile'],
  'Sex': ['sex', 'gender'],
  'Age on entry': ['age on entry', 'age', 'mature'],
  'Ethnicity (BAME grouping)': ['bame', 'bame grouping', 'ethnicity bame'],
  'Ethnicity (broad)': ['ethnicity', 'ethnicity broad', 'broad ethnicity', 'ethnic group'],
  'Ethnicity (detailed)': ['ethnicity detailed', 'detailed ethnicity', 'ethnicity description'],
  'Disability': ['disability', 'disability flag', 'disabled'],
  'First generation in HE': ['first generation in he', 'first generation', 'first gen'],
  'Care leaver': ['care leaver', 'care experienced'],
  'IMD quintile': ['imd quintile', 'imd'],
  'Prior qualifications (A-level and BTEC flags)': ['prior qualifications', 'prior qualification', 'entry qualification'],
  'Religion': ['religion', 'religion or belief'],
};

(async () => {
  const [file, wantYear] = process.argv.slice(2);
  if (!file) { console.error('Give the path to the student number download.'); process.exit(1); }
  const rows = await P.readXlsx(fs.readFileSync(file), JSZip);
  const headers = rows[0].map(String), body = rows.slice(1);
  if (!P.detect(headers)) { console.error('This does not look like the student number download.'); process.exit(1); }
  const years = P.years(headers, body);
  const year = wantYear || years[years.length - 1];
  const t = P.transform(headers, body, year);
  const total = t.rows.length;

  const dims = [], population = {};
  t.headers.slice(1).forEach((dim, i) => {
    if (SKIP[dim]) return;
    const tally = {};
    let present = 0;
    t.rows.forEach((r) => { const v = r[i + 1]; if (v) { tally[v] = (tally[v] || 0) + 1; present++; } });
    let small = 0;
    const list = [];
    Object.keys(tally).sort((a, b) => tally[b] - tally[a]).forEach((k) => {
      if (tally[k] < MIN) small += tally[k]; else list.push({ category: k, n: tally[k] });
    });
    if (small) list.push({ category: 'Groups under 10 combined', n: small });
    list.forEach((c) => { c.pct = Math.round(1000 * c.n / present) / 10; });
    dims.push(dim);
    population[dim] = list;
  });

  const label = P.yearLabel(year);
  const meta = {
    generated: new Date().toISOString().slice(0, 10),
    minCell: MIN,
    popTotal: total,
    populationLabel: `Whole student population (${label})`,
    dimensions: dims,
    columnAliases: Object.fromEntries(dims.map((d) => [d, ALIASES[d] || [d.toLowerCase()]])),
    disclosure: `Population figures are the ${label} whole student population (${total.toLocaleString('en-GB')} students), from the student number download filtered as in the EDI report. Your uploaded cohort is compared against these. Groups with fewer than 10 students in your cohort are suppressed and not tested. Significance is a two-proportion z-test at the 95% level. Category labels in your file must match the population labels exactly to line up (see the notes under each chart).`,
  };

  const out = `// Built-in population baseline for the student cohort comparison dashboard.
// Population = whole student population ${label} (${total.toLocaleString('en-GB')} students), built from the
// student number download by analysis/build_dashboard_baseline.js. No personal records
// here: counts and percentages only, with categories under ${MIN} students combined.
// Rebuild with that script to refresh. Keep it in the same folder as student_dashboard.html.
window.DASHBOARD_DATA = ${JSON.stringify({ META: meta, POPULATION: population }, null, 1)};
`;
  fs.writeFileSync(path.join(root, 'student_dashboard_data.js'), out);
  console.log(`Wrote student_dashboard_data.js: ${label}, ${total} students, ${dims.length} characteristics.`);
})();
