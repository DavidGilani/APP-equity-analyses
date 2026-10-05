# =============================================================================
# APP equity gaps: university, faculty, department and programme
#
# Purpose
#   1. Rebuild the eight APP success and progression target gaps from the OfS
#      individualised file, and check them against the agreed reference
#      figures
#   2. Break every gap down by faculty, department and programme
#   3. Export CSVs for a summary sheet: gaps, headcounts, small-number flags
#      and whether each area is meeting the APP milestones
#
# Population: full-time, UK-domiciled undergraduates registered at Middlesex
# (app_exclusion_reason = 0). First degree only by default; the check in
# section 6 also runs first degree plus integrated masters for comparison.
#
# Rebuild rules follow the OfS guidance, "Rebuilding student outcome and
# experience measures used in OfS regulation" (May 2026), Tables 9 to 12 and
# Annex B.
#
# Years (from the workbook). For continuation and completion the year is the
# entry year. For attainment and progression it is the qualifying year.
#   Continuation  baseline 2017/18 to 2020/21, then 2021/22, 2022/23, 2023/24
#   Completion    baseline 2014/15 to 2017/18, then 2018/19, 2019/20, 2020/21
#   Attainment    baseline 2018/19 to 2021/22, then 2022/23, 2023/24, 2024/25
#   Progression   baseline 2017/18 to 2020/21, then 2021/22, 2022/23, 2023/24
#
# First in family (PTP_1) is not included: the OfS file has no parental
# education field.
# =============================================================================

# ---- 0. Settings ---------------------------------------------------------------
# install.packages(c("readxl", "dplyr", "tidyr", "purrr", "readr", "writexl"))
library(readxl)
library(dplyr)
library(tidyr)
library(purrr)
library(readr)

data_dir  <- "C:/Users/David278/OneDrive - Middlesex University/APP Framework/Data/Indivisualised data for regression"
data_file <- file.path(data_dir, "IND_2026_1_Core_10004351 - Tableau.xlsx")
rds_file  <- file.path(data_dir, "IND_2026_1_Core_10004351.rds")   # fast copy, made on first run
out_dir   <- file.path(data_dir, "outputs", "equity_gaps")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

mdx_ukprn <- 10004351
small_n   <- 10     # flag any gap where either group has fewer students than this

level_options <- list(
  "First degree"                        = "DEG",
  "First degree and integrated masters" = c("DEG", "PUGD"))
chosen_level <- "First degree"   # used for the faculty, department and programme exports

# ---- 1. Import -------------------------------------------------------------------
# Uses, in order: raw already in memory (e.g. from the continuation script),
# then the saved .rds copy, then the original .xlsx. The first full import
# saves an .rds copy, which loads in seconds on later runs.
clean_names <- function(df) {
  nm <- tolower(names(df))
  nm <- gsub("[^a-z0-9]+", "_", nm)
  nm <- gsub("^_|_$", "", nm)
  names(df) <- nm
  df
}

if (exists("raw") && is.data.frame(raw) && "coursetitle" %in% names(raw)) {
  message("Using 'raw' already in memory")
} else if (file.exists(rds_file)) {
  raw <- readRDS(rds_file)
} else {
  raw <- read_excel(data_file, sheet = 1, guess_max = 1100000) %>% clean_names()
  saveRDS(raw, rds_file)
}
cat("Rows in raw file:", nrow(raw), "\n")

num_cols <- c("registering_ukprn", "app_exclusion_reason", "entrant_exclusion",
              "base_academic_year", "subject_weighting", "broad_entry_qualifications",
              "in_free_school_meal_population", "had_free_school_meals",
              "in_degree_outcomes_population", "in_progression_population",
              "progression_numerator")
chr_cols <- c("level_aggregate_1", "linked_engagement_starting_mode",
              "continuation_outcome_after_1_year", "continuation_outcome_after_4_years",
              "degree_class", "student_domicile", "broad_student_ethnicity",
              "historic_home_imd_quintile_by_nation", "facultyv4", "department",
              "coursetitle")
missing_cols <- setdiff(c(num_cols, chr_cols), names(raw))
if (length(missing_cols)) stop("Columns not found: ", paste(missing_cols, collapse = ", "))

