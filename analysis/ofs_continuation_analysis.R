# =============================================================================
# OfS individualised student data: continuation analysis
#
# Purpose
#   1. Import the OfS individualised file (IND_2026_1_Core_10004351 - Tableau.xlsx)
#   2. Filter to the continuation population used in the access and participation
#      (APP) dashboard: full-time, first degree, UK-domiciled undergraduates
#   3. Rebuild continuation rates by year and by entry qualification group, so the
#      figures can be checked against the published OfS dashboard
#   4. Fit logistic regression models of continuation on student characteristics
#
# Source for all filter rules:
#   OfS, "Rebuilding student outcome and experience measures used in OfS
#   regulation" (May 2026). Table 3 (populations), Table 4 (years), Table 9
#   (continuation steps) and Annex B Table B1 (characteristics).
# =============================================================================

# ---- 0. Packages -------------------------------------------------------------
# install.packages(c("readxl", "dplyr", "tidyr", "broom", "purrr",
#                    "forcats", "readr", "writexl"))
library(readxl)
library(dplyr)
library(tidyr)
library(broom)
library(purrr)
library(forcats)
library(readr)

# Tidy the column names: lower case, spaces and punctuation to underscores.
# "Course title V2" -> course_title_v2, "FacultyV4" -> facultyv4,
# "Collab - Partner Name" -> collab_partner_name
clean_names <- function(df) {
  nm <- tolower(names(df))
  nm <- gsub("[^a-z0-9]+", "_", nm)
  nm <- gsub("^_|_$", "", nm)
  names(df) <- nm
  df
}

# ---- 1. Import ----------------------------------------------------------------
# readxl imports .xlsx directly, so there is no need to convert to CSV first.
# Two things to be aware of:
#   a. Excel caps a sheet at 1,048,576 rows. The OfS file is one row per student
#      per CAH3 subject, so if the original CSV was longer than that, rows were
#      lost when it was saved as .xlsx. Check the row count against the CSV.
#   b. readxl guesses column types from the first rows. guess_max = 1100000 makes it
#      look at every row, which avoids codes like "E1" being read as numbers
#      and then turned into NA. It is slower but safer.
# If the import takes more than a few minutes, saving the sheet as CSV and using
# readr::read_csv() will be quicker. The rest of the script is unchanged.

data_dir  <- "C:/Users/David278/OneDrive - Middlesex University/APP Framework/Data/Indivisualised data for regression"
data_file <- file.path(data_dir, "IND_2026_1_Core_10004351 - Tableau.xlsx")

# excel_sheets(data_file)   # run this first if unsure which sheet holds the data

raw <- read_excel(data_file, sheet = 1, guess_max = 1100000) %>%
  clean_names()

cat("Rows imported:", nrow(raw), "\n")
cat("Columns:", ncol(raw), "\n")

# Force the coded fields to character so that filters compare like with like.
# Numeric codes (0/1 flags, entry qualification codes) are kept numeric.
raw <- raw %>%
  mutate(
    across(c(level_aggregate_1, linked_engagement_starting_mode,
             continuation_outcome_after_1_year, broad_student_ethnicity,
             home_imd_quintile_by_nation, engagement_starting_age_group,
             is_reported_disabled, reported_disability_type, student_domicile),
           as.character),
    across(c(app_exclusion_reason, entrant_exclusion, broad_entry_qualifications,
             student_sex, base_academic_year, subject_weighting,
             linked_engagement_has_foundation_year, registering_ukprn),
           as.numeric)
  )

# Quick look at the values in the key filter columns before filtering.
raw %>% count(level_aggregate_1, sort = TRUE) %>% print()
raw %>% count(linked_engagement_starting_mode) %>% print()
raw %>% count(continuation_outcome_after_1_year) %>% print()
raw %>% count(base_academic_year) %>% print()
raw %>% count(app_exclusion_reason) %>% print()
raw %>% count(entrant_exclusion) %>% print()

# ---- 2. Filter to the APP continuation population -----------------------------
# Steps follow Table 9 of the rebuild guidance, with the population choices
# from the colleague's Tableau filters (screenshot):
#   Level Aggregate 1 = DEG            first degree            (Table 3)
#   Linked Engagement Starting Mode = FT  full-time            (Table 3)
#   App Exclusion Reason = 0           UK-domiciled UG in scope for APP
#   Entrant Exclusion = 0              counted as an entrant   (Table 9, step 6)
#   continuation_outcome_after_1_year != TRANSFER               (Table 9, step 6)
#
# The APP dashboard uses the "registered" view of the provider, so records are
# also restricted to registering_ukprn = 10004351 (Middlesex). If the file only
# contains Middlesex-registered students this filter changes nothing.

