# =============================================================================
# APP equity gaps: university, faculty, department and programme
#
# Purpose
#   1. Rebuild the eight APP success and progression target gaps from the OfS
#      individualised file, and check them against the "APP Equity Gap Table"
#      workbook (1st Deg FT UG sheet)
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

if (exists("raw") && is.data.frame(raw) && "programme_title_long" %in% names(raw)) {
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
              "home_imd_quintile_by_nation", "facultyv4", "department",
              "programme_title_long")
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
    # IMD: English quintiles, 1 is most deprived
    split_imd = case_when(home_imd_quintile_by_nation %in% c("E1", "E2") ~ "IMD Q1-2",
                          home_imd_quintile_by_nation %in% c("E3", "E4", "E5") ~ "IMD Q3-5"),
    faculty    = coalesce(facultyv4, "Unknown"),
    department = coalesce(department, "Unknown"),
    programme  = coalesce(programme_title_long, "Unknown")
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
# Milestones are from the APP (Tables 5d and 5e). The first year after the
# baseline is compared with the 2025-26 milestone, the second with 2026-27,
# and the third with 2027-28.
# wb_yr and wb_after are the workbook figures, used only for the check.
targets <- tribble(
  ~target_id, ~stage, ~target_group_label, ~split, ~target_group, ~comparator_group,
  ~baseline_years, ~after_years, ~app_baseline, ~m_2025_26, ~m_2026_27, ~m_2027_28, ~m_2028_29,
  ~wb_yr, ~wb_after,
  "PTS_1", "Continuation", "BTEC vs A-level", "split_btec_alevel", "BTEC", "A-level",
  2017:2020, 2021:2023, 5.9, 5, 4, 3, 1.9,
  c(8.3, 4.25, 4.42, 7.9), c(13.09, 11.08, 9.93),
  "PTS_2", "Completion", "FSM eligible vs not eligible", "split_fsm", "Eligible", "Not eligible",
  2014:2017, 2018:2020, 5.3, 4.5, 3.5, 2.5, 1.9,
  c(4.17, 6.65, 5.98, 3.72), c(3.25, 9.52, 1.93),
  "PTS_3", "Completion", "BTEC vs A-level", "split_btec_alevel", "BTEC", "A-level",
  2014:2017, 2018:2020, 7.9, 6.5, 5, 4, 2.9,
  c(6.59, 7.8, 9.86, 6.54), c(10.4, 10.7, 15.5),
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
  2018:2021, 2022:2024, 14.9, 12, 9, 6, 4.9,
  c(17.66, 12.59, 13.74, 14.37), c(26.7, 22.6, 19.5),
  "PTP_2", "Progression", "BTEC vs all other qualifications", "split_btec_other", "BTEC", "All other qualifications",
  2017:2020, 2021:2023, 10.4, 8.5, 7.5, 6.5, 4.9,
  c(6.88, 8.45, 13.05, 10.45), c(8.2, 11.1, 11.1),
  # The workbook progression figures compare BTEC with A-level. This row is a
  # check only, so we can see which comparator the workbook used.
  "PTP_2 (A-level check)", "Progression", "BTEC vs A-level (check only)", "split_btec_alevel", "BTEC", "A-level",
  2017:2020, 2021:2023, 10.4, 8.5, 7.5, 6.5, 4.9,
  c(6.88, 8.45, 13.05, 10.45), c(8.2, 11.1, 11.1)
)
# tribble stores the year vectors as list columns only if wrapped; make sure
targets <- targets %>%
  mutate(across(c(baseline_years, after_years, wb_yr, wb_after), as.list))

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
           app_baseline = t$app_baseline,
           milestone = case_when(period == "1 year after baseline"  ~ t$m_2025_26,
                                 period == "2 years after baseline" ~ t$m_2026_27,
                                 period == "3 years after baseline" ~ t$m_2027_28),
           target_2028_29 = t$m_2028_29)
}

run_targets <- function(stages, unit_vars) {
  map_dfr(seq_len(nrow(targets)), ~ calc_gaps(stages, targets[.x, ], unit_vars))
}

# ---- 6. University-level check against the workbook ---------------------------------------
period_order <- c("YR1", "YR2", "YR3", "YR4", "Baseline (4-year pooled)",
                  "Baseline (average of YR1 to YR4 gaps)",
                  "1 year after baseline", "2 years after baseline", "3 years after baseline")

workbook_values <- targets %>%
  transmute(target_id,
            values = map2(wb_yr, wb_after, ~ tibble(
              period = c(paste0("YR", 1:4), "1 year after baseline",
                         "2 years after baseline", "3 years after baseline"),
              workbook_gap_pp = c(.x, .y)))) %>%
  unnest(values)

university_check <- imap_dfr(level_options, function(lv, lv_name) {
  run_targets(build_stages(base, lv), character(0)) %>%
    mutate(level_option = lv_name)
}) %>%
  left_join(workbook_values, by = c("target_id", "period")) %>%
  mutate(difference_pp = round(gap_pp - workbook_gap_pp, 2),
         period = factor(period, levels = period_order)) %>%
  arrange(level_option, target_id, period) %>%
  mutate(across(c(n_target, n_comparator), round),
         across(c(rate_target, rate_comparator, gap_pp), ~ round(.x, 2))) %>%
  select(level_option, target_id, target_group_label, period, years,
         n_target, rate_target, n_comparator, rate_comparator,
         gap_pp, workbook_gap_pp, difference_pp, app_baseline)

cat("\nUniversity-level check against the workbook\n")
print(university_check, n = Inf, width = Inf)

# Quick summary: how close is each target, for each level option?
check_summary <- university_check %>%
  filter(!is.na(workbook_gap_pp)) %>%
  group_by(level_option, target_id) %>%
  summarise(max_abs_difference_pp = max(abs(difference_pp), na.rm = TRUE),
            after_years_max_diff  = max(abs(difference_pp[grepl("after", period)]), na.rm = TRUE),
            .groups = "drop")
cat("\nLargest difference from the workbook, by target\n")
print(check_summary, n = Inf)

write_csv(university_check, file.path(out_dir, "equity_gaps_university_check.csv"))
write_csv(check_summary,    file.path(out_dir, "equity_gaps_check_summary.csv"))

# =============================================================================
# STOP HERE until the university-level gaps match the workbook.
# The "after" years should match closely, as they did for continuation. The
# YR1 to YR4 figures in the workbook may come from an earlier OfS data release
# and may not match exactly.
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
         across(c(rate_target, rate_comparator, gap_pp), ~ round(.x, 1))) %>%
  select(level, faculty, department, unit, target_id, stage, target_group_label,
         target_group, comparator_group, period, years,
         n_target, rate_target, n_comparator, rate_comparator, gap_pp,
         small_numbers, app_baseline, milestone, met_milestone,
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
         milestone, target_2028_29, app_baseline) %>%
  mutate(period = recode(as.character(period),
                         "Baseline (4-year pooled)" = "baseline",
                         "1 year after baseline"    = "after_1",
                         "2 years after baseline"   = "after_2",
                         "3 years after baseline"   = "after_3")) %>%
  group_by(level, faculty, department, unit, target_id, stage, target_group_label,
           app_baseline, target_2028_29) %>%
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