# ---- 2. Base population and characteristic splits ------------------------------------
base <- raw %>%
  mutate(across(all_of(num_cols), ~ suppressWarnings(as.numeric(.x))),
         across(all_of(chr_cols), as.character)) %>%
  filter(registering_ukprn == mdx_ukprn,
         app_exclusion_reason == 0,
         linked_engagement_starting_mode == "FT") %>%
  mutate(
    # Entry qualifications (Annex B codes). A-level is codes 1 to 4, as in the
    # BTEC analyses workbook.
    split_btec_alevel = case_when(broad_entry_qualifications %in% 7:8 ~ "BTEC",
                                  broad_entry_qualifications %in% 1:4 ~ "A-level"),
    split_btec_other  = if_else(broad_entry_qualifications %in% 7:8,
                                "BTEC", "All other qualifications"),
    # Free school meals: only students inside the FSM population
    split_fsm = case_when(
      in_free_school_meal_population == 1 & had_free_school_meals == 1 ~ "Eligible",
      in_free_school_meal_population == 1 & had_free_school_meals == 0 ~ "Not eligible"),
    # Ethnicity: UK-domiciled students only
    split_ethnicity = case_when(
      student_domicile %in% c("E", "N", "S", "W") & broad_student_ethnicity %in% c("A", "B", "M", "O") ~ "ABMO",
      student_domicile %in% c("E", "N", "S", "W") & broad_student_ethnicity == "W" ~ "White"),
    # IMD 2019 (the OfS "historic" field), English-domiciled students. The APP
    # targets were set on IMD 2019; home_imd_quintile_by_nation is IMD 2025.
    # Quintile 1 is most deprived.
    split_imd = case_when(
      student_domicile == "E" & historic_home_imd_quintile_by_nation %in% c("E1", "E2") ~ "IMD Q1-2",
      student_domicile == "E" & historic_home_imd_quintile_by_nation %in% c("E3", "E4", "E5") ~ "IMD Q3-5"),
    faculty    = coalesce(facultyv4, "Unknown"),
    department = coalesce(department, "Unknown"),
    # Programme = coursetitle. Programme Title Long is only filled in for
    # collaborative partner courses, so it cannot be used for the whole University.
    programme  = coalesce(coursetitle, "Unknown")
  )

# Check the outcome codes match the OfS guidance before relying on them
base %>% count(degree_class) %>% print()
base %>% count(continuation_outcome_after_4_years) %>% print()

# ---- 3. One row per student-subject per lifecycle stage ------------------------------
# weight  = subject_weighting (the headcount; never count rows)
# success = the weighted numerator for that stage
success_codes <- c("QUALIFIED", "CONTINUING", "TRANSFER_COLLAB", "QUALIFIED_PGRDORM")

build_stages <- function(d, levels_keep) {
  d <- d %>% filter(level_aggregate_1 %in% levels_keep)
  bind_rows(
    # Continuation, Table 9 (full-time)
    d %>% filter(entrant_exclusion == 0, continuation_outcome_after_1_year != "TRANSFER") %>%
      mutate(stage = "Continuation",
             success = subject_weighting * (continuation_outcome_after_1_year %in% success_codes)),
    # Completion, Table 10 (full-time)
    d %>% filter(entrant_exclusion == 0, continuation_outcome_after_4_years != "TRANSFER") %>%
      mutate(stage = "Completion",
             success = subject_weighting * (continuation_outcome_after_4_years %in% success_codes)),
    # Attainment (degree outcomes), Table 11: firsts and 2:1s
    d %>% filter(in_degree_outcomes_population == 1) %>%
      mutate(stage = "Attainment",
             success = subject_weighting * (degree_class %in% c("FIRST", "2_1"))),
    # Progression, Table 12
    d %>% filter(in_progression_population == 1) %>%
      mutate(stage = "Progression",
             success = subject_weighting * coalesce(progression_numerator, 0))
  ) %>%
    select(stage, base_academic_year, faculty, department, programme,
           starts_with("split_"), weight = subject_weighting, success)
}

# ---- 4. Target definitions ------------------------------------------------------------
# Gap = comparator rate minus target group rate, in percentage points.
# A positive gap means the target group does worse.
#
# Comparators: BTEC is compared with A-level entrants for continuation,
# completion and attainment, and with all other qualifications for progression.
#
# baseline = the agreed four-year pooled university baseline.
# Milestones: the BTEC targets (PTS_1, PTS_3, PTS_7, PTP_2) use the milestones
# revised for these comparators; the others are as published in the APP.
# The first year after the baseline is compared with the 2025-26 milestone, the
# second with 2026-27, and the third with 2027-28. "Below 4pp" is entered as 3.9.
#
# ref_yr and ref_after are the agreed reference figures for the check in
# section 6 (NA where there is no agreed figure). Sources: the detailed
# workbook for FSM, ethnicity and IMD; the BTEC analyses workbook and Board
# Appendix for the BTEC baseline years; your APP tracking table for the BTEC
# years after baseline.
targets <- tribble(
  ~target_id, ~stage, ~target_group_label, ~split, ~target_group, ~comparator_group,
  ~baseline_years, ~after_years, ~baseline, ~m_2025_26, ~m_2026_27, ~m_2027_28, ~m_2028_29,
  ~ref_yr, ~ref_after,
  "PTS_1", "Continuation", "BTEC vs A-level", "split_btec_alevel", "BTEC", "A-level",
  2017:2020, 2021:2023, 10.7, 9.0, 7.0, 5.0, 3.9,
  c(10.65, 8.89, 8.74, 13.58), c(13.09, 11.08, 9.93),
  "PTS_2", "Completion", "FSM eligible vs not eligible", "split_fsm", "Eligible", "Not eligible",
  2014:2017, 2018:2020, 5.4, 4.5, 3.5, 2.5, 1.9,
  c(4.17, 6.65, 5.98, 3.72), c(3.25, 9.52, 1.93),
  "PTS_3", "Completion", "BTEC vs A-level", "split_btec_alevel", "BTEC", "A-level",
  2014:2017, 2018:2020, 10.1, 8.5, 7.0, 5.5, 3.9,
  c(9.2, 10.8, 12.1, 7.4), c(10.4, 10.7, 15.5),
  "PTS_4", "Attainment", "ABMO vs White", "split_ethnicity", "ABMO", "White",
  2018:2021, 2022:2024, 11.4, 9.5, 7.5, 6, 4.9,
  c(12.04, 12.98, 8.93, 12.32), c(11.8, 18.7, 12.8),
  "PTS_5", "Attainment", "FSM eligible vs not eligible", "split_fsm", "Eligible", "Not eligible",
  2018:2021, 2022:2024, 11.2, 9, 7, 5, 4.5,
  c(10.95, 10.17, 10.77, 12.81), c(7.7, 7.3, 6.7),
  "PTS_6", "Attainment", "IMD Q1-2 vs Q3-5", "split_imd", "IMD Q1-2", "IMD Q3-5",
  2018:2021, 2022:2024, 6.9, 6, 5, 4, 2.9,
  c(9.52, 3.92, 4.66, 8.63), c(12.2, 9.5, 7.8),
  "PTS_7", "Attainment", "BTEC vs A-level", "split_btec_alevel", "BTEC", "A-level",
  2018:2021, 2022:2024, 23.6, 20.0, 16.0, 12.0, 7.9,
  c(27.9, 21.1, 18.1, 25.5), c(26.2, 23.1, 19.2),
  "PTP_2", "Progression", "BTEC vs all other qualifications", "split_btec_other", "BTEC", "All other qualifications",
  2017:2020, 2021:2023, 10.4, 8.5, 7.5, 6.5, 4.9,
  c(NA, NA, NA, NA), c(10.5, 12.3, 14.0)
)
# tribble stores the year vectors as list columns only if wrapped; make sure
targets <- targets %>%
  mutate(across(c(baseline_years, after_years, ref_yr, ref_after), as.list))