mdx_ukprn <- 10004351

cont_pop <- raw %>%
  filter(
    registering_ukprn == mdx_ukprn,
    app_exclusion_reason == 0,
    level_aggregate_1 == "DEG",
    linked_engagement_starting_mode == "FT",
    entrant_exclusion == 0,
    continuation_outcome_after_1_year != "TRANSFER"
  ) %>%
  mutate(
    # Numerator per Table 9, step 7
    continued = continuation_outcome_after_1_year %in%
      c("QUALIFIED", "CONTINUING", "TRANSFER_COLLAB", "QUALIFIED_PGRDORM"),

    # Entry qualification labels from Annex B, Table B1
    entry_qual_label = case_when(
      broad_entry_qualifications == 1  ~ "A-levels (AAA or higher)",
      broad_entry_qualifications == 2  ~ "A-levels (ABB or higher)",
      broad_entry_qualifications == 3  ~ "A-levels (BCC or higher) or IB",
      broad_entry_qualifications == 4  ~ "A-levels (CDD or higher)",
      broad_entry_qualifications == 5  ~ "A-levels (DDD or lower), other L3 at 105+ tariff, or 2 A-levels and 1 BTEC",
      broad_entry_qualifications == 6  ~ "HE level qualifications on entry",
      broad_entry_qualifications == 7  ~ "BTECs (at least DDM), or 1 A-level and 2 BTECs",
      broad_entry_qualifications == 8  ~ "BTECs (lower than DDM)",
      broad_entry_qualifications == 9  ~ "Other quals reported by non-UK domiciled",
      broad_entry_qualifications == 10 ~ "Access and foundation courses, or other L3 at 65+ tariff",
      broad_entry_qualifications == 11 ~ "None, unknown or other",
      TRUE ~ "Not coded"
    ),

    # Three-way grouping for the BTEC / A-level / other comparison. This matches
    # the grouping in the "BTEC analyses" workbook: A-level is codes 1 to 4 only.
    # Code 5 (DDD or lower, other Level 3 at 105+ tariff, or 2 A-levels and
    # 1 BTEC) sits in Other, along with HE-level, access and unknown.
    entry_qual_group = case_when(
      broad_entry_qualifications %in% 1:4  ~ "A-level",
      broad_entry_qualifications %in% 7:8  ~ "BTEC",
      TRUE ~ "Other"
    ),

    # Which years are in the published six-year APP series (Table 4, FT)
    in_app_series = base_academic_year %in% 2018:2023
  )

cat("\nRows in continuation population:", nrow(cont_pop), "\n")
cat("Weighted headcount:", round(sum(cont_pop$subject_weighting), 1), "\n")

# ---- 3. Rebuild continuation rates -------------------------------------------
# Headcounts are the sum of subject_weighting, never a count of rows
# (paragraphs 33 and 34 of the guidance).

continuation_rate <- function(df, ...) {
  df %>%
    group_by(...) %>%
    summarise(
      denominator = sum(subject_weighting),
      numerator   = sum(subject_weighting[continued]),
      .groups = "drop"
    ) %>%
    mutate(continuation_pct = round(100 * numerator / denominator, 1))
}

# 3a. Overall by year. Compare against the dashboard time series first.
overall_by_year <- continuation_rate(cont_pop, base_academic_year, in_app_series)
print(overall_by_year)

# 3b. Three-way entry qualification group by year (wide for easy comparison)
group_by_year <- continuation_rate(cont_pop, base_academic_year, entry_qual_group)
print(group_by_year)

group_by_year_wide <- group_by_year %>%
  select(base_academic_year, entry_qual_group, continuation_pct) %>%
  pivot_wider(names_from = entry_qual_group, values_from = continuation_pct)
print(group_by_year_wide)

# 3c. Full 11-category breakdown by year. This matches the dashboard split
#     directly, so it is the best check that the filters are right.
detail_by_year <- continuation_rate(cont_pop, base_academic_year,
                                    broad_entry_qualifications, entry_qual_label)
