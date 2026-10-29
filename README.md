# APP equity analyses

Tools for comparing a group of students against the whole student population, to
support Access and Participation Plan (APP) equity work.

## APP tracking and reporting tool (in scoping)

A local, in-boundary tool for tracking APP intervention delivery and
semi-automating the ESE committee report. See
[`APP reporting tool/`](APP%20reporting%20tool/README.md). As with
the dashboard below, this repository holds code only: no tracker data, notes,
transcripts or snapshots are committed here.

## APP equity gaps dashboard

`app_equity_dashboard.html` shows progress against the eight APP success and
progression targets for the University, each faculty, department and programme.
It holds no data of its own: load the CSVs written by
`analysis/app_equity_gaps.R` (`equity_gaps_all_levels_long.csv`, and optionally
`equity_gaps_scan.csv`). Files are read in the browser and never uploaded.

The **Largest department gaps** page ranks departments within each faculty by
their widest gap, to help choose departments for the reverse mentoring pilot.
Each target uses the latest four years combined and is compared with the
University's gap for the same target. Targets for the same group of students
(four BTEC, two free school meals) are combined, weighted by the number of
students, so each group counts once. Targets with fewer than 20 students in
either group are left out. The (i) button explains the method in full.

The **Report builder** page puts sections from any page into one PDF, in the
order you choose. Drag section types into a list and reorder them, set each
section's filters and which parts to include, or add a panel straight from
another page through its download menu. Titles, headings, captions and summaries
can be edited in the preview. Templates include one section per faculty. The
layout is kept in the browser and can be saved as a layout file; neither holds
any results. Download PDF uses the browser's print window (A4 landscape).

Each report has its own tab, so several can be kept side by side; **+ New
report** starts a blank one. In an area summary, the Targets buttons above the
section close or add back individual targets (or show only the BTEC, free school
meals, ethnicity or IMD targets), and the rows of the snapshot below can be
closed or added back in the same way. These buttons are not printed. The
**APP Interventions Fund** report is set up as a tab the first time the page
opens, and is also available under Start from. Reports use Middlesex University
colours and type; the colour values sit together at the end of the page's styles
so they can be updated.

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

### PDF summary report

Once the comparison is built, **Download PDF report** (top right) produces a
summary report for all groups or just the one on screen. It has a cover page
explaining how to read the results, then for each group: headline figures, the
key findings written out (significant under- and over-representation ordered by
the size of the gap, and larger groups in line with the population), the biggest
gaps chart and a chart for every demographic. It opens the browser's print
window; choose "Save as PDF" as the destination. Charts stay as sharp vector
graphics and the report is built entirely in the browser, like everything else.

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
