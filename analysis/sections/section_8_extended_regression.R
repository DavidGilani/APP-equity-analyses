# ---- 8. Extended regression: what drives continuation? ------------------------
# Entrants 2020/21 to 2023/24 only (the OfS four-year aggregate window).
# Two models:
#   Model A  student characteristics only
#   Model B  Model A plus university structure: department, foundation year,
#            course length, sandwich year, distance learning
# Comparing the two shows how much of each characteristic's effect runs
# through where and what students study, rather than who they are.
#
# For each model: variable importance (drop-one likelihood ratio test), odds
# ratios, average marginal effects in percentage points if the
# marginaleffects package is installed, and fit statistics. Model B is also
# refitted within each entry year to see whether the drivers change.
#
# Variables NOT used, and why:
#   abcs_continuation_quintile   OfS builds it from these same characteristics
#                                as a predicted continuation risk, so it would
#                                double count. It is kept as a benchmark model.
#   degree_class, progression_*  outcomes that happen after continuation
#   interim_study_mode, geography_of_employment_quintile   post-entry
#   sexual_orientation           mostly unknown

analysis_years <- 2020:2023
min_cell       <- 30      # department levels smaller than this fold into "Other"

fold_small <- function(x, min_n = min_cell, other = "Other (small groups)") {
  x <- as.character(x)
  tab <- table(x)
  x[x %in% names(tab)[tab < min_n]] <- other
  x
}

reg_data8 <- reg_data %>%
  filter(base_academic_year %in% analysis_years) %>%
  mutate(
    year = droplevels(year),

    entry_qual_detail = factor(entry_qual_label) %>%
      fct_relevel("A-levels (BCC or higher) or IB"),

    # IMD: quintiles 1 and 2 (most deprived 40% of areas) against 3 to 5
    imd2 = case_when(
      student_domicile == "E" & home_imd_quintile_by_nation %in% c("E1", "E2") ~ "IMD Q1-2 (most deprived)",
      student_domicile == "E" & home_imd_quintile_by_nation %in% c("E3", "E4", "E5") ~ "IMD Q3-5",
      TRUE ~ "Unknown or not England") %>% factor() %>% fct_relevel("IMD Q3-5"),

    disability_type = case_when(
      is_reported_disabled == "N"        ~ "No disability reported",
      reported_disability_type == "COG"  ~ "Cognitive or learning",
      reported_disability_type == "MH"   ~ "Mental health",
      reported_disability_type == "MULTI"~ "Multiple",
      reported_disability_type == "PHY"  ~ "Physical or sensory",
      reported_disability_type == "SOC"  ~ "Social or communication",
      is_reported_disabled == "Y"        ~ "Disability, type unknown",
      TRUE ~ "Unknown") %>% factor() %>% fct_relevel("No disability reported"),

    fsm = case_when(
      in_free_school_meal_population == 1 & had_free_school_meals == 1 ~ "Eligible for FSM",
      in_free_school_meal_population == 1 & had_free_school_meals == 0 ~ "Not eligible for FSM",
      TRUE ~ "Not in FSM population") %>% factor() %>% fct_relevel("Not eligible for FSM"),

    nssec = case_when(
      as.character(socioeconomic_class) %in% c("01", "02", "1", "2") ~ "Higher managerial and professional",
      as.character(socioeconomic_class) %in% c("03", "04", "3", "4") ~ "Intermediate",
      as.character(socioeconomic_class) %in% c("05", "06", "07", "5", "6", "7") ~ "Routine and manual",
      as.character(socioeconomic_class) %in% c("08", "8") ~ "Not classified",
      TRUE ~ "Unknown") %>% factor() %>% fct_relevel("Higher managerial and professional"),

    # POLAR4 is only defined for young entrants
    polar4 = case_when(
      engagement_starting_age_group == "U21" & as.character(polar4_quintile) %in% as.character(1:5) ~
        paste0("Q", polar4_quintile),
      engagement_starting_age_group == "U21" ~ "Young, unknown",
      TRUE ~ "Mature, not applicable") %>% factor() %>% fct_relevel("Q5"),

    department    = fold_small(department) %>% factor(),
    course_length = factor(as.character(expected_course_length_grouped)),
    sandwich      = if_else(as.character(is_sandwich_year) == "1", "Sandwich", "Not sandwich") %>%
      factor() %>% fct_relevel("Not sandwich"),
    distance      = if_else(as.character(is_distance_learner) == "1", "Distance", "Campus") %>%
      factor() %>% fct_relevel("Campus"),

    abcs = case_when(
      as.character(abcs_continuation_quintile) %in% as.character(1:5) ~
        paste0("ABCS Q", abcs_continuation_quintile),
      TRUE ~ "Unknown") %>% factor() %>% fct_relevel("ABCS Q5")
  )