year_label <- function(y) paste0(y, "/", substr(y + 1, 3, 4))

# ---- 5. Gap calculation ------------------------------------------------------------------
# For one target and one set of grouping columns, returns one row per unit and
# period: each single year, the pooled four-year baseline, and the simple
# average of the four baseline-year gaps.
calc_gaps <- function(stages, t, unit_vars) {
  base_yrs  <- t$baseline_years[[1]]
  after_yrs <- t$after_years[[1]]

  d <- stages %>%
    filter(stage == t$stage, base_academic_year %in% c(base_yrs, after_yrs)) %>%
    mutate(grp = case_when(.data[[t$split]] == t$target_group     ~ "target",
                           .data[[t$split]] == t$comparator_group ~ "comparator")) %>%
    filter(!is.na(grp))

  summarise_rates <- function(x, ...) {
    x %>%
      group_by(across(all_of(unit_vars)), ..., grp) %>%
      summarise(n = sum(weight), rate = 100 * sum(success) / sum(weight), .groups = "drop") %>%
      pivot_wider(names_from = grp, values_from = c(n, rate)) %>%
      { if (!"n_target" %in% names(.)) mutate(., n_target = NA_real_, rate_target = NA_real_) else . } %>%
      { if (!"n_comparator" %in% names(.)) mutate(., n_comparator = NA_real_, rate_comparator = NA_real_) else . } %>%
      mutate(gap_pp = rate_comparator - rate_target)
  }

  single <- summarise_rates(d, base_academic_year) %>%
    mutate(period = case_when(
      base_academic_year == base_yrs[1]  ~ "YR1",
      base_academic_year == base_yrs[2]  ~ "YR2",
      base_academic_year == base_yrs[3]  ~ "YR3",
      base_academic_year == base_yrs[4]  ~ "YR4",
      base_academic_year == after_yrs[1] ~ "1 year after baseline",
      base_academic_year == after_yrs[2] ~ "2 years after baseline",
      base_academic_year == after_yrs[3] ~ "3 years after baseline"),
      years = year_label(base_academic_year)) %>%
    select(-base_academic_year)

  pooled <- summarise_rates(filter(d, base_academic_year %in% base_yrs)) %>%
    mutate(period = "Baseline (4-year pooled)",
           years = paste(year_label(min(base_yrs)), "to", year_label(max(base_yrs))))

  mean4 <- single %>%
    filter(period %in% paste0("YR", 1:4)) %>%
    group_by(across(all_of(unit_vars))) %>%
    summarise(gap_pp = if (n() == 4) mean(gap_pp) else NA_real_, .groups = "drop") %>%
    mutate(period = "Baseline (average of YR1 to YR4 gaps)",
           years = paste(year_label(min(base_yrs)), "to", year_label(max(base_yrs))))

  bind_rows(single, pooled, mean4) %>%
    mutate(target_id = t$target_id, stage = t$stage,
           target_group_label = t$target_group_label,
           target_group = t$target_group, comparator_group = t$comparator_group,
           baseline_university = t$baseline,
           milestone = case_when(period == "1 year after baseline"  ~ t$m_2025_26,
                                 period == "2 years after baseline" ~ t$m_2026_27,
                                 period == "3 years after baseline" ~ t$m_2027_28),
           target_2028_29 = t$m_2028_29)
}

run_targets <- function(stages, unit_vars) {
  map_dfr(seq_len(nrow(targets)), ~ calc_gaps(stages, targets[.x, ], unit_vars))
}

# ---- 6. University-level check against the agreed reference figures ----------------------
period_order <- c("YR1", "YR2", "YR3", "YR4", "Baseline (4-year pooled)",
                  "Baseline (average of YR1 to YR4 gaps)",
                  "1 year after baseline", "2 years after baseline", "3 years after baseline")

