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