cat("\nStudents in 2020/21 to 2023/24 regression sample:", nrow(reg_data8), "\n")
for (v in c("entry_qual_group", "imd2", "disability_type", "fsm", "nssec", "polar4",
            "department", "course_length", "sandwich", "distance", "year")) {
  cat("\n--", v, "--\n"); print(table(reg_data8[[v]], useNA = "ifany"))
}

# ---- 8a. Fit the two models ------------------------------------------------------
student_vars   <- c("entry_qual_group", "sex", "age_group", "ethnicity", "imd2",
                    "disability_type", "fsm", "nssec", "polar4")
structure_vars <- c("department", "foundation_year", "course_length", "sandwich", "distance")

# Drop any variable with a single level in this sample, otherwise glm errors
usable <- function(vars, d) {
  keep <- vars[sapply(vars, function(v) nlevels(droplevels(d[[v]])) >= 2)]
  dropped <- setdiff(vars, keep)
  if (length(dropped)) message("Dropped single-level variables: ", paste(dropped, collapse = ", "))
  keep
}
rhs_A <- c(usable(student_vars, reg_data8), "year")
rhs_B <- c(usable(c(student_vars, structure_vars), reg_data8), "year")

model_A <- glm(reformulate(rhs_A, "continued"), data = reg_data8, family = binomial)
model_B <- glm(reformulate(rhs_B, "continued"), data = reg_data8, family = binomial)
model_B_detail <- update(model_B, . ~ . - entry_qual_group + entry_qual_detail)
model_abcs <- glm(continued ~ abcs + year, data = reg_data8, family = binomial)

pseudo_r2 <- function(m) round(1 - m$deviance / m$null.deviance, 4)   # McFadden
auc <- function(m) {                                                  # rank-based AUC
  p <- fitted(m); y <- m$y
  r <- rank(p); n1 <- sum(y == 1); n0 <- sum(y == 0)
  round((sum(r[y == 1]) - n1 * (n1 + 1) / 2) / (n1 * n0), 4)
}
fit_table <- tibble(
  model = c("A: student characteristics", "B: A + university structure",
            "B with 11-category entry quals", "ABCS benchmark"),
  n     = c(nobs(model_A), nobs(model_B), nobs(model_B_detail), nobs(model_abcs)),
  AIC   = round(c(AIC(model_A), AIC(model_B), AIC(model_B_detail), AIC(model_abcs)), 1),
  mcfadden_r2 = c(pseudo_r2(model_A), pseudo_r2(model_B), pseudo_r2(model_B_detail), pseudo_r2(model_abcs)),
  auc   = c(auc(model_A), auc(model_B), auc(model_B_detail), auc(model_abcs)))
cat("\nModel fit comparison\n"); print(fit_table)
cat("\nDoes adding university structure improve fit?\n")
print(anova(model_A, model_B, test = "Chisq"))

# ---- 8b. Variable importance and odds ratios --------------------------------------
importance <- function(m, label) {
  drop1(m, test = "LRT") %>%
    as.data.frame() %>%
    tibble::rownames_to_column("variable") %>%
    filter(variable != "<none>") %>%
    transmute(model = label, variable, df = Df, deviance_change = round(LRT, 1),
              p_value = signif(`Pr(>Chi)`, 3)) %>%
    arrange(desc(deviance_change)) %>%
    as_tibble()
}
importance_A <- importance(model_A, "A")
importance_B <- importance(model_B, "B")
cat("\nVariable importance, model A\n"); print(importance_A, n = Inf)
cat("\nVariable importance, model B\n"); print(importance_B, n = Inf)

