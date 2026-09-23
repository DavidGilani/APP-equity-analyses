# APP tracking and reporting tool: scoping brief

## Purpose

Middlesex University runs a large set of Access and Participation Plan (APP) interventions, grouped into seven strands, each with a strand lead and often separate project leads underneath. Progress is reviewed in regular one-to-one meetings and reported to the Education and Student Experience (ESE) Committee every few months.

Two problems drive this work. First, capturing progress from those meetings is manual and slow. Second, issues that threaten delivery surface too late, often only when the committee paper is being written.

The aim is a small, in-boundary tool and a supporting pipeline that reduce the manual note-taking, surface delivery risks earlier, and semi-automate the committee report.

## Goals

1. Cut the manual effort of recording progress after each lead or project meeting.
2. Surface barriers to delivery earlier, before they reach a committee cycle.
3. Generate the computable parts of the committee report automatically, leaving only judgement to the author.

## Settled constraints and architecture

These are decided and should not be reopened in the build.

- All data stays inside the MDX Microsoft boundary (OneDrive / SharePoint / Teams). This includes project documents, the tracker, notes, and meeting transcripts.
- No admin approvals are available for a tool with programmatic SharePoint API access. The demo must not depend on a registered app reading SharePoint, or on Power Apps / Power Automate connectors that need admin consent.
- Code lives in a private GitHub repository that only David can access. The repository holds code only. No data, notes, or transcripts are ever committed to it.
- Data lives in a OneDrive-synced local folder, which is the in-boundary copy. The tool runs locally against the synced files, the same double-click, no-server pattern already used for the wellbeing dashboards. OneDrive syncs any changes back to SharePoint.
- The phone is view-only. Capture and editing happen on the laptop. This means the interactive layer can be a local HTML and JavaScript app rather than a Power App.
- Meeting transcripts are handled in-boundary by Microsoft Copilot, reduced to a short structured update, and the raw transcript is then deleted. Only the de-sensitised structured update enters the tracker.
- Build first as a demo on a small subset, prove the loop works, then scale.

## A working principle for the build

Build the tooling against sample or synthetic rows and against the field schemas below, not against real staff data. The generators and the report logic do not need live personal data to be developed. This keeps real names, vacancies, and capacity notes out of the code chat entirely.

## Data model

There are three levels of detail. Each field has exactly one home, and every other view reads from it. This is what stops the detail multiplying and removes the "what do I record where" problem.

1. **Project template (deep level).** One completed document per non-BAU intervention. Holds scope, timeframes, the full theory of change, and the evaluation design. Changes rarely. Owns scope, timeframes, and the deliverable list.
2. **Tracker (live level).** One record per intervention. Holds current status, current stage, and a list of deliverables or milestones with owners and target dates. Owns live status and stage. Reads scope, timeframes, and deliverables from the project template. This is what the interactive tool shows and what gets touched in meetings.
3. **Committee roll-up (generated level).** The status counts, the strand breakdown, and the "what changed since last update" narrative. Generated, never typed.

Two supporting pieces:

- **Deliverables layer.** The current tracker holds a single status per intervention. Add a short list of deliverables or milestones beneath each intervention, each with an owner and a target date. Project-lead meetings update at deliverable level; the strand view rolls them up. This is what lets the glance view answer "how is it going" rather than only "what is the top-level status".
- **Snapshots.** At each committee cycle, save a dated snapshot of every intervention's status and deliverables. The next report diffs against the last snapshot to produce the "what changed" section automatically. Snapshots are stored in-boundary, not on GitHub.

One writer per field, to stop the template and the tracker drifting apart:

- Project template owns scope, timeframes, deliverables.
- Tracker owns live status and stage.
- Notes log owns the running updates and risks.

## End-to-end pipeline

1. Every non-BAU intervention has a completed project template. Fleshing these out is the first job, since only APP6.3 exists today (see open points).
2. A skeleton generator creates a starting project template for each intervention from its tracker row, pre-filling name, strand, lead, description, and target mapping, so leads complete only the theory of change and evaluation sections rather than starting blank.
3. The tool lifts the key fields from each completed template (timeframes, deliverables) into the tracker.
4. Before a meeting, David opens the tool and sees, for a chosen strand, the interventions beneath it, the deliverables agreed for the period, and where each should be by now against its planned dates.
5. In the meeting, David captures top-level notes and any scope changes or risks directly in the tracker on the laptop. If there is a Teams transcript, Copilot reduces it in-boundary to a structured update, which is added to the notes log, and the raw transcript is deleted.
6. The tool works out, from the planned dates, which interventions have slipped or are close to slipping, and flags them. This is most of the "raise barriers earlier" goal and comes free from data already recorded.
7. At each committee cycle, the report generator reads the in-boundary data, diffs against the last snapshot, computes the status counts and the strand breakdown, and fills the committee template. David edits the narrative and the assurance rationale.

## Demo scope

Keep this small. The purpose is to prove the loop end to end on one strand, then scale.

Pick one strand that can have all its project templates completed quickly. Strand 6 (Futures) is a candidate, since the one existing template (APP6.3) sits there.

Build:

