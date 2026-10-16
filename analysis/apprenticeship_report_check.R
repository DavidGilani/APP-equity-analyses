# =============================================================================
# Apprenticeship check against the 2025-26 Inclusion Report
#
# The 2025-26 apprenticeship Inclusion Report (data snapshot 3 July 2026) gives Middlesex
# apprenticeship outcomes by sex, LLDD and IMD. This script rebuilds the
# closest equivalents from the OfS individualised file under a range of
# options, then ranks the options by how closely they agree with the report.
#
# The two sources measure different things, so exact agreement is not
# expected:
#   - The report uses the Qualification Achievement Rate (QAR) from the ILR in
#     Aptem: learners who achieved, out of learners who left, by the year they
#     left (2022/23 to 2025/26 year to date).
#   - The OfS file measures continuation and completion by the year students
#     started. Completion is the closest match to QAR.
#   - The report covers levels 4 to 7, including postgraduate apprenticeships.
#   - The report uses the ILR LLDD flag; the OfS file has is_reported_disabled.
#
# So the options tested are:
#   levels      first degree / all undergraduate / all levels
#   exclusion   OfS APP exclusions applied or not (app_exclusion_reason = 0)
#   measure     continuation / completion
#   imd         IMD 2019 (historic field) / IMD 2025. The report uses IMD 2019.
#   year_offset report leaving year = OfS entry year + offset (0 to 4), since a
#               cohort leaves some years after it starts
#
# For each option the script compares the rates and gaps by year and reports:
#   direction_agree_pct  share of gaps pointing the same way as the report
#   mean_abs_gap_diff    average difference between our gap and the report's
#   mean_abs_rate_diff   average difference between our rates and the report's
#
# Age is not compared: the OfS file only has age bands (under 21, 21 to 25,
# ...), and the report uses 16 to 18, 19 to 23 and 24 and over. Ethnicity is
# not compared: the report's figures are for White British only, without a
# comparator rate.
#
# Outputs (outputs/apprenticeship_check), counts and rates only:
#   apprenticeship_option_ranking.csv   one row per option, best agreement first
#   apprenticeship_comparison_detail.csv  every year and figure, for every option
# =============================================================================

library(readxl)
library(dplyr)
library(tidyr)
library(purrr)
library(readr)

data_dir  <- "C:/Users/David278/OneDrive - Middlesex University/APP Framework/Data/Indivisualised data for regression"
data_file <- file.path(data_dir, "IND_2026_1_Core_10004351 - Tableau.xlsx")
rds_file  <- file.path(data_dir, "IND_2026_1_Core_10004351.rds")
out_dir   <- file.path(data_dir, "outputs", "apprenticeship_check")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

mdx_ukprn <- 10004351
min_n     <- 10   # leave out a year where either group has fewer students than this

# ---- 1. Figures from the Inclusion Report (Middlesex, QAR %) --------------------------
# The report is an internal document, so its figures are kept next to the data
# rather than in this public repository. The CSV needs these columns:
#   comparison        "Male vs female", "Disability vs none" or "IMD Q1 vs Q2-5"
#   year              leaving year as the OfS base year (2022 = 2022/23)
#   rate_group, rate_comparator  QAR % (blank where the report gives only the gap)
#   gap_pp            comparator minus group, so positive means the group does worse
report_file <- file.path(data_dir, "inclusion_report_figures.csv")
if (!file.exists(report_file)) stop("Could not find ", report_file)
report <- read_csv(report_file, col_types = cols(comparison = col_character(), .default = col_double()))

# ---- 2. Import ------------------------------------------------------------------------
clean_names <- function(df) {
  nm <- tolower(names(df)); nm <- gsub("[^a-z0-9]+", "_", nm); nm <- gsub("^_|_$", "", nm)
  names(df) <- nm; df
}
if (exists("raw") && is.data.frame(raw) && "linked_engagement_starting_mode" %in% names(raw)) {
  message("Using 'raw' already in memory")
} else if (file.exists(rds_file)) {
  raw <- readRDS(rds_file)
} else {
  raw <- read_excel(data_file, sheet = 1, guess_max = 1100000) %>% clean_names()
  saveRDS(raw, rds_file)
}

txt <- function(x) trimws(as.character(x))
num <- function(x) suppressWarnings(as.numeric(as.character(x)))
success_codes <- c("QUALIFIED", "CONTINUING", "TRANSFER_COLLAB", "QUALIFIED_PGRDORM")

appr <- raw %>%
  filter(num(registering_ukprn) == mdx_ukprn, txt(linked_engagement_starting_mode) == "APPR") %>%
  mutate(year = num(base_academic_year),
         weight = num(subject_weighting),
         level = txt(level_aggregate_1),
         app_excluded = num(app_exclusion_reason) != 0,
         entrant_exclusion = num(entrant_exclusion),
         cont1 = txt(continuation_outcome_after_1_year),
         cont4 = txt(continuation_outcome_after_4_years),
         sex = case_when(txt(student_sex) == "1" ~ "group", txt(student_sex) == "2" ~ "comparator"),
         dis = case_when(txt(is_reported_disabled) == "Y" ~ "group", txt(is_reported_disabled) == "N" ~ "comparator"),
         imd2019 = case_when(txt(historic_home_imd_quintile_by_nation) == "E1" ~ "group",
                             txt(historic_home_imd_quintile_by_nation) %in% paste0("E", 2:5) ~ "comparator"),
         imd2025 = case_when(txt(home_imd_quintile_by_nation) == "E1" ~ "group",
                             txt(home_imd_quintile_by_nation) %in% paste0("E", 2:5) ~ "comparator"))