print(detail_by_year, n = Inf)

# 3d. Four-year aggregate (2020 to 2023), as reported on the dashboard
four_year_agg <- cont_pop %>%
  filter(base_academic_year %in% 2020:2023) %>%
  continuation_rate(broad_entry_qualifications, entry_qual_label)
print(four_year_agg, n = Inf)

# Write the checks out
out_dir <- file.path(data_dir, "outputs")
dir.create(out_dir, showWarnings = FALSE)
write_csv(overall_by_year,     file.path(out_dir, "continuation_overall_by_year.csv"))
write_csv(group_by_year,       file.path(out_dir, "continuation_by_entry_qual_group.csv"))
write_csv(detail_by_year,      file.path(out_dir, "continuation_by_entry_qual_detail.csv"))
write_csv(four_year_agg,       file.path(out_dir, "continuation_entry_qual_4yr_agg.csv"))

# =============================================================================
# STOP HERE until the figures above match the OfS dashboard.
# If they do not, the usual causes are:
#   - the file holds the "taught or registered" view rather than "registered"
#   - subject_weighting has been read as text (check class(raw$subject_weighting))
#   - rows were truncated at Excel's row limit
# =============================================================================

# ---- 4. Comparison tables in the layout of the BTEC analyses workbook ---------
# Reproduces the "Continuation" tab: one column per entry year, and for each
# group the continuation %, non-continuation %, continuing headcount and
# non-continuing headcount, with a Gap row (top group minus BTEC).
#   Block 1: A-level vs BTEC, with a Grand Total of those two groups only
#   Block 2: BTEC vs Non-BTEC, with a Grand Total of everyone
# Both blocks are written to one xlsx file and to CSV.

# Recompute the grouping here so this section works on a cont_pop built with
# an earlier version of section 2.
cont_pop <- cont_pop %>%
  mutate(entry_qual_group = case_when(
    broad_entry_qualifications %in% 1:4 ~ "A-level",
    broad_entry_qualifications %in% 7:8 ~ "BTEC",
    TRUE ~ "Other"))

workbook_years <- 2016:2023   # 2016/17 to 2023/24, as in the workbook

comparison_block <- function(df, group_var, group_levels, total_label = "Grand Total") {
  df <- df %>%
    filter(base_academic_year %in% workbook_years) %>%
    mutate(grp = .data[[group_var]]) %>%
    filter(grp %in% group_levels)

  by_group <- df %>%
    group_by(grp, base_academic_year) %>%
    summarise(continuing = sum(subject_weighting[continued]),
              non_continuing = sum(subject_weighting[!continued]),
              .groups = "drop")

  total <- df %>%
    group_by(base_academic_year) %>%
    summarise(continuing = sum(subject_weighting[continued]),
              non_continuing = sum(subject_weighting[!continued]),
              .groups = "drop") %>%
    mutate(grp = total_label)

  long <- bind_rows(by_group, total) %>%
    mutate(continuation_pct = 100 * continuing / (continuing + non_continuing),
           non_continuation_pct = 100 - continuation_pct,
           year_label = paste0(base_academic_year, "/",
                               substr(base_academic_year + 1, 3, 4))) %>%
    select(grp, year_label, continuation_pct, non_continuation_pct,
           continuing, non_continuing) %>%
    pivot_longer(c(continuation_pct, non_continuation_pct, continuing, non_continuing),
                 names_to = "measure", values_to = "value") %>%
    mutate(measure = factor(measure, levels = c("continuation_pct", "non_continuation_pct",
                                                "continuing", "non_continuing"),
                            labels = c("Continuation %", "Non-continuation %",
                                       "Continuing (headcount)",
                                       "Non-continuing (headcount)")),
           grp = factor(grp, levels = c(group_levels, total_label)),
           value = round(value, 1))

  wide <- long %>%
    arrange(grp, measure) %>%
    pivot_wider(names_from = year_label, values_from = value)

  # Gap row: first group minus BTEC, in percentage points
  gap <- wide %>%
    filter(measure == "Continuation %", grp %in% c(group_levels[1], "BTEC")) %>%
    summarise(across(-c(grp, measure),
                     ~ round(.x[grp == group_levels[1]] - .x[grp == "BTEC"], 1))) %>%
    mutate(grp = "Gap", measure = paste(group_levels[1], "minus BTEC (pp)"), .before = 1)

  bind_rows(wide %>% mutate(grp = as.character(grp), measure = as.character(measure)),
            gap) %>%
    rename(group = grp)
}

