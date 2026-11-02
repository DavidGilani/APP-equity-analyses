// Builds one block of HTML for pasting into a LibGuides "Media / Widget" box, so the
// student cohort comparison dashboard runs on a LibGuides page with no other files.
//
// Usage, from the repository root:
//   node analysis/build_libguides_snippet.js path/to/output.html
//
// The page, the built-in baseline (counts only) and the Excel preset are packed into
// the snippet. The Excel reader (JSZip) loads from cdnjs, checked against a fixed
// hash so a changed copy would not run.
//
// Keeping files on the person's own device is enforced by the browser, not just by
// the code:
// - a Content Security Policy inside the frame blocks every network request
//   (connect-src, form-action and img-src allow nothing that leaves the device);
// - the frame is sandboxed without allow-same-origin, so neither LibGuides nor any
//   other script on the page (analytics, for example) can read what is in it.
// The frame only sends its height to the page, so the box can grow to fit.
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
  ['<script src="lib/jszip.min.js"></script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" integrity="sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG" crossorigin="anonymous"></script>'],
  ['<script src="student_dashboard_mis.js"></script>', inline(read('student_dashboard_mis.js'))],
];
const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
// Tells the page how tall the tool is, and scrolls the page to the tool where the tool
// would scroll to its own top. Sends nothing else.
const FRAME_SCRIPT = `<script>
(function () {
  function send(scroll) { parent.postMessage({ mdxCohortTool: 1, height: document.documentElement.scrollHeight, scroll: !!scroll }, '*'); }
  window.scrollTo = function () { send(true); };
  new ResizeObserver(function () { send(false); }).observe(document.documentElement);
  window.addEventListener('load', function () { send(false); });
})();
</script>`;
swaps.unshift(['<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="' + CSP + '">\n' + FRAME_SCRIPT]);
for (const [from, to] of swaps) {
  if (!page.includes(from)) { console.error('Could not find: ' + from); process.exit(1); }
  page = page.replace(from, () => to);
}

// Compressed so the block fits LibGuides' 65,535-character limit on embed code.
const b64 = zlib.gzipSync(Buffer.from(page, 'utf8'), { level: 9 }).toString('base64');
const snippet = `<!-- Student cohort comparison tool. Built by analysis/build_libguides_snippet.js; rebuild rather than editing. -->
<div id="mdx-cohort-tool">
  <iframe id="mdx-cohort-frame" title="Student cohort comparison tool" sandbox="allow-scripts allow-modals" style="width:100%;height:900px;border:0;display:block"></iframe>
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
  // The sandboxed frame can only tell the page its height, and when to scroll to it.
  window.addEventListener('message', function (e) {
    if (e.source !== frame.contentWindow || !e.data || !e.data.mdxCohortTool) return;
    var h = Number(e.data.height);
    if (h > 0) frame.style.height = Math.max(600, Math.min(h + 20, 20000)) + 'px';
    if (e.data.scroll) frame.scrollIntoView();
  });
})();
</script>
`;
fs.writeFileSync(out, snippet);
console.log(`Wrote ${out}: ${snippet.length.toLocaleString('en-GB')} characters (LibGuides limit 65,535).`);
if (snippet.length > 65535) { console.error('Too long for a LibGuides widget box.'); process.exit(1); }