reference_values <- targets %>%
  transmute(target_id,
            values = map2(ref_yr, ref_after, ~ tibble(
              period = c(paste0("YR", 1:4), "1 year after baseline",
                         "2 years after baseline", "3 years after baseline"),
              reference_gap_pp = c(.x, .y)))) %>%
  unnest(values)

university_check <- imap_dfr(level_options, function(lv, lv_name) {
  run_targets(build_stages(base, lv), character(0)) %>%
    mutate(level_option = lv_name)
}) %>%
  left_join(reference_values, by = c("target_id", "period")) %>%
  mutate(difference_pp = round(gap_pp - reference_gap_pp, 2),
         period = factor(period, levels = period_order)) %>%
  arrange(level_option, target_id, period) %>%
  mutate(across(c(n_target, n_comparator), round),
         across(c(rate_target, rate_comparator, gap_pp), ~ round(.x, 2))) %>%
  select(level_option, target_id, target_group_label, period, years,
         n_target, rate_target, n_comparator, rate_comparator,
         gap_pp, reference_gap_pp, difference_pp, baseline_university)

cat("\nUniversity-level check against the agreed reference figures\n")
print(university_check, n = Inf, width = Inf)

# Quick summary: how close is each target, for each level option?
check_summary <- university_check %>%
  filter(!is.na(reference_gap_pp)) %>%
  group_by(level_option, target_id) %>%
  summarise(max_abs_difference_pp = max(abs(difference_pp), na.rm = TRUE),
            after_years_max_diff  = max(abs(difference_pp[grepl("after", period)]), na.rm = TRUE),
            .groups = "drop")
cat("\nLargest difference from the reference figures, by target\n")
print(check_summary, n = Inf)

write_csv(university_check, file.path(out_dir, "equity_gaps_university_check.csv"))
write_csv(check_summary,    file.path(out_dir, "equity_gaps_check_summary.csv"))

# =============================================================================
# STOP HERE until the university-level gaps match the reference figures.
# Every gap should be within about 0.2 percentage points of the reference.
# Small differences in the baseline years come from rounded headcounts in
# earlier OfS dashboard releases.
# =============================================================================

# ---- 7. Faculty, department and programme breakdowns ----------------------------------------
stages <- build_stages(base, level_options[[chosen_level]])

# Each department and programme is shown against the faculty (and department)
# where most of its students sit, so the export can be filtered by faculty.
dept_lookup <- stages %>%
  count(department, faculty, wt = weight) %>%
  group_by(department) %>% slice_max(n, n = 1, with_ties = FALSE) %>% ungroup() %>%
  select(department, faculty)
prog_lookup <- stages %>%
  count(programme, department, faculty, wt = weight) %>%
  group_by(programme) %>% slice_max(n, n = 1, with_ties = FALSE) %>% ungroup() %>%
  select(programme, department, faculty)

gaps_long <- bind_rows(
  run_targets(stages, character(0)) %>%
    mutate(level = "University", unit = "Middlesex University"),
  run_targets(stages, "faculty") %>%
    mutate(level = "Faculty", unit = faculty),
  run_targets(stages, "department") %>%
    left_join(dept_lookup, by = "department") %>%
    mutate(level = "Department", unit = department),
  run_targets(stages, "programme") %>%
    left_join(prog_lookup, by = "programme") %>%
    mutate(level = "Programme", unit = programme)
) %>%
  mutate(
    # 95% margin of error on the gap, from each group's rate and headcount
    margin_pp = 196 * sqrt((rate_target / 100) * (1 - rate_target / 100) / n_target +
                           (rate_comparator / 100) * (1 - rate_comparator / 100) / n_comparator),
    # Is the gap significantly different from that year's milestone?
    significance = case_when(
      is.na(milestone) | is.na(gap_pp) | is.na(margin_pp) ~ NA_character_,
      gap_pp - margin_pp > milestone ~ "Significantly behind",
      gap_pp + margin_pp < milestone ~ "Significantly ahead",
      TRUE ~ "Could be chance"),
    small_numbers = !is.na(n_target) & !is.na(n_comparator) &
      (n_target < small_n | n_comparator < small_n) |
      is.na(n_target) | is.na(n_comparator),
    small_numbers = if_else(period == "Baseline (average of YR1 to YR4 gaps)", NA, small_numbers),
    met_milestone = if_else(!is.na(milestone) & !is.na(gap_pp), gap_pp <= milestone, NA),
    met_2028_29_target = if_else(!is.na(gap_pp), gap_pp <= target_2028_29, NA),
    level = factor(level, levels = c("University", "Faculty", "Department", "Programme")),
    period = factor(period, levels = period_order)
  ) %>%
  arrange(target_id, level, faculty, department, unit, period) %>%
  mutate(across(c(n_target, n_comparator), round),
         across(c(rate_target, rate_comparator, gap_pp, margin_pp), ~ round(.x, 1))) %>%
  select(level, faculty, department, unit, target_id, stage, target_group_label,
         target_group, comparator_group, period, years,
         n_target, rate_target, n_comparator, rate_comparator, gap_pp, margin_pp, significance,
         small_numbers, baseline_university, milestone, met_milestone,
         target_2028_29, met_2028_29_target)