block1_alevel_vs_btec <- comparison_block(cont_pop, "entry_qual_group",
                                          c("A-level", "BTEC"))

block2_btec_vs_nonbtec <- cont_pop %>%
  mutate(btec_flag = if_else(entry_qual_group == "BTEC", "BTEC", "Non-BTEC")) %>%
  comparison_block("btec_flag", c("Non-BTEC", "BTEC"))

# Three-way view as well, since the regression uses these three groups
block3_three_way <- comparison_block(cont_pop, "entry_qual_group",
                                     c("A-level", "BTEC", "Other"))

cat("\nBlock 1: A-level vs BTEC\n");   print(block1_alevel_vs_btec, n = Inf, width = Inf)
cat("\nBlock 2: BTEC vs Non-BTEC\n");  print(block2_btec_vs_nonbtec, n = Inf, width = Inf)
cat("\nBlock 3: three-way\n");         print(block3_three_way, n = Inf, width = Inf)

out_dir <- file.path(data_dir, "outputs")
dir.create(out_dir, showWarnings = FALSE)
write_csv(block1_alevel_vs_btec,  file.path(out_dir, "check_continuation_alevel_vs_btec.csv"))
write_csv(block2_btec_vs_nonbtec, file.path(out_dir, "check_continuation_btec_vs_nonbtec.csv"))
write_csv(block3_three_way,       file.path(out_dir, "check_continuation_three_way.csv"))
if (requireNamespace("writexl", quietly = TRUE)) {
  writexl::write_xlsx(
    list("A-level vs BTEC"  = block1_alevel_vs_btec,
         "BTEC vs Non-BTEC" = block2_btec_vs_nonbtec,
         "Three-way"        = block3_three_way),
    file.path(out_dir, "check_continuation_vs_workbook.xlsx"))
}

# ---- 5. Prepare a student-level dataset for regression ------------------------
# The file is one row per student per CAH3 subject. For a logistic regression
# each student should appear once, so keep the row with the largest
# subject_weighting for each student-entry (their main subject). The outcome and
# all student characteristics are identical across a student's rows, so nothing
# is lost except the minor subject codes.

# The student key is husid (HESA) with learnrefnumber (ILR) as the fallback,
# since husid is blank for ILR-returned students. record_id is NOT a student
# identifier: it is unique per row, so using it would keep every subject row
# as a separate student.
reg_data <- cont_pop %>%
  mutate(student_key = paste(
    base_academic_year,
    coalesce(as.character(husid), as.character(learnrefnumber),
             as.character(sid), "NOID"),
    numhus, sep = "_")) %>%
  group_by(student_key) %>%
  slice_max(subject_weighting, n = 1, with_ties = FALSE) %>%
  ungroup() %>%
  mutate(
    continued = as.integer(continued),
    year = factor(base_academic_year),

    entry_qual_group = fct_relevel(factor(entry_qual_group), "A-level"),

    sex = case_when(student_sex == 2 ~ "Female",
                    student_sex == 1 ~ "Male",
                    TRUE ~ "Unknown") %>% factor() %>% fct_relevel("Female"),

    # Annex B age bands for undergraduates
    age_group = case_when(
      engagement_starting_age_group == "U21" ~ "Under 21",
      engagement_starting_age_group %in% c("21_25", "26_30") ~ "21 to 30",
      engagement_starting_age_group %in% c("31_40", "41_50", "51+") ~ "31 and over",
      TRUE ~ "Unknown") %>% factor() %>% fct_relevel("Under 21"),

    ethnicity = case_when(
      broad_student_ethnicity == "W" ~ "White",
      broad_student_ethnicity == "A" ~ "Asian",
      broad_student_ethnicity == "B" ~ "Black",
      broad_student_ethnicity == "M" ~ "Mixed",
      broad_student_ethnicity == "O" ~ "Other",
      TRUE ~ "Unknown") %>% factor() %>% fct_relevel("White"),

    # IMD quintile: E1 is most deprived. Restricted to English domicile so the
    # quintiles are on one scale.
    imd_quintile = case_when(
      student_domicile == "E" & home_imd_quintile_by_nation %in% paste0("E", 1:5) ~
        home_imd_quintile_by_nation,
      TRUE ~ "Unknown") %>% factor() %>% fct_relevel("E5"),

    disabled = case_when(is_reported_disabled == "Y" ~ "Disability reported",
                         is_reported_disabled == "N" ~ "No disability reported",
                         TRUE ~ "Unknown") %>% factor() %>%
      fct_relevel("No disability reported"),

    foundation_year = if_else(linked_engagement_has_foundation_year == 1,
                              "Foundation year", "No foundation year") %>%
      factor() %>% fct_relevel("No foundation year"),

    # Fold the small collaborative partner categories into one level
    faculty = case_when(
      grepl("^Collab", facultyv4) ~ "Collaborative partner",
      TRUE ~ facultyv4) %>% factor()
  )

