// Reading Excel files, and the preset for the student number download from the
// management information system (MDX_STUDENT_NUMBERS_SV), for the student cohort
// comparison dashboard. Used by student_dashboard.html in the browser and by
// analysis/build_dashboard_baseline.js in Node, so both group students the same way.
// Holds no data.
(function (root) {
  'use strict';

  // ---- .xlsx reading (first sheet, cell values only) ------------------------
  // Reads the sheet XML with regular expressions rather than DOMParser, which is
  // much faster on a 30,000-row export and also works in Node. Needs JSZip.
  function unescapeXml(s) {
    return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, function (m, e) {
      if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&';
      if (e === 'quot') return '"'; if (e === 'apos') return "'";
      return String.fromCharCode(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    });
  }
  function textRuns(xml) {
    var out = '', re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, m;
    while ((m = re.exec(xml))) out += m[1];
    return unescapeXml(out);
  }
  function colIndex(ref) {
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  function readXlsx(data, JSZip) {
    JSZip = JSZip || root.JSZip;
    if (!JSZip) return Promise.reject(new Error('The Excel reader (lib/jszip.min.js) did not load. Save the file as CSV and try again.'));
    return JSZip.loadAsync(data).then(function (zip) {
      return zip.file('xl/workbook.xml').async('string').then(function (wb) {
        return zip.file('xl/_rels/workbook.xml.rels').async('string').then(function (rels) {
          var first = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb);
          var target = 'xl/worksheets/sheet1.xml';
          if (first) {
            var rel = new RegExp('<Relationship\\b[^>]*Id="' + first[1] + '"[^>]*>').exec(rels);
            var t = rel && /Target="([^"]+)"/.exec(rel[0]);
            if (t) target = t[1].replace(/^\//, '').replace(/^(?!xl\/)/, 'xl/');
          }
          var sst = zip.file('xl/sharedStrings.xml');
          return Promise.all([zip.file(target).async('string'), sst ? sst.async('string') : '']);
        });
      });
    }).then(function (res) {
      var sheet = res[0], shared = [], m;
      var siRe = /<si>([\s\S]*?)<\/si>/g;
      while ((m = siRe.exec(res[1]))) shared.push(textRuns(m[1]));
      var rows = [], rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g, cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      while ((m = rowRe.exec(sheet))) {
        var row = [], c;
        cellRe.lastIndex = 0;
        while ((c = cellRe.exec(m[1]))) {
          var attrs = c[1], body = c[2] || '';
          var r = /\br="([A-Z]+)\d+"/.exec(attrs), type = /\bt="([^"]+)"/.exec(attrs);
          var idx = r ? colIndex(r[1]) : row.length, v = '';
          if (type && type[1] === 'inlineStr') v = textRuns(body);
          else {
            var vv = /<v>([\s\S]*?)<\/v>/.exec(body);
            if (vv) v = type && type[1] === 's' ? (shared[parseInt(vv[1], 10)] || '') : unescapeXml(vv[1]);
          }
          while (row.length < idx) row.push('');
          row[idx] = v;
        }
        rows.push(row);
      }
      var width = rows.length ? rows[0].length : 0;
      rows.forEach(function (r) { while (r.length < width) r.push(''); });
      return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
    });
  }

  // ---- student number download preset ----------------------------------------
  // Recognised when the file has these column headers. The groupings follow the
  // planning team's EDI report methodology, so totals match that report.
  var REQUIRED = ['student id', 'academic year enrolment term'];
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  function detect(headers) {
    var h = headers.map(norm);
    return REQUIRED.every(function (r) { return h.indexOf(r) > -1; });
  }

  function yearLabel(y) {
    var n = parseInt(y, 10);
    return isNaN(n) ? String(y) : n + '/' + String(n + 1).slice(-2);
  }

  var FACULTY = { ACI: 'Arts and Creative Industries', BAL: 'Business and Law', HSE: 'Health, Social Care and Education', 'S&T': 'Science and Technology' };
  var WHITE = { 'White': 1, 'White-British': 1, 'White-Irish': 1, 'White-Scottish': 1, 'White Welsh': 1, 'Other White Background': 1, 'Irish Traveller': 1, 'Gypsy or Traveller': 1 };
  var NOT_KNOWN_ETH = { '': 1, 'Not Given': 1, 'Not Known': 1, 'Refused to answer': 1 };

  // Values that mean "not known" or suppressed in the download become blank, so they
  // are left out of the comparison for that characteristic and reported as missing.
  function clean(v) { v = String(v == null ? '' : v).trim(); return v === '*' ? '' : v; }

  // Each derived column: [label, default role, function(get) -> value]. The role is
  // true (a demographic to compare on), false (ignored) or 'filter' (used only to
  // choose who is in the population, such as enrolment status).
  // get('Header Name') returns the cleaned value of that column for the row.
  var DERIVED = [
    ['Faculty', true, function (g, has) { if (!has('Programme Faculty')) return ''; var f = g('Programme Faculty'); return f ? (FACULTY[f] || f) : 'No faculty'; }],
    ['Department', false, function (g) { return g('Programme Department Desc'); }],
    ['Level of study', true, function (g) {
      // Student Level holds codes; the EDI download has Programme Level Description instead
      var c = g('Student Level'), d = g('Programme Level Description');
      if (c) return { UG: 'Undergraduate', PG: 'Postgraduate taught', RE: 'Postgraduate research' }[c] || 'Other';
      return d ? ({ Undergraduate: 'Undergraduate', Postgraduate: 'Postgraduate taught', Research: 'Postgraduate research', Foundation: 'Foundation' }[d] || 'Other') : '';
    }],
    ['Mode of study', true, function (g) {
      var m = g('Mode Of Study'); return /^(FT|TK|TN)$/.test(m) ? 'Full time' : /^(PT|DE)$/.test(m) ? 'Part time' : '';
    }],
    ['Residency', true, function (g) {
      var r = g('Residency Description');
      if (r === 'United Kingdom' || r === 'Channel Islands / Isle of Man') return 'UK';
      if (r === 'Overseas') return 'Overseas';
      if (r === 'European Union') return 'EU';
      return r ? 'Other or not resolved' : '';
    }],
    ['Sex', true, function (g, has) { if (!has('SEX')) return ''; var s = g('SEX'); return s === 'F' ? 'Female' : s === 'M' ? 'Male' : 'Other'; }],
    ['Age on entry', true, function (g) {
      // As in the EDI report: every grouping other than 16-20 (including "No Age") counts as 21 and over.
      var a = g('Start Age Grouping'); return a === '16-20' ? 'Under 21' : a ? '21 and over' : '';
    }],
    ['Age group', false, function (g) { var a = g('Start Age Grouping'); return a === 'No Age' ? '' : a; }],
    ['Ethnicity (BAME grouping)', true, function (g, has) {
      // As in the EDI report: Gypsy or Traveller counts as BAME here (but White in the broad grouping).
      if (!has('Ethnicity Description')) return '';
      var e = g('Ethnicity Description'); return NOT_KNOWN_ETH[e] ? 'Unknown' : (WHITE[e] && e !== 'Gypsy or Traveller') ? 'White' : 'BAME';
    }],
    ['Ethnicity (broad)', true, function (g, has) {
      if (!has('Ethnicity Description')) return '';
      var e = g('Ethnicity Description');
      if (NOT_KNOWN_ETH[e]) return 'Not known';
      if (WHITE[e]) return 'White';
      if (/^Asian|Chinese|Other Asian/.test(e)) return 'Asian';
      if (/^Black|Other Black/.test(e)) return 'Black';
      if (/^Mixed|Other Mixed/.test(e)) return 'Mixed';
      return 'Other';
    }],
    ['Ethnicity (detailed)', false, function (g, has) { return has('Ethnicity Description') ? (g('Ethnicity Description') || 'Not known') : ''; }],
    ['Disability', true, function (g) {
      var d = g('Disability Flag'); return d === 'Y' ? 'Reported disability' : d === 'N' ? 'No reported disability' : '';
    }],
    ['First generation in HE', true, function (g) { var v = g('First Gen In He'); return v === 'Yes' || v === 'No' ? v : ''; }],
    ['Parental HE', false, function (g) { return g('Parent He Description'); }],
    ['Care leaver', true, function (g) {
      var c = g('Care Leaver Description');
      return c === 'In care for more than 3 months' ? 'Care leaver' : c === 'Not a care leaver' ? c : '';
    }],
    ['Deprived area (IMD flag)', true, function (g) { var v = g('Imd Wp Flag'); return v === 'Yes' || v === 'No' ? v : ''; }],
    ['IMD quintile', true, function (g) {
      var d = parseInt(g('Postcode Home Imd Decile'), 10);
      return d >= 1 && d <= 10 ? 'Quintile ' + Math.ceil(d / 2) + (d <= 2 ? ' (most deprived)' : d >= 9 ? ' (least deprived)' : '') : '';
    }],
    ['Widening participation flag', false, function (g) { var w = g('Widening Particip Flag'); return w === 'Y' ? 'Yes' : w === 'N' ? 'No' : ''; }],
    ['Prior qualifications (A-level and BTEC flags)', true, function (g) {
      var a = g('Alevel Flag'), b = g('Btec Flag');
      if (!a || !b) return '';
      return a === 'Y' && b === 'Y' ? 'A-levels and BTEC' : a === 'Y' ? 'A-levels' : b === 'Y' ? 'BTEC' : 'Neither';
    }],
    ['Entry route', false, function (g, has) {
      if (!has('Ucas Application Type')) return '';
      var u = g('Ucas Application Type');
      return u === 'UCAS MAIN CYCLE' ? 'UCAS main cycle' : u === 'UCAS CLEARING' ? 'UCAS Clearing' : 'Not through UCAS';
    }],
    ['Apprenticeship', 'filter', function (g) { var a = g('Apprenticeship Flag'); return a === 'Y' ? 'Apprentice' : a === 'N' ? 'Not an apprentice' : ''; }],
    ['Enrolment status', 'filter', function (g) {
      var e = g('Enrolment Term Status'); return e === 'ES' ? 'Enrolled (ES)' : e === 'IN' ? 'Interrupted (IN)' : e ? e : 'No status';
    }],
    ['Joint programme', 'filter', function (g, has) { return !has('Programme Collab Type') ? '' : g('Programme Collab Type') ? 'Joint programme' : 'Not a joint programme'; }],
    // Only filled in when the download includes these fields
    ['New or continuing', 'filter', function (g) { return g('Newness') || g('Student New Or Returning'); }],
    ['Intake', 'filter', function (g) { return g('Intake'); }],
    ['Programme type', 'filter', function (g) { return g('Programme Type'); }],
    ['Religion', false, function (g) { return g('Religion Description'); }],
    ['Free school meals (code)', false, function (g) { return g('Free School Meals'); }]
  ];

  function years(headers, rows) {
    var yi = headers.map(norm).indexOf('academic year enrolment term'), seen = {};
    rows.forEach(function (r) { var y = clean(r[yi]); if (y) seen[y] = 1; });
    return Object.keys(seen).sort();
  }

  function roleOf(d) { return d[1] === true ? 'dim' : d[1] === 'filter' ? 'filter' : 'ignore'; }

  // Returns {headers, rows, defaults}: a Student ID column and the derived columns.
  // Derived columns with fewer than two different values (for example faculty, when
  // the download has no faculty field) are left out, as they cannot be compared on.
  // With a year, only that academic year's rows. With no year, every year, plus an
  // Academic year column, so the page can filter by year (one row per student per
  // year). Student IDs left blank on a student's second year are filled down from
  // the row above, as in the download.
  function transform(headers, rows, year) {
    var hn = headers.map(norm), all = year == null;
    var has = function (name) { return hn.indexOf(norm(name)) > -1; };
    var idCol = hn.indexOf('student id'), yCol = hn.indexOf('academic year enrolment term');
    var outH = ['Student ID'].concat(all ? ['Academic year'] : [], DERIVED.map(function (d) { return d[0]; }));
    var defaults = { 'Student ID': 'id' };
    if (all) defaults['Academic year'] = 'filter';
    DERIVED.forEach(function (d) { defaults[d[0]] = roleOf(d); });
    var out = [], lastId = '';
    rows.forEach(function (r) {
      var id = String(r[idCol] == null ? '' : r[idCol]).trim();
      if (id) lastId = id; else id = lastId;
      var y = clean(r[yCol]);
      if (!all && y !== String(year)) return;
      var get = function (name) { var i = hn.indexOf(norm(name)); return i < 0 ? '' : clean(r[i]); };
      out.push([id].concat(all ? [yearLabel(y)] : [], DERIVED.map(function (d) { return d[2](get, has); })));
    });
    var first = all ? 2 : 1, keep = outH.map(function (h, i) {
      if (i < first) return true;
      var seen = {}, n = 0;
      for (var r = 0; r < out.length && n < 2; r++) { var v = out[r][i]; if (v && !seen[v]) { seen[v] = 1; n++; } }
      return n >= 2;
    });
    var pick = function (row) { return row.filter(function (_, i) { return keep[i]; }); };
    outH.forEach(function (h, i) { if (!keep[i]) delete defaults[h]; });
    return { headers: pick(outH), rows: out.map(pick), defaults: defaults };
  }

  root.MISPreset = { readXlsx: readXlsx, detect: detect, years: years, yearLabel: yearLabel, transform: transform, DERIVED: DERIVED, roleOf: roleOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MISPreset;
})(typeof window !== 'undefined' ? window : globalThis);
