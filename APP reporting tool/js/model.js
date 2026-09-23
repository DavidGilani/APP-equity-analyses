// Shared vocabulary and the rules that compare planned and recorded stages.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});

  const STRANDS = {
    1: 'Access', 2: 'Transitions', 3: 'Studies', 4: 'Wellbeing',
    5: 'Assessing', 6: 'Futures', 7: 'Infrastructure',
  };

  const TARGETS = [
    ['continuationBtec', 'Continuation BTEC'],
    ['completionFsm', 'Completion FSM'],
    ['completionBtec', 'Completion BTEC'],
    ['attainmentAbmo', 'Attainment ABMO'],
    ['attainmentFsm', 'Attainment FSM'],
    ['attainmentImd', 'Attainment IMD Q1-2'],
    ['attainmentBtec', 'Attainment BTEC'],
    ['progressionFif', 'Progression first in family'],
    ['progressionBtec', 'Progression BTEC'],
  ];

  // Day-to-day statuses. The first four come from the project template dropdown;
  // BAU and To be mapped come from the tracker and have no template equivalent.
  const STATUSES = ['On track', 'Ahead of schedule', 'At risk', 'Behind schedule', 'To be mapped', 'BAU'];

  // The four categories the ESE committee report counts.
  const COMMITTEE_CATEGORIES = ['BAU', 'On track', 'To be mapped', 'Behind schedule / at risk'];

  function committeeCategory(status) {
    switch (status) {
      case 'BAU': return 'BAU';
      case 'On track':
      case 'Ahead of schedule': return 'On track';
      case 'To be mapped': return 'To be mapped';
      case 'At risk':
      case 'Behind schedule': return 'Behind schedule / at risk';
      default: return null;
    }
  }

  // Map a tracker "Project status" cell onto the day-to-day list.
  function statusFromTracker(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'bau' || s.startsWith('business as usual')) return 'BAU';
    if (s.startsWith('on track')) return 'On track';
    if (s.startsWith('to be mapped') || s.includes('further mapping')) return 'To be mapped';
    if (s.startsWith('ahead')) return 'Ahead of schedule';
    if (s.startsWith('behind')) return 'Behind schedule';
    if (s.includes('at risk')) return 'At risk';
    return null;
  }

  // Gantt cell label -> { stage, activity }.
  function stageFromGantt(label) {
    const s = String(label || '').trim().toLowerCase();
    const activity = s.includes('enhanced') ? 'enhanced' : s.includes('existing') ? 'existing' : s.includes('new') ? 'new' : null;
    if (s.startsWith('business as usual')) return { stage: 'BAU', activity: null };
    if (s.startsWith('planning')) return { stage: 'Planning', activity };
    if (s.startsWith('implementation')) return { stage: 'Implementation', activity };
    if (s.startsWith('evaluation')) return { stage: 'Evaluation', activity };
    if (s.includes('unconfirmed')) return { stage: 'Unconfirmed', activity: null };
    return null;
  }

  // Rank used to compare "where it should be" with "where it is".
  // 0 not started, 1 planning, 2 implementation, 3 evaluation, 4 finished.
  const PHASE_RANK = { Planning: 1, Implementation: 2, Evaluation: 3 };
  const PHASE_NAMES = ['Not started', 'Planning', 'Implementation', 'Evaluation', 'Finished'];

  // Template "Project status stage" (Stage 1 to Stage 8) -> rank.
  function rankFromTemplateStage(stageText) {
    const m = /stage\s*(\d)/i.exec(stageText || '');
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return [null, 0, 0, 1, 1, 2, 2, 3, 4][n];
  }

  // Planned periods for an intervention, preferring the template's timeframes
  // (the template owns them) and falling back to the tracker Gantt.
  function plannedPeriods(iv) {
    const tf = iv.template && iv.template.timeframes;
    if (tf) {
      const out = [];
      for (const [key, stage] of [['planning', 'Planning'], ['implementation', 'Implementation'], ['evaluation', 'Evaluation']]) {
        if (tf[key] && tf[key].start && tf[key].end) out.push({ stage, start: tf[key].start, end: tf[key].end });
      }
      if (out.length) return { source: 'template', periods: out };
    }
    // Evaluation of an existing activity comes before the new cycle starts, so it
    // says nothing about progress through planning, implementation and evaluation.
    const g = (iv.plannedStages || []).filter((p) => PHASE_RANK[p.stage] && p.activity !== 'existing');
    return { source: g.length ? 'tracker' : null, periods: g };
  }

  // Where the plan says the intervention should be on a given date.
  function plannedRankOn(periods, isoDate) {
    if (!periods.length) return null;
    let rank = 0;
    for (const p of periods) {
      if (isoDate > p.end) rank = Math.max(rank, PHASE_RANK[p.stage] === 3 ? 4 : PHASE_RANK[p.stage]);
      if (isoDate >= p.start && isoDate <= p.end) rank = Math.max(rank, PHASE_RANK[p.stage]);
    }
    return rank;
  }

  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // The slip check. Compares the planned stage today with the stage recorded
  // in the project template, and looks ahead to catch stages about to be due.
  function slipCheck(iv, todayIso, warnDays = 14) {
    if (iv.status === 'BAU') return { flag: 'bau', text: 'Business as usual' };
    const { source, periods } = plannedPeriods(iv);
    if (!periods.length) return { flag: 'unknown', text: 'No planned dates yet' };
    const planned = plannedRankOn(periods, todayIso);
    const recorded = iv.template ? rankFromTemplateStage(iv.template.stage) : null;
    const base = { source, planned, plannedName: PHASE_NAMES[planned], recorded,
      recordedName: recorded === null ? null : PHASE_NAMES[recorded] };
    if (recorded === null) return { ...base, flag: 'unknown', text: 'No stage recorded in a project template' };
    if (recorded < planned) {
      return { ...base, flag: 'behind', text: `Should be in ${PHASE_NAMES[planned].toLowerCase()}, recorded as ${PHASE_NAMES[recorded].toLowerCase()}` };
    }
    const soon = plannedRankOn(periods, addDays(todayIso, warnDays));
    if (recorded < soon) {
      return { ...base, flag: 'soon', text: `Due to move into ${PHASE_NAMES[soon].toLowerCase()} within ${warnDays} days` };
    }
    return { ...base, flag: 'ok', text: 'In line with plan' };
  }

  // ---------- deliverables, notes and template updates ----------

  const DELIVERABLE_STATUSES = ['Not started', 'In progress', 'Done', 'Blocked'];
  const NOTE_TYPES = ['Update', 'Risk', 'Decision', 'Scope change', 'Question', 'Reason for delay', 'Success'];
  const TEMPLATE_SECTIONS = ['Top-level details', 'Timeframes', 'Theory of change', 'Evaluation'];

  function newId(prefix) {
    const r = root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
    return `${prefix}-${r}`;
  }

  // Overdue or nearly due deliverables and actions.
  function deliverableCheck(iv, todayIso, warnDays = 14) {
    const open = (iv.deliverables || []).filter((d) => d.status !== 'Done' && d.due);
    const overdue = open.filter((d) => d.due < todayIso);
    const soon = open.filter((d) => d.due >= todayIso && d.due <= addDays(todayIso, warnDays));
    const blocked = (iv.deliverables || []).filter((d) => d.status === 'Blocked');
    if (overdue.length) return { flag: 'behind', text: `${overdue.length} overdue`, overdue, soon, blocked };
    if (blocked.length) return { flag: 'behind', text: `${blocked.length} blocked`, overdue, soon, blocked };
    if (soon.length) return { flag: 'soon', text: `${soon.length} due within ${warnDays} days`, overdue, soon, blocked };
    return { flag: open.length ? 'ok' : 'unknown', text: '', overdue, soon, blocked };
  }

  const FLAG_ORDER = ['behind', 'soon', 'unknown', 'ok', 'bau'];

  // The stage check, made worse by any overdue, blocked or nearly due deliverables.
  // Deliverables that are all on time don't change the stage check's answer.
  function overallFlag(iv, todayIso) {
    const s = slipCheck(iv, todayIso).flag;
    const d = deliverableCheck(iv, todayIso).flag;
    if (d !== 'behind' && d !== 'soon') return s;
    if (s === 'bau') return d;
    return [s, d].sort((a, b) => FLAG_ORDER.indexOf(a) - FLAG_ORDER.indexOf(b))[0];
  }

  APP.model = {
    STRANDS, TARGETS, STATUSES, COMMITTEE_CATEGORIES, PHASE_NAMES,
    DELIVERABLE_STATUSES, NOTE_TYPES, TEMPLATE_SECTIONS,
    committeeCategory, statusFromTracker, stageFromGantt, rankFromTemplateStage,
    plannedPeriods, plannedRankOn, slipCheck, addDays,
    newId, deliverableCheck, overallFlag,
  };
})(typeof window !== 'undefined' ? window : globalThis);
