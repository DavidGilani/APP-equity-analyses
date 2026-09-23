# APP reporting tool

A local, in-boundary tool for tracking Access and Participation Plan (APP) intervention delivery and semi-automating the ESE committee report.

This folder holds code and documentation only. Tracker data, notes, transcripts, completed templates and snapshots live in the OneDrive-synced folder and are never committed here.

## Running the tool

**From a web address (recommended).** Once Vercel is set up (below), open the address in Chrome on your laptop and bookmark it. Every push to `main` updates it automatically.

**By double-clicking.** Download this folder, keeping the `js` folder next to `index.html`, and double-click `index.html` to open it in Chrome.

Either way, the page runs in Chrome on the laptop and works on files in the synced folder. The page's security policy stops it from sending data anywhere.

### First use

1. Click **Choose folder** and pick **APP Framework** in OneDrive - Middlesex University. Allow Chrome to view and edit it.
2. On **Import tracker**, choose the APP timeline and status spreadsheet, check the preview, then save. This creates `APP Projects/_Tracker data/tracker.json`.
3. On **Template audit**, click **Check templates**.

Chrome remembers the folder, so later visits need one click at most.

### What it does so far

- **Import tracker:** reads the `APP Timeline` sheet (names, descriptions, status, the nine target columns, and the Gantt stages with their dates) into `tracker.json`. Importing again updates everything except status, because the tool's copy owns live status. The previous copy goes into `_Tracker data/backups/` first.
- **Template audit:** finds `APPx.y - Name.docx` files in the strand folders, including subfolders, and reads each template's dropdowns and dates. It lists missing, incomplete, unreadable and duplicate templates, plus any file that doesn't match a tracker row. The details it finds are copied into the tracker.
- **Strands:** an all-strand table with the committee's four status categories, and a view of each strand showing where each intervention should be by now and whether it is behind plan or due to change stage within 14 days. The check compares planned dates (from the template, or the Gantt if there is no template) with the stage recorded in the template.

### Setting up the web address on Vercel

1. In Vercel, choose **Add New**, then **Project**, and import `APP-equity-analyses`. Vercel may ask for access to the repository on GitHub.
2. Set **Root Directory** to `APP reporting tool`.
3. Set **Framework Preset** to **Other**, and leave the build settings empty.
4. Click **Deploy**, then bookmark the address it gives you.

The repository stays private. The address shows the tool's code to anyone who has it, but no data, because the data only ever lives in the synced folder.

## Files

- `scoping-brief.md`: purpose, constraints, data model, pipeline and demo scope.
- `source-document-structure.md`: the layout of the tracker and the Word templates the tool reads and writes, plus the vocabulary mismatches between them.
- `index.html` and `js/`: the tool. `js/lib/jszip.min.js` is JSZip 3.10.2 (MIT licence), used to open Word and Excel files in the browser.
- `folder-access-check.html`: a one-off check that Chrome can read and write the synced folder. Download it, double-click it, choose the synced folder, and check that every step says Pass.

## Decisions so far

- **Browser:** Chrome on the laptop, from a Vercel web address or by double-clicking. No server and no Python.
- **Master data:** JSON in the synced folder. The Excel tracker is imported once, then becomes an export.
- **Phone view:** a `latest-summary.pdf` saved into the synced folder, opened in the OneDrive app. The web address can't show data on the phone, because the phone can't reach the synced folder.
- **Statuses:** the template's list (On track, Ahead of schedule, At risk, Behind schedule), plus BAU and To be mapped, is used day to day. The report collapses these into the committee's four categories.
- **Committee reports:** read from and written to `APP Framework/Committees and reporting`. Choosing APP Framework as the tool's folder covers both locations.
- **Committee report:** built as a Word file in the browser on the laptop, not by a cloud routine, so the data stays in the MDX boundary.
- **Folder access confirmed:** the folder check passed every step in Chrome against the synced `APP Projects` folder (read, write, read back, delete).
- **Template audit:** the tool reads the strand subfolders inside `APP Projects` and matches templates to tracker rows by intervention number, using file names such as `APP6.3 - Embedding Graduate Competencies and Authentic Assessments.docx`.