# ---- 8. Summary: one row per area and target -----------------------------------------------
# Latest gap = 3 years after baseline. Status, in order of precedence:
#   Small numbers          either group has fewer than small_n students
#   Meeting 2028-29 target latest gap at or below the final target
#   Meeting milestone      latest gap at or below the 2027-28 milestone
#   Not meeting milestone  latest gap above the milestone
gaps_summary <- gaps_long %>%
  filter(period %in% c("Baseline (4-year pooled)", "1 year after baseline",
                       "2 years after baseline", "3 years after baseline")) %>%
  select(level, faculty, department, unit, target_id, stage, target_group_label,
         period, gap_pp, n_target, n_comparator, small_numbers,
         milestone, target_2028_29, baseline_university) %>%
  mutate(period = recode(as.character(period),
                         "Baseline (4-year pooled)" = "baseline",
                         "1 year after baseline"    = "after_1",
                         "2 years after baseline"   = "after_2",
                         "3 years after baseline"   = "after_3")) %>%
  group_by(level, faculty, department, unit, target_id, stage, target_group_label,
           baseline_university, target_2028_29) %>%
  summarise(
    gap_baseline = gap_pp[period == "baseline"][1],
    gap_after_1  = gap_pp[period == "after_1"][1],
    gap_after_2  = gap_pp[period == "after_2"][1],
    gap_after_3  = gap_pp[period == "after_3"][1],
    n_target_latest     = n_target[period == "after_3"][1],
    n_comparator_latest = n_comparator[period == "after_3"][1],
    small_numbers_latest = small_numbers[period == "after_3"][1],
    milestone_latest = milestone[period == "after_3"][1],
    .groups = "drop") %>%
  mutate(
    change_since_baseline_pp = round(gap_after_3 - gap_baseline, 1),
    direction = case_when(is.na(change_since_baseline_pp) ~ NA_character_,
                          change_since_baseline_pp < 0 ~ "Narrowed",
                          change_since_baseline_pp > 0 ~ "Widened",
                          TRUE ~ "No change"),
    status = case_when(
      is.na(gap_after_3) | is.na(small_numbers_latest) | small_numbers_latest ~ "Small numbers",
      gap_after_3 <= target_2028_29   ~ "Meeting 2028-29 target",
      gap_after_3 <= milestone_latest ~ "Meeting milestone",
      TRUE                            ~ "Not meeting milestone")) %>%
  arrange(target_id, level, desc(gap_after_3))

cat("\nUniversity and faculty summary\n")
print(gaps_summary %>% filter(level %in% c("University", "Faculty")), n = Inf, width = Inf)

cat("\nStatus counts by level and target\n")
print(gaps_summary %>% count(target_id, level, status) %>%
        pivot_wider(names_from = status, values_from = n, values_fill = 0), n = Inf, width = Inf)

# ---- 9. Export --------------------------------------------------------------------------------
write_csv(gaps_long,    file.path(out_dir, "equity_gaps_all_levels_long.csv"))
write_csv(gaps_summary, file.path(out_dir, "equity_gaps_summary_by_area.csv"))
for (lv in levels(gaps_long$level)) {
  write_csv(filter(gaps_summary, level == lv),
            file.path(out_dir, paste0("equity_gaps_summary_", tolower(lv), ".csv")))
}
if (requireNamespace("writexl", quietly = TRUE)) {
  writexl::write_xlsx(
    list("Summary"          = gaps_summary,
         "All periods"      = gaps_long,
         "University check" = university_check),
    file.path(out_dir, "equity_gaps.xlsx"))
}
cat("\nFiles written to:", out_dir, "\n")

# =============================================================================
# 10. Equity gap scan: every demographic group, not only the APP targets
# =============================================================================
# Compares each group in the OfS file with its comparison group, at every
# lifecycle stage, so gaps outside the formal APP targets can be monitored and
# researched ahead of the next APP.
#
# For each comparison and stage it reports:
#   - the gap over the latest four years combined (the main measure)
#   - its 95% margin of error and p-value (two-group test of the rates)
#   - the gap over the first four years (baseline) and the change since
#   - the gap in each of the seven years, for a trend line
#   - which group is behind, and whether the gap is already an APP target
#
# Gap = comparison group's rate minus the named group's rate. A positive gap
# means the named group is behind; a negative gap means the comparison group
# is behind.
#
# Not in the OfS file, so not covered: care experience, estrangement, caring
# responsibilities, commuting, parental higher education (first in family),
# refugee status, Gypsy, Roma and Traveller communities, military families.

scan_min_n   <- 20   # each group needs at least this many students over the four years
monitor_gap  <- 5    # significant gaps of 5 to 10 pp: "Monitor"
priority_gap <- 10   # significant gaps of 10 pp or more: "Monitor closely"
                     # significant gaps under 5 pp: "Small but significant gap"
scan_levels  <- list(University = character(0), Faculty = "faculty")

code    <- function(x) trimws(as.character(x))
numcode <- function(x) suppressWarnings(as.integer(as.character(x)))
uk      <- c("E", "N", "S", "W")

