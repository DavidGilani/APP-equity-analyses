# APP equity analyses

Tools for comparing a group of students against the whole student population, to
support Access and Participation Plan (APP) equity work.

## Student cohort comparison dashboard

A single-page tool that lets someone upload a CSV of students and see how that
group compares with the whole student population, using a dumbbell-chart style.

### Files

- `student_dashboard.html` — the page. All CSS and JS are inline. It reads the
  uploaded CSV in the browser and does the maths locally; nothing is uploaded
  anywhere.
- `student_dashboard_data.js` — the baked-in **population baseline** (the
  2025/26 whole-population distributions, 14,256 students). Percentages and
  counts only, no personal records. Keep it in the same folder as the HTML.
- `sample_cohort.csv` — a small synthetic file for testing the upload.

### What it does

1. The user drops in a CSV with one row per student.
2. It matches the columns to demographic dimensions (Gender, Ethnicity, Age
   group, Disability, Residency, Religion, and so on). Matching ignores case
   and spacing, and each dimension has a list of accepted column names in
   `student_dashboard_data.js` under `columnAliases`, which you can extend.
3. For each dimension it tallies the cohort, works out each group's share, and
   compares it with the population share. A two-proportion z-test at the 95%
   level flags groups that are significantly over- or under-represented.
4. Groups with fewer than 10 students in the cohort are suppressed and not
   tested.

Category labels in the CSV need to match the population labels (for example
`United Kingdom`, not `UK`) to line up. Anything that does not match is listed
under "Notes on matching" so it is visible rather than silently dropped.

### Refreshing the population baseline

Edit `student_dashboard_data.js`. Each dimension under `POPULATION` is a list of
`{category, pct, n}`. Update the numbers, or add/remove dimensions, and the page
picks them up on next load.

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
