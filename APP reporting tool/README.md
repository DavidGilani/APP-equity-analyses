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

### The process, in order

1. **Agree a plan for each intervention.** On **Interventions**, open the intervention. Record each deliverable with an owner and a date, and the data the evaluation needs: what, why, who provides it, in what format and when. Save the plan as a Word file, send it to the team, and record it as agreed once they confirm.
2. **Two weeks before each paper deadline (the reminder banner shows on Progress from four weeks out),** send each strand lead their summary from **Progress**, **Strand lead summaries**.
3. **When updates come in,** paste them on **Updates**, or edit the intervention's page directly. Moving an agreed date later asks for the reason.
4. **Keep project documents and the timeline in step.** Changes to project documents go on the **Theory of Change audit** checklist, and **Progress**, **Timeline spreadsheet** updates the Gantt once a document's dates change.
5. **At the deadline,** follow the checklist under **Progress**, **Committee reporting**, then create the draft paper.

### The tabs

- **Progress:** how many interventions are business as usual, on track, behind schedule, completed or needing further scoping, overall and by strand. Click any number to list the interventions behind it. "Behind schedule" covers interventions marked at risk or behind, and any with a deliverable or action overdue or blocked, a deliverable later than its agreed date, or data past its due date. Progress has three more pages:
  - **Strand lead summaries:** for each strand, your open actions, the team's, and every non-BAU intervention, saved as a Word file or copied as email text.
  - **Committee reporting:** committee dates (editable), the countdown and checklist, the termly ESE paper and annual report, and Outlook reminders: an all-day entry, shown as free, on each paper deadline and two weeks before it.
  - **Timeline spreadsheet:** checks the APP timeline and status spreadsheet and updates it (see below). The import sits here too.
- **Updates:** drag in an update file, choose one, or paste the text, then check the preview and save. Data requirements with the same description as an existing one are merged, both when an update is saved and each time the folder is opened. See `meeting-update-format.md`.
- **Interventions:** every intervention, with its status, progress group, plan and next due date. Each opens a page with everything about it: status, deliverables and actions, and data requirements, each shown as a table with an Edit button on each row, and Copy buttons that put the tables on the clipboard ready to paste into an email, the plan's agreement, notes, project document changes, and a link to its project document. Recording a plan as agreed fixes each deliverable's agreed date, so later changes show as slippage. With the SharePoint address of APP Projects saved, the document link opens it in Word; otherwise the page offers a copy.
- **Theory of Change audit:** counts of complete, partly written and missing theories of change for non-BAU interventions in strands 1 to 6 (strand 7 is listed separately), with the missing sections for each, related notes, and the checklist of project document changes.
- **How it works:** the question mark in the banner opens a diagram of how the data flows and the reporting cycle.

### Updating the timeline spreadsheet

The tool updates two things: the project status column, and the Gantt bars for interventions whose project template has planning, implementation and evaluation dates. For each changed row it removes the current cycle's bars and draws new ones on the weeks in the template, split into quarter blocks like the rest of the sheet, with the stage labels and cell styles already used in the sheet. Bars that finish before the new dates start, such as BAU or evaluation of the existing activity, are kept. Nothing outside the changed rows is touched.

Before replacing the file it saves a copy in `_Tracker data/backups/`, and it reads the new file back to check that every changed row says what it should. If the check finds a problem, the spreadsheet isn't changed. Close the spreadsheet in Excel before updating.

### Committee papers

Both papers are built from the tracker and saved as new Word files in `APP Framework/Committees and reporting`; an existing draft is never overwritten. Parts only the author can write are left as prompts in square brackets. The cover sheet, Table 1 and the Interventions Fund table are carried over from the latest paper in that folder, with the dates moved on. Status colours: green for on track or ahead, purple for at risk or behind.

