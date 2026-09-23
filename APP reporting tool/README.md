# APP reporting tool

A local, in-boundary tool for tracking Access and Participation Plan (APP) intervention delivery and semi-automating the ESE committee report.

This folder holds code and documentation only. Tracker data, notes, transcripts, completed templates and snapshots live in the OneDrive-synced folder and are never committed here.

## Running the tool

**From a web address (recommended).** Once Vercel is set up (below), open the address in Chrome on your laptop and bookmark it. Every push to `main` updates it automatically.

**By double-clicking.** Download this folder, keeping the `js` folder next to `index.html`, and double-click `index.html` to open it in Chrome.

Either way, the page runs in Chrome on the laptop and works on files in the synced folder. The page's security policy stops it from sending data anywhere.

### First use

1. Click **Choose folder** and pick **APP Framework** in OneDrive - Middlesex University. Allow Chrome to view and edit it.
2. On **Timeline spreadsheet**, import the APP timeline and status spreadsheet (the tool finds it in APP Projects or APP Framework), check the preview, then save. This creates `APP Projects/_Tracker data/tracker.json`.

Chrome remembers the folder, so later visits need one click at most. Each time the folder is opened, the tool re-reads every project template, so the views are always current.

### The tabs

- **Progress:** the page to use before a strand lead catch-up. For each strand: your open actions, the team's open actions and deliverables, and every non-BAU intervention with its APP targets (1 to 9), status, planned stage now, next action and theory of change progress. It saves a Word summary for the strand lead, or copies it as email text; either records the summary as sent.
- **Reporting:** the committee cycle. Committee dates and paper deadlines, a countdown, and a checklist of what's still needed: strand summaries sent and responses back, reasons for anything behind schedule or at risk, successes, Table 2 notes by strand, and the timeline spreadsheet. It creates the draft paper from the latest paper in `Committees and reporting`, creates a separate document of generated sections, and saves Outlook reminders. From four weeks before a deadline, a banner on every tab points here.
- **Interventions:** one card per intervention, for recording things during a meeting: status, actions and deliverables, notes (including reasons for delay and successes) and template changes.
- **Meeting update:** paste a structured update from a meeting or a strand lead's response, check the preview, and save it. See `meeting-update-format.md`.
- **Theory of Change audit:** counts of complete, partly written and missing theories of change for non-BAU interventions in strands 1 to 6 (strand 7 is listed separately), with the missing sections for each, related meeting notes, and the checklist of template changes raised in meetings.
- **Timeline spreadsheet:** checks the APP timeline and status spreadsheet against the tool, and updates it automatically (see below). Anything it can't change is listed for changing by hand. The import sits on the same tab.
- **How it works:** a diagram of how the data flows and a timeline of the reporting cycle.

### Updating the timeline spreadsheet

The tool updates two things: the project status column, and the Gantt bars for interventions whose project template has planning, implementation and evaluation dates. For each changed row it removes the current cycle's bars and draws new ones on the weeks in the template, split into quarter blocks like the rest of the sheet, with the stage labels and cell styles already used in the sheet. Bars that finish before the new dates start, such as BAU or evaluation of the existing activity, are kept. Nothing outside the changed rows is touched.

Before replacing the file it saves a copy in `_Tracker data/backups/`, and it reads the new file back to check that every changed row says what it should. If the check finds a problem, the spreadsheet isn't changed. Close the spreadsheet in Excel before updating.

### Committee papers

**Create the draft paper** copies the latest paper in `APP Framework/Committees and reporting` and saves it under a new name for the next committee, for example `ESE October 2026 - APP update v1 (draft from the tool).docx`. In the copy it updates:

- the status counts in sentences like "5 interventions now classified as business as usual (BAU)";
- Table 2 (found by its BAU and On track headings): the counts for each strand, the totals row, and the notes column where Table 2 notes have been written on the Reporting tab.

Everything else, including Tables 1 and 3 and the narrative, stays as it was in the last paper for editing. The tool lists what it updated and anything it couldn't find. The original paper isn't changed.

**Create generated sections** makes a separate document with the counts, Table 2, theory of change progress, and what changed, successes and reasons for delay since the last snapshot. Either button can save a dated snapshot in `_Tracker data/snapshots/`, which the next paper compares against.

Strand summaries and the timeline checklist are saved in `APP Projects/_Tracker data/Reports/`.

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
- `js/`: `app.js` (the page), `model.js` (statuses and slip checks), `template-read.js` (reading templates and judging theory of change completeness), `tracker-import.js` and `xlsx-read.js` (reading the spreadsheet), `xlsx-write.js` (updating statuses and Gantt bars), `meeting-update.js`, `reports.js` (summaries, snapshots and generated sections), `reporting.js` (committee dates, the readiness checklist and reminders), `paper-fill.js` (the draft committee paper), `timeline-check.js`, `docx-write.js` (writing Word files) and `folder.js`.
- `meeting-update-format.md`: the meeting update format and the Copilot prompt that produces it.
- `folder-access-check.html`: a one-off check that Chrome can read and write the synced folder. Download it, double-click it, choose the synced folder, and check that every step says Pass.

## Decisions so far

- **Browser:** Chrome on the laptop, from a Vercel web address or by double-clicking. No server and no Python.
- **Master data:** JSON in the synced folder. The Excel tracker is imported once; after that the tool writes statuses and Gantt bars back to it.
- **Phone view:** a `latest-summary.pdf` saved into the synced folder, opened in the OneDrive app. The web address can't show data on the phone, because the phone can't reach the synced folder.
- **Statuses:** the template's list (On track, Ahead of schedule, At risk, Behind schedule), plus BAU and To be mapped, is used day to day. The report collapses these into the committee's four categories.
- **Committee reports:** read from and written to `APP Framework/Committees and reporting`. Choosing APP Framework as the tool's folder covers both locations.
- **Committee report:** built as a Word file in the browser on the laptop, not by a cloud routine, so the data stays in the MDX boundary.
- **Folder access confirmed:** the folder check passed every step in Chrome against the synced `APP Projects` folder (read, write, read back, delete).
- **Template audit:** the tool reads the strand subfolders inside `APP Projects` and matches templates to tracker rows by intervention number, using file names such as `APP6.3 - Embedding Graduate Competencies and Authentic Assessments.docx`.
