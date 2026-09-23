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

- **Progress:** the page to use before a strand lead catch-up. For each strand: your open actions, the team's open actions and deliverables, and every non-BAU intervention with its APP targets (1 to 9), status, planned stage now, next action and theory of change progress. It saves a Word summary for the strand lead, or copies the same summary as email text. The **All** view has the status table by strand and creates the ESE committee update (see below).
- **Interventions:** one card per intervention, for recording things during a meeting: change the status, update actions and deliverables, add notes, and tick off template changes.
- **Meeting update:** paste a structured update from a meeting (typed by hand, or written by Copilot from a Teams transcript), check the preview, and save it. See `meeting-update-format.md` for the format and the Copilot prompt.
- **Theory of Change audit:** counts of complete, partly written and missing theories of change for non-BAU interventions in strands 1 to 6. Strand 7 is listed separately, because its interventions are architectural. For partly written templates it lists exactly which sections are still empty, and shows the meeting notes and template changes that could help fill them. Below that is the checklist of template changes raised in meetings.
- **Timeline spreadsheet:** checks the APP timeline and status spreadsheet against the tool and lists the changes it probably needs: status differences, template dates that differ from the Gantt, deliverables due after the timeline ends, timing changes raised in meetings, and notes that mention timing. The list can be saved as a Word checklist. The import sits on the same tab.

### What counts as a complete theory of change

A section counts as written when its cell has content beyond the template's guidance prompts. "Complete" means all eight theory of change sections and all five evaluation sections are written, and planning, implementation and evaluation all have start and end dates. If a template is ticked as completed but still has gaps, the audit says so.

### Committee updates and snapshots

**Create committee update** (Progress, All) saves a Word document to `APP Framework/Committees and reporting` with the status counts in the committee paper's wording, Table 2 by strand (with risks recorded since the last update as a starting point for the notes column), theory of change progress by strand, and a "what changed since the last update" list. By default it also saves a dated snapshot in `_Tracker data/snapshots/`, which the next update compares against. Tables 1 and 3 are still added by hand.

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
- `js/`: `app.js` (the page), `model.js` (statuses and slip checks), `template-read.js` (reading templates and judging theory of change completeness), `tracker-import.js` and `xlsx-read.js` (reading the spreadsheet), `meeting-update.js`, `reports.js` (summaries, snapshots and the committee update), `timeline-check.js`, `docx-write.js` (writing Word files) and `folder.js`.
- `meeting-update-format.md`: the meeting update format and the Copilot prompt that produces it.
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