**Termly ESE paper:**
1. Executive summary: status changes since the last paper, with reasons.
2. Delivery at a glance: counts now and at the last paper, and a table by strand.
3. Exceptions: only interventions at risk or behind, or whose status changed: what is happening, why, next step and when it should be back on track.
4. Changes to the plan: scope changes recorded since the last paper.
5. Theory of change and evaluation: completeness counts, and evaluation reports due or overdue (from the project template dates).
6. Successes and impact.
7. Progress against targets: Table 1.
8. Sector and regulatory context.
9. APP Interventions Fund.
10. Priorities for next term: drafted from deliverables due before the next paper.
11. Action.

Appendix A is the delivery roadmap (every intervention with its status, APP targets and next deliverable), and Appendix B the Interventions Fund projects.

**Annual report:** executive summary, delivery over the year (against the snapshot nearest a year ago), progress against targets, targets by faculty (a chart and table per target), other gaps to monitor, evaluation findings and impact, expenditure against the plan, and priorities for next year. The faculty, gaps and expenditure figures come from `_Tracker data/APP annual report data.xlsx`, which Committee reporting creates with the right sheets and headings. On the faculty charts each bar is a faculty's gap, the black line is the University gap, and the arrow is the change since last year: purple where the gap has widened, green where it has narrowed.

Creating the termly paper can also save a dated snapshot in `_Tracker data/snapshots/`, which the next paper compares against.

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
- `js/`: `app.js` (the page), `model.js` (statuses and slip checks), `template-read.js` (reading templates and judging theory of change completeness), `tracker-import.js` and `xlsx-read.js` (reading the spreadsheet), `xlsx-write.js` (updating statuses and Gantt bars), `meeting-update.js`, `reports.js` (strand summaries and snapshots), `reporting.js` (committee dates, the readiness checklist and reminders), `papers.js` (the termly paper and annual report), `annual-data.js` (the annual data spreadsheet and faculty charts), `timeline-check.js`, `plans.js` (delivery and data plans), `docx-write.js` (writing Word files) and `folder.js`.
- `meeting-update-format.md`: the meeting update format and the Copilot prompt that produces it.
- `folder-access-check.html`: a one-off check that Chrome can read and write the synced folder. Download it, double-click it, choose the synced folder, and check that every step says Pass.

## Decisions so far

- **Look and feel:** the page follows the staff intranet: a dark purple banner, condensed type and pill buttons. Status colours follow the Project Delivery Framework's accessible palette, with green for Green, white for Amber and purple for Red. Fonts load from Google Fonts, and the page falls back to system fonts when offline.
- **Delivery and data plans:** each intervention has written deliverables with dates and written data requirements, agreed with its team, so slippage can be checked against what was agreed and the evaluation has the data it needs.
- **Browser:** Chrome on the laptop, from a Vercel web address or by double-clicking. No server and no Python.
- **Master data:** JSON in the synced folder. The Excel tracker is imported once; after that the tool writes statuses and Gantt bars back to it.
- **Phone view:** a `latest-summary.pdf` saved into the synced folder, opened in the OneDrive app. The web address can't show data on the phone, because the phone can't reach the synced folder.
- **Statuses:** the template's list (On track, Ahead of schedule, At risk, Behind schedule), plus BAU, To be mapped and Completed, is used day to day, with no RAG rating. Green marks on track or ahead, purple marks at risk or behind. The papers count them in the committee's four categories.
- **Report formats:** a short termly ESE paper built around exceptions, plus an annual report with faculty breakdowns, other gaps to monitor, evaluation findings and expenditure. No risk scoring and no OfS tier flags for now.
- **Committee reports:** read from and written to `APP Framework/Committees and reporting`. Choosing APP Framework as the tool's folder covers both locations.
- **Committee report:** built as a Word file in the browser on the laptop, not by a cloud routine, so the data stays in the MDX boundary.
- **Folder access confirmed:** the folder check passed every step in Chrome against the synced `APP Projects` folder (read, write, read back, delete).
- **Template audit:** the tool reads the strand subfolders inside `APP Projects` and matches templates to tracker rows by intervention number, using file names such as `APP6.3 - Embedding Graduate Competencies and Authentic Assessments.docx`.