base <- base %>% mutate(
  split_s_sex    = case_when(code(student_sex) == "2" ~ "Female", code(student_sex) == "1" ~ "Male"),
  split_s_mature = case_when(code(engagement_starting_age_group) == "U21" ~ "Under 21",
                             code(engagement_starting_age_group) %in% c("21_25", "26_30", "31_40", "41_50", "51+") ~ "21 and over"),
  split_s_age    = case_when(code(engagement_starting_age_group) == "U21" ~ "Under 21",
                             code(engagement_starting_age_group) == "21_25" ~ "21 to 25",
                             code(engagement_starting_age_group) == "26_30" ~ "26 to 30",
                             code(engagement_starting_age_group) %in% c("31_40", "41_50", "51+") ~ "31 and over"),
  split_s_eth    = case_when(!(student_domicile %in% uk) ~ NA_character_,
                             code(broad_student_ethnicity) == "A" ~ "Asian",
                             code(broad_student_ethnicity) == "B" ~ "Black",
                             code(broad_student_ethnicity) == "M" ~ "Mixed",
                             code(broad_student_ethnicity) == "O" ~ "Other ethnicity",
                             code(broad_student_ethnicity) == "W" ~ "White"),
  split_s_dis    = case_when(code(is_reported_disabled) == "Y" ~ "Disability reported",
                             code(is_reported_disabled) == "N" ~ "No disability reported"),
  split_s_distype = case_when(code(is_reported_disabled) == "N" ~ "No disability reported",
                              code(reported_disability_type) == "COG"   ~ "Cognitive or learning difference",
                              code(reported_disability_type) == "MH"    ~ "Mental health condition",
                              code(reported_disability_type) == "MULTI" ~ "Multiple impairments",
                              code(reported_disability_type) == "PHY"   ~ "Physical or sensory impairment",
                              code(reported_disability_type) == "SOC"   ~ "Social or communication impairment"),
  split_s_imd15  = case_when(student_domicile == "E" & code(historic_home_imd_quintile_by_nation) == "E1" ~ "IMD Q1",
                             student_domicile == "E" & code(historic_home_imd_quintile_by_nation) == "E5" ~ "IMD Q5"),
  split_s_tundra = case_when(student_domicile == "E" & code(engagement_starting_age_group) == "U21" & numcode(tundra_msoa_quintile) %in% 1:2 ~ "TUNDRA Q1-2",
                             student_domicile == "E" & code(engagement_starting_age_group) == "U21" & numcode(tundra_msoa_quintile) %in% 3:5 ~ "TUNDRA Q3-5"),
  split_s_polar  = case_when(code(engagement_starting_age_group) == "U21" & numcode(polar4_quintile) %in% 1:2 ~ "POLAR4 Q1-2",
                             code(engagement_starting_age_group) == "U21" & numcode(polar4_quintile) %in% 3:5 ~ "POLAR4 Q3-5"),
  split_s_nssec  = case_when(student_domicile %in% uk & numcode(socioeconomic_class) %in% 5:7 ~ "Routine and manual",
                             student_domicile %in% uk & numcode(socioeconomic_class) %in% 1:2 ~ "Higher managerial and professional"),
  split_s_lgb    = case_when(code(sexual_orientation) %in% c("10", "11") ~ "LGB+",
                             code(sexual_orientation) == "12" ~ "Heterosexual"),
  split_s_access = case_when(broad_entry_qualifications == 10 ~ "Access or foundation course", broad_entry_qualifications %in% 1:4 ~ "A-level"),
  split_s_heq    = case_when(broad_entry_qualifications == 6  ~ "HE-level qualification",      broad_entry_qualifications %in% 1:4 ~ "A-level"),
  split_s_noq    = case_when(broad_entry_qualifications == 11 ~ "None, unknown or other",      broad_entry_qualifications %in% 1:4 ~ "A-level"),
  split_s_fy     = case_when(numcode(linked_engagement_has_foundation_year) == 1 ~ "Foundation year",
                             numcode(linked_engagement_has_foundation_year) == 0 ~ "No foundation year"),
  split_s_abcs_c = case_when(numcode(abcs_continuation_quintile) == 1 ~ "ABCS Q1", numcode(abcs_continuation_quintile) == 5 ~ "ABCS Q5"),
  split_s_abcs_k = case_when(numcode(abcs_completion_quintile)   == 1 ~ "ABCS Q1", numcode(abcs_completion_quintile)   == 5 ~ "ABCS Q5"),
  split_s_abcs_p = case_when(numcode(abcs_progression_quintile)  == 1 ~ "ABCS Q1", numcode(abcs_progression_quintile)  == 5 ~ "ABCS Q5"),
  split_s_sex_imd = case_when(split_s_sex == "Male"   & split_imd == "IMD Q1-2" ~ "Male, IMD Q1-2",
                              split_s_sex == "Female" & split_imd == "IMD Q3-5" ~ "Female, IMD Q3-5"),
  split_s_sex_eth = case_when(split_s_sex == "Male"   & split_s_eth == "Black" ~ "Black male",
                              split_s_sex == "Female" & split_s_eth == "White" ~ "White female")
)