# Odds ratios side by side: how much does each effect change once structure
# is controlled for?
or_A <- tidy_or(model_A) %>% rename(or_A = odds_ratio, low_A = conf.low, high_A = conf.high, p_A = p.value)
or_B <- tidy_or(model_B) %>% rename(or_B = odds_ratio, low_B = conf.low, high_B = conf.high, p_B = p.value)
or_side_by_side <- full_join(or_A, or_B, by = "term")
cat("\nOdds ratios, model A and model B\n"); print(or_side_by_side, n = Inf, width = Inf)

# ---- 8c. Average marginal effects in percentage points ----------------------------
# For each variable: the average change in the probability of continuing when
# a student is moved from the reference level to each other level, holding
# their other characteristics as they are.
if (requireNamespace("marginaleffects", quietly = TRUE)) {
  ame <- function(m, label) {
    marginaleffects::avg_comparisons(m) %>%
      as_tibble() %>%
      transmute(model = label, variable = term, contrast,
                effect_pp = round(100 * estimate, 1),
                conf.low  = round(100 * conf.low, 1),
                conf.high = round(100 * conf.high, 1),
                p_value   = signif(p.value, 3))
  }
  ame_both <- bind_rows(ame(model_A, "A"), ame(model_B, "B"))
  cat("\nAverage marginal effects (percentage points)\n"); print(ame_both, n = Inf)
  write_csv(ame_both, file.path(out_dir, "model_AB_marginal_effects_pp.csv"))
} else {
  message("Install the 'marginaleffects' package to get effects in percentage points: ",
          "install.packages('marginaleffects')")
}

# ---- 8d. Do the drivers change over time? -------------------------------------------
# Model B refitted within each entry year.
rhs_B_year <- setdiff(rhs_B, "year")
by_year <- reg_data8 %>%
  group_split(year) %>%
  map(function(d) {
    keep <- usable(rhs_B_year, d)
    list(year = as.character(first(d$year)), n = nrow(d),
         model = glm(reformulate(keep, "continued"), data = d, family = binomial))
  })

importance_by_year <- map_dfr(by_year, function(x)
  importance(x$model, x$year) %>% rename(year = model) %>% mutate(n = x$n))
importance_by_year_wide <- importance_by_year %>%
  select(year, variable, deviance_change) %>%
  pivot_wider(names_from = year, values_from = deviance_change) %>%
  arrange(desc(rowSums(across(-variable), na.rm = TRUE)))
cat("\nVariable importance by entry year, model B (deviance change)\n")
print(importance_by_year_wide, n = Inf, width = Inf)

entry_qual_by_year <- map_dfr(by_year, function(x)
  tidy_or(x$model) %>% filter(grepl("^entry_qual_group", term)) %>%
    mutate(year = x$year, .before = 1))
cat("\nEntry qualification odds ratios by year, model B controls\n")
print(entry_qual_by_year, n = Inf)

# ---- 8e. Write out -------------------------------------------------------------------
write_csv(fit_table,               file.path(out_dir, "model_AB_fit_comparison.csv"))
write_csv(bind_rows(importance_A, importance_B),
                                   file.path(out_dir, "model_AB_variable_importance.csv"))
write_csv(or_side_by_side,         file.path(out_dir, "model_AB_odds_ratios.csv"))
write_csv(tidy_or(model_B_detail), file.path(out_dir, "model_B_11cat_entry_qual_odds_ratios.csv"))
write_csv(importance_by_year,      file.path(out_dir, "model_B_variable_importance_by_year.csv"))
write_csv(importance_by_year_wide, file.path(out_dir, "model_B_variable_importance_by_year_wide.csv"))
write_csv(entry_qual_by_year,      file.path(out_dir, "model_B_entry_qual_odds_ratios_by_year.csv"))

# ---- 8f. Notes -----------------------------------------------------------------------
# - Read model A as "who continues" and model B as "who continues, given what
#   and where they study". If an effect shrinks from A to B, part of it runs
#   through course choice. If it holds, it is there regardless of course.
# - Age and entry qualifications overlap: mature students mostly enter through
#   access courses. Expect wider confidence intervals for both than in section 6.
# - FSM, POLAR4 and NS-SEC each carry a "not applicable" or "unknown" level for
#   students outside the population they are defined on. Those levels keep the
#   sample whole; do not interpret them as a substantive group.
# - The ABCS model is a benchmark only. If model B beats it on AUC, the
#   individual characteristics explain more than the OfS composite measure.
