# Meeting update format

The tool's **Meeting update** tab reads a short structured update, shows a preview, and saves it into the tracker. You can type the update yourself after a meeting, or have Copilot write it from a Teams transcript using the prompt below.

## The format

```
Meeting: Strand 6 catch-up with strand lead
Date: 22/09/2026

[6.2]
Update: Still investigating options. No decision yet.
Action: Invite the provider in to go through the details | owner: Strand lead | due: 30/10/2026
Deliverable: Decision on approach | owner: Strand lead | due: 18/12/2026
Risk: Budget pressure this year
Decision: Keep the current pilot running until the decision is made
Scope change: Now includes final-year students
Question: Does this overlap with 6.7?
Template: Timeframes | Set planning dates once the approach is decided
Status: At risk
```

- **Headings:** each intervention starts with its number in square brackets, like `[6.2]`. Every line after it belongs to that intervention until the next heading.
- **Notes:** `Update`, `Risk`, `Decision`, `Scope change` and `Question` are saved to the intervention's notes. `Reason for delay` and `Success` are saved too, and feed the committee paper.
- **Actions and deliverables:** `Action` is a short-term to-do from the meeting. `Deliverable` is a project milestone. Both take `| owner: Name | due: dd/mm/yyyy`, and can take `| status: In progress`.
- **Template changes:** `Template: Section | what needs changing`. The section is one of `Top-level details`, `Timeframes`, `Theory of change` or `Evaluation`. These make up the list on the **Template changes** tab.
- **Status:** changes the live status. It must be one of On track, Ahead of schedule, At risk, Behind schedule, To be mapped or BAU. The change is logged as a note.

Bullet points at the start of lines are ignored, so a pasted list works. Anything the tool doesn't understand is listed in the preview before you save, and nothing is saved until you click **Save to the tracker**. The previous tracker is copied to `_Tracker data/backups/` first.

## Copilot prompt for Teams transcripts

Save this in Outlook Quick Parts, or in Copilot's saved prompts. Run it in Teams against the meeting transcript, check the output, then paste it into the tool.

```
From this meeting transcript, write an update in exactly this format and nothing else.

Meeting: <short meeting title>
Date: <dd/mm/yyyy>

Then, for each APP intervention discussed, a heading with its number in square brackets, such as [6.2], followed by any of these lines:
Update: <one sentence on progress>
Action: <short action> | owner: <first name> | due: <dd/mm/yyyy, or leave out if no date was given>
Deliverable: <project milestone> | owner: <first name> | due: <dd/mm/yyyy>
Risk: <anything that threatens delivery, including budget, staffing or timing>
Decision: <anything agreed>
Scope change: <any change to what the project will deliver>
Question: <anything left open>
Template: <Top-level details, Timeframes, Theory of change or Evaluation> | <what in the project plan needs changing>
Status: <only if a status change was agreed: On track, Ahead of schedule, At risk or Behind schedule>

Rules:
- One line per item. No other text, headings or commentary.
- Only include what was said in the meeting. Don't invent dates, owners or numbers.
- Don't include anything about individual students, or personal details about staff beyond first names and roles.
```

Once the update is saved in the tool, delete the raw transcript.