# Every comparison in the scan. stages = "all" or a single stage.
scan_defs <- tribble(
  ~characteristic,                    ~column,            ~group,                               ~comparator,                          ~stages,
  "Sex",                              "split_s_sex",      "Male",                               "Female",                             "all",
  "Age on entry",                     "split_s_mature",   "21 and over",                        "Under 21",                           "all",
  "Age on entry",                     "split_s_age",      "21 to 25",                           "Under 21",                           "all",
  "Age on entry",                     "split_s_age",      "26 to 30",                           "Under 21",                           "all",
  "Age on entry",                     "split_s_age",      "31 and over",                        "Under 21",                           "all",
  "Ethnicity",                        "split_ethnicity",  "ABMO",                               "White",                              "all",
  "Ethnicity",                        "split_s_eth",      "Asian",                              "White",                              "all",
  "Ethnicity",                        "split_s_eth",      "Black",                              "White",                              "all",
  "Ethnicity",                        "split_s_eth",      "Mixed",                              "White",                              "all",
  "Ethnicity",                        "split_s_eth",      "Other ethnicity",                    "White",                              "all",
  "Disability",                       "split_s_dis",      "Disability reported",                "No disability reported",             "all",
  "Disability",                       "split_s_distype",  "Cognitive or learning difference",   "No disability reported",             "all",
  "Disability",                       "split_s_distype",  "Mental health condition",            "No disability reported",             "all",
  "Disability",                       "split_s_distype",  "Multiple impairments",               "No disability reported",             "all",
  "Disability",                       "split_s_distype",  "Physical or sensory impairment",     "No disability reported",             "all",
  "Disability",                       "split_s_distype",  "Social or communication impairment", "No disability reported",             "all",
  "Free school meals",                "split_fsm",        "Eligible",                           "Not eligible",                       "all",
  "Deprivation (IMD 2019)",           "split_imd",        "IMD Q1-2",                           "IMD Q3-5",                           "all",
  "Deprivation (IMD 2019)",           "split_s_imd15",    "IMD Q1",                             "IMD Q5",                             "all",
  "Area participation (TUNDRA)",      "split_s_tundra",   "TUNDRA Q1-2",                        "TUNDRA Q3-5",                        "all",
  "Area participation (POLAR4)",      "split_s_polar",    "POLAR4 Q1-2",                        "POLAR4 Q3-5",                        "all",
  "Socioeconomic class (NS-SEC)",     "split_s_nssec",    "Routine and manual",                 "Higher managerial and professional", "all",
  "Sexual orientation",               "split_s_lgb",      "LGB+",                               "Heterosexual",                       "all",
  "Entry qualifications",             "split_btec_alevel","BTEC",                               "A-level",                            "all",
  "Entry qualifications",             "split_btec_other", "BTEC",                               "All other qualifications",           "all",
  "Entry qualifications",             "split_s_access",   "Access or foundation course",        "A-level",                            "all",
  "Entry qualifications",             "split_s_heq",      "HE-level qualification",             "A-level",                            "all",
  "Entry qualifications",             "split_s_noq",      "None, unknown or other",             "A-level",                            "all",
  "Foundation year",                  "split_s_fy",       "Foundation year",                    "No foundation year",                 "all",
  "Combined characteristics (ABCS)",  "split_s_abcs_c",   "ABCS Q1",                            "ABCS Q5",                            "Continuation",
  "Combined characteristics (ABCS)",  "split_s_abcs_k",   "ABCS Q1",                            "ABCS Q5",                            "Completion",
  "Combined characteristics (ABCS)",  "split_s_abcs_p",   "ABCS Q1",                            "ABCS Q5",                            "Progression",
  "Intersections",                    "split_s_sex_imd",  "Male, IMD Q1-2",                     "Female, IMD Q3-5",                   "all",
  "Intersections",                    "split_s_sex_eth",  "Black male",                         "White female",                       "all"
)

# Which comparisons are already formal APP targets
app_lookup <- tribble(
  ~stage,         ~column,             ~group,     ~app_target,
  "Continuation", "split_btec_alevel", "BTEC",     "PTS_1",
  "Completion",   "split_fsm",         "Eligible", "PTS_2",
  "Completion",   "split_btec_alevel", "BTEC",     "PTS_3",
  "Attainment",   "split_ethnicity",   "ABMO",     "PTS_4",
  "Attainment",   "split_fsm",         "Eligible", "PTS_5",
  "Attainment",   "split_imd",         "IMD Q1-2", "PTS_6",
  "Attainment",   "split_btec_alevel", "BTEC",     "PTS_7",
  "Progression",  "split_btec_other",  "BTEC",     "PTP_2"
)

# Seven years per stage, as for the APP targets
stage_years <- list(Continuation = 2017:2023, Completion = 2014:2020,
                    Attainment = 2018:2024, Progression = 2017:2023)

scan_stages <- build_stages(base, level_options[[chosen_level]])

gap_of <- function(s_g, n_g, s_c, n_c) ifelse(n_g > 0 & n_c > 0, 100 * (s_c / n_c - s_g / n_g), NA_real_)

# University rows have no grouping column, so they are joined side by side
join_units <- function(x, y, unit_vars) if (length(unit_vars)) left_join(x, y, by = unit_vars) else bind_cols(x, y)

