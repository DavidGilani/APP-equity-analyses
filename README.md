# APP equity analyses

Tools for comparing a group of students against the whole student population, to
support Access and Participation Plan (APP) equity work.

## APP tracking and reporting tool (in scoping)

A local, in-boundary tool for tracking APP intervention delivery and
semi-automating the ESE committee report. See
[`docs/app-tracker/scoping-brief.md`](docs/app-tracker/scoping-brief.md). As with
the dashboard below, this repository holds code only: no tracker data, notes,
transcripts or snapshots are committed here.

## Student cohort comparison dashboard

A single-page tool that compares a group of students against the whole student
population, overall and by sub-group, using a dumbbell-chart style.

### Files

- `student_dashboard.html` — the page. All CSS and JS are inline. It reads the
  uploaded CSV(s) in the browser and does the maths locally; nothing is uploaded
  anywhere.
- `student_dashboard_data.js` — the built-in **fallback baseline** (the 2025/26
  whole-population distributions, 14,256 students). Percentages and counts only,
  no personal records. Used only when no population file is uploaded.

No student data is kept in this repository. Uploaded CSVs are read entirely in
the browser and never leave the viewer's device.

### Two ways to use it

**1. Two files, joined by student ID (recommended).**
Upload a **population file** (one row per student: an ID column plus demographic
columns for everyone) and a **cohort/service file** (the students of interest:
an ID column, plus optional service or sub-group columns). The dashboard joins
them on ID, pulls demographics from the population file, and compares. Because
both sides come from the same file, category labels always match, there is no
label-mismatch problem. Students in the cohort file not found in the population
file are reported and excluded from the breakdowns.

**2. One cohort file against the built-in baseline (quick mode).**
Skip the population file and upload only a cohort file that already carries
demographic columns. It is compared against the baked-in baseline. Here the
cohort's labels must match the baseline labels (for example `United Kingdom`,
not `UK`); mismatches are listed under "Notes on the data".

### Column mapping and sub-groups

After upload, every column is shown with sample values and a role you confirm or
change:

- **Student ID** — used to join the two files.
- **Demographic** — a dimension to compare on (in the population file, or in the
  cohort file for quick mode).
- **Sub-group: any value here** — a *flag* column (e.g. a service name). Any
  student with a value counts as a member.
- **Sub-group: split by each value** — a *category* column (e.g. year). Each
  distinct value becomes its own sub-group.
- **Ignore.**

The result gets a service/sub-group tab row (All, plus one tab per flag column
and per category value). Each shows representation vs the population across every
demographic, with a two-proportion z-test at the 95% level and a "Biggest gaps"
view. Groups under 10 students are suppressed and not tested.

### Refreshing the built-in baseline

Edit `student_dashboard_data.js`. Each dimension under `POPULATION` is a list of
`{category, pct, n}`. This only affects quick mode; the two-file mode uses the
uploaded population file instead.

### Embedding on a SharePoint page

SharePoint (modern pages) will **not** run an uploaded HTML file with its own
JavaScript from a document library, and the **Embed** web part only accepts
`<iframe>` code pointing at a domain your tenant has allow-listed. So there are
two realistic routes:

**Option A — host it, then embed via iframe (recommended).**
1. Put `student_dashboard.html` and `student_dashboard_data.js` somewhere that
   serves them as a live web page. GitHub Pages works for this; a
   tenant-approved web host works too.
2. A SharePoint admin adds that domain to the allow-list:
   **SharePoint admin centre → Settings → (classic settings) → HTML Field
   Security**, or the site's **Site collection features**, add the host domain.
3. On the page, add the **Embed** web part and paste:
   ```html
   <iframe src="https://your-host/student_dashboard.html"
           width="100%" height="1200" style="border:0"></iframe>
   ```

**Option B — File viewer web part (no scripting).**
Upload the HTML to a document library and use the **File viewer** web part. This
renders the file but will not execute the upload/JavaScript, so the interactive
dashboard will not work this way. Use it only for static previews.

If your tenant blocks custom scripts and iframes entirely, the fallback is to
share the two files in a synced OneDrive/SharePoint folder and have people open
`student_dashboard.html` directly from the synced folder on their machine.

The uploaded CSV never leaves the viewer's browser in any of these options.