cat("Apprentice rows registered at Middlesex:", nrow(appr), "\n")
cat("\nApprentice headcount by level and year (sum of subject_weighting):\n")
appr %>% group_by(level, year) %>% summarise(n = round(sum(weight, na.rm = TRUE)), .groups = "drop") %>%
  pivot_wider(names_from = year, values_from = n, values_fill = 0) %>% print(width = Inf)
cat("\nApprentices excluded from the APP population (app_exclusion_reason not 0):",
    round(sum(appr$weight[appr$app_excluded], na.rm = TRUE)), "of", round(sum(appr$weight, na.rm = TRUE)), "\n")

# ---- 3. Rates by year for each set of options -------------------------------------
level_sets <- list("First degree" = "DEG",
                   "All undergraduate" = c("DEG", "PUGD", "OUG"),
                   "All levels" = unique(na.omit(appr$level)))

rates_for <- function(levels_name, exclusion, measure, imd) {
  d <- appr %>% filter(level %in% level_sets[[levels_name]])
  if (exclusion == "APP exclusions applied") d <- d %>% filter(!app_excluded)
  outcome <- if (measure == "Continuation") d$cont1 else d$cont4
  d <- d %>% mutate(outcome = outcome) %>%
    filter(entrant_exclusion == 0, !is.na(outcome), outcome != "TRANSFER", outcome != "NA") %>%
    mutate(success = weight * (outcome %in% success_codes))
  splits <- c("Male vs female" = "sex", "Disability vs none" = "dis", "IMD Q1 vs Q2-5" = imd)
  imap_dfr(splits, function(col, comparison) {
    d %>% filter(!is.na(.data[[col]])) %>%
      group_by(year, side = .data[[col]]) %>%
      summarise(n = sum(weight), rate = 100 * sum(success) / sum(weight), .groups = "drop") %>%
      pivot_wider(names_from = side, values_from = c(n, rate)) %>%
      mutate(comparison = comparison)
  })
}

options <- expand_grid(levels = names(level_sets),
                       exclusion = c("APP exclusions applied", "No APP exclusions"),
                       measure = c("Completion", "Continuation"),
                       imd = c("imd2019", "imd2025"))

ofs_rates <- options %>%
  mutate(rates = pmap(list(levels, exclusion, measure, imd), rates_for)) %>%
  unnest(rates) %>%
  filter(!is.na(n_group), !is.na(n_comparator), n_group >= min_n, n_comparator >= min_n) %>%
  transmute(levels, exclusion, measure, imd, comparison, ofs_year = year,
            ofs_n_group = round(n_group), ofs_n_comparator = round(n_comparator),
            ofs_rate_group = round(rate_group, 1), ofs_rate_comparator = round(rate_comparator, 1),
            ofs_gap_pp = round(rate_comparator - rate_group, 1))

# ---- 4. Compare with the report under each year offset ------------------------------
detail <- map_dfr(0:4, function(off) {
  ofs_rates %>% mutate(year_offset = off, year = ofs_year + off) %>%
    inner_join(report, by = c("comparison", "year"))
}) %>%
  mutate(year_label = paste0(year, "/", substr(year + 1, 3, 4)),
         direction_agree = sign(ofs_gap_pp) == sign(gap_pp),
         gap_diff = ofs_gap_pp - gap_pp,
         rate_diff_group = ofs_rate_group - rate_group,
         rate_diff_comparator = ofs_rate_comparator - rate_comparator)

ranking <- detail %>%
  group_by(levels, exclusion, measure, imd = if_else(imd == "imd2019", "IMD 2019", "IMD 2025"), year_offset) %>%
  summarise(figures_compared = n(),
            direction_agree_pct = round(100 * mean(direction_agree), 0),
            mean_abs_gap_diff = round(mean(abs(gap_diff)), 1),
            mean_abs_rate_diff = round(mean(abs(c(rate_diff_group, rate_diff_comparator)), na.rm = TRUE), 1),
            .groups = "drop") %>%
  # Options built on only a few figures can agree by chance, so need at least 4
  filter(figures_compared >= 4) %>%
  arrange(desc(direction_agree_pct), mean_abs_gap_diff, mean_abs_rate_diff)

cat("\n---- Options ranked by agreement with the Inclusion Report ----\n")
print(head(ranking, 15), n = 15, width = Inf)

best <- ranking[1, ]
if (nrow(best)) {
  cat("\n---- Closest option, year by year ----\n")
  detail %>%
    filter(levels == best$levels, exclusion == best$exclusion, measure == best$measure,
           year_offset == best$year_offset,
           imd == if_else(best$imd == "IMD 2019", "imd2019", "imd2025")) %>%
    select(comparison, report_year = year_label, ofs_entry_year = ofs_year,
           ofs_n_group, ofs_n_comparator, ofs_rate_group, report_rate_group = rate_group,
           ofs_rate_comparator, report_rate_comparator = rate_comparator,
           ofs_gap_pp, report_gap_pp = gap_pp) %>%
    print(width = Inf)
}

write_csv(ranking, file.path(out_dir, "apprenticeship_option_ranking.csv"))
write_csv(detail %>% select(-year), file.path(out_dir, "apprenticeship_comparison_detail.csv"))
cat("\nFiles written to:", out_dir, "\n")
