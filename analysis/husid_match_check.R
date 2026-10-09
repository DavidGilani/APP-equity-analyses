# =============================================================================
# HUSID match check: how many students in the OfS data have a student ID?
#
# Joins the OfS individualised file to the "ownstu HUSID extract", which links
# HUSID to the student record ID (SPRIDEN_ID). Reports the share of students
# that can be matched:
#   - overall, and within the APP population used for the equity gap analyses
#   - by academic year, level, mode, faculty and lifecycle stage
# so you can judge whether other student-record data (for example religion)
# can be brought into the APP analyses by SPRIDEN_ID.
#
# Counts are of unique students (HUSID), not rows: the OfS file has one row per
# student per subject, and a student can appear in several years.
#
# Outputs (outputs/husid_match):
#   husid_match_summary.csv      match rates for every breakdown
#   husid_unmatched_sample.csv   up to 200 unmatched HUSIDs to investigate
#                                (personal identifiers: keep this file secure)
# =============================================================================

library(readxl)
library(dplyr)
library(tidyr)
library(readr)
library(purrr)

data_dir  <- "C:/Users/David278/OneDrive - Middlesex University/APP Framework/Data/Indivisualised data for regression"
ofs_file  <- file.path(data_dir, "IND_2026_1_Core_10004351 - Tableau.xlsx")
rds_file  <- file.path(data_dir, "IND_2026_1_Core_10004351.rds")
out_dir   <- file.path(data_dir, "outputs", "husid_match")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
mdx_ukprn <- 10004351

# ---- 1. The HUSID extract ------------------------------------------------------
# Finds "ownstu HUSID extract" whatever its extension (.csv or .xlsx).
extract_file <- list.files(data_dir, pattern = "^ownstu HUSID extract\\.(csv|xlsx|xls)$",
                           full.names = TRUE, ignore.case = TRUE)[1]
if (is.na(extract_file)) stop("Could not find 'ownstu HUSID extract' in ", data_dir)

# Read every column as text. Reading HUSIDs as numbers can drop leading zeros
# or turn them into scientific notation, and then nothing matches.
extract <- if (grepl("\\.csv$", extract_file, ignore.case = TRUE)) {
  read_csv(extract_file, col_types = cols(.default = col_character()))
} else {
  read_excel(extract_file, col_types = "text")
}
names(extract) <- toupper(trimws(names(extract)))
if (!all(c("SPRIDEN_ID", "HUSID") %in% names(extract)))
  stop("The extract needs columns SPRIDEN_ID and HUSID. Found: ", paste(names(extract), collapse = ", "))

# HUSIDs are 13 digits. Strip anything that is not a digit and restore any
# leading zeros lost in Excel, so both files use the same form.
clean_husid <- function(x) {
  x <- as.character(x)
  x <- ifelse(grepl("[eE]\\+", x), format(suppressWarnings(as.numeric(x)), scientific = FALSE, trim = TRUE), x)
  x <- gsub("\\.0+$", "", x)
  x <- gsub("[^0-9]", "", x)
  x <- ifelse(nchar(x) > 0 & nchar(x) < 13, paste0(strrep("0", pmax(0, 13 - nchar(x))), x), x)
  ifelse(nchar(x) == 0, NA_character_, x)
}

# HUSIDs saved in scientific notation (e.g. 1.23457E+12) have already lost
# digits in Excel and cannot be recovered. If this count is above zero,
# re-export the extract with the HUSID column formatted as text.
n_sci <- sum(grepl("[eE]\\+", extract$HUSID))
if (n_sci > 0) warning(n_sci, " HUSIDs are in scientific notation and will probably not match. Re-export with HUSID as text.")

extract <- extract %>%
  mutate(husid_clean = clean_husid(HUSID), SPRIDEN_ID = trimws(SPRIDEN_ID))

cat("\n---- HUSID extract ----\n")
cat("Rows:", nrow(extract), "\n")
cat("Rows with no HUSID:", sum(is.na(extract$husid_clean)), "\n")
cat("HUSIDs that are not 13 digits:", sum(!is.na(extract$husid_clean) & nchar(extract$husid_clean) != 13), "\n")
dup_husid <- extract %>% filter(!is.na(husid_clean)) %>% count(husid_clean) %>% filter(n > 1)
cat("HUSIDs linked to more than one student ID:", nrow(dup_husid), "\n")
dup_id <- extract %>% filter(!is.na(husid_clean)) %>% distinct(SPRIDEN_ID, husid_clean) %>% count(SPRIDEN_ID) %>% filter(n > 1)
cat("Student IDs linked to more than one HUSID:", nrow(dup_id), "\n")

# One row per HUSID for matching (if a HUSID has several IDs, keep the first
# and flag it, so the match rate is not inflated by duplicates)
lookup <- extract %>%
  filter(!is.na(husid_clean)) %>%
  group_by(husid_clean) %>%
  summarise(SPRIDEN_ID = first(SPRIDEN_ID), ids_for_husid = n_distinct(SPRIDEN_ID), .groups = "drop")