scan_one <- function(def, stg, unit_vars) {
  yrs <- stage_years[[stg]]
  d <- scan_stages %>%
    filter(stage == stg, base_academic_year %in% yrs) %>%
    mutate(grp = case_when(.data[[def$column]] == def$group ~ "g",
                           .data[[def$column]] == def$comparator ~ "c")) %>%
    filter(!is.na(grp))
  if (nrow(d) == 0) return(NULL)
  agg <- function(x, ...) {
    out <- x %>% group_by(across(all_of(unit_vars)), ..., grp) %>%
      summarise(n = sum(weight), s = sum(success), .groups = "drop") %>%
      pivot_wider(names_from = grp, values_from = c(n, s), values_fill = 0)
    for (v in c("n_g", "n_c", "s_g", "s_c")) if (!v %in% names(out)) out[[v]] <- 0
    out
  }
  latest <- agg(filter(d, base_academic_year %in% tail(yrs, 4)))
  basel  <- agg(filter(d, base_academic_year %in% head(yrs, 4))) %>%
    transmute(across(all_of(unit_vars)), baseline_gap_pp = gap_of(s_g, n_g, s_c, n_c))
  yearly <- agg(d, base_academic_year) %>%
    mutate(gap = gap_of(s_g, n_g, s_c, n_c), yi = match(base_academic_year, yrs)) %>%
    select(all_of(unit_vars), yi, gap) %>%
    arrange(yi) %>%
    pivot_wider(names_from = yi, values_from = gap, names_prefix = "gap_y")
  for (i in 1:7) if (!paste0("gap_y", i) %in% names(yearly)) yearly[[paste0("gap_y", i)]] <- NA_real_
  latest %>%
    mutate(rate_group = 100 * s_g / n_g, rate_comparator = 100 * s_c / n_c,
           gap_pp = gap_of(s_g, n_g, s_c, n_c),
           se = 100 * sqrt((s_g / n_g) * (1 - s_g / n_g) / n_g + (s_c / n_c) * (1 - s_c / n_c) / n_c),
           margin_pp = 1.96 * se,
           p_value = ifelse(se > 0, 2 * pnorm(-abs(gap_pp / se)), NA_real_)) %>%
    join_units(basel, unit_vars) %>%
    join_units(yearly, unit_vars) %>%
    transmute(across(all_of(unit_vars)),
              stage = stg, characteristic = def$characteristic, column = def$column,
              group = def$group, comparator = def$comparator,
              years_latest4 = paste(yl(tail(yrs, 4)[1]), "to", yl(tail(yrs, 1))),
              year_labels = paste(sapply(yrs, yl), collapse = "|"),
              n_group = round(n_g), rate_group, n_comparator = round(n_c), rate_comparator,
              gap_pp, margin_pp, p_value, baseline_gap_pp,
              change_pp = gap_pp - baseline_gap_pp,
              gap_y1, gap_y2, gap_y3, gap_y4, gap_y5, gap_y6, gap_y7)
}
yl <- function(y) paste0(y, "/", substr(y + 1, 3, 4))

scan <- map_dfr(names(scan_levels), function(lv) {
  map_dfr(seq_len(nrow(scan_defs)), function(i) {
    def <- scan_defs[i, ]
    stgs <- if (def$stages == "all") names(stage_years) else def$stages
    map_dfr(stgs, ~ scan_one(def, .x, scan_levels[[lv]]))
  }) %>% mutate(level = lv, .before = 1)
}) %>%
  { if (!"faculty" %in% names(.)) mutate(., faculty = NA_character_) else . } %>%
  mutate(faculty = if_else(level == "University", NA_character_, faculty)) %>%
  left_join(app_lookup, by = c("stage", "column", "group")) %>%
  mutate(
    significant  = !is.na(p_value) & p_value < 0.05 & n_group >= scan_min_n & n_comparator >= scan_min_n,
    group_behind = case_when(is.na(gap_pp) ~ NA_character_, gap_pp > 0 ~ group, gap_pp < 0 ~ comparator, TRUE ~ "Neither"),
    priority = case_when(
      is.na(gap_pp) | n_group < scan_min_n | n_comparator < scan_min_n ~ "Too few students",
      !significant ~ "No significant gap",
      abs(gap_pp) >= priority_gap ~ "Monitor closely",
      abs(gap_pp) >= monitor_gap ~ "Monitor",
      TRUE ~ "Small but significant gap"),
    across(c(rate_group, rate_comparator, gap_pp, margin_pp, baseline_gap_pp, change_pp, starts_with("gap_y")), ~ round(.x, 1)),
    p_value = signif(p_value, 3)) %>%
  select(level, faculty, stage, characteristic, group, comparator, app_target, priority,
         group_behind, gap_pp, margin_pp, p_value, significant, years_latest4,
         n_group, rate_group, n_comparator, rate_comparator,
         baseline_gap_pp, change_pp, year_labels, starts_with("gap_y"))

cat("\nGaps to monitor that are not APP targets (University, latest four years)\n")
scan %>%
  filter(level == "University", is.na(app_target), priority %in% c("Monitor closely", "Monitor")) %>%
  arrange(desc(abs(gap_pp))) %>%
  select(stage, characteristic, group, comparator, group_behind, gap_pp, margin_pp, change_pp, priority) %>%
  print(n = Inf, width = Inf)

write_csv(scan, file.path(out_dir, "equity_gaps_scan.csv"))
cat("\nScan written to:", file.path(out_dir, "equity_gaps_scan.csv"), "\n")
