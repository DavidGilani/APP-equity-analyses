# APP reporting tool

A local, in-boundary tool for tracking Access and Participation Plan (APP) intervention delivery and semi-automating the ESE committee report.

This folder holds code and documentation only. Tracker data, notes, transcripts, completed templates and snapshots live in the OneDrive-synced folder and are never committed here.

## Files

- `scoping-brief.md`: purpose, constraints, data model, pipeline and demo scope.
- `source-document-structure.md`: the layout of the tracker and the Word templates the tool reads and writes, plus the vocabulary mismatches between them.
- `folder-access-check.html`: a one-off check that Chrome can read and write the synced folder. Download it, double-click it, choose the synced folder, and check that every step says Pass.

## Decisions so far

- **Browser:** Chrome, opened by double-clicking a local file. No server and no Python.
- **Master data:** JSON in the synced folder. The Excel tracker is imported once, then becomes an export.
- **Phone view:** a `latest-summary.pdf` saved into the synced folder, opened in the OneDrive app. Nothing is published to GitHub Pages, because the view would need the data behind it.
- **Committee report:** built as a Word file in the browser on the laptop, not by a cloud routine, so the data stays in the MDX boundary.
- **Template audit:** the tool reads the synced templates folder and matches file names that start with the intervention number (for example `APP6.3 ...docx`) against the tracker.
