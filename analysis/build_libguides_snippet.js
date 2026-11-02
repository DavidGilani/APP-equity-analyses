// Builds one block of HTML for pasting into a LibGuides "Media / Widget" box, so the
// student cohort comparison dashboard runs on a LibGuides page with no other files.
//
// Usage, from the repository root:
//   node analysis/build_libguides_snippet.js path/to/output.html
//
// The page, the built-in baseline (counts only) and the Excel preset are packed into
// the snippet. The Excel reader (JSZip) loads from cdnjs. The dashboard runs inside
// an iframe so LibGuides styles and the dashboard's styles cannot affect each other,
// and the frame grows to fit its content. Any file a person chooses is read inside
// their browser only, as when the page is opened directly.
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2];
if (!out) { console.error('Give the output path.'); process.exit(1); }

const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const inline = (code) => '<script>\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>';
let page = read('student_dashboard.html');
const swaps = [
  ['<script src="student_dashboard_data.js"></script>', inline(read('student_dashboard_data.js'))],
  ['<script src="lib/jszip.min.js"></script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>'],
  ['<script src="student_dashboard_mis.js"></script>', inline(read('student_dashboard_mis.js'))],
];
for (const [from, to] of swaps) {
  if (!page.includes(from)) { console.error('Could not find: ' + from); process.exit(1); }
  page = page.replace(from, () => to);
}

// Compressed so the block fits LibGuides' 65,535-character limit on embed code.
const b64 = zlib.gzipSync(Buffer.from(page, 'utf8'), { level: 9 }).toString('base64');
const snippet = `<!-- Student cohort comparison tool. Built by analysis/build_libguides_snippet.js; rebuild rather than editing. -->
<div id="mdx-cohort-tool">
  <iframe id="mdx-cohort-frame" title="Student cohort comparison tool" style="width:100%;min-height:900px;border:0;display:block"></iframe>
  <noscript>This tool needs JavaScript to run.</noscript>
</div>
<script>
(function () {
  var frame = document.getElementById('mdx-cohort-frame');
  var b64 = '${b64}';
  var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
  new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    .then(function (html) { frame.srcdoc = html; })
    .catch(function () { frame.outerHTML = '<p>This tool needs an up-to-date browser (Chrome, Edge, Firefox or Safari).</p>'; });
  function fit() {
    try {
      var d = frame.contentDocument;
      if (d && d.documentElement) frame.style.height = Math.max(900, d.documentElement.scrollHeight + 20) + 'px';
    } catch (e) {}
  }
  frame.addEventListener('load', function () {
    fit();
    // The tool scrolls to the top after each step; scroll the LibGuides page to the tool instead.
    try { frame.contentWindow.scrollTo = function () { fit(); frame.scrollIntoView(); }; } catch (e) {}
    try { new ResizeObserver(fit).observe(frame.contentDocument.documentElement); } catch (e) { setInterval(fit, 1000); }
  });
})();
</script>
`;
fs.writeFileSync(out, snippet);
console.log(`Wrote ${out}: ${snippet.length.toLocaleString('en-GB')} characters (LibGuides limit 65,535).`);
if (snippet.length > 65535) { console.error('Too long for a LibGuides widget box.'); process.exit(1); }
