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
any results. Download PDF builds an A4 landscape PDF in the page itself, so pages come out the right way round on any computer; its pages are pictures, so the text cannot be selected. Pages break between rows and panels, a panel that fits on one page is kept whole, and a page that is only slightly too long is shrunk to fit. Print uses the browser's print window instead and keeps the text selectable (choose Save as PDF as the destination).

Each report has its own tab, so several can be kept side by side; **+ New
report** starts a blank one. In an area summary, the Targets buttons above the
section close or add back individual targets (or show only the BTEC, free school
meals, ethnicity or IMD targets), and the rows of the snapshot below can be
closed or added back in the same way. These buttons are not printed. The
**APP Interventions Fund** report is set up as a tab the first time the page
opens, and is also available under Start from. Reports use Middlesex University
colours and type; the colour values sit together at the end of the page's styles
so they can be updated.

The **Reverse mentoring pairings** section (also a report tab and a template)
takes a list of departments with staff taking part, how many staff, and any
pairing a faculty has already asked for. For each department it recommends the
group of students to pair with: the group whose gap is widest against the
University, using the same grouped comparison as the Largest department gaps
page. It writes a short summary, says whether a requested pairing is supported
(comparing the named stage where one is given, such as BTEC completion), and
shows each target's figures. A subject name such as Music adds the matching
programmes in that department. The list holds departments only: no staff names.

## Student cohort comparison dashboard

A single-page tool that compares a group of students against the whole student
population, overall and by sub-group, using a dumbbell-chart style.

### Files

- `student_dashboard.html` — the page. All CSS and JS are inline. It reads the
  uploaded CSV(s) in the browser and does the maths locally; nothing is uploaded
  anywhere.
- `student_dashboard_data.js` — the built-in **fallback baseline** (the 2025/26
  whole student population, 14,023 students, built from the student number
  download). Percentages and counts only, with categories under 10 students
  combined. Used only when no population file is uploaded.
- `student_dashboard_mis.js` — reads Excel files and recognises the student number
  download (see below). Holds no data.
- `lib/jszip.min.js` — used to read Excel files.

No student data is kept in this repository. Uploaded CSVs are read entirely in
the browser and never leave the viewer's device.

### The student number download as the population file