1. A canonical data store for that strand's interventions and deliverables, in a format the local tool can read and write.
2. A skeleton generator that produces a project template from a tracker row.
3. A local HTML and JavaScript view: choose the strand, see its interventions, their deliverables, their status, and which are behind their planned stage. Read-only rendering is fine for the phone view.
4. Note capture on the laptop: record a status change, a scope change, or a risk against an intervention, saved back to the in-boundary store.
5. A report generator that, for the subset, produces the status counts, the strand breakdown row, and a "what changed since the last snapshot" list, written into the committee template.

If that loop works for one strand, scaling to seven is mostly data entry, not new code.

## Out of scope for the demo (later phases)

- Strand leads and project leads having their own logins or editing access. David stays the single editor for now.
- Generating the Evaluation Library reports. The same store will support this later as a separate output.
- Automated syncing between the local store and SharePoint beyond what OneDrive already does.
- Off-track email alerts to David's MDX address. Desirable, and a natural phase 2. Likely a Power Automate flow under David's own account or a simple scheduled local script, to be confirmed against what runs without admin approval.

## The four existing documents and their shapes

The build works from these. Extracts are available; this is the structure.

### 1. APP timeline and status (Excel)

The master tracker. Seven strands, interventions numbered by strand (1.1, 2.2, 6.3, and so on). Key columns:

- intervention name
- activity description
- project status, with values Business as usual (BAU), On track, To be mapped / requires further mapping, and Behind schedule / at risk
- a target-mapping matrix of nine equity-gap columns, each marked Y, N, or Partial:
  - continuation BTEC
  - completion FSM
  - completion BTEC
  - attainment ABMO
  - attainment FSM
  - attainment IMD Q1-2
  - attainment BTEC
  - progression first in family
  - progression BTEC
- a weekly Gantt whose cells carry a stage label (Planning, Implementation, Evaluation, Business as usual, or unconfirmed timelines)

The committee report's status counts come directly from the project status column.

### 2. APP intervention template / project detail (Word), example APP6.3

The deep per-intervention record. Fields:

- **Top-level details:** intervention name, strand, strand owner, intervention number, lead, activity details, cross-intervention links, project status stage, priority, flags for whether timeframes / theory of change / evaluation details are complete, last updated, project status.
- **Timeframes:** planning, implementation, evaluation start and end dates, estimated report publication date.
- **Theory of change:** problem statement, inputs, activities, outcomes across short / medium / long term, impact, causal pathways, moderating factors and assumptions, targeting.
- **Evaluation:** research questions, outcome measures, evaluation methods against the TASO level 1 / 2 / 3 framework, analysis strategy, evaluation reporting.

### 3. Evaluation Library template (Word)

The end-of-project report, uploaded to the research repository. Sections: introduction and summaries; intervention details (education stage, activity type, target group, relevance to APP targets, participant count); theory of change (copied forward from the project template); evaluation details (data collection methods, comparison / control approach, limitations, student involvement, ethics approval, cost); quantitative results; qualitative results; reflections and recommendations.

A large part is copied from the project template, which is why the same store should feed it.

### 4. ESE committee update (Word), the report to be semi-automated

Sections:

- a cover metadata table
- executive summary, narrating status changes since the last update
- context, with the OfS regulatory framing
- analysis of progress against targets: Table 1, the equity gaps with baseline, one and two years after, and target, sourced from lagged OfS data and pasted in manually
- analysis of progress against the delivery plan: the status counts and Table 2, the strand-by-strand status counts and notes / risks
- the APP Interventions Fund: Table 3, a separate list of funded projects
- rationale for assurance
- action
- next steps

For the report generator, the split is:

- **Generated from the tracker and snapshots:** the status counts, Table 2's strand breakdown, and the executive summary's "what changed" list.
- **Written by David:** the narrative notes in Table 2, the risk framing, and the assurance rationale.
- **Pasted manually:** Table 1 (OfS targets data) and Table 3 (Interventions Fund projects).

## Open points for the build

Each has a recommendation, but confirm in the build.

1. **Canonical data format.** Recommendation: hold the structured data as JSON in the synced folder, with a JavaScript data file derivative that the phone view loads via a plain script tag (the existing dashboard pattern, no fetch, no server). The project templates stay as Word files in a documents subfolder. An alternative is to keep the current Excel workbook as the source and generate the JSON from it.
2. **Note write-back on the laptop.** Recommendation: use the File System Access API in Edge so the local app can write to the synced JSON with permission, keeping everything in-boundary and serverless. Confirm this works from the OneDrive-synced location.
3. **Transcript extraction.** Recommendation: a saved Copilot prompt (stored in Outlook Quick Parts) that turns a Teams transcript into a fixed structured update (status, what changed, new risks, decisions, next actions). Confirm Copilot can read the Teams meeting transcript directly. The raw transcript is deleted once the update is captured.
4. **Pilot strand.** Recommendation: choose the strand whose templates can be completed first, with Strand 6 as a candidate given APP6.3 already exists. Decide based on which strand lead David meets before the next committee.
5. **Snapshot storage and cadence.** Recommendation: save a dated snapshot in-boundary at each committee cycle. Decide the file layout.
6. **Entitlements check.** Confirm the demo route needs nothing beyond standard M365 that David already has. It should not, since it relies on local files, OneDrive sync, and Copilot. Any phase-2 alerting via Power Automate needs a separate check against what runs without admin approval.

## First job before any of this

Audit the tracker and list every non-BAU intervention that does not yet have a completed project template. Those templates are the foundation the whole pipeline lifts from, so completing them, starting with the pilot strand, comes before the tool is useful.