cat("\nStudents in regression dataset:", nrow(reg_data), "\n")
cat("Weighted headcount in cont_pop:", round(sum(cont_pop$subject_weighting)), "\n")
if (abs(nrow(reg_data) - sum(cont_pop$subject_weighting)) > 0.02 * nrow(reg_data)) {
  warning("Student count differs from weighted headcount by more than 2%. ",
          "Check that the student key is unique per student.")
}

# Check the reference categories and cell sizes before modelling
reg_data %>% count(entry_qual_group) %>% print()
reg_data %>% count(age_group) %>% print()
reg_data %>% count(ethnicity) %>% print()
reg_data %>% count(imd_quintile) %>% print()
reg_data %>% count(faculty) %>% print()

# ---- 6. Regression models ------------------------------------------------------
# Model 1: entry qualification only, with year controls.
m1 <- glm(continued ~ entry_qual_group + year,
          data = reg_data, family = binomial)

# Model 2: full set of student characteristics plus faculty and year.
m2 <- glm(continued ~ entry_qual_group + sex + age_group + ethnicity +
            imd_quintile + disabled + foundation_year + faculty + year,
          data = reg_data, family = binomial)

# Odds ratios with 95% Wald confidence intervals. tidy(conf.int = TRUE) would
# use profile likelihood intervals, which take minutes on a sample this size
# and give the same answer to two decimal places.
tidy_or <- function(model) {
  tidy(model) %>%
    mutate(odds_ratio = round(exp(estimate), 3),
           conf.low   = round(exp(estimate - 1.96 * std.error), 3),
           conf.high  = round(exp(estimate + 1.96 * std.error), 3),
           p.value    = signif(p.value, 3)) %>%
    select(term, odds_ratio, conf.low, conf.high, p.value)
}

print(tidy_or(m1), n = Inf)
print(tidy_or(m2), n = Inf)
glance(m1); glance(m2)
anova(m1, m2, test = "Chisq")   # does adding characteristics improve fit?

# Model 3: does the entry qualification gap change over time?
m3 <- update(m2, . ~ . + entry_qual_group:year)
anova(m2, m3, test = "Chisq")

# Model 4: one model per year, so drivers can be compared year on year
by_year_models <- reg_data %>%
  group_split(year) %>%
  set_names(map_chr(., ~ as.character(first(.x$year)))) %>%
  map(~ glm(continued ~ entry_qual_group + sex + age_group + ethnicity +
              imd_quintile + disabled + foundation_year + faculty,
            data = .x, family = binomial))

by_year_or <- imap_dfr(by_year_models, ~ tidy_or(.x) %>% mutate(year = .y, .before = 1))
print(by_year_or %>% filter(grepl("entry_qual_group", term)), n = Inf)

write_csv(tidy_or(m1),  file.path(out_dir, "model1_entry_qual_odds_ratios.csv"))
write_csv(tidy_or(m2),  file.path(out_dir, "model2_full_odds_ratios.csv"))
write_csv(by_year_or,   file.path(out_dir, "models_by_year_odds_ratios.csv"))

# ---- 7. Notes for interpretation ----------------------------------------------
# - Odds ratios above 1 mean higher odds of continuing than the reference group
#   (A-level entrants, female, under 21, White, IMD quintile 5, no disability,
#   no foundation year), holding the other variables constant.
# - Cells with very few students give wide confidence intervals. Collapse or
#   drop levels if a category has fewer than about 30 students.
# - Unknown categories are kept in the model rather than dropped, so that the
#   sample stays the same as the dashboard population. Remove them from the
#   formula if the coefficients are not of interest.