The recommended population file is the student number download from
`MDX_STUDENT_NUMBERS_SV`, filtered as in the planning team's EDI report
(EnrolmentStatus ES, IN or NA; Hendon campus; collaboration type blank or Joint;
StudentStatus AS; DegreeStatus SO, FN or PF). It can be uploaded as the Excel file
straight from the download, or saved as text: comma or tab separated, in UTF-8 or
UTF-16 (Excel's "Unicode Text"), whatever the file extension.

The fullest version is the "Student EDI data" download, which adds programme level
(`Programme Level Description`), new or returning (`Student New Or Returning`) and
the apprenticeship flag. With its base filters (2025/26, enrolled, not joint, no
apprentices) it gives 11,042 students, matching the EDI dashboard.

When its headers are recognised, the dashboard:

- fills down the Student Id, which the download leaves blank on a student's second
  year;
- keeps both academic years, with an Academic year column, and starts the
  population on the latest year and enrolled students (ES), with apprentices
  left out where the download has the apprenticeship flag. These are ordinary
  population filters (see below), so any of them can be changed;
- groups each characteristic as the EDI report does, so totals match that report
  exactly (2025/26: 14,023 students, 10,293 BAME, 5,903 under 21, 2,341 with a
  reported disability). Sex is Female, Male or Other (blank counts as Other). Age
  on entry is under 21 (16-20) or 21 and over. BAME grouping counts Gypsy or
  Traveller as BAME and Irish Traveller as White, as the report does;
- adds the wider characteristics in the download: faculty, level and mode of
  study, residency, first generation in HE, care leaver, IMD quintile (from the
  home postcode decile), and prior qualifications from the A-level and BTEC flags.
  It also adds the IMD widening participation flag (deprived area, yes or no) where
  the download has no postcode decile. Department, detailed ethnicity, religion,
  parental HE and entry route are available too and can be switched on in the
  column mapping. Characteristics the download does not hold (for example faculty,
  when there is no faculty field) are left out automatically. Enrolment status,
  joint programme and apprenticeship are set up as filters only, as are new or
  continuing, intake and programme type when the download includes them.

Values shown as `*` in the download are treated as not known and left out of the
comparison for that characteristic. Student numbers match with or without the
leading M and zeros, so `M01093680`, `01093680` and `1093680` are the same
student.

To refresh the built-in baseline from a new download:

```bash
node analysis/build_dashboard_baseline.js "path/to/Student_number_data.xlsx"
```

### Population filters

Any population column can be marked as a demographic (compared on) or a filter
only (used to choose who counts). Under **Population: who counts?**, tick the
values to keep for each filter, for example 2025/26 and enrolled students. The
page shows the population count as you go. If more than one academic year is
selected, each student is counted once, using their latest year.

Cohort students take their characteristics from anywhere in the population file,
even if they are outside the population filters (for example, from another year
or not recorded as enrolled), so as many as possible are included. The population
they are compared with is still the filtered one.

### Funding funnels

Under **Funds and funnel stages**, each fund groups cohort columns into two
stages: who applied and who received it. Ticking several columns for a stage
combines them, which is how small donor funds can be grouped into one. Each fund
can have eligibility filters on top of the population filters, and a fund filter
replaces the population filter for the same column (for example, a different
academic year for a scheme awarded to last year's entrants). Columns named
"<fund> applied" and "<fund> received" (or paid) are paired up automatically.

The **Funding funnel** view then shows, for each fund, the population, the
eligible students, those who applied and those who received the fund. It looks at
three comparisons:

- **Whole journey:** of the eligible students in each group, the share who
  received the fund, against every other eligible student. This is where to start.
- **Applying:** the share of eligible students who applied.
- **Being awarded:** the share of applicants who received the fund.

An **All financial support** funnel comes first when there is more than one
fund: a student counts as eligible, applying or receiving if they are for any
fund. Funds called Living Costs Fund (or hardship) default to UK students, and the
excellence scholarship to new UK undergraduates in the previous year; any of
these can be changed.

**Where the gaps are** lists the significant gaps for the chosen comparison,
largest first (eight at a time), each with its 95% range. For the whole journey it
also shows whether each gap comes from applying, being awarded or both. A chart shows each
gap's rate and range beside the rate for everyone else. Selecting a characteristic
shows a flow chart of each group's share at each stage, with * where an applied or
received share differs significantly from the group's share of eligible students,
and a table of the figures. **All three stages** shows eligible, applied and received
side by side. Gaps are tested with a two-proportion z-test at the 95% level, and
groups under 10 students are combined or not shown.

Applicants count if they meet the fund's own eligibility filters, wherever they
are in the population file; the notes report anyone left out and why. If everyone
counted as applying also received the fund, the page says so, since that usually
means unsuccessful applications had no student number. The PDF report includes
the funnels.

The population filters and funds are remembered in the browser. **Save setup**
writes them to a small file of column names and filter choices, with no student
data, so the same setup can be opened next year or on another computer.

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

Run `analysis/build_dashboard_baseline.js` on the latest student number download
(see above). This only affects quick mode; the two-file mode uses the uploaded
population file instead.

### Hosting on the APP LibGuides pages

The page and its scripts hold no student data, so they can sit on a page anyone
can open. The data is the part that needs MDX sign-in. Three routes, in order of
how much setup they need:

1. **Tool on LibGuides, population file on SharePoint.** Put the tool on the
   LibGuides page and keep the student number download in a SharePoint or Teams
   folder that only the right staff can open. Staff sign in to SharePoint with
   their MDX account, download the file, and drop it into the tool alongside their
   own list of students. Nothing is uploaded anywhere. This works without any
   IT changes.
2. **Tool on LibGuides, data read from SharePoint automatically.** The page signs
   staff in with their MDX (Microsoft) account and reads the population file
   straight from SharePoint through Microsoft Graph, so staff only upload their
   own list. This needs IT to register an app in Microsoft Entra ID with the
   LibGuides address as its redirect, with delegated permission to read files.
   SharePoint permissions still decide who can see the data.
3. **Restricting the LibGuides page itself.** LibGuides can hide or restrict a
   guide, but the student number download should not be uploaded to LibGuides,
   which is run by an external company (Springshare). Restricting the page alone
   does not keep the data within MDX systems.

To try the tool on a LibGuides page without hosting any files, build a single
block of HTML and paste it into a **Media / Widget** box:

```bash
node analysis/build_libguides_snippet.js libguides_cohort_tool.html
```

The block holds the page, the built-in baseline (counts only) and the Excel preset.
It is compressed to fit the 65,535-character limit on embed code.

The browser itself keeps uploaded files on the person's device. The tool runs in a
sandboxed frame with a Content Security Policy that blocks every network request,
form submission and browser storage, and that LibGuides (or any analytics on the
page) cannot read into. The only thing the frame sends to the page is its height.
It loads the
Excel reader from cdnjs. Rebuild it whenever the dashboard or baseline changes.

Alternatively, add an HTML or widget box that loads
the page in an `<iframe>` from wherever the files are hosted, or ask the LibGuides
administrators whether custom scripts can be added to a page's content. The files
need to stay together: `student_dashboard.html`, `student_dashboard_data.js`,
`student_dashboard_mis.js` and `lib/jszip.min.js`.

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