# ---- 2. The OfS individualised data ---------------------------------------------
clean_names <- function(df) {
  nm <- tolower(names(df)); nm <- gsub("[^a-z0-9]+", "_", nm); nm <- gsub("^_|_$", "", nm)
  names(df) <- nm; df
}
if (exists("raw") && is.data.frame(raw) && "husid" %in% names(raw)) {
  message("Using 'raw' already in memory")
  ofs <- raw
} else if (file.exists(rds_file)) {
  ofs <- readRDS(rds_file)
} else {
  ofs <- read_excel(ofs_file, sheet = 1, guess_max = 1100000) %>% clean_names()
}

ofs <- ofs %>%
  mutate(husid_clean = clean_husid(husid),
         registering_ukprn = suppressWarnings(as.numeric(registering_ukprn)),
         app_exclusion_reason = suppressWarnings(as.numeric(app_exclusion_reason)),
         base_academic_year = suppressWarnings(as.numeric(base_academic_year)),
         faculty = coalesce(as.character(facultyv4), "Unknown"),
         in_app_population = registering_ukprn == mdx_ukprn & app_exclusion_reason == 0 &
           as.character(linked_engagement_starting_mode) == "FT" &
           as.character(level_aggregate_1) == "DEG")

cat("\n---- OfS individualised data ----\n")
cat("Rows:", nrow(ofs), "\n")
cat("Rows with no HUSID (often students returned through the ILR):", sum(is.na(ofs$husid_clean)), "\n")

ofs <- ofs %>% left_join(lookup, by = "husid_clean") %>%
  mutate(matched = !is.na(SPRIDEN_ID))

# ---- 3. Match rates ------------------------------------------------------------------
# Unique students: a student counts as matched if their HUSID is in the extract.
# Students with no HUSID cannot be matched this way and are counted as unmatched.
rate <- function(d, label, ...) {
  d %>%
    mutate(student = coalesce(husid_clean, paste0("noid_", row_number()))) %>%
    group_by(...) %>%
    summarise(students = n_distinct(student),
              students_matched = n_distinct(student[matched]),
              students_no_husid = n_distinct(student[is.na(husid_clean)]),
              .groups = "drop") %>%
    mutate(match_rate_pct = round(100 * students_matched / students, 1),
           breakdown = label, .before = 1)
}

app <- ofs %>% filter(in_app_population)
stage_rows <- bind_rows(
  app %>% filter(as.numeric(entrant_exclusion) == 0) %>% mutate(stage = "Continuation and completion entrants"),
  app %>% filter(as.numeric(in_degree_outcomes_population) == 1) %>% mutate(stage = "Attainment (qualifiers)"),
  app %>% filter(as.numeric(in_progression_population) == 1) %>% mutate(stage = "Progression (Graduate Outcomes)")
)

summary_tbl <- bind_rows(
  rate(ofs, "All students in the OfS file") %>% mutate(group = "All"),
  rate(app, "APP population (full-time first degree, UK, registered)") %>% mutate(group = "All"),
  rate(app, "APP population by year", base_academic_year) %>% mutate(group = as.character(base_academic_year)) %>% select(-base_academic_year),
  rate(app, "APP population by faculty", faculty) %>% rename(group = faculty),
  rate(stage_rows, "APP population by lifecycle stage", stage) %>% rename(group = stage),
  rate(ofs, "All students by level", level_aggregate_1) %>% mutate(group = as.character(level_aggregate_1)) %>% select(-level_aggregate_1),
  rate(ofs, "All students by mode", linked_engagement_starting_mode) %>% mutate(group = as.character(linked_engagement_starting_mode)) %>% select(-linked_engagement_starting_mode)
) %>%
  select(breakdown, group, students, students_matched, match_rate_pct, students_no_husid)

cat("\n---- Match rates (unique students) ----\n")
print(summary_tbl, n = Inf, width = Inf)

# Which way round: how many IDs in the extract appear in the OfS file?
in_ofs <- lookup %>% mutate(found = husid_clean %in% ofs$husid_clean)
cat("\nHUSIDs in the extract that appear in the OfS file:", sum(in_ofs$found), "of", nrow(in_ofs),
    sprintf("(%.1f%%)\n", 100 * mean(in_ofs$found)))

# ---- 4. Save ------------------------------------------------------------------------
write_csv(summary_tbl, file.path(out_dir, "husid_match_summary.csv"))
unmatched <- app %>% filter(!matched, !is.na(husid_clean)) %>%
  distinct(husid_clean, base_academic_year, faculty) %>% head(200)
write_csv(unmatched, file.path(out_dir, "husid_unmatched_sample.csv"))
cat("\nFiles written to:", out_dir, "\n")

# ---- 5. Next step: bringing in another dataset by student ID ----------------------
# Once the match rate is acceptable, a dataset keyed by SPRIDEN_ID (for example
# religion) can be joined like this, then carried into the equity gap analyses:
#
#   religion <- read_csv(file.path(data_dir, "religion extract.csv"),
#                        col_types = cols(.default = col_character()))
#   ofs_with_religion <- ofs %>% left_join(religion, by = "SPRIDEN_ID")
#
# Check the same way how many matched students have a religion recorded before
# relying on it, since a high HUSID match rate does not guarantee the second
# dataset is complete.
