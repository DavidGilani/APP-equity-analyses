# Source document structure

What the tool reads from and writes to, taken from the blank templates and the tracker's layout. This records structure only. The documents themselves, and anything filled in, stay in the synced OneDrive folder.

## 1. APP timeline and status (Excel)

Two sheets: `Cover sheet` (the key) and `APP Timeline` (the tracker).

### Layout of `APP Timeline`

- **Row 1:** column headings, plus a quarter label every 13 columns (`2025 Q3` to `2027 Q4`).
- **Row 2:** month names over the week columns.
- **Row 3:** day of the month each week starts. The first week column (M) is 7 July 2025, and each column after that is one week later.
- **Strand header rows:** column A only, in the form `Strand 6: Futures`. There are seven strands, running from row 4 to row 52.
- **Intervention rows:** one per intervention, sitting under their strand header.

| Column | Heading | Content |
|---|---|---|
| A | Access and Participation Plan timeline | Intervention number and name in one cell, for example `6.3 Embedding graduate competencies`. One row is written as `2.4:`, with a colon. |
| B | Project details | Activity description |
| C | Project status | `BAU`, `On Track`, `To be mapped`. Some cells have a trailing space (`On Track `). |
| D | Continuation BTEC students | `Y`, `N`, `Partial` |
| E | Completion FSM students | as above |
| F | Completion BTEC students | as above |
| G | Attainment ABMO students | as above |
| H | Attainment FSM students | as above |
| I | Attainment IMD Q1-2 students | as above |
| J | Attainment BTEC students | as above |
| K | Progression First in Family | as above |
| L | Progression BTEC students | as above |
| M onwards | Weekly Gantt | A stage label in a merged range, with the merge spanning the weeks the stage covers |

### Gantt stage labels

These come from the cover sheet key and the labels used in the Gantt cells:

- Business as usual activity
- Planning new activity / Planning enhanced activity
- Implementation of new activity / Implementation of enhanced activity
- Evaluation of new activity / Evaluation of existing activity / Evaluation of enhanced activity
- Activities with unconfirmed timelines (on the key; no cells use it at the moment)

The tool will reduce these to four stages: **Planning**, **Implementation**, **Evaluation** and **BAU**. It will also keep whether the activity is new, enhanced or existing.

## 2. APP project template (Word)

The template is built from four tables. Many cells are Word content controls (dropdowns and date pickers), so the tool can read and fill them reliably.

### Top-level intervention details

| Field | Type | Values |
|---|---|---|
| Intervention name | text | |
| APP strand | dropdown | Strand 1 - Access; Strand 2 - Transitions; Strand 3 - First year; Strand 4 - Wellbeing; Strand 5 - Assessing; Strand 6 - Futures; Strand 7 - Infrastructure |
| APP strand owner | text | |
| Intervention # | text | |
| Intervention lead | text | |
| Activity details | text | Copied from tracker column B |
| Cross intervention details | text | |
| Project status stage | dropdown | Stage 1 - Initial development; Stage 2 - Ready for planning; Stage 3 - Planning; Stage 4 - Ready for implementation; Stage 5 - Implementation; Stage 6 - Ready for evaluation; Stage 7 - Evaluation; Stage 8 - Completed |
| Project priority | dropdown | High; Medium; Low |
| Intervention timeframes completed | dropdown | Completed; In progress; To be completed |
| Theory of change completed | dropdown | as above |
| Evaluation details completed | dropdown | as above |
| Last updated | date | |
| Project status | dropdown | On track; At risk; Ahead of schedule; Behind schedule |

### Intervention timeframes

Start and end date pickers for **Planning**, **Implementation** and **Evaluation**, plus one date for the **estimated project report publication date**.

### Theory of change details

Free text, each with guidance prompts: problem statement; inputs; activities; outcomes; impact; causal pathways; moderating factors / assumptions; targeting.

### Evaluation details

Free text, each with guidance prompts: research questions; outcome measures; evaluation methods (TASO level 1 monitor, level 2 compare, level 3 identify); analysis strategy; evaluation reporting.

## 3. MDX Evaluation Library template (Word)

This has seven section tables, each a heading row over an empty two-column body: introduction and summaries; intervention details; theory of change details; evaluation details; results: quantitative; results: qualitative; reflections and recommendations. It is out of scope for the demo.

## Mismatches to resolve

The tracker and the project template don't use the same vocabularies. The tool needs one mapping for each of these.

1. **Project status.** The tracker uses BAU / On Track / To be mapped. The template uses On track / At risk / Ahead of schedule / Behind schedule. The committee report counts use a fourth set: BAU / On track / To be mapped / Behind schedule or at risk.
2. **Stage.** The tracker Gantt uses Planning / Implementation / Evaluation / BAU. The template uses an eight-step scale, Stage 1 to Stage 8. Both are useful, since the Gantt gives the planned stage by date and the eight steps give finer detail on where a project is now.
3. **Strand 3 name.** It is "Studies" in the tracker and "First year" in the template dropdown.
4. **Dates in two places.** The Gantt already holds stage dates, and so does the template's timeframes table. Under the one-writer rule, the template owns them. The Gantt dates can seed the skeleton templates.
